-- Phase 7B rollback:
-- Removes church admin invitation workflow functions.

begin;

drop function if exists public.accept_church_admin_invitation(uuid);

drop function if exists public.create_church_admin_invitation(uuid,text,text);

commit;