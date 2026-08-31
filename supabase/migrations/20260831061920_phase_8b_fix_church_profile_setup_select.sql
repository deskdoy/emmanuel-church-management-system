begin;


create policy church_admin_profile_setup_read

on public.churches

for select

to authenticated

using (
  exists (
    select 1
    from public.church_memberships cm
    join public.roles r
      on r.id = cm.role_id
    where cm.church_id = churches.id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and r.name = 'Admin'
  )
);


commit;