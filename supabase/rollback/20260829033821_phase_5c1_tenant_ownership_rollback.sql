-- Manual rollback for Phase 5C-1 only.
-- Review and run in a controlled maintenance window after taking a fresh backup.
-- This script intentionally does not modify migration history or any RLS policy.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

create temp table phase5c1_rollback_targets (table_name text primary key) on commit drop;
insert into phase5c1_rollback_targets (table_name) values
  ('accounts'),('categories'),('offerings'),('donations'),('expenses'),
  ('account_transfers'),('payables'),('payable_payments'),('members'),
  ('attendance'),('projects'),('events'),('announcements'),('reports'),
  ('access_requests'),('audit_logs');

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

do $rollback_guard$
declare
  church_count integer;
  emmanuel_id uuid;
  target record;
  mismatched_rows bigint;
begin
  select count(*) into church_count from public.churches;
  if church_count <> 1 then
    raise exception
      'Phase 5C-1 rollback refused: expected exactly one church, found %',
      church_count;
  end if;

  select id into strict emmanuel_id
  from public.churches
  where slug = 'emmanuel-church' and status = 'active';

  for target in select table_name from phase5c1_rollback_targets order by table_name loop
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = target.table_name
        and column_name = 'church_id'
    ) then
      raise exception 'Phase 5C-1 rollback refused: public.%.church_id is missing', target.table_name;
    end if;

    execute format(
      'select count(*) from public.%I where church_id is distinct from $1',
      target.table_name
    ) into mismatched_rows using emmanuel_id;

    if mismatched_rows <> 0 then
      raise exception
        'Phase 5C-1 rollback refused: public.% has % rows not owned by Emmanuel Church',
        target.table_name, mismatched_rows;
    end if;
  end loop;
end
$rollback_guard$;

do $drop_compatibility_triggers$
declare
  target record;
begin
  for target in select table_name from phase5c1_rollback_targets order by table_name loop
    execute format(
      'drop trigger if exists %I on public.%I',
      'tenant_default_' || target.table_name || '_church_id',
      target.table_name
    );
  end loop;
end
$drop_compatibility_triggers$;

drop index if exists public.idx_accounts_church;
drop index if exists public.idx_categories_church;
drop index if exists public.idx_offerings_church_date;
drop index if exists public.idx_donations_church_date;
drop index if exists public.idx_expenses_church_date;
drop index if exists public.idx_account_transfers_church_date;
drop index if exists public.idx_payables_church_status_due;
drop index if exists public.idx_payable_payments_church_date;
drop index if exists public.idx_members_church_name;
drop index if exists public.idx_attendance_church_date;
drop index if exists public.idx_projects_church_status;
drop index if exists public.idx_events_church_start;
drop index if exists public.idx_announcements_church_publish;
drop index if exists public.idx_reports_church_type_created;
drop index if exists public.idx_access_requests_church_status_created;
drop index if exists public.idx_audit_logs_church_created;

do $drop_ownership_columns$
declare
  target record;
begin
  for target in select table_name from phase5c1_rollback_targets order by table_name loop
    execute format(
      'alter table public.%I drop constraint %I',
      target.table_name,
      target.table_name || '_church_id_fkey'
    );
    execute format(
      'alter table public.%I drop column church_id',
      target.table_name
    );
  end loop;
end
$drop_ownership_columns$;

drop function private.assign_single_active_church();

commit;

