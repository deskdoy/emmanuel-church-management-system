-- Phase 5D Stage 4: tenant-aware membership administration and public church resolution.
-- Additive server authorization only. Existing RLS policies remain unchanged.

begin;

create or replace function public.resolve_church_workspace(p_slug text)
returns table (
  id uuid,
  name text,
  slug text,
  logo_url text,
  timezone text,
  currency text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select c.id,c.name,c.slug,c.logo_url,c.timezone,c.currency
  from public.churches c
  where c.slug=lower(btrim(p_slug))
    and c.status='active'
    and lower(btrim(p_slug))~'^[a-z0-9]+(?:-[a-z0-9]+)*$'
  limit 1
$function$;

revoke all on function public.resolve_church_workspace(text)
from public,anon,authenticated,service_role;
grant execute on function public.resolve_church_workspace(text) to anon,authenticated;

create or replace function public.update_church_membership_access(
  p_church_id uuid,
  p_membership_id uuid,
  p_role_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target public.church_memberships%rowtype;
  final_role_name text;
  remaining_admins integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required' using errcode='42501';
  end if;
  if not (select private.has_church_role(p_church_id,array['Admin'])) then
    raise exception 'Only an active Church Admin can manage memberships' using errcode='42501';
  end if;
  if p_status not in ('active','inactive') then
    raise exception 'Membership status is invalid' using errcode='23514';
  end if;

  select * into target
  from public.church_memberships
  where id=p_membership_id and church_id=p_church_id
  for update;
  if not found then
    raise exception 'Church membership was not found' using errcode='P0002';
  end if;

  select name into final_role_name from public.roles where id=p_role_id;
  if final_role_name is null or final_role_name not in ('Admin','Treasurer','Encoder','Pastor','Secretary','Viewer') then
    raise exception 'Church role is invalid' using errcode='23514';
  end if;

  if target.user_id=(select auth.uid()) and final_role_name<>'Admin' then
    raise exception 'You cannot remove your own Church Admin role' using errcode='42501';
  end if;
  if target.user_id=(select auth.uid()) and p_status<>'active' then
    raise exception 'You cannot deactivate your own church membership' using errcode='42501';
  end if;

  if target.status='active'
     and exists(select 1 from public.roles r where r.id=target.role_id and r.name='Admin')
     and (p_status<>'active' or final_role_name<>'Admin') then
    select count(*) into remaining_admins
    from public.church_memberships cm
    join public.roles r on r.id=cm.role_id
    where cm.church_id=p_church_id
      and cm.status='active'
      and r.name='Admin'
      and cm.id<>target.id;
    if remaining_admins=0 then
      raise exception 'Every church must retain at least one active Church Admin' using errcode='23514';
    end if;
  end if;

  update public.church_memberships
  set role_id=p_role_id,
      status=p_status,
      joined_at=case when p_status='active' then coalesce(joined_at,now()) else joined_at end,
      updated_at=now()
  where id=target.id and church_id=p_church_id;
end
$function$;

revoke all on function public.update_church_membership_access(uuid,uuid,uuid,text)
from public,anon,authenticated,service_role;
grant execute on function public.update_church_membership_access(uuid,uuid,uuid,text) to authenticated;

comment on function public.resolve_church_workspace(text) is
  'Resolves minimal public identity for one active church by exact slug; exposes no membership or financial data.';
comment on function public.update_church_membership_access(uuid,uuid,uuid,text) is
  'Tenant Admin membership update with self-protection and last-active-Admin protection.';

commit;
