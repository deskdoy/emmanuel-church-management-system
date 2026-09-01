begin;

grant update
on public.church_invitations
to authenticated;


create policy church_invitations_admin_update

on public.church_invitations

for update

to authenticated

using (
  private.has_church_role(
    church_invitations.church_id,
    array['Admin']
  )
)

with check (
  private.has_church_role(
    church_invitations.church_id,
    array['Admin']
  )
);


commit;npx supabase db push