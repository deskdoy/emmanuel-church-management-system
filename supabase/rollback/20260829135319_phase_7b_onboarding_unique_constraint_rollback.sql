begin;

alter table public.church_onboarding
drop constraint if exists church_onboarding_church_unique;

commit;