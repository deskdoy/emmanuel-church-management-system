-- Phase 8B:
-- Allow Church Admin to create team invitations during onboarding

begin;


grant insert
on public.church_invitations
to authenticated;


create policy church_invitations_admin_insert

on public.church_invitations

for insert

to authenticated

with check (
  private.has_church_role(
    church_invitations.church_id,
    array['Admin']
  )
);


comment on policy church_invitations_admin_insert

on public.church_invitations

is
'Allows Church Admin users to create invitations for their own church.';


commit;