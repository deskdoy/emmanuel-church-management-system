-- Phase 5D Stage 5: Platform Owner can create inactive church onboarding drafts.
-- Drafts do not grant financial access and cannot become active through this function.
begin;

create or replace function public.create_platform_church_draft(
  p_name text,
  p_slug text,
  p_address text,
  p_timezone text,
  p_currency text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  new_church_id uuid;
  normalized_slug text:=lower(btrim(p_slug));
  normalized_currency text:=upper(btrim(p_currency));
begin
  if (select auth.uid()) is null or not (select private.is_platform_owner()) then
    raise exception 'Only an active Platform Owner can create church drafts' using errcode='42501';
  end if;
  if char_length(btrim(p_name)) not between 2 and 200 then
    raise exception 'Church name is invalid' using errcode='23514';
  end if;
  if normalized_slug!~'^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(normalized_slug) not between 3 and 100 then
    raise exception 'Church slug is invalid' using errcode='23514';
  end if;
  if normalized_currency!~'^[A-Z]{3}$' then
    raise exception 'Currency must use a three-letter ISO code' using errcode='23514';
  end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=btrim(p_timezone)) then
    raise exception 'Timezone is invalid' using errcode='23514';
  end if;

  insert into public.churches(name,slug,address,status,timezone,currency)
  values(btrim(p_name),normalized_slug,btrim(coalesce(p_address,'')),'inactive',btrim(p_timezone),normalized_currency)
  returning id into new_church_id;
  return new_church_id;
end
$function$;

revoke all on function public.create_platform_church_draft(text,text,text,text,text)
from public,anon,authenticated,service_role;
grant execute on function public.create_platform_church_draft(text,text,text,text,text) to authenticated;

comment on function public.create_platform_church_draft(text,text,text,text,text) is
  'Creates an inactive tenant draft. No membership or financial access is assigned automatically.';

commit;
