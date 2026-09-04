-- Church financial settings

create table if not exists public.church_settings (

  id uuid primary key default gen_random_uuid(),

  church_id uuid not null
    references public.churches(id)
    on delete cascade,

  financial_approval_required boolean
    not null
    default false,

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  unique(church_id)

);



-- Enable RLS

alter table public.church_settings
enable row level security;



-- Read settings
create policy church_settings_read

on public.church_settings

for select

to authenticated

using (

  private.is_active_church_member(
    church_settings.church_id
  )

);



-- Admin can create settings
create policy church_settings_insert

on public.church_settings

for insert

to authenticated

with check (

  private.has_church_role(
    church_settings.church_id,
    array['Admin']
  )

);



-- Admin can update settings
create policy church_settings_update

on public.church_settings

for update

to authenticated

using (

  private.has_church_role(
    church_settings.church_id,
    array['Admin']
  )

)

with check (

  private.has_church_role(
    church_settings.church_id,
    array['Admin']
  )

);



-- Admin can delete settings
create policy church_settings_delete

on public.church_settings

for delete

to authenticated

using (

  private.has_church_role(
    church_settings.church_id,
    array['Admin']
  )

);