-- Phase 7C:
-- Activate church after first admin accepts invitation.
-- Allows onboarding flow:
-- inactive church -> admin accepted -> active church

begin;

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


  if admin_role_id is null then
    raise exception 'Admin role does not exist'
      using errcode = '23514';
  end if;


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


  -- Activate church after first admin completes setup

  update public.churches
  set
    status = 'active',
    updated_at = now()
  where id = invitation_row.church_id;


end

$function$;


revoke all on function public.accept_church_admin_invitation(uuid)
from public, anon;


grant execute on function public.accept_church_admin_invitation(uuid)
to authenticated;


comment on function public.accept_church_admin_invitation(uuid)
is 'Accepts first church admin invitation, creates membership, completes onboarding, and activates church.';


commit;