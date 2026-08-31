-- Phase 5C-1 only: tenant ownership columns and Emmanuel Church backfill.
-- Canonical linked-project migration version: 20260829033821.
-- This migration intentionally does not change any existing RLS policy.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

create temp table phase5c1_targets (
  table_name text primary key,
  require_not_null boolean not null
) on commit drop;

insert into phase5c1_targets (table_name, require_not_null) values
  ('accounts', true),
  ('categories', true),
  ('offerings', true),
  ('donations', true),
  ('expenses', true),
  ('account_transfers', true),
  ('payables', true),
  ('payable_payments', true),
  ('members', true),
  ('attendance', true),
  ('projects', true),
  ('events', true),
  ('announcements', true),
  ('reports', true),
  ('access_requests', true),
  ('audit_logs', false);

lock table
  public.churches,
  public.accounts,
  public.categories,
  public.offerings,
  public.donations,
  public.expenses,
  public.account_transfers,
  public.payables,
  public.payable_payments,
  public.members,
  public.attendance,
  public.projects,
  public.events,
  public.announcements,
  public.reports,
  public.access_requests,
  public.audit_logs
in access exclusive mode;

do $preconditions$
declare
  church_count integer;
  active_count integer;
  emmanuel_count integer;
  existing_church_columns integer;
begin
  select
    count(*),
    count(*) filter (where status = 'active'),
    count(*) filter (where slug = 'emmanuel-church' and name = 'Emmanuel Church')
  into church_count, active_count, emmanuel_count
  from public.churches;

  if church_count <> 1 or active_count <> 1 or emmanuel_count <> 1 then
    raise exception
      'Phase 5C-1 requires exactly one church, the active Emmanuel Church (churches=%, active=%, Emmanuel=%)',
      church_count, active_count, emmanuel_count;
  end if;

  select count(*) into existing_church_columns
  from information_schema.columns c
  join phase5c1_targets t on t.table_name = c.table_name
  where c.table_schema = 'public'
    and c.column_name = 'church_id';

  if existing_church_columns <> 0 then
    raise exception
      'Phase 5C-1 expected no pre-existing church_id columns on target tables; found %',
      existing_church_columns;
  end if;
end
$preconditions$;

-- Preserve a catalog fingerprint so the migration can prove that existing RLS
-- policy definitions and row-security flags were not changed.
create temp table phase5c1_security_control on commit drop as
select
  (select count(*) from pg_policies where schemaname = 'public') as policy_count,
  (select md5(coalesce(string_agg(
    concat_ws(
      E'\x1f',
      schemaname,
      tablename,
      policyname,
      permissive,
      roles::text,
      cmd,
      coalesce(qual, ''),
      coalesce(with_check, '')
    ),
    E'\x1e' order by tablename, policyname
  ), '')) from pg_policies where schemaname = 'public') as policy_hash,
  (select md5(coalesce(string_agg(
    concat_ws(E'\x1f', n.nspname, c.relname, c.relrowsecurity::text, c.relforcerowsecurity::text),
    E'\x1e' order by n.nspname, c.relname
  ), ''))
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')) as rls_hash;

-- Snapshot every row without church_id. The post-migration hash must match.
create temp table phase5c1_row_controls (
  phase text not null,
  table_name text not null,
  row_count bigint not null,
  distinct_id_count bigint not null,
  payload_hash text not null,
  primary key (phase, table_name)
) on commit drop;

do $row_control_before$
declare
  target record;
  rows_count bigint;
  distinct_count bigint;
  rows_hash text;
begin
  for target in select table_name from phase5c1_targets order by table_name loop
    execute format(
      'select count(*), count(distinct id), md5(coalesce(string_agg(to_jsonb(t)::text, %L order by id::text), %L)) from public.%I t',
      '|', '', target.table_name
    ) into rows_count, distinct_count, rows_hash;

    insert into phase5c1_row_controls
      (phase, table_name, row_count, distinct_id_count, payload_hash)
    values
      ('before', target.table_name, rows_count, distinct_count, rows_hash);
  end loop;
end
$row_control_before$;

-- Snapshot financial controls, including organization-wide and per-account
-- balances. Transfers are net-zero organization-wide but remain in account
-- balance calculations.
create temp table phase5c1_financial_controls (
  phase text primary key,
  opening_balance numeric not null,
  offering_income numeric not null,
  donation_income numeric not null,
  expense_total numeric not null,
  transfer_total numeric not null,
  payable_total numeric not null,
  payable_paid numeric not null,
  payable_payment_total numeric not null,
  organization_balance numeric not null,
  account_balance_hash text not null
) on commit drop;

insert into phase5c1_financial_controls
select
  'before',
  coalesce((select sum(opening_balance) from public.accounts), 0),
  coalesce((select sum(amount) from public.offerings), 0),
  coalesce((select sum(amount) from public.donations), 0),
  coalesce((select sum(amount) from public.expenses), 0),
  coalesce((select sum(amount) from public.account_transfers), 0),
  coalesce((select sum(amount) from public.payables), 0),
  coalesce((select sum(amount_paid) from public.payables), 0),
  coalesce((select sum(amount) from public.payable_payments), 0),
  coalesce((select sum(opening_balance) from public.accounts), 0)
    + coalesce((select sum(amount) from public.offerings), 0)
    + coalesce((select sum(amount) from public.donations), 0)
    - coalesce((select sum(amount) from public.expenses), 0),
  (
    select md5(coalesce(string_agg(
      balances.id::text || ':' || balances.current_balance::text,
      '|' order by balances.id::text
    ), ''))
    from (
      select
        a.id,
        a.opening_balance
          + coalesce((select sum(o.amount) from public.offerings o where o.account_id = a.id), 0)
          + coalesce((select sum(d.amount) from public.donations d where d.account_id = a.id), 0)
          - coalesce((select sum(e.amount) from public.expenses e where e.account_id = a.id), 0)
          + coalesce((select sum(t.amount) from public.account_transfers t where t.to_account_id = a.id), 0)
          - coalesce((select sum(t.amount) from public.account_transfers t where t.from_account_id = a.id), 0)
          as current_balance
      from public.accounts a
    ) balances
  );

-- Preserve current enablement states for only the audit and updated_at triggers
-- that would otherwise turn a metadata backfill into business changes.
create temp table phase5c1_trigger_states (
  table_name text not null,
  trigger_name text not null,
  enabled_state "char" not null,
  primary key (table_name, trigger_name)
) on commit drop;

insert into phase5c1_trigger_states (table_name, trigger_name, enabled_state)
select c.relname, t.tgname, t.tgenabled
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
join pg_namespace pn on pn.oid = p.pronamespace
join phase5c1_targets target on target.table_name = c.relname
where n.nspname = 'public'
  and pn.nspname = 'private'
  and p.proname in ('audit_row_change', 'set_updated_at')
  and not t.tgisinternal;

do $disable_metadata_triggers$
declare
  trigger_row record;
begin
  for trigger_row in select * from phase5c1_trigger_states loop
    execute format(
      'alter table public.%I disable trigger %I',
      trigger_row.table_name,
      trigger_row.trigger_name
    );
  end loop;
end
$disable_metadata_triggers$;

-- Add the ownership columns and restrictive foreign keys without changing RLS.
do $add_ownership_columns$
declare
  target record;
begin
  for target in select table_name from phase5c1_targets order by table_name loop
    execute format(
      'alter table public.%I add column church_id uuid',
      target.table_name
    );
    execute format(
      'alter table public.%I add constraint %I foreign key (church_id) references public.churches(id) on delete restrict not valid',
      target.table_name,
      target.table_name || '_church_id_fkey'
    );
  end loop;
end
$add_ownership_columns$;

do $backfill_emmanuel$
declare
  target record;
  emmanuel_id uuid;
begin
  select id into strict emmanuel_id
  from public.churches
  where slug = 'emmanuel-church' and status = 'active';

  for target in select table_name from phase5c1_targets order by table_name loop
    execute format(
      'update public.%I set church_id = $1 where church_id is null',
      target.table_name
    ) using emmanuel_id;
  end loop;
end
$backfill_emmanuel$;

-- Transitional insert compatibility for the existing single-church frontend.
-- Once multiple active churches exist, this fails closed instead of guessing.
create or replace function private.assign_single_active_church()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  active_count integer;
  active_church_id uuid;
begin
  if tg_op <> 'INSERT'
    or tg_table_schema <> 'public'
    or not (tg_table_name = any(array[
      'accounts','categories','offerings','donations','expenses','account_transfers',
      'payables','payable_payments','members','attendance','projects','events',
      'announcements','reports','access_requests','audit_logs'
    ]))
  then
    raise exception 'assign_single_active_church may only run as an approved INSERT trigger';
  end if;

  select count(*), (array_agg(id order by id))[1]
  into active_count, active_church_id
  from public.churches
  where status = 'active';

  if active_count <> 1 or active_church_id is null then
    raise exception
      'A church_id is required because exactly one active church could not be resolved';
  end if;

  if new.church_id is null then
    new.church_id := active_church_id;
  elsif new.church_id <> active_church_id then
    raise exception
      'The supplied church_id does not match the sole active church';
  end if;

  return new;
end
$function$;

revoke all on function private.assign_single_active_church()
from public, anon, authenticated, service_role;

do $create_compatibility_triggers$
declare
  target record;
begin
  for target in select table_name from phase5c1_targets order by table_name loop
    execute format(
      'create trigger %I before insert on public.%I for each row execute function private.assign_single_active_church()',
      'tenant_default_' || target.table_name || '_church_id',
      target.table_name
    );
  end loop;
end
$create_compatibility_triggers$;

-- One church-leading index per tenant-owned table.
create index idx_accounts_church on public.accounts(church_id);
create index idx_categories_church on public.categories(church_id);
create index idx_offerings_church_date on public.offerings(church_id, offering_date desc);
create index idx_donations_church_date on public.donations(church_id, donation_date desc);
create index idx_expenses_church_date on public.expenses(church_id, expense_date desc);
create index idx_account_transfers_church_date on public.account_transfers(church_id, transfer_date desc);
create index idx_payables_church_status_due on public.payables(church_id, status, due_date);
create index idx_payable_payments_church_date on public.payable_payments(church_id, payment_date desc);
create index idx_members_church_name on public.members(church_id, last_name, first_name);
create index idx_attendance_church_date on public.attendance(church_id, attendance_date desc);
create index idx_projects_church_status on public.projects(church_id, status);
create index idx_events_church_start on public.events(church_id, starts_at desc);
create index idx_announcements_church_publish on public.announcements(church_id, is_published, publish_at desc);
create index idx_reports_church_type_created on public.reports(church_id, report_type, created_at desc);
create index idx_access_requests_church_status_created on public.access_requests(church_id, status, created_at desc);
create index idx_audit_logs_church_created on public.audit_logs(church_id, created_at desc);

do $validate_constraints_and_nullability$
declare
  target record;
begin
  for target in select * from phase5c1_targets order by table_name loop
    execute format(
      'alter table public.%I validate constraint %I',
      target.table_name,
      target.table_name || '_church_id_fkey'
    );

    if target.require_not_null then
      execute format(
        'alter table public.%I alter column church_id set not null',
        target.table_name
      );
    end if;

    execute format(
      'comment on column public.%I.church_id is %L',
      target.table_name,
      'Tenant owner. Added and backfilled to Emmanuel Church in Phase 5C-1.'
    );
  end loop;
end
$validate_constraints_and_nullability$;

comment on function private.assign_single_active_church() is
  'Phase 5C-1 single-active-church insert compatibility; fails closed when tenant selection is ambiguous.';

-- Restore trigger states exactly as they were before the backfill.
do $restore_metadata_triggers$
declare
  trigger_row record;
begin
  for trigger_row in select * from phase5c1_trigger_states loop
    if trigger_row.enabled_state = 'O' then
      execute format('alter table public.%I enable trigger %I', trigger_row.table_name, trigger_row.trigger_name);
    elsif trigger_row.enabled_state = 'D' then
      execute format('alter table public.%I disable trigger %I', trigger_row.table_name, trigger_row.trigger_name);
    elsif trigger_row.enabled_state = 'R' then
      execute format('alter table public.%I enable replica trigger %I', trigger_row.table_name, trigger_row.trigger_name);
    elsif trigger_row.enabled_state = 'A' then
      execute format('alter table public.%I enable always trigger %I', trigger_row.table_name, trigger_row.trigger_name);
    else
      raise exception 'Unknown trigger enabled state: %', trigger_row.enabled_state;
    end if;
  end loop;
end
$restore_metadata_triggers$;

-- Canary: omit church_id through the unchanged report insert shape, verify that
-- Emmanuel is assigned, and deliberately roll the insert back in a subtransaction.
do $canary$
declare
  canary_id uuid := gen_random_uuid();
  assigned_church_id uuid;
  emmanuel_id uuid;
begin
  select id into strict emmanuel_id
  from public.churches
  where slug = 'emmanuel-church' and status = 'active';

  begin
    insert into public.reports (
      id, title, report_type, parameters, generated_data
    ) values (
      canary_id,
      '__phase_5c1_canary__',
      'phase_5c1_canary',
      '{}'::jsonb,
      '{}'::jsonb
    )
    returning church_id into assigned_church_id;

    if assigned_church_id is distinct from emmanuel_id then
      raise exception
        'Phase 5C-1 canary assigned %, expected %',
        assigned_church_id, emmanuel_id;
    end if;

    raise exception using
      errcode = 'Z5C1A',
      message = 'phase_5c1_canary_rollback';
  exception
    when sqlstate 'Z5C1A' then
      null;
  end;

  if exists (select 1 from public.reports where id = canary_id)
    or exists (
      select 1 from public.audit_logs
      where record_id = canary_id::text
        and table_name = 'reports'
    )
  then
    raise exception 'Phase 5C-1 canary rollback left persistent rows';
  end if;
end
$canary$;

-- Recompute row controls while excluding only the new church_id field.
do $row_control_after$
declare
  target record;
  rows_count bigint;
  distinct_count bigint;
  rows_hash text;
begin
  for target in select table_name from phase5c1_targets order by table_name loop
    execute format(
      'select count(*), count(distinct id), md5(coalesce(string_agg((to_jsonb(t) - %L)::text, %L order by id::text), %L)) from public.%I t',
      'church_id', '|', '', target.table_name
    ) into rows_count, distinct_count, rows_hash;

    insert into phase5c1_row_controls
      (phase, table_name, row_count, distinct_id_count, payload_hash)
    values
      ('after', target.table_name, rows_count, distinct_count, rows_hash);
  end loop;
end
$row_control_after$;

insert into phase5c1_financial_controls
select
  'after',
  coalesce((select sum(opening_balance) from public.accounts), 0),
  coalesce((select sum(amount) from public.offerings), 0),
  coalesce((select sum(amount) from public.donations), 0),
  coalesce((select sum(amount) from public.expenses), 0),
  coalesce((select sum(amount) from public.account_transfers), 0),
  coalesce((select sum(amount) from public.payables), 0),
  coalesce((select sum(amount_paid) from public.payables), 0),
  coalesce((select sum(amount) from public.payable_payments), 0),
  coalesce((select sum(opening_balance) from public.accounts), 0)
    + coalesce((select sum(amount) from public.offerings), 0)
    + coalesce((select sum(amount) from public.donations), 0)
    - coalesce((select sum(amount) from public.expenses), 0),
  (
    select md5(coalesce(string_agg(
      balances.id::text || ':' || balances.current_balance::text,
      '|' order by balances.id::text
    ), ''))
    from (
      select
        a.id,
        a.opening_balance
          + coalesce((select sum(o.amount) from public.offerings o where o.account_id = a.id), 0)
          + coalesce((select sum(d.amount) from public.donations d where d.account_id = a.id), 0)
          - coalesce((select sum(e.amount) from public.expenses e where e.account_id = a.id), 0)
          + coalesce((select sum(t.amount) from public.account_transfers t where t.to_account_id = a.id), 0)
          - coalesce((select sum(t.amount) from public.account_transfers t where t.from_account_id = a.id), 0)
          as current_balance
      from public.accounts a
    ) balances
  );

do $postconditions$
declare
  target record;
  null_count bigint;
  owner_count bigint;
  policy_count_after bigint;
  policy_hash_after text;
  rls_hash_after text;
  compatibility_trigger_count integer;
begin
  if exists (
    select 1
    from phase5c1_row_controls before_control
    join phase5c1_row_controls after_control
      on after_control.table_name = before_control.table_name
    where before_control.phase = 'before'
      and after_control.phase = 'after'
      and (
        before_control.row_count is distinct from after_control.row_count
        or before_control.distinct_id_count is distinct from after_control.distinct_id_count
        or before_control.payload_hash is distinct from after_control.payload_hash
      )
  ) then
    raise exception 'Phase 5C-1 row controls changed';
  end if;

  if (select to_jsonb(c) - 'phase' from phase5c1_financial_controls c where phase = 'before')
     is distinct from
     (select to_jsonb(c) - 'phase' from phase5c1_financial_controls c where phase = 'after')
  then
    raise exception 'Phase 5C-1 financial controls changed';
  end if;

  for target in select table_name from phase5c1_targets order by table_name loop
    execute format(
      'select count(*) filter (where church_id is null), count(distinct church_id) from public.%I',
      target.table_name
    ) into null_count, owner_count;

    if null_count <> 0 then
      raise exception 'Phase 5C-1 left % unowned rows in public.%', null_count, target.table_name;
    end if;
    if owner_count > 1 then
      raise exception 'Phase 5C-1 assigned multiple owners in public.%', target.table_name;
    end if;
  end loop;

  select count(*) into compatibility_trigger_count
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join phase5c1_targets target_table on target_table.table_name = c.relname
  where n.nspname = 'public'
    and t.tgname = 'tenant_default_' || c.relname || '_church_id'
    and t.tgenabled = 'O'
    and not t.tgisinternal;

  if compatibility_trigger_count <> 16 then
    raise exception
      'Phase 5C-1 expected 16 enabled compatibility triggers, found %',
      compatibility_trigger_count;
  end if;

  select
    count(*),
    md5(coalesce(string_agg(
      concat_ws(
        E'\x1f',
        schemaname,
        tablename,
        policyname,
        permissive,
        roles::text,
        cmd,
        coalesce(qual, ''),
        coalesce(with_check, '')
      ),
      E'\x1e' order by tablename, policyname
    ), ''))
  into policy_count_after, policy_hash_after
  from pg_policies
  where schemaname = 'public';

  select md5(coalesce(string_agg(
    concat_ws(E'\x1f', n.nspname, c.relname, c.relrowsecurity::text, c.relforcerowsecurity::text),
    E'\x1e' order by n.nspname, c.relname
  ), ''))
  into rls_hash_after
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p');

  if exists (
    select 1 from phase5c1_security_control
    where policy_count is distinct from policy_count_after
      or policy_hash is distinct from policy_hash_after
      or rls_hash is distinct from rls_hash_after
  ) then
    raise exception 'Phase 5C-1 detected an RLS policy or row-security flag change';
  end if;
end
$postconditions$;

commit;
