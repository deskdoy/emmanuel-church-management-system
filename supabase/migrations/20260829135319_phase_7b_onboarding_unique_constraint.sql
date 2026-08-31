-- Phase 7B: Ensure one onboarding record per church.

begin;

alter table public.church_onboarding
add constraint church_onboarding_church_unique
unique (church_id);

commit;