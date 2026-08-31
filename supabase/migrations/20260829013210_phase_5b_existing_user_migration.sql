-- Phase 5B: connect existing users to the Emmanuel Church tenant.
-- Existing users, roles, authentication, financial tables, and RLS policies
-- are intentionally unchanged.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Keep the validation snapshot and the backfill population stable. Reads remain
-- available, while concurrent writes wait briefly or fail this migration before
-- any assignment is committed.
lock table
  public.users,
  public.roles,
  public.churches,
  public.platform_roles,
  public.platform_user_roles,
  public.church_memberships
in share row exclusive mode;

-- Validate every prerequisite before inserting any assignment. The Phase 5A
-- assignment tables must still be empty for these seeds so the rollback below
-- restores the exact Phase 5A state.
do $$
declare
  emmanuel_count integer;
  platform_owner_role_count integer;
  active_admin_count integer;
  existing_emmanuel_membership_count integer;
  existing_platform_owner_count integer;
  unmapped_user_count integer;
  missing_roles text;
begin
  select count(*)
  into emmanuel_count
  from public.churches
  where slug = 'emmanuel-church'
    and name = 'Emmanuel Church';

  if emmanuel_count <> 1 then
    raise exception 'Phase 5B requires exactly one Emmanuel Church seed; found %', emmanuel_count;
  end if;

  select count(*)
  into platform_owner_role_count
  from public.platform_roles
  where code = 'platform_owner'
    and name = 'Platform Owner';

  if platform_owner_role_count <> 1 then
    raise exception 'Phase 5B requires exactly one Platform Owner role; found %', platform_owner_role_count;
  end if;

  select string_agg(expected.name, ', ' order by expected.name)
  into missing_roles
  from (
    values
      ('Admin'),
      ('Treasurer'),
      ('Encoder'),
      ('Pastor'),
      ('Secretary'),
      ('Viewer')
  ) as expected(name)
  left join public.roles role_row on role_row.name = expected.name
  where role_row.id is null;

  if missing_roles is not null then
    raise exception 'Phase 5B is missing required church roles: %', missing_roles;
  end if;

  select count(*)
  into unmapped_user_count
  from public.users user_row
  join public.roles role_row on role_row.id = user_row.role_id
  where role_row.name not in ('Admin', 'Treasurer', 'Encoder', 'Pastor', 'Secretary', 'Viewer');

  if unmapped_user_count <> 0 then
    raise exception 'Phase 5B found % users with unsupported role mappings', unmapped_user_count;
  end if;

  select count(*)
  into active_admin_count
  from public.users user_row
  join public.roles role_row on role_row.id = user_row.role_id
  where role_row.name = 'Admin'
    and user_row.is_active = true;

  if active_admin_count <> 1 then
    raise exception 'Phase 5B requires exactly one active primary Admin; found %', active_admin_count;
  end if;

  select count(*)
  into existing_emmanuel_membership_count
  from public.church_memberships membership
  join public.churches church on church.id = membership.church_id
  where church.slug = 'emmanuel-church';

  if existing_emmanuel_membership_count <> 0 then
    raise exception 'Phase 5B expected no existing Emmanuel memberships; found %', existing_emmanuel_membership_count;
  end if;

  select count(*)
  into existing_platform_owner_count
  from public.platform_user_roles assignment
  join public.platform_roles platform_role on platform_role.id = assignment.platform_role_id
  where platform_role.code = 'platform_owner';

  if existing_platform_owner_count <> 0 then
    raise exception 'Phase 5B expected no existing Platform Owner assignments; found %', existing_platform_owner_count;
  end if;
end;
$$;

-- The singular active Admin is the existing primary administrator. This does
-- not change that user's church role or public.users record.
insert into public.platform_user_roles (
  user_id,
  platform_role_id,
  is_active
)
select
  user_row.id,
  platform_role.id,
  true
from public.users user_row
join public.roles church_role on church_role.id = user_row.role_id
cross join public.platform_roles platform_role
where church_role.name = 'Admin'
  and user_row.is_active = true
  and platform_role.code = 'platform_owner';

-- Church Admin intentionally reuses the existing public.roles "Admin" row.
-- Every other church membership keeps the user's existing role_id unchanged.
insert into public.church_memberships (
  church_id,
  user_id,
  role_id,
  status,
  joined_at
)
select
  church.id,
  user_row.id,
  user_row.role_id,
  case when user_row.is_active then 'active' else 'inactive' end,
  user_row.created_at
from public.users user_row
cross join public.churches church
where church.slug = 'emmanuel-church';

-- Validate completeness, uniqueness, role fidelity, membership status, and
-- the Platform Owner assignment before allowing the transaction to commit.
do $$
declare
  user_count integer;
  membership_count integer;
  distinct_membership_user_count integer;
  invalid_membership_count integer;
  platform_owner_assignment_count integer;
begin
  select count(*) into user_count from public.users;

  select
    count(*),
    count(distinct membership.user_id)
  into membership_count, distinct_membership_user_count
  from public.church_memberships membership
  join public.churches church on church.id = membership.church_id
  where church.slug = 'emmanuel-church';

  if membership_count <> user_count then
    raise exception 'Phase 5B membership validation failed: expected %, found %', user_count, membership_count;
  end if;

  if distinct_membership_user_count <> user_count then
    raise exception 'Phase 5B duplicate membership validation failed: expected % distinct users, found %', user_count, distinct_membership_user_count;
  end if;

  select count(*)
  into invalid_membership_count
  from public.users user_row
  left join public.church_memberships membership
    on membership.user_id = user_row.id
   and membership.church_id = (
     select church.id
     from public.churches church
     where church.slug = 'emmanuel-church'
   )
  left join public.roles source_role on source_role.id = user_row.role_id
  left join public.roles membership_role on membership_role.id = membership.role_id
  where membership.id is null
     or membership.role_id <> user_row.role_id
     or membership_role.name <> source_role.name
     or membership.status <> case when user_row.is_active then 'active' else 'inactive' end
     or membership.joined_at is null;

  if invalid_membership_count <> 0 then
    raise exception 'Phase 5B role or status validation failed for % memberships', invalid_membership_count;
  end if;

  select count(*)
  into platform_owner_assignment_count
  from public.platform_user_roles assignment
  join public.platform_roles platform_role on platform_role.id = assignment.platform_role_id
  join public.users user_row on user_row.id = assignment.user_id
  join public.roles church_role on church_role.id = user_row.role_id
  where platform_role.code = 'platform_owner'
    and assignment.is_active = true
    and user_row.is_active = true
    and church_role.name = 'Admin';

  if platform_owner_assignment_count <> 1 then
    raise exception 'Phase 5B Platform Owner validation failed: expected 1, found %', platform_owner_assignment_count;
  end if;
end;
$$;

commit;

-- Rollback before Phase 5C or any manual tenant assignments:
-- begin;
-- delete from public.church_memberships
-- where church_id = (select id from public.churches where slug = 'emmanuel-church');
-- delete from public.platform_user_roles
-- where platform_role_id = (select id from public.platform_roles where code = 'platform_owner');
-- commit;
