-- Phase 5C-3 Stage 2 only: tenant-aware audit and access-request functions.
-- RLS policies remain unchanged. Compatibility triggers remain installed.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

create temp table phase5c3_stage2_controls on commit drop as
select
  (select count(*) from pg_policies where schemaname = 'public') as policy_count,
  (select md5(coalesce(string_agg(
    concat_ws(E'\x1f', schemaname, tablename, policyname, permissive, roles::text,
      cmd, coalesce(qual, ''), coalesce(with_check, '')),
    E'\x1e' order by tablename, policyname
  ), '')) from pg_policies where schemaname = 'public') as policy_hash,
  coalesce((select sum(opening_balance) from public.accounts), 0) as opening_balance,
  coalesce((select sum(amount) from public.offerings), 0) as offering_income,
  coalesce((select sum(amount) from public.donations), 0) as donation_income,
  coalesce((select sum(amount) from public.expenses), 0) as expense_total,
  coalesce((select sum(amount) from public.account_transfers), 0) as transfer_total,
  coalesce((select sum(amount) from public.payables), 0) as payable_total,
  coalesce((select sum(amount_paid) from public.payables), 0) as payable_paid,
  coalesce((select sum(amount) from public.payable_payments), 0) as payable_payment_total;

do $preconditions$
declare
  compatibility_trigger_count integer;
  ownership_trigger_count integer;
begin
  if (select count(*) from pg_policies where schemaname = 'public') <> 62 then
    raise exception 'Stage 2 expected the reviewed 62-policy baseline';
  end if;

  if to_regprocedure('private.has_church_role(uuid,text[])') is null
    or to_regprocedure('private.is_platform_owner()') is null
  then
    raise exception 'Stage 2 requires validated Stage 1 helpers';
  end if;

  select count(*) into compatibility_trigger_count
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and t.tgname = 'tenant_default_' || c.relname || '_church_id'
    and t.tgenabled = 'O'
    and not t.tgisinternal;

  if compatibility_trigger_count <> 16 then
    raise exception 'Stage 2 expected 16 enabled compatibility triggers, found %',
      compatibility_trigger_count;
  end if;

  select count(*) into ownership_trigger_count
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and t.tgname = 'tenant_immutable_' || c.relname || '_church_id'
    and not t.tgisinternal;

  if ownership_trigger_count <> 0 then
    raise exception 'Stage 2 found pre-existing tenant ownership immutability triggers';
  end if;
end
$preconditions$;

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

  if new.church_id is not null then
    if not exists (
      select 1 from public.churches c
      where c.id = new.church_id and c.status = 'active'
    ) then
      raise exception 'The supplied church_id does not reference an active church';
    end if;
    return new;
  end if;

  -- Platform-level audit events intentionally retain a null church owner.
  if tg_table_name = 'audit_logs' then
    return new;
  end if;

  select count(*), (array_agg(id order by id))[1]
  into active_count, active_church_id
  from public.churches
  where status = 'active';

  if active_count <> 1 or active_church_id is null then
    raise exception
      'A church_id is required because exactly one active church could not be resolved';
  end if;

  new.church_id := active_church_id;
  return new;
end
$function$;

revoke all on function private.assign_single_active_church()
  from public, anon, authenticated, service_role;

comment on function private.assign_single_active_church() is
  'Transitional insert compatibility: accepts an explicit active church, defaults only when one active church exists, and preserves null platform audit ownership.';

create or replace function private.prevent_church_id_change()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op <> 'UPDATE'
    or tg_table_schema <> 'public'
    or not (tg_table_name = any(array[
      'accounts','categories','offerings','donations','expenses','account_transfers',
      'payables','payable_payments','members','attendance','projects','events',
      'announcements','reports','access_requests','church_memberships'
    ]))
  then
    raise exception 'prevent_church_id_change may only run as an approved UPDATE trigger';
  end if;

  if new.church_id is distinct from old.church_id then
    raise exception 'church_id is immutable after insert' using errcode = '23514';
  end if;

  return new;
end
$function$;

revoke all on function private.prevent_church_id_change()
  from public, anon, authenticated, service_role;

do $create_ownership_triggers$
declare
  target_table text;
begin
  foreach target_table in array array[
    'accounts','categories','offerings','donations','expenses','account_transfers',
    'payables','payable_payments','members','attendance','projects','events',
    'announcements','reports','access_requests','church_memberships'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.prevent_church_id_change()',
      'tenant_immutable_' || target_table || '_church_id',
      target_table
    );
  end loop;
end
$create_ownership_triggers$;

create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  row_id text;
  tenant_id uuid;
  source_values jsonb;
begin
  if tg_op = 'DELETE' then
    source_values := to_jsonb(old);
  else
    source_values := to_jsonb(new);
  end if;

  row_id := source_values ->> 'id';
  if row_id is null then
    raise exception 'Audited rows must expose an id field';
  end if;

  if nullif(source_values ->> 'church_id', '') is not null then
    tenant_id := (source_values ->> 'church_id')::uuid;
  else
    tenant_id := null;
  end if;

  if tg_op = 'DELETE' then
    insert into public.audit_logs (
      actor_user_id, action, table_name, record_id, old_values, church_id
    ) values (
      (select auth.uid()), tg_op, tg_table_name, row_id, to_jsonb(old), tenant_id
    );
    return old;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_logs (
      actor_user_id, action, table_name, record_id, old_values, new_values, church_id
    ) values (
      (select auth.uid()), tg_op, tg_table_name, row_id, to_jsonb(old), to_jsonb(new), tenant_id
    );
    return new;
  else
    insert into public.audit_logs (
      actor_user_id, action, table_name, record_id, new_values, church_id
    ) values (
      (select auth.uid()), tg_op, tg_table_name, row_id, to_jsonb(new), tenant_id
    );
    return new;
  end if;
end
$function$;

revoke all on function private.audit_row_change()
  from public, anon, authenticated, service_role;

create trigger audit_church_memberships
after insert or update or delete on public.church_memberships
for each row execute function private.audit_row_change();

create or replace function public.finalize_access_request(
  p_request_id uuid,
  p_invited_user_id uuid,
  p_approved_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_row public.access_requests%rowtype;
  final_role_id uuid;
  invited_email text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select * into request_row
  from public.access_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Access request not found' using errcode = 'P0002';
  end if;

  if not (select private.has_church_role(request_row.church_id, array['Admin'])) then
    raise exception 'Only an active Church Admin can approve this access request'
      using errcode = '42501';
  end if;

  if request_row.status <> 'Pending' then
    raise exception 'Access request has already been processed' using errcode = '23514';
  end if;

  select id into final_role_id
  from public.roles
  where name = p_approved_role;

  if final_role_id is null then
    raise exception 'Approved role is invalid' using errcode = '23514';
  end if;

  select lower(email) into invited_email
  from auth.users
  where id = p_invited_user_id;

  if invited_email is null or invited_email <> request_row.email then
    raise exception 'Invited Auth user does not match this request' using errcode = '23514';
  end if;

  insert into public.users (id, email, full_name, role_id, is_active)
  values (
    p_invited_user_id, request_row.email, btrim(request_row.full_name), final_role_id, true
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role_id = excluded.role_id,
    is_active = true,
    updated_at = now();

  insert into public.church_memberships (
    church_id, user_id, role_id, status, joined_at
  ) values (
    request_row.church_id, p_invited_user_id, final_role_id, 'active', now()
  )
  on conflict (church_id, user_id) do update set
    role_id = excluded.role_id,
    status = 'active',
    joined_at = coalesce(public.church_memberships.joined_at, excluded.joined_at),
    updated_at = now();

  update public.access_requests
  set status = 'Approved',
      approved_role = final_role_id,
      approved_by = (select auth.uid()),
      approved_at = now()
  where id = p_request_id;
end
$function$;

create or replace function public.reject_access_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_row public.access_requests%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select * into request_row
  from public.access_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Access request not found' using errcode = 'P0002';
  end if;

  if not (select private.has_church_role(request_row.church_id, array['Admin'])) then
    raise exception 'Only an active Church Admin can reject this access request'
      using errcode = '42501';
  end if;

  if request_row.status <> 'Pending' then
    raise exception 'Access request has already been processed' using errcode = '23514';
  end if;

  update public.access_requests
  set status = 'Rejected',
      approved_role = null,
      approved_by = (select auth.uid()),
      approved_at = now()
  where id = p_request_id;
end
$function$;

revoke all on function public.finalize_access_request(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.reject_access_request(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_access_request(uuid, uuid, text) to authenticated;
grant execute on function public.reject_access_request(uuid) to authenticated;

do $stage2_canaries$
declare
  emmanuel_id uuid;
  admin_id uuid;
  non_admin_id uuid;
  report_id uuid := gen_random_uuid();
  request_id uuid := gen_random_uuid();
  request_email text := 'phase5c3-' || replace(request_id::text, '-', '') || '@example.invalid';
  membership_id uuid;
  audit_owner uuid;
  request_status text;
begin
  select id into strict emmanuel_id
  from public.churches
  where slug = 'emmanuel-church' and status = 'active';

  select cm.user_id into strict admin_id
  from public.church_memberships cm
  join public.roles r on r.id = cm.role_id
  join public.users u on u.id = cm.user_id
  where cm.church_id = emmanuel_id
    and cm.status = 'active'
    and r.name = 'Admin'
    and u.is_active = true;

  select cm.user_id into non_admin_id
  from public.church_memberships cm
  join public.roles r on r.id = cm.role_id
  join public.users u on u.id = cm.user_id
  where cm.church_id = emmanuel_id
    and cm.status = 'active'
    and r.name <> 'Admin'
    and u.is_active = true
  order by cm.user_id
  limit 1;

  select cm.id into strict membership_id
  from public.church_memberships cm
  where cm.church_id = emmanuel_id and cm.user_id = admin_id;

  begin
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', admin_id, 'role', 'authenticated')::text,
      true
    );

    insert into public.reports (
      id, title, report_type, parameters, generated_data, church_id
    ) values (
      report_id, '__phase_5c3_stage2_report__', 'phase_5c3_canary',
      '{}'::jsonb, '{}'::jsonb, emmanuel_id
    );

    select church_id into strict audit_owner
    from public.audit_logs
    where table_name = 'reports' and record_id = report_id::text and action = 'INSERT';

    if audit_owner is distinct from emmanuel_id then
      raise exception 'Stage 2 report audit owner mismatch';
    end if;

    update public.church_memberships set role_id = role_id where id = membership_id;
    select church_id into strict audit_owner
    from public.audit_logs
    where table_name = 'church_memberships'
      and record_id = membership_id::text and action = 'UPDATE'
    order by created_at desc, id desc
    limit 1;

    if audit_owner is distinct from emmanuel_id then
      raise exception 'Stage 2 membership audit owner mismatch';
    end if;

    update public.users set full_name = full_name where id = admin_id;
    if not exists (
      select 1 from public.audit_logs
      where table_name = 'users' and record_id = admin_id::text
        and action = 'UPDATE' and church_id is null
    ) then
      raise exception 'Stage 2 platform user audit ownership mismatch';
    end if;

    insert into public.access_requests (
      id, full_name, email, requested_role, reason, church_id
    ) values (
      request_id, 'Phase Five Canary', request_email, 'Viewer',
      'Temporary Stage 2 tenant authorization canary.', emmanuel_id
    );

    if non_admin_id is not null then
      perform set_config(
        'request.jwt.claims',
        jsonb_build_object('sub', non_admin_id, 'role', 'authenticated')::text,
        true
      );
      begin
        perform public.reject_access_request(request_id);
        raise exception 'Stage 2 non-Admin rejection unexpectedly succeeded';
      exception
        when insufficient_privilege then null;
      end;
    end if;

    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', admin_id, 'role', 'authenticated')::text,
      true
    );
    perform public.reject_access_request(request_id);

    select status into strict request_status
    from public.access_requests where id = request_id;
    if request_status <> 'Rejected' then
      raise exception 'Stage 2 Admin rejection canary failed';
    end if;

    begin
      update public.reports set church_id = gen_random_uuid() where id = report_id;
      raise exception 'Stage 2 ownership immutability canary unexpectedly succeeded';
    exception
      when check_violation then null;
    end;

    raise exception using
      errcode = 'Z5C32',
      message = 'phase_5c3_stage2_canary_rollback';
  exception
    when sqlstate 'Z5C32' then null;
  end;

  perform set_config('request.jwt.claims', '{}', true);

  if exists (select 1 from public.reports where id = report_id)
    or exists (select 1 from public.access_requests where id = request_id)
    or exists (
      select 1 from public.audit_logs
      where record_id in (report_id::text, request_id::text)
    )
  then
    raise exception 'Stage 2 canary rollback left persistent rows';
  end if;
end
$stage2_canaries$;

do $postconditions$
declare
  policy_count_after bigint;
  policy_hash_after text;
  compatibility_trigger_count integer;
  ownership_trigger_count integer;
  audit_membership_trigger_count integer;
  financial_before jsonb;
  financial_after jsonb;
begin
  select count(*), md5(coalesce(string_agg(
    concat_ws(E'\x1f', schemaname, tablename, policyname, permissive, roles::text,
      cmd, coalesce(qual, ''), coalesce(with_check, '')),
    E'\x1e' order by tablename, policyname
  ), ''))
  into policy_count_after, policy_hash_after
  from pg_policies
  where schemaname = 'public';

  if exists (
    select 1 from phase5c3_stage2_controls
    where policy_count is distinct from policy_count_after
       or policy_hash is distinct from policy_hash_after
  ) then
    raise exception 'Stage 2 changed an RLS policy';
  end if;

  select count(*) into compatibility_trigger_count
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and t.tgname = 'tenant_default_' || c.relname || '_church_id'
    and t.tgenabled = 'O'
    and not t.tgisinternal;

  select count(*) into ownership_trigger_count
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and t.tgname = 'tenant_immutable_' || c.relname || '_church_id'
    and t.tgenabled = 'O'
    and not t.tgisinternal;

  select count(*) into audit_membership_trigger_count
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'church_memberships'
    and t.tgname = 'audit_church_memberships'
    and t.tgenabled = 'O'
    and not t.tgisinternal;

  if compatibility_trigger_count <> 16
    or ownership_trigger_count <> 16
    or audit_membership_trigger_count <> 1
  then
    raise exception
      'Stage 2 trigger validation failed (compatibility=%, ownership=%, membership audit=%)',
      compatibility_trigger_count, ownership_trigger_count, audit_membership_trigger_count;
  end if;

  if position(
    'private.has_church_role(request_row.church_id' in
    pg_get_functiondef('public.finalize_access_request(uuid,uuid,text)'::regprocedure)
  ) = 0
    or position(
      'insert into public.church_memberships' in
      lower(pg_get_functiondef('public.finalize_access_request(uuid,uuid,text)'::regprocedure))
    ) = 0
    or position(
      'private.has_church_role(request_row.church_id' in
      pg_get_functiondef('public.reject_access_request(uuid)'::regprocedure)
    ) = 0
  then
    raise exception 'Stage 2 access-request function validation failed';
  end if;

  select to_jsonb(c) - 'policy_count' - 'policy_hash'
  into financial_before
  from phase5c3_stage2_controls c;

  select jsonb_build_object(
    'opening_balance', coalesce((select sum(opening_balance) from public.accounts), 0),
    'offering_income', coalesce((select sum(amount) from public.offerings), 0),
    'donation_income', coalesce((select sum(amount) from public.donations), 0),
    'expense_total', coalesce((select sum(amount) from public.expenses), 0),
    'transfer_total', coalesce((select sum(amount) from public.account_transfers), 0),
    'payable_total', coalesce((select sum(amount) from public.payables), 0),
    'payable_paid', coalesce((select sum(amount_paid) from public.payables), 0),
    'payable_payment_total', coalesce((select sum(amount) from public.payable_payments), 0)
  ) into financial_after;

  if financial_before is distinct from financial_after then
    raise exception 'Stage 2 financial controls changed';
  end if;
end
$postconditions$;

commit;
