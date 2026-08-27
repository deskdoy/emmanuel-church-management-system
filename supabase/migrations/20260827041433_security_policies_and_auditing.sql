-- Authentication profile sync, role-based RLS, timestamps, and immutable audit history.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.name
  from public.users u
  join public.roles r on r.id = u.role_id
  where u.id = (select auth.uid()) and u.is_active = true
  limit 1;
$$;

create or replace function private.has_any_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and coalesce((select private.current_user_role()) = any(allowed_roles), false);
$$;

revoke all on function private.current_user_role() from public;
revoke all on function private.has_any_role(text[]) from public;
grant execute on function private.current_user_role() to authenticated;
grant execute on function private.has_any_role(text[]) to authenticated;

create or replace function private.sync_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_role_id uuid;
begin
  select id into viewer_role_id from public.roles where name = 'Viewer';
  insert into public.users (id, email, full_name, role_id)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''), viewer_role_id)
  on conflict (id) do update set
    email = excluded.email,
    full_name = case when excluded.full_name <> '' then excluded.full_name else public.users.full_name end,
    updated_at = now();
  return new;
end;
$$;

revoke all on function private.sync_auth_user() from public;
create trigger sync_auth_user_profile
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function private.sync_auth_user();

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at before update on public.users for each row execute function private.set_updated_at();
create trigger accounts_set_updated_at before update on public.accounts for each row execute function private.set_updated_at();
create trigger categories_set_updated_at before update on public.categories for each row execute function private.set_updated_at();
create trigger members_set_updated_at before update on public.members for each row execute function private.set_updated_at();
create trigger projects_set_updated_at before update on public.projects for each row execute function private.set_updated_at();
create trigger events_set_updated_at before update on public.events for each row execute function private.set_updated_at();
create trigger attendance_set_updated_at before update on public.attendance for each row execute function private.set_updated_at();
create trigger offerings_set_updated_at before update on public.offerings for each row execute function private.set_updated_at();
create trigger donations_set_updated_at before update on public.donations for each row execute function private.set_updated_at();
create trigger expenses_set_updated_at before update on public.expenses for each row execute function private.set_updated_at();
create trigger payables_set_updated_at before update on public.payables for each row execute function private.set_updated_at();
create trigger announcements_set_updated_at before update on public.announcements for each row execute function private.set_updated_at();

create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_id text;
begin
  if tg_op = 'DELETE' then
    row_id := old.id::text;
    insert into public.audit_logs (actor_user_id, action, table_name, record_id, old_values)
    values ((select auth.uid()), tg_op, tg_table_name, row_id, to_jsonb(old));
    return old;
  elsif tg_op = 'UPDATE' then
    row_id := new.id::text;
    insert into public.audit_logs (actor_user_id, action, table_name, record_id, old_values, new_values)
    values ((select auth.uid()), tg_op, tg_table_name, row_id, to_jsonb(old), to_jsonb(new));
    return new;
  else
    row_id := new.id::text;
    insert into public.audit_logs (actor_user_id, action, table_name, record_id, new_values)
    values ((select auth.uid()), tg_op, tg_table_name, row_id, to_jsonb(new));
    return new;
  end if;
end;
$$;

revoke all on function private.audit_row_change() from public;

create trigger audit_users after insert or update or delete on public.users for each row execute function private.audit_row_change();
create trigger audit_members after insert or update or delete on public.members for each row execute function private.audit_row_change();
create trigger audit_attendance after insert or update or delete on public.attendance for each row execute function private.audit_row_change();
create trigger audit_offerings after insert or update or delete on public.offerings for each row execute function private.audit_row_change();
create trigger audit_donations after insert or update or delete on public.donations for each row execute function private.audit_row_change();
create trigger audit_expenses after insert or update or delete on public.expenses for each row execute function private.audit_row_change();
create trigger audit_projects after insert or update or delete on public.projects for each row execute function private.audit_row_change();
create trigger audit_announcements after insert or update or delete on public.announcements for each row execute function private.audit_row_change();
create trigger audit_events after insert or update or delete on public.events for each row execute function private.audit_row_change();
create trigger audit_reports after insert or update or delete on public.reports for each row execute function private.audit_row_change();
create trigger audit_accounts after insert or update or delete on public.accounts for each row execute function private.audit_row_change();
create trigger audit_categories after insert or update or delete on public.categories for each row execute function private.audit_row_change();
create trigger audit_payables after insert or update or delete on public.payables for each row execute function private.audit_row_change();

alter table public.roles enable row level security;
alter table public.users enable row level security;
alter table public.members enable row level security;
alter table public.attendance enable row level security;
alter table public.offerings enable row level security;
alter table public.donations enable row level security;
alter table public.expenses enable row level security;
alter table public.projects enable row level security;
alter table public.announcements enable row level security;
alter table public.events enable row level security;
alter table public.reports enable row level security;
alter table public.audit_logs enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.payables enable row level security;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

grant select on public.roles, public.users, public.members, public.attendance, public.offerings,
  public.donations, public.expenses, public.projects, public.announcements, public.events,
  public.reports, public.audit_logs, public.accounts, public.categories, public.payables to authenticated;
grant insert, update, delete on public.members, public.attendance, public.offerings, public.donations,
  public.expenses, public.projects, public.announcements, public.events, public.reports,
  public.accounts, public.categories, public.payables to authenticated;
grant update on public.users to authenticated;
grant usage, select on all sequences in schema public to authenticated;

create policy roles_read on public.roles for select to authenticated
using ((select private.current_user_role()) is not null);

create policy users_read on public.users for select to authenticated
using (id = (select auth.uid()) or (select private.has_any_role(array['Admin','Pastor','Secretary'])));
create policy users_admin_update on public.users for update to authenticated
using ((select private.has_any_role(array['Admin'])))
with check ((select private.has_any_role(array['Admin'])));

create policy members_read on public.members for select to authenticated
using ((select private.current_user_role()) is not null);
create policy members_write on public.members for insert to authenticated
with check ((select private.has_any_role(array['Admin','Pastor','Secretary','Encoder'])));
create policy members_update on public.members for update to authenticated
using ((select private.has_any_role(array['Admin','Pastor','Secretary','Encoder'])))
with check ((select private.has_any_role(array['Admin','Pastor','Secretary','Encoder'])));
create policy members_delete on public.members for delete to authenticated
using ((select private.has_any_role(array['Admin','Pastor'])));

create policy attendance_read on public.attendance for select to authenticated
using ((select private.current_user_role()) is not null);
create policy attendance_write on public.attendance for insert to authenticated
with check ((select private.has_any_role(array['Admin','Pastor','Secretary','Encoder'])));
create policy attendance_update on public.attendance for update to authenticated
using ((select private.has_any_role(array['Admin','Pastor','Secretary','Encoder'])))
with check ((select private.has_any_role(array['Admin','Pastor','Secretary','Encoder'])));
create policy attendance_delete on public.attendance for delete to authenticated
using ((select private.has_any_role(array['Admin','Pastor','Secretary'])));

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

create policy payables_read on public.payables for select to authenticated using ((select private.current_user_role()) is not null);
create policy payables_insert on public.payables for insert to authenticated with check ((select private.has_any_role(array['Admin','Treasurer','Encoder'])));
create policy payables_update on public.payables for update to authenticated using ((select private.has_any_role(array['Admin','Treasurer','Encoder']))) with check ((select private.has_any_role(array['Admin','Treasurer','Encoder'])));
create policy payables_delete on public.payables for delete to authenticated using ((select private.has_any_role(array['Admin','Treasurer'])));

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
using ((select private.has_any_role(array['Admin','Pastor'])));

-- Restrict future objects unless a later migration explicitly grants access.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
