-- Phase 19.7: Announcement Audience Targeting.
-- Review-only draft at the requested filename. Not applied.
-- Target vocabulary: All, Member, Family, Event, Role. Role IDs reference public.roles,
-- interpreted within church_id; they never grant permissions or platform access.
-- This stores audience metadata only. Existing announcement visibility and
-- publication policies remain unchanged; targeting is not a confidentiality rule.
-- Requires the tenant authorization/audit helpers and Family Grouping migration.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Announcements do not yet have this composite key. It makes the child FK
-- enforce church ownership independently of RLS, including for privileged writes.
alter table public.announcements
  add constraint announcements_church_id_id_key unique (church_id, id);

create table public.announcement_targets (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete restrict,
  announcement_id uuid not null,
  target_type text not null,
  target_id uuid,
  created_at timestamptz not null default now(),
  constraint announcement_targets_announcement_fkey
    foreign key (church_id, announcement_id)
    references public.announcements(church_id, id) on delete cascade,
  constraint announcement_targets_type_check
    check (target_type in ('All', 'Member', 'Family', 'Event', 'Role')),
  constraint announcement_targets_id_check check (
    (target_type = 'All' and target_id is null)
    or (target_type in ('Member', 'Family', 'Event', 'Role') and target_id is not null)
  ),
  constraint announcement_targets_announcement_type_target_key
    unique (announcement_id, target_type, target_id)
);

-- The unique indexes also support church and announcement lookups. Separate
-- partial indexes prevent duplicate All targets without relying on NULL equality.
create unique index idx_announcement_targets_specific
  on public.announcement_targets(church_id, announcement_id, target_type, target_id)
  where target_id is not null;
create unique index idx_announcement_targets_all
  on public.announcement_targets(church_id, announcement_id)
  where target_type = 'All';
-- Non-partial index supports the announcement FK cascade for all target types.
create index idx_announcement_targets_church_announcement
  on public.announcement_targets(church_id, announcement_id);
create index idx_announcement_targets_church_target
  on public.announcement_targets(church_id, target_type, target_id)
  where target_id is not null;

-- target_id is polymorphic: validate it against the appropriate RLS-visible
-- directory on every write. It is not a foreign key to all four directories.
-- Deleting a member/family/event does not broaden its audience: that stale ID simply
-- matches nobody, and managers can remove the target. Never fall back to All.
-- The shared church metadata guard has a fixed table allowlist, so use a private
-- invoker trigger for this table without modifying existing helpers or policies.
create function private.guard_announcement_target()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if tg_op not in ('INSERT', 'UPDATE')
    or tg_table_schema <> 'public'
    or tg_table_name <> 'announcement_targets'
  then
    raise exception 'guard_announcement_target only supports announcement target writes';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.church_id is distinct from old.church_id
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Announcement target identity and creation metadata are immutable'
        using errcode = '23514';
    end if;
  end if;

  if new.target_type = 'Member' and not exists (
    select 1 from public.members m
    where m.church_id = new.church_id and m.id = new.target_id
  ) then
    raise exception 'Target member is not available in this church' using errcode = '23503';
  elsif new.target_type = 'Family' and not exists (
    select 1 from public.families f
    where f.church_id = new.church_id and f.id = new.target_id
  ) then
    raise exception 'Target family is not available in this church' using errcode = '23503';
  elsif new.target_type = 'Event' and not exists (
    select 1 from public.events e
    where e.church_id = new.church_id and e.id = new.target_id
  ) then
    raise exception 'Target event is not available in this church' using errcode = '23503';
  elsif new.target_type = 'Role' and not exists (
    select 1 from public.roles r where r.id = new.target_id
  ) then
    raise exception 'Target church role is not available' using errcode = '23503';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_announcement_target()
  from public, anon, authenticated, service_role;

create trigger announcement_targets_guard before insert or update on public.announcement_targets
for each row execute function private.guard_announcement_target();
create trigger audit_announcement_targets after insert or update or delete on public.announcement_targets
for each row execute function private.audit_row_change();
-- No updated_at column: created_at defaults to now() and is immutable on update.
-- Audit history records subsequent changes, including cascade deletes.

alter table public.announcement_targets enable row level security;

revoke all on public.announcement_targets from public, anon, authenticated;
grant select, insert, update, delete on public.announcement_targets to authenticated;

-- No platform-owner bypass. Both existing and proposed rows must pass the fence.
create policy announcement_targets_tenant_fence on public.announcement_targets
as restrictive for all to authenticated
using ((select private.is_active_church_member(church_id)))
with check ((select private.is_active_church_member(church_id)));

create policy announcement_targets_read on public.announcement_targets
for select to authenticated
using ((select private.is_active_church_member(church_id)));

create policy announcement_targets_insert on public.announcement_targets
for insert to authenticated
with check ((select private.has_church_role(church_id, array['Admin','Pastor','Secretary'])));

create policy announcement_targets_update on public.announcement_targets
for update to authenticated
using ((select private.has_church_role(church_id, array['Admin','Pastor','Secretary'])))
with check ((select private.has_church_role(church_id, array['Admin','Pastor','Secretary'])));

create policy announcement_targets_delete on public.announcement_targets
for delete to authenticated
using ((select private.has_church_role(church_id, array['Admin','Pastor','Secretary'])));

commit;
