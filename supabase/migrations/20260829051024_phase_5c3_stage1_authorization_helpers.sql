-- Phase 5C-3 Stage 1 only: tenant authorization helpers.
-- No RLS policy, trigger, table, financial row, authentication, or frontend change.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

create temp table phase5c3_stage1_controls on commit drop as
select
  (select count(*) from pg_policies where schemaname = 'public') as policy_count,
  (select md5(coalesce(string_agg(
    concat_ws(E'\x1f', schemaname, tablename, policyname, permissive, roles::text,
      cmd, coalesce(qual, ''), coalesce(with_check, '')),
    E'\x1e' order by tablename, policyname
  ), '')) from pg_policies where schemaname = 'public') as policy_hash,
  (select md5(coalesce(string_agg(
    concat_ws(E'\x1f', p.proname, pg_get_function_identity_arguments(p.oid),
      pg_get_functiondef(p.oid), coalesce(p.proacl::text, '')),
    E'\x1e' order by p.proname, pg_get_function_identity_arguments(p.oid)
  ), ''))
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.proname in (
       'current_user_role', 'has_any_role', 'is_active_church_member',
       'is_active_platform_owner'
     )) as legacy_helper_hash,
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
  church_count integer;
  emmanuel_count integer;
begin
  select count(*), count(*) filter (
    where slug = 'emmanuel-church' and name = 'Emmanuel Church' and status = 'active'
  )
  into church_count, emmanuel_count
  from public.churches;

  if church_count <> 1 or emmanuel_count <> 1 then
    raise exception
      'Stage 1 requires exactly one active Emmanuel Church (churches=%, Emmanuel=%)',
      church_count, emmanuel_count;
  end if;

  if (select count(*) from pg_policies where schemaname = 'public') <> 62 then
    raise exception 'Stage 1 expected the reviewed 62-policy baseline';
  end if;
end
$preconditions$;

create or replace function private.has_church_role(
  target_church_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select auth.uid()) is not null
    and target_church_id is not null
    and coalesce(cardinality(allowed_roles), 0) > 0
    and exists (
      select 1
      from public.church_memberships cm
      join public.churches c on c.id = cm.church_id
      join public.users u on u.id = cm.user_id
      join public.roles r on r.id = cm.role_id
      where cm.church_id = target_church_id
        and cm.user_id = (select auth.uid())
        and cm.status = 'active'
        and c.status = 'active'
        and u.is_active = true
        and r.name = any(allowed_roles)
    );
$function$;

create or replace function private.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
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
$function$;

create or replace function private.has_active_church_membership()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.church_memberships cm
      join public.churches c on c.id = cm.church_id
      join public.users u on u.id = cm.user_id
      where cm.user_id = (select auth.uid())
        and cm.status = 'active'
        and c.status = 'active'
        and u.is_active = true
    );
$function$;

create or replace function private.shares_active_church_with_user(
  target_user_id uuid,
  viewer_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select auth.uid()) is not null
    and target_user_id is not null
    and coalesce(cardinality(viewer_roles), 0) > 0
    and exists (
      select 1
      from public.church_memberships viewer_membership
      join public.roles viewer_role on viewer_role.id = viewer_membership.role_id
      join public.churches c on c.id = viewer_membership.church_id
      join public.users viewer_user on viewer_user.id = viewer_membership.user_id
      join public.church_memberships target_membership
        on target_membership.church_id = viewer_membership.church_id
       and target_membership.user_id = target_user_id
       and target_membership.status = 'active'
      join public.users target_user on target_user.id = target_membership.user_id
      where viewer_membership.user_id = (select auth.uid())
        and viewer_membership.status = 'active'
        and viewer_role.name = any(viewer_roles)
        and c.status = 'active'
        and viewer_user.is_active = true
        and target_user.is_active = true
    );
$function$;

create or replace function private.is_active_church(target_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select target_church_id is not null
    and exists (
      select 1
      from public.churches c
      where c.id = target_church_id
        and c.status = 'active'
    );
$function$;

revoke all on function private.has_church_role(uuid, text[])
  from public, anon, authenticated, service_role;
revoke all on function private.is_platform_owner()
  from public, anon, authenticated, service_role;
revoke all on function private.has_active_church_membership()
  from public, anon, authenticated, service_role;
revoke all on function private.shares_active_church_with_user(uuid, text[])
  from public, anon, authenticated, service_role;
revoke all on function private.is_active_church(uuid)
  from public, anon, authenticated, service_role;

grant execute on function private.has_church_role(uuid, text[]) to authenticated;
grant execute on function private.is_platform_owner() to authenticated;
grant execute on function private.has_active_church_membership() to authenticated;
grant execute on function private.shares_active_church_with_user(uuid, text[]) to authenticated;
grant execute on function private.is_active_church(uuid) to anon, authenticated;

comment on function private.has_church_role(uuid, text[]) is
  'Checks the caller active membership and church role for a specific active church.';
comment on function private.is_platform_owner() is
  'Checks only the active platform_owner assignment; does not grant church access.';
comment on function private.has_active_church_membership() is
  'Checks whether the caller has any active membership in an active church.';
comment on function private.shares_active_church_with_user(uuid, text[]) is
  'Checks whether caller and target share an active church and caller has an allowed role there.';
comment on function private.is_active_church(uuid) is
  'Narrow active-church lookup used for tenant-safe public access request validation.';

do $helper_tests$
declare
  membership record;
  owner record;
  emmanuel_id uuid;
begin
  select id into strict emmanuel_id
  from public.churches
  where slug = 'emmanuel-church' and status = 'active';

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  if private.is_platform_owner()
    or private.has_active_church_membership()
    or private.has_church_role(emmanuel_id, array['Admin'])
  then
    raise exception 'Stage 1 anonymous helper test failed';
  end if;

  if not private.is_active_church(emmanuel_id)
    or private.is_active_church(gen_random_uuid())
  then
    raise exception 'Stage 1 active church helper test failed';
  end if;

  for membership in
    select cm.user_id, cm.status, r.name as role_name, u.is_active as user_active
    from public.church_memberships cm
    join public.roles r on r.id = cm.role_id
    join public.users u on u.id = cm.user_id
    where cm.church_id = emmanuel_id
  loop
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', membership.user_id, 'role', 'authenticated')::text,
      true
    );

    if private.is_active_church_member(emmanuel_id)
       is distinct from (membership.status = 'active' and membership.user_active)
    then
      raise exception 'Stage 1 membership helper mismatch for user %', membership.user_id;
    end if;

    if private.has_active_church_membership()
       is distinct from (membership.status = 'active' and membership.user_active)
    then
      raise exception 'Stage 1 any-membership helper mismatch for user %', membership.user_id;
    end if;

    if private.has_church_role(emmanuel_id, array[membership.role_name])
       is distinct from (membership.status = 'active' and membership.user_active)
    then
      raise exception 'Stage 1 role helper mismatch for user %', membership.user_id;
    end if;

    if private.has_church_role(emmanuel_id, array[]::text[])
       or private.has_church_role(emmanuel_id, null::text[])
    then
      raise exception 'Stage 1 empty role list failed closed for user %', membership.user_id;
    end if;
  end loop;

  for owner in
    select distinct pur.user_id
    from public.platform_user_roles pur
    join public.platform_roles pr on pr.id = pur.platform_role_id
    join public.users u on u.id = pur.user_id
    where pur.is_active = true and pr.code = 'platform_owner' and u.is_active = true
  loop
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', owner.user_id, 'role', 'authenticated')::text,
      true
    );

    if not private.is_platform_owner()
      or private.is_platform_owner() is distinct from private.is_active_platform_owner()
    then
      raise exception 'Stage 1 platform owner helper mismatch for user %', owner.user_id;
    end if;
  end loop;

  perform set_config('request.jwt.claims', '{}', true);
end
$helper_tests$;

do $postconditions$
declare
  policy_count_after bigint;
  policy_hash_after text;
  legacy_helper_hash_after text;
  financial_after jsonb;
  financial_before jsonb;
begin
  select
    count(*),
    md5(coalesce(string_agg(
      concat_ws(E'\x1f', schemaname, tablename, policyname, permissive, roles::text,
        cmd, coalesce(qual, ''), coalesce(with_check, '')),
      E'\x1e' order by tablename, policyname
    ), ''))
  into policy_count_after, policy_hash_after
  from pg_policies
  where schemaname = 'public';

  select md5(coalesce(string_agg(
    concat_ws(E'\x1f', p.proname, pg_get_function_identity_arguments(p.oid),
      pg_get_functiondef(p.oid), coalesce(p.proacl::text, '')),
    E'\x1e' order by p.proname, pg_get_function_identity_arguments(p.oid)
  ), ''))
  into legacy_helper_hash_after
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname in (
      'current_user_role', 'has_any_role', 'is_active_church_member',
      'is_active_platform_owner'
    );

  if exists (
    select 1 from phase5c3_stage1_controls
    where policy_count is distinct from policy_count_after
       or policy_hash is distinct from policy_hash_after
       or legacy_helper_hash is distinct from legacy_helper_hash_after
  ) then
    raise exception 'Stage 1 changed a legacy helper or RLS policy';
  end if;

  select to_jsonb(c) - 'policy_count' - 'policy_hash' - 'legacy_helper_hash'
  into financial_before
  from phase5c3_stage1_controls c;

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
    raise exception 'Stage 1 financial controls changed';
  end if;
end
$postconditions$;

commit;
