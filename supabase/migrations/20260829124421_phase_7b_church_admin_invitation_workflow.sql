-- Phase 7B: Church Admin Invitation Workflow
-- Creates secure bootstrap flow for the first Church Administrator.
-- Existing access request workflow remains unchanged.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';


-- ============================================================
-- CREATE FIRST CHURCH ADMIN INVITATION
-- ============================================================

create or replace function public.create_church_admin_invitation(
  p_church_id uuid,
  p_full_name text,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$

declare
  invitation_id uuid;
  admin_role_id uuid;
begin

  if (select auth.uid()) is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;


  if not (select private.is_platform_owner()) then
    raise exception 'Only Platform Owners can create church admin invitations'
      using errcode = '42501';
  end if;


  if not exists (
    select 1
    from public.churches
    where id = p_church_id
      and status = 'inactive'
  ) then
    raise exception 'Only inactive churches can receive first admin invitations'
      using errcode = '23514';
  end if;


  if exists (
    select 1
    from public.church_memberships cm
    join public.roles r
      on r.id = cm.role_id
    where cm.church_id = p_church_id
      and cm.status = 'active'
      and r.name = 'Admin'
  ) then
    raise exception 'This church already has an active Admin'
      using errcode = '23514';
  end if;


  select id
  into admin_role_id
  from public.roles
  where name = 'Admin';


  if admin_role_id is null then
    raise exception 'Admin role does not exist'
      using errcode = '23514';
  end if;


  insert into public.church_invitations(
    church_id,
    email,
    full_name,
    role_id,
    status,
    invited_by,
    expires_at
  )
  values(
    p_church_id,
    lower(trim(p_email)),
    trim(p_full_name),
    admin_role_id,
    'pending',
    auth.uid(),
    now() + interval '7 days'
  )
  returning id into invitation_id;


  update public.church_onboarding
  set
    stage = 'admin_invited',
    first_admin_name = trim(p_full_name),
    first_admin_email = lower(trim(p_email)),
    invited_at = now(),
    updated_at = now()
  where church_id = p_church_id;


  return invitation_id;

end

$function$;


-- ============================================================
-- ACCEPT CHURCH ADMIN INVITATION
-- ============================================================

create or replace function public.accept_church_admin_invitation(
  p_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$

declare
  invitation_row public.church_invitations%rowtype;
  admin_role_id uuid;
  current_email text;

begin

  if (select auth.uid()) is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;


  select *
  into invitation_row
  from public.church_invitations
  where id = p_invitation_id
  for update;


  if not found then
    raise exception 'Invitation not found'
      using errcode = 'P0002';
  end if;


  if invitation_row.status <> 'pending' then
    raise exception 'Invitation has already been processed'
      using errcode = '23514';
  end if;


  if invitation_row.expires_at < now() then
    raise exception 'Invitation has expired'
      using errcode = '23514';
  end if;


  select lower(email)
  into current_email
  from auth.users
  where id = auth.uid();


  if current_email is null
     or current_email <> invitation_row.email then
    raise exception 'Invitation email does not match account'
      using errcode = '23514';
  end if;


  select id
  into admin_role_id
  from public.roles
  where name = 'Admin';


  insert into public.users(
    id,
    email,
    full_name,
    role_id,
    is_active
  )
  values(
    auth.uid(),
    invitation_row.email,
    invitation_row.full_name,
    admin_role_id,
    true
  )
  on conflict(id)
  do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role_id = excluded.role_id,
    is_active = true,
    updated_at = now();


  insert into public.church_memberships(
    church_id,
    user_id,
    role_id,
    status,
    joined_at
  )
  values(
    invitation_row.church_id,
    auth.uid(),
    admin_role_id,
    'active',
    now()
  )
  on conflict(church_id,user_id)
  do update set
    role_id = excluded.role_id,
    status = 'active',
    joined_at = now(),
    updated_at = now();


  update public.church_invitations
  set
    status = 'accepted',
    invited_user_id = auth.uid(),
    accepted_at = now(),
    updated_at = now()
  where id = p_invitation_id;


  update public.church_onboarding
  set
    stage = 'admin_accepted',
    first_admin_user_id = auth.uid(),
    accepted_at = now(),
    updated_at = now()
  where church_id = invitation_row.church_id;


end

$function$;


-- ============================================================
-- PERMISSIONS
-- ============================================================

revoke all on function public.create_church_admin_invitation(uuid,text,text)
from public, anon;

revoke all on function public.accept_church_admin_invitation(uuid)
from public, anon;


grant execute on function public.create_church_admin_invitation(uuid,text,text)
to authenticated;

grant execute on function public.accept_church_admin_invitation(uuid)
to authenticated;


comment on function public.create_church_admin_invitation(uuid,text,text)
is 'Creates a first church administrator invitation for an inactive church.';

comment on function public.accept_church_admin_invitation(uuid)
is 'Accepts a church admin invitation and creates the first church membership.';


commit;