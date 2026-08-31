-- Full Phase 5C-3 Stage 3 policy rollback snapshot.
-- SAFE ONLY while Emmanuel Church is the sole persistent tenant.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $rollback_preconditions$
begin
  if (select count(*) from public.churches) <> 1
    or (select count(*) from public.churches
        where slug = 'emmanuel-church' and status = 'active') <> 1
  then
    raise exception 'Stage 3 policy rollback is prohibited after another tenant exists';
  end if;
end
$rollback_preconditions$;

do $drop_stage3_policies$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'access_requests','account_transfers','accounts','announcements','attendance',
        'audit_logs','categories','church_memberships','churches','donations','events',
        'expenses','members','offerings','payable_payments','payables','platform_roles',
        'platform_user_roles','projects','reports','roles','users'
      ])
    order by tablename, policyname
  loop
    execute format('drop policy %I on %I.%I',
      policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end
$drop_stage3_policies$;

create policy access_requests_public_insert on public.access_requests
for insert to anon, authenticated
with check (status = 'Pending' and approved_role is null and approved_by is null and approved_at is null);
create policy access_requests_admin_read on public.access_requests
for select to authenticated using ((select private.has_any_role(array['Admin'])));

create policy account_transfers_read on public.account_transfers for select to authenticated
using ((select private.current_user_role()) is not null);
create policy account_transfers_insert on public.account_transfers for insert to authenticated
with check ((select private.has_any_role(array['Admin','Treasurer','Encoder']))
  and recorded_by = (select auth.uid()));

create policy accounts_read on public.accounts for select to authenticated using ((select private.current_user_role()) is not null);
create policy accounts_insert on public.accounts for insert to authenticated with check ((select private.has_any_role(array['Admin','Treasurer'])));
create policy accounts_update on public.accounts for update to authenticated using ((select private.has_any_role(array['Admin','Treasurer']))) with check ((select private.has_any_role(array['Admin','Treasurer'])));
create policy accounts_delete on public.accounts for delete to authenticated using ((select private.has_any_role(array['Admin'])));

create policy categories_read on public.categories for select to authenticated using ((select private.current_user_role()) is not null);
create policy categories_insert on public.categories for insert to authenticated with check ((select private.has_any_role(array['Admin','Treasurer'])));
create policy categories_update on public.categories for update to authenticated using ((select private.has_any_role(array['Admin','Treasurer']))) with check ((select private.has_any_role(array['Admin','Treasurer'])));
create policy categories_delete on public.categories for delete to authenticated using ((select private.has_any_role(array['Admin'])));

create policy offerings_read on public.offerings for select to authenticated using ((select private.current_user_role()) is not null);
create policy offerings_insert on public.offerings for insert to authenticated with check ((select private.has_any_role(array['Admin','Treasurer','Encoder'])));
create policy offerings_update on public.offerings for update to authenticated using ((select private.has_any_role(array['Admin','Treasurer','Encoder']))) with check ((select private.has_any_role(array['Admin','Treasurer','Encoder'])));
create policy offerings_delete on public.offerings for delete to authenticated using ((select private.has_any_role(array['Admin','Treasurer'])));

create policy donations_read on public.donations for select to authenticated using ((select private.current_user_role()) is not null);
create policy donations_insert on public.donations for insert to authenticated with check ((select private.has_any_role(array['Admin','Treasurer','Encoder'])));
create policy donations_update on public.donations for update to authenticated using ((select private.has_any_role(array['Admin','Treasurer','Encoder']))) with check ((select private.has_any_role(array['Admin','Treasurer','Encoder'])));
create policy donations_delete on public.donations for delete to authenticated using ((select private.has_any_role(array['Admin','Treasurer'])));

create policy expenses_read on public.expenses for select to authenticated using ((select private.current_user_role()) is not null);
create policy expenses_insert on public.expenses for insert to authenticated with check ((select private.has_any_role(array['Admin','Treasurer','Encoder'])));
create policy expenses_update on public.expenses for update to authenticated using ((select private.has_any_role(array['Admin','Treasurer','Encoder']))) with check ((select private.has_any_role(array['Admin','Treasurer','Encoder'])));
create policy expenses_delete on public.expenses for delete to authenticated using ((select private.has_any_role(array['Admin','Treasurer'])));

create policy payable_payments_read on public.payable_payments for select to authenticated
using ((select private.current_user_role()) is not null);
create policy payable_payments_insert on public.payable_payments for insert to authenticated
with check ((select private.has_any_role(array['Admin','Treasurer','Encoder']))
  and recorded_by = (select auth.uid()));

create policy payables_read on public.payables for select to authenticated using ((select private.current_user_role()) is not null);
create policy payables_insert on public.payables for insert to authenticated with check ((select private.has_any_role(array['Admin','Treasurer','Encoder'])));
create policy payables_update on public.payables for update to authenticated using ((select private.has_any_role(array['Admin','Treasurer','Encoder']))) with check ((select private.has_any_role(array['Admin','Treasurer','Encoder'])));
create policy payables_delete on public.payables for delete to authenticated using ((select private.has_any_role(array['Admin','Treasurer'])));

create policy members_read on public.members for select to authenticated using ((select private.current_user_role()) is not null);
create policy members_write on public.members for insert to authenticated with check ((select private.has_any_role(array['Admin','Pastor','Secretary','Encoder'])));
create policy members_update on public.members for update to authenticated using ((select private.has_any_role(array['Admin','Pastor','Secretary','Encoder']))) with check ((select private.has_any_role(array['Admin','Pastor','Secretary','Encoder'])));
create policy members_delete on public.members for delete to authenticated using ((select private.has_any_role(array['Admin','Pastor'])));

create policy attendance_read on public.attendance for select to authenticated using ((select private.current_user_role()) is not null);
create policy attendance_write on public.attendance for insert to authenticated with check ((select private.has_any_role(array['Admin','Pastor','Secretary','Encoder'])));
create policy attendance_update on public.attendance for update to authenticated using ((select private.has_any_role(array['Admin','Pastor','Secretary','Encoder']))) with check ((select private.has_any_role(array['Admin','Pastor','Secretary','Encoder'])));
create policy attendance_delete on public.attendance for delete to authenticated using ((select private.has_any_role(array['Admin','Pastor','Secretary'])));

create policy projects_read on public.projects for select to authenticated using ((select private.current_user_role()) is not null);
create policy projects_insert on public.projects for insert to authenticated with check ((select private.has_any_role(array['Admin','Pastor','Secretary'])));
create policy projects_update on public.projects for update to authenticated using ((select private.has_any_role(array['Admin','Pastor','Secretary']))) with check ((select private.has_any_role(array['Admin','Pastor','Secretary'])));
create policy projects_delete on public.projects for delete to authenticated using ((select private.has_any_role(array['Admin','Pastor'])));

create policy announcements_read on public.announcements for select to authenticated using ((select private.current_user_role()) is not null);
create policy announcements_insert on public.announcements for insert to authenticated with check ((select private.has_any_role(array['Admin','Pastor','Secretary'])));
create policy announcements_update on public.announcements for update to authenticated using ((select private.has_any_role(array['Admin','Pastor','Secretary']))) with check ((select private.has_any_role(array['Admin','Pastor','Secretary'])));
create policy announcements_delete on public.announcements for delete to authenticated using ((select private.has_any_role(array['Admin','Pastor','Secretary'])));

create policy events_read on public.events for select to authenticated using ((select private.current_user_role()) is not null);
create policy events_insert on public.events for insert to authenticated with check ((select private.has_any_role(array['Admin','Pastor','Secretary'])));
create policy events_update on public.events for update to authenticated using ((select private.has_any_role(array['Admin','Pastor','Secretary']))) with check ((select private.has_any_role(array['Admin','Pastor','Secretary'])));
create policy events_delete on public.events for delete to authenticated using ((select private.has_any_role(array['Admin','Pastor','Secretary'])));

create policy reports_read on public.reports for select to authenticated using ((select private.current_user_role()) is not null);
create policy reports_insert on public.reports for insert to authenticated with check ((select private.has_any_role(array['Admin','Pastor','Treasurer','Secretary'])));
create policy reports_update on public.reports for update to authenticated using ((select private.has_any_role(array['Admin','Pastor','Treasurer','Secretary']))) with check ((select private.has_any_role(array['Admin','Pastor','Treasurer','Secretary'])));
create policy reports_delete on public.reports for delete to authenticated using ((select private.has_any_role(array['Admin','Treasurer'])));

create policy audit_logs_read on public.audit_logs for select to authenticated
using ((select private.has_any_role(array['Admin'])));

create policy roles_read on public.roles for select to authenticated
using ((select private.current_user_role()) is not null);
create policy users_read on public.users for select to authenticated
using (id = (select auth.uid()) or (select private.has_any_role(array['Admin','Pastor','Secretary'])));
create policy users_admin_update on public.users for update to authenticated
using ((select private.has_any_role(array['Admin'])))
with check ((select private.has_any_role(array['Admin'])));

create policy churches_member_or_platform_owner_read on public.churches
for select to authenticated
using ((select private.is_active_platform_owner()) or (select private.is_active_church_member(id)));
create policy platform_roles_authenticated_read on public.platform_roles
for select to authenticated using ((select auth.uid()) is not null);
create policy platform_user_roles_self_or_owner_read on public.platform_user_roles
for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_active_platform_owner()));
create policy church_memberships_self_or_owner_read on public.church_memberships
for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_active_platform_owner()));

do $rollback_postconditions$
begin
  if (select count(*) from pg_policies where schemaname = 'public') <> 62 then
    raise exception 'Stage 3 rollback did not restore the 62-policy baseline';
  end if;
end
$rollback_postconditions$;

commit;
