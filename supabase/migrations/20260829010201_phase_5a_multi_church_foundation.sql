-- Phase 5A: additive multi-church foundation only.
-- Existing application tables and RLS policies are intentionally unchanged.

create table public.churches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  address text not null default '',
  logo_url text,
  status text not null default 'active',
  timezone text not null default 'UTC',
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint churches_name_length check (char_length(btrim(name)) between 2 and 200),
  constraint churches_slug_normalized check (
    slug = lower(btrim(slug))
    and char_length(slug) between 3 and 100
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint churches_status_valid check (status in ('active', 'inactive', 'suspended')),
  constraint churches_timezone_present check (char_length(btrim(timezone)) between 1 and 100),
  constraint churches_currency_iso check (currency ~ '^[A-Z]{3}$')
);

create table public.platform_roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  created_at timestamptz not null default now(),
  constraint platform_roles_code_normalized check (
    code = lower(btrim(code))
    and char_length(code) between 3 and 60
    and code ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint platform_roles_name_length check (char_length(btrim(name)) between 2 and 100)
);

create table public.platform_user_roles (
  user_id uuid not null references public.users(id) on delete cascade,
  platform_role_id uuid not null references public.platform_roles(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, platform_role_id)
);

create table public.church_memberships (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  role_id uuid not null references public.roles(id) on delete restrict,
  status text not null default 'pending',
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint church_memberships_church_user_unique unique (church_id, user_id),
  constraint church_memberships_status_valid check (status in ('pending', 'active', 'inactive', 'revoked')),
  constraint church_memberships_active_joined check (status <> 'active' or joined_at is not null)
);

create index idx_churches_status_name
  on public.churches(status, name);

create index idx_platform_user_roles_role_active
  on public.platform_user_roles(platform_role_id, user_id)
  where is_active = true;

create index idx_church_memberships_user_status
  on public.church_memberships(user_id, status, church_id);

create index idx_church_memberships_church_role_status
  on public.church_memberships(church_id, role_id, status);

create index idx_church_memberships_role_id
  on public.church_memberships(role_id);

create trigger churches_set_updated_at
before update on public.churches
for each row execute function private.set_updated_at();

create trigger platform_user_roles_set_updated_at
before update on public.platform_user_roles
for each row execute function private.set_updated_at();

create trigger church_memberships_set_updated_at
before update on public.church_memberships
for each row execute function private.set_updated_at();

insert into public.platform_roles (code, name)
values ('platform_owner', 'Platform Owner');

insert into public.churches (name, slug, address, status, timezone, currency)
values ('Emmanuel Church', 'emmanuel-church', '', 'active', 'Asia/Manila', 'PHP');

create or replace function private.is_active_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.platform_user_roles pur
      join public.platform_roles pr on pr.id = pur.platform_role_id
      join public.users u on u.id = pur.user_id
      where pur.user_id = (select auth.uid())
        and pur.is_active = true
        and pr.code = 'platform_owner'
        and u.is_active = true
    );
$$;

create or replace function private.is_active_church_member(target_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.church_memberships cm
      join public.churches c on c.id = cm.church_id
      join public.users u on u.id = cm.user_id
      where cm.church_id = target_church_id
        and cm.user_id = (select auth.uid())
        and cm.status = 'active'
        and c.status = 'active'
        and u.is_active = true
    );
$$;

revoke all on function private.is_active_platform_owner() from public, anon, authenticated;
revoke all on function private.is_active_church_member(uuid) from public, anon, authenticated;
grant execute on function private.is_active_platform_owner() to authenticated;
grant execute on function private.is_active_church_member(uuid) to authenticated;

alter table public.churches enable row level security;
alter table public.platform_roles enable row level security;
alter table public.platform_user_roles enable row level security;
alter table public.church_memberships enable row level security;

revoke all on public.churches from anon, authenticated;
revoke all on public.platform_roles from anon, authenticated;
revoke all on public.platform_user_roles from anon, authenticated;
revoke all on public.church_memberships from anon, authenticated;

grant select on public.churches to authenticated;
grant select on public.platform_roles to authenticated;
grant select on public.platform_user_roles to authenticated;
grant select on public.church_memberships to authenticated;

create policy churches_member_or_platform_owner_read
on public.churches
for select
to authenticated
using (
  (select private.is_active_platform_owner())
  or (select private.is_active_church_member(id))
);

create policy platform_roles_authenticated_read
on public.platform_roles
for select
to authenticated
using ((select auth.uid()) is not null);

create policy platform_user_roles_self_or_owner_read
on public.platform_user_roles
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_active_platform_owner())
);

create policy church_memberships_self_or_owner_read
on public.church_memberships
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_active_platform_owner())
);

comment on table public.churches is 'Phase 5A tenant registry; not yet connected to existing church records.';
comment on table public.platform_roles is 'Platform-scoped roles kept separate from church roles.';
comment on table public.platform_user_roles is 'Platform role assignments; no initial user assignment is created in Phase 5A.';
comment on table public.church_memberships is 'Future user-to-church role assignments; existing users are not migrated in Phase 5A.';

-- Rollback boundary: these objects may be removed in reverse dependency order
-- only before a later phase references them. Existing tables and policies do not
-- need rollback because this migration does not alter them.
