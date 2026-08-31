-- Phase 8B:
-- Allow Church Admin to update their own church profile during setup

begin;


create policy church_admin_update_church_profile

on public.churches

for update

to authenticated

using (
  private.has_church_role(
    id,
    array['Admin']
  )
)

with check (
  private.has_church_role(
    id,
    array['Admin']
  )
);


comment on policy church_admin_update_church_profile
on public.churches
is
'Allows Church Admin users to update their own church profile during setup.';


commit;