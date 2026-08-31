-- Phase 7A rollback:
-- Removes church onboarding foundation objects.

begin;

drop policy if exists church_onboarding_platform_owner_read
on public.church_onboarding;

drop policy if exists church_onboarding_admin_read
on public.church_onboarding;

drop policy if exists church_invitations_platform_owner_read
on public.church_invitations;

drop policy if exists church_invitations_admin_read
on public.church_invitations;


drop trigger if exists church_onboarding_set_updated_at
on public.church_onboarding;

drop trigger if exists church_invitations_set_updated_at
on public.church_invitations;


drop table if exists public.church_invitations;

drop table if exists public.church_onboarding;

commit;