-- Family Grouping: church-owned families and optional member assignments.
-- Existing member policies, attendance, and relationships remain unchanged.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

create table public.families (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  notes text not null default '',
  created_by uuid not null default auth.uid() references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint families_church_id_id_key unique (church_id, id)
);

-- Existing members remain unassigned. The composite FK prevents linking a
-- member to another church's family, independently of RLS visibility.
-- Unlink members explicitly before deleting a family; never cascade to members
-- or attendance, and never clear a member's church_id.
alter table public.members
  add column family_id uuid,
  add constraint members_family_id_fkey foreign key (church_id, family_id)
    references public.families(church_id, id) on delete restrict;

-- Church-leading indexes support family directories and member-family lookups.
-- The family unique key also indexes its church ownership and composite FK target.
create index idx_families_church_name on public.families(church_id, name);
create index idx_families_created_by on public.families(created_by);
create index idx_members_church_family on public.members(church_id, family_id)
  where family_id is not null;

-- The shared prevent_church_id_change trigger has a fixed table allowlist.
-- Protect this new table with an invoker function without changing that helper.
create function private.guard_family_metadata()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op <> 'UPDATE'
    or tg_table_schema <> 'public'
    or tg_table_name <> 'families'
  then
    raise exception 'guard_family_metadata only supports family UPDATE triggers';
  end if;

  if new.church_id is distinct from old.church_id then
    raise exception 'church_id is immutable after insert' using errcode = '23514';
  end if;
  if new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Family creation metadata is immutable' using errcode = '23514';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_family_metadata() from public, anon, authenticated, service_role;

create trigger families_guard_metadata before update on public.families
for each row execute function private.guard_family_metadata();
create trigger families_set_updated_at before update on public.families
for each row execute function private.set_updated_at();
create trigger audit_families after insert or update or delete on public.families
for each row execute function private.audit_row_change();

alter table public.families enable row level security;

revoke all on public.families from public, anon, authenticated;
grant select, insert, update, delete on public.families to authenticated;

-- No platform-owner bypass. The restrictive fence applies to every operation,
-- including any permissive policies added later.
create policy families_tenant_fence on public.families as restrictive for all to authenticated
using ((select private.is_active_church_member(church_id)))
with check ((select private.is_active_church_member(church_id)));

create policy families_read on public.families for select to authenticated
using ((select private.is_active_church_member(church_id)));
create policy families_insert on public.families for insert to authenticated
with check (
  (select private.has_church_role(church_id, array['Admin','Pastor','Secretary']))
  and created_by = (select auth.uid())
);
create policy families_update on public.families for update to authenticated
using ((select private.has_church_role(church_id, array['Admin','Pastor','Secretary'])))
with check ((select private.has_church_role(church_id, array['Admin','Pastor','Secretary'])));
create policy families_delete on public.families for delete to authenticated
using ((select private.has_church_role(church_id, array['Admin','Pastor'])));

commit;
