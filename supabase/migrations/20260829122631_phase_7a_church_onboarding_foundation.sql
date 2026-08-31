-- Phase 7A: Church onboarding foundation
-- Adds onboarding tracking and church invitation lifecycle.
-- Existing church security and financial tables are unchanged.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';


-- ============================================================
-- CHURCH ONBOARDING
-- ============================================================

create table public.church_onboarding (

  id uuid primary key default gen_random_uuid(),

  church_id uuid not null
    references public.churches(id)
    on delete cascade,

  stage text not null default 'draft',

  first_admin_name text,
  first_admin_email text,
  first_admin_user_id uuid
    references public.users(id)
    on delete set null,

  invited_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint church_onboarding_stage_valid
  check (
    stage in (
      'draft',
      'admin_invited',
      'admin_accepted',
      'setup',
      'completed'
    )
  ),

  constraint church_onboarding_email_valid
  check (
    first_admin_email is null
    or position('@' in first_admin_email) > 1
  )
);


-- ============================================================
-- CHURCH INVITATIONS
-- ============================================================

create table public.church_invitations (

  id uuid primary key default gen_random_uuid(),

  church_id uuid not null
    references public.churches(id)
    on delete cascade,

  email text not null,

  full_name text not null,

  role_id uuid not null
    references public.roles(id)
    on delete restrict,

  status text not null default 'pending',

  invited_by uuid not null
    references public.users(id)
    on delete restrict,

  invited_user_id uuid
    references public.users(id)
    on delete set null,

  invited_at timestamptz not null default now(),

  accepted_at timestamptz,

  expires_at timestamptz not null
    default (now() + interval '7 days'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint church_invitations_status_valid
  check (
    status in (
      'pending',
      'accepted',
      'expired',
      'cancelled'
    )
  ),

  constraint church_invitations_email_valid
  check (
    position('@' in email) > 1
  )
);


-- ============================================================
-- INDEXES
-- ============================================================

create index idx_church_onboarding_church_stage
on public.church_onboarding(church_id, stage);


create index idx_church_invitations_church_status
on public.church_invitations(church_id, status);


create index idx_church_invitations_email_status
on public.church_invitations(email, status);


-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

create trigger church_onboarding_set_updated_at
before update on public.church_onboarding
for each row
execute function private.set_updated_at();


create trigger church_invitations_set_updated_at
before update on public.church_invitations
for each row
execute function private.set_updated_at();


-- ============================================================
-- RLS
-- ============================================================

alter table public.church_onboarding enable row level security;

alter table public.church_invitations enable row level security;


revoke all on public.church_onboarding
from anon, authenticated;

revoke all on public.church_invitations
from anon, authenticated;


grant select on public.church_onboarding
to authenticated;

grant select on public.church_invitations
to authenticated;


-- ============================================================
-- POLICIES
-- ============================================================


create policy church_onboarding_platform_owner_read
on public.church_onboarding
for select
to authenticated
using (
  (select private.is_active_platform_owner())
);


create policy church_onboarding_admin_read
on public.church_onboarding
for select
to authenticated
using (
  (select private.has_church_role(
      church_onboarding.church_id,
      array['Admin']
  ))
);


create policy church_invitations_platform_owner_read
on public.church_invitations
for select
to authenticated
using (
  (select private.is_active_platform_owner())
);


create policy church_invitations_admin_read
on public.church_invitations
for select
to authenticated
using (
  (select private.has_church_role(
      church_invitations.church_id,
      array['Admin']
  ))
);


-- ============================================================
-- COMMENTS
-- ============================================================

comment on table public.church_onboarding is
'Tracks the lifecycle of new church tenant onboarding.';


comment on table public.church_invitations is
'Tracks invitations for onboarding users, including initial church administrators.';


commit;