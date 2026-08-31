begin;
drop function if exists public.update_church_membership_access(uuid,uuid,uuid,text);
drop function if exists public.resolve_church_workspace(text);
commit;
