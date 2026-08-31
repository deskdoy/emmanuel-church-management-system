-- Phase 5C-3 Stage 3: atomic tenant RLS policy replacement.
-- Platform Owner receives no automatic church financial access.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

create temp table phase5c3_stage3_security_control on commit drop as
select
  (select count(*) from pg_policies where schemaname = 'public') as policy_count,
  (select md5(coalesce(string_agg(
    concat_ws(E'\x1f', schemaname, tablename, policyname, permissive, roles::text,
      cmd, coalesce(qual, ''), coalesce(with_check, '')),
    E'\x1e' order by tablename, policyname
  ), '')) from pg_policies where schemaname = 'public') as policy_hash,
  (select md5(coalesce(string_agg(
    concat_ws(E'\x1f', n.nspname, c.relname, c.relrowsecurity::text,
      c.relforcerowsecurity::text), E'\x1e' order by n.nspname, c.relname
  ), ''))
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')) as rls_hash,
  coalesce((select sum(opening_balance) from public.accounts), 0) as opening_balance,
  coalesce((select sum(amount) from public.offerings), 0) as offering_income,
  coalesce((select sum(amount) from public.donations), 0) as donation_income,
  coalesce((select sum(amount) from public.expenses), 0) as expense_total,
  coalesce((select sum(amount) from public.account_transfers), 0) as transfer_total,
  coalesce((select sum(amount) from public.payables), 0) as payable_total,
  coalesce((select sum(amount_paid) from public.payables), 0) as payable_paid,
  coalesce((select sum(amount) from public.payable_payments), 0) as payable_payment_total;

create temp table phase5c3_stage3_policy_snapshot on commit drop as
select * from pg_policies where schemaname = 'public';

do $preconditions$
declare
  compatibility_trigger_count integer;
  ownership_trigger_count integer;
begin
  if (select count(*) from phase5c3_stage3_policy_snapshot) <> 62 then
    raise exception 'Stage 3 expected the reviewed 62-policy baseline';
  end if;

  if to_regprocedure('private.has_church_role(uuid,text[])') is null
    or to_regprocedure('private.is_platform_owner()') is null
    or to_regprocedure('private.has_active_church_membership()') is null
    or to_regprocedure('private.shares_active_church_with_user(uuid,text[])') is null
    or to_regprocedure('private.is_active_church(uuid)') is null
  then
    raise exception 'Stage 3 requires all validated Stage 1 helpers';
  end if;

  select count(*) into compatibility_trigger_count
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and t.tgname = 'tenant_default_' || c.relname || '_church_id'
    and t.tgenabled = 'O' and not t.tgisinternal;

  select count(*) into ownership_trigger_count
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and t.tgname = 'tenant_immutable_' || c.relname || '_church_id'
    and t.tgenabled = 'O' and not t.tgisinternal;

  if compatibility_trigger_count <> 16 or ownership_trigger_count <> 16 then
    raise exception 'Stage 3 requires validated Stage 2 triggers';
  end if;

  if (select count(*) from public.churches) <> 1
    or (select count(*) from public.churches
        where slug = 'emmanuel-church' and status = 'active') <> 1
  then
    raise exception 'Stage 3 requires the sole active Emmanuel Church';
  end if;
end
$preconditions$;

lock table
  public.access_requests,
  public.account_transfers,
  public.accounts,
  public.announcements,
  public.attendance,
  public.audit_logs,
  public.categories,
  public.church_memberships,
  public.churches,
  public.donations,
  public.events,
  public.expenses,
  public.members,
  public.offerings,
  public.payable_payments,
  public.payables,
  public.platform_roles,
  public.platform_user_roles,
  public.projects,
  public.reports,
  public.roles,
  public.users
in access exclusive mode;

do $drop_reviewed_policies$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from phase5c3_stage3_policy_snapshot
    order by tablename, policyname
  loop
    execute format(
      'drop policy %I on %I.%I',
      policy_row.policyname, policy_row.schemaname, policy_row.tablename
    );
  end loop;
end
$drop_reviewed_policies$;

-- Restrictive tenant fences: future permissive policies cannot bypass church membership.
create policy accounts_tenant_fence on public.accounts as restrictive for all to authenticated
using ((select private.is_active_church_member(church_id)))
with check ((select private.is_active_church_member(church_id)));
create policy categories_tenant_fence on public.categories as restrictive for all to authenticated
using ((select private.is_active_church_member(church_id)))
with check ((select private.is_active_church_member(church_id)));
create policy offerings_tenant_fence on public.offerings as restrictive for all to authenticated
using ((select private.is_active_church_member(church_id)))
with check ((select private.is_active_church_member(church_id)));
create policy donations_tenant_fence on public.donations as restrictive for all to authenticated
using ((select private.is_active_church_member(church_id)))
with check ((select private.is_active_church_member(church_id)));
create policy expenses_tenant_fence on public.expenses as restrictive for all to authenticated
using ((select private.is_active_church_member(church_id)))
with check ((select private.is_active_church_member(church_id)));
create policy account_transfers_tenant_fence on public.account_transfers as restrictive for all to authenticated
using ((select private.is_active_church_member(church_id)))
with check ((select private.is_active_church_member(church_id)));
create policy payables_tenant_fence on public.payables as restrictive for all to authenticated
using ((select private.is_active_church_member(church_id)))
with check ((select private.is_active_church_member(church_id)));
create policy payable_payments_tenant_fence on public.payable_payments as restrictive for all to authenticated
using ((select private.is_active_church_member(church_id)))
with check ((select private.is_active_church_member(church_id)));
create policy members_tenant_fence on public.members as restrictive for all to authenticated
using ((select private.is_active_church_member(church_id)))
with check ((select private.is_active_church_member(church_id)));
create policy attendance_tenant_fence on public.attendance as restrictive for all to authenticated
using ((select private.is_active_church_member(church_id)))
with check ((select private.is_active_church_member(church_id)));
create policy projects_tenant_fence on public.projects as restrictive for all to authenticated
using ((select private.is_active_church_member(church_id)))
with check ((select private.is_active_church_member(church_id)));
create policy events_tenant_fence on public.events as restrictive for all to authenticated
using ((select private.is_active_church_member(church_id)))
with check ((select private.is_active_church_member(church_id)));
create policy announcements_tenant_fence on public.announcements as restrictive for all to authenticated
using ((select private.is_active_church_member(church_id)))
with check ((select private.is_active_church_member(church_id)));
create policy reports_tenant_fence on public.reports as restrictive for all to authenticated
using ((select private.is_active_church_member(church_id)))
with check ((select private.is_active_church_member(church_id)));

-- Public access request creation and tenant Admin review.
create policy access_requests_public_insert on public.access_requests
for insert to anon, authenticated
with check (
  (select private.is_active_church(church_id))
  and status = 'Pending'
  and approved_role is null
  and approved_by is null
  and approved_at is null
);
create policy access_requests_admin_read on public.access_requests
for select to authenticated
using ((select private.has_church_role(church_id, array['Admin'])));

-- Financial masters.
create policy accounts_read on public.accounts for select to authenticated
using ((select private.is_active_church_member(church_id)));
create policy accounts_insert on public.accounts for insert to authenticated
with check ((select private.has_church_role(church_id, array['Admin','Treasurer'])));
create policy accounts_update on public.accounts for update to authenticated
using ((select private.has_church_role(church_id, array['Admin','Treasurer'])))
with check ((select private.has_church_role(church_id, array['Admin','Treasurer'])));
create policy accounts_delete on public.accounts for delete to authenticated
using ((select private.has_church_role(church_id, array['Admin'])));

create policy categories_read on public.categories for select to authenticated
using ((select private.is_active_church_member(church_id)));
create policy categories_insert on public.categories for insert to authenticated
with check ((select private.has_church_role(church_id, array['Admin','Treasurer'])));
create policy categories_update on public.categories for update to authenticated
using ((select private.has_church_role(church_id, array['Admin','Treasurer'])))
with check ((select private.has_church_role(church_id, array['Admin','Treasurer'])));
create policy categories_delete on public.categories for delete to authenticated
using ((select private.has_church_role(church_id, array['Admin'])));

-- Money in/out.
create policy offerings_read on public.offerings for select to authenticated
using ((select private.is_active_church_member(church_id)));
create policy offerings_insert on public.offerings for insert to authenticated
with check ((select private.has_church_role(church_id, array['Admin','Treasurer','Encoder'])));
create policy offerings_update on public.offerings for update to authenticated
using ((select private.has_church_role(church_id, array['Admin','Treasurer','Encoder'])))
with check ((select private.has_church_role(church_id, array['Admin','Treasurer','Encoder'])));
create policy offerings_delete on public.offerings for delete to authenticated
using ((select private.has_church_role(church_id, array['Admin','Treasurer'])));

create policy donations_read on public.donations for select to authenticated
using ((select private.is_active_church_member(church_id)));
create policy donations_insert on public.donations for insert to authenticated
with check ((select private.has_church_role(church_id, array['Admin','Treasurer','Encoder'])));
create policy donations_update on public.donations for update to authenticated
using ((select private.has_church_role(church_id, array['Admin','Treasurer','Encoder'])))
with check ((select private.has_church_role(church_id, array['Admin','Treasurer','Encoder'])));
create policy donations_delete on public.donations for delete to authenticated
using ((select private.has_church_role(church_id, array['Admin','Treasurer'])));

create policy expenses_read on public.expenses for select to authenticated
using ((select private.is_active_church_member(church_id)));
create policy expenses_insert on public.expenses for insert to authenticated
with check ((select private.has_church_role(church_id, array['Admin','Treasurer','Encoder'])));
create policy expenses_update on public.expenses for update to authenticated
using ((select private.has_church_role(church_id, array['Admin','Treasurer','Encoder'])))
with check ((select private.has_church_role(church_id, array['Admin','Treasurer','Encoder'])));
create policy expenses_delete on public.expenses for delete to authenticated
using ((select private.has_church_role(church_id, array['Admin','Treasurer'])));

-- Transfers and payables.
create policy account_transfers_read on public.account_transfers for select to authenticated
using ((select private.is_active_church_member(church_id)));
create policy account_transfers_insert on public.account_transfers for insert to authenticated
with check (
  (select private.has_church_role(church_id, array['Admin','Treasurer','Encoder']))
  and recorded_by = (select auth.uid())
);

create policy payables_read on public.payables for select to authenticated
using ((select private.is_active_church_member(church_id)));
create policy payables_insert on public.payables for insert to authenticated
with check ((select private.has_church_role(church_id, array['Admin','Treasurer','Encoder'])));
create policy payables_update on public.payables for update to authenticated
using ((select private.has_church_role(church_id, array['Admin','Treasurer','Encoder'])))
with check ((select private.has_church_role(church_id, array['Admin','Treasurer','Encoder'])));
create policy payables_delete on public.payables for delete to authenticated
using ((select private.has_church_role(church_id, array['Admin','Treasurer'])));

create policy payable_payments_read on public.payable_payments for select to authenticated
using ((select private.is_active_church_member(church_id)));
create policy payable_payments_insert on public.payable_payments for insert to authenticated
with check (
  (select private.has_church_role(church_id, array['Admin','Treasurer','Encoder']))
  and recorded_by = (select auth.uid())
);

-- Operational management.
create policy members_read on public.members for select to authenticated
using ((select private.is_active_church_member(church_id)));
create policy members_write on public.members for insert to authenticated
with check ((select private.has_church_role(church_id, array['Admin','Pastor','Secretary','Encoder'])));
create policy members_update on public.members for update to authenticated
using ((select private.has_church_role(church_id, array['Admin','Pastor','Secretary','Encoder'])))
with check ((select private.has_church_role(church_id, array['Admin','Pastor','Secretary','Encoder'])));
create policy members_delete on public.members for delete to authenticated
using ((select private.has_church_role(church_id, array['Admin','Pastor'])));

create policy attendance_read on public.attendance for select to authenticated
using ((select private.is_active_church_member(church_id)));
create policy attendance_write on public.attendance for insert to authenticated
with check ((select private.has_church_role(church_id, array['Admin','Pastor','Secretary','Encoder'])));
create policy attendance_update on public.attendance for update to authenticated
using ((select private.has_church_role(church_id, array['Admin','Pastor','Secretary','Encoder'])))
with check ((select private.has_church_role(church_id, array['Admin','Pastor','Secretary','Encoder'])));
create policy attendance_delete on public.attendance for delete to authenticated
using ((select private.has_church_role(church_id, array['Admin','Pastor','Secretary'])));

create policy projects_read on public.projects for select to authenticated
using ((select private.is_active_church_member(church_id)));
create policy projects_insert on public.projects for insert to authenticated
with check ((select private.has_church_role(church_id, array['Admin','Pastor','Secretary'])));
create policy projects_update on public.projects for update to authenticated
using ((select private.has_church_role(church_id, array['Admin','Pastor','Secretary'])))
with check ((select private.has_church_role(church_id, array['Admin','Pastor','Secretary'])));
create policy projects_delete on public.projects for delete to authenticated
using ((select private.has_church_role(church_id, array['Admin','Pastor'])));

create policy events_read on public.events for select to authenticated
using ((select private.is_active_church_member(church_id)));
create policy events_insert on public.events for insert to authenticated
with check ((select private.has_church_role(church_id, array['Admin','Pastor','Secretary'])));
create policy events_update on public.events for update to authenticated
using ((select private.has_church_role(church_id, array['Admin','Pastor','Secretary'])))
with check ((select private.has_church_role(church_id, array['Admin','Pastor','Secretary'])));
create policy events_delete on public.events for delete to authenticated
using ((select private.has_church_role(church_id, array['Admin','Pastor','Secretary'])));

create policy announcements_read on public.announcements for select to authenticated
using ((select private.is_active_church_member(church_id)));
create policy announcements_insert on public.announcements for insert to authenticated
with check ((select private.has_church_role(church_id, array['Admin','Pastor','Secretary'])));
create policy announcements_update on public.announcements for update to authenticated
using ((select private.has_church_role(church_id, array['Admin','Pastor','Secretary'])))
with check ((select private.has_church_role(church_id, array['Admin','Pastor','Secretary'])));
create policy announcements_delete on public.announcements for delete to authenticated
using ((select private.has_church_role(church_id, array['Admin','Pastor','Secretary'])));

-- Reports: backup/export metadata is Church Admin only.
create policy reports_read on public.reports for select to authenticated
using (
  (report_type <> 'backup_export' and (select private.is_active_church_member(church_id)))
  or (report_type = 'backup_export' and (select private.has_church_role(church_id, array['Admin'])))
);
create policy reports_insert on public.reports for insert to authenticated
with check (
  (report_type <> 'backup_export'
    and (select private.has_church_role(church_id, array['Admin','Pastor','Treasurer','Secretary'])))
  or (report_type = 'backup_export'
    and (select private.has_church_role(church_id, array['Admin'])))
);
create policy reports_update on public.reports for update to authenticated
using (
  (report_type <> 'backup_export'
    and (select private.has_church_role(church_id, array['Admin','Pastor','Treasurer','Secretary'])))
  or (report_type = 'backup_export'
    and (select private.has_church_role(church_id, array['Admin'])))
)
with check (
  (report_type <> 'backup_export'
    and (select private.has_church_role(church_id, array['Admin','Pastor','Treasurer','Secretary'])))
  or (report_type = 'backup_export'
    and (select private.has_church_role(church_id, array['Admin'])))
);
create policy reports_delete on public.reports for delete to authenticated
using (
  (report_type <> 'backup_export'
    and (select private.has_church_role(church_id, array['Admin','Treasurer'])))
  or (report_type = 'backup_export'
    and (select private.has_church_role(church_id, array['Admin'])))
);

-- Immutable audit history.
create policy audit_logs_read on public.audit_logs for select to authenticated
using (
  (church_id is not null and (select private.has_church_role(church_id, array['Admin'])))
  or (church_id is null and (select private.is_platform_owner()))
);

-- Tenant and identity catalogs.
create policy churches_member_or_platform_owner_read on public.churches
for select to authenticated
using (
  (select private.is_platform_owner())
  or (select private.is_active_church_member(id))
);

create policy church_memberships_self_or_owner_read on public.church_memberships
for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_platform_owner())
  or (select private.has_church_role(church_id, array['Admin']))
);

create policy platform_roles_authenticated_read on public.platform_roles
for select to authenticated
using (
  (select private.has_active_church_membership())
  or (select private.is_platform_owner())
);

create policy platform_user_roles_self_or_owner_read on public.platform_user_roles
for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_platform_owner())
);

create policy roles_read on public.roles for select to authenticated
using (
  (select private.has_active_church_membership())
  or (select private.is_platform_owner())
);

create policy users_read on public.users for select to authenticated
using (
  id = (select auth.uid())
  or (select private.is_platform_owner())
  or (select private.shares_active_church_with_user(
    id, array['Admin','Pastor','Secretary']
  ))
);

do $postconditions$
declare
  policy_count_after bigint;
  restrictive_fence_count integer;
  rls_hash_after text;
  financial_before jsonb;
  financial_after jsonb;
begin
  select count(*) into policy_count_after
  from pg_policies where schemaname = 'public';

  select count(*) into restrictive_fence_count
  from pg_policies
  where schemaname = 'public'
    and permissive = 'RESTRICTIVE'
    and policyname = tablename || '_tenant_fence';

  if policy_count_after <> 75 or restrictive_fence_count <> 14 then
    raise exception 'Stage 3 policy catalog mismatch (policies=%, fences=%)',
      policy_count_after, restrictive_fence_count;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
        ~ '(current_user_role|has_any_role)'
  ) then
    raise exception 'Stage 3 left a legacy global-role policy reference';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in (
        'accounts','categories','offerings','donations','expenses','account_transfers',
        'payables','payable_payments','members','attendance','projects','events',
        'announcements','reports'
      )
      and (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
        ~ '(is_platform_owner|is_active_platform_owner)'
  ) then
    raise exception 'Stage 3 gave Platform Owner automatic church business access';
  end if;

  if exists (
    select 1
    from unnest(array[
      'accounts','categories','offerings','donations','expenses','account_transfers',
      'payables','payable_payments','members','attendance','projects','events',
      'announcements','reports'
    ]) expected(table_name)
    where not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = expected.table_name
        and p.policyname = expected.table_name || '_tenant_fence'
        and p.permissive = 'RESTRICTIVE'
    )
  ) then
    raise exception 'Stage 3 is missing a restrictive tenant fence';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and policyname = 'users_admin_update'
  ) then
    raise exception 'Stage 3 retained the global users_admin_update policy';
  end if;

  select md5(coalesce(string_agg(
    concat_ws(E'\x1f', n.nspname, c.relname, c.relrowsecurity::text,
      c.relforcerowsecurity::text), E'\x1e' order by n.nspname, c.relname
  ), ''))
  into rls_hash_after
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p');

  if exists (
    select 1 from phase5c3_stage3_security_control
    where rls_hash is distinct from rls_hash_after
  ) then
    raise exception 'Stage 3 changed an RLS enablement or force flag';
  end if;

  if to_regprocedure('private.current_user_role()') is null
    or to_regprocedure('private.has_any_role(text[])') is null
    or to_regprocedure('private.is_active_platform_owner()') is null
  then
    raise exception 'Stage 3 removed a legacy helper before tests completed';
  end if;

  if (select count(*) from public.churches) <> 1 then
    raise exception 'Stage 3 created an unexpected church';
  end if;

  select to_jsonb(c) - 'policy_count' - 'policy_hash' - 'rls_hash'
  into financial_before
  from phase5c3_stage3_security_control c;

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
    raise exception 'Stage 3 financial controls changed';
  end if;
end
$postconditions$;

commit;
