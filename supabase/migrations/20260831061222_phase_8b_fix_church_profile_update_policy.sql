begin;


drop policy if exists church_admin_update_church_profile
on public.churches;


create policy church_admin_update_church_profile

on public.churches

for update

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
)

with check (
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