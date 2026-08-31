begin;

-- Restore previous function through migration history if needed.

drop function if exists public.accept_church_admin_invitation(uuid);

commit;