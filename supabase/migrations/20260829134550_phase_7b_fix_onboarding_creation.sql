-- Phase 7B Fix:
-- Ensure first admin invitation creates onboarding state safely.
-- Existing invitation workflow remains unchanged.

begin;

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


  insert into public.church_onboarding (
    church_id,
    stage
  )
  values (
    p_church_id,
    'draft'
  )
  on conflict (church_id)
  do nothing;


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


revoke all on function public.create_church_admin_invitation(uuid,text,text)
from public, anon;


grant execute on function public.create_church_admin_invitation(uuid,text,text)
to authenticated;


comment on function public.create_church_admin_invitation(uuid,text,text)
is 'Creates the first church administrator invitation and initializes onboarding state.';


commit;