-- Create payment_methods table if missing

create table if not exists public.payment_methods (

  id uuid primary key default gen_random_uuid(),

  name text not null,

  is_active boolean not null default true,

  church_id uuid not null references public.churches(id) on delete cascade,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()

);


alter table public.payment_methods
enable row level security;


drop policy if exists payment_methods_read
on public.payment_methods;

create policy payment_methods_read

on public.payment_methods

for select

to authenticated

using (
  private.is_active_church_member(
    payment_methods.church_id
  )
);



drop policy if exists payment_methods_insert
on public.payment_methods;

create policy payment_methods_insert

on public.payment_methods

for insert

to authenticated

with check (
  private.has_church_role(
    payment_methods.church_id,
    array['Admin','Treasurer']
  )
);



drop policy if exists payment_methods_update
on public.payment_methods;

create policy payment_methods_update

on public.payment_methods

for update

to authenticated

using (
  private.has_church_role(
    payment_methods.church_id,
    array['Admin','Treasurer']
  )
)

with check (
  private.has_church_role(
    payment_methods.church_id,
    array['Admin','Treasurer']
  )
);



drop policy if exists payment_methods_delete
on public.payment_methods;

create policy payment_methods_delete

on public.payment_methods

for delete

to authenticated

using (
  private.has_church_role(
    payment_methods.church_id,
    array['Admin']
  )
);