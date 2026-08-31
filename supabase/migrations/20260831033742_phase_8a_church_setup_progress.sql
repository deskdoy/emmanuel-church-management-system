-- Phase 8A: Church Setup Progress Foundation

begin;

create table public.church_setup_progress (

  id uuid primary key default gen_random_uuid(),

  church_id uuid not null
    references public.churches(id)
    on delete cascade,

  profile_completed boolean not null default false,

  financial_setup_completed boolean not null default false,

  team_setup_completed boolean not null default false,

  setup_completed boolean not null default false,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint church_setup_progress_church_unique
    unique (church_id)

);


create index idx_church_setup_progress_church
on public.church_setup_progress(church_id);


create trigger church_setup_progress_set_updated_at

before update on public.church_setup_progress

for each row execute function private.set_updated_at();


-- Existing Emmanuel Church already completed setup

insert into public.church_setup_progress(
  church_id,
  profile_completed,
  financial_setup_completed,
  team_setup_completed,
  setup_completed
)

select
  id,
  true,
  true,
  true,
  true

from public.churches

where slug = 'emmanuel-church'

on conflict (church_id)
do nothing;


-- Security

alter table public.church_setup_progress
enable row level security;


revoke all
on public.church_setup_progress
from anon, authenticated;


grant select, insert, update
on public.church_setup_progress
to authenticated;


create policy church_setup_progress_member_read

on public.church_setup_progress

for select

to authenticated

using (
  (select private.is_platform_owner())
  or
  (select private.is_active_church_member(church_id))
);


create policy church_setup_progress_member_update

on public.church_setup_progress

for update

to authenticated

using (
  (select private.has_church_role(church_id, array['Admin']))
)

with check (
  (select private.has_church_role(church_id, array['Admin']))
);


comment on table public.church_setup_progress is
'Tracks first-time church setup progress after onboarding.';


commit;