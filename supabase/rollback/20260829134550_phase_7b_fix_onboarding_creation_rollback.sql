-- Phase 7B Fix rollback:
-- Restores previous function state by removing the override.

begin;

drop function if exists public.create_church_admin_invitation(uuid,text,text);

commit;