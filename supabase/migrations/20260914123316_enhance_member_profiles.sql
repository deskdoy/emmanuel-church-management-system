-- Optional member profile details. Preserve the existing members table,
-- church ownership, RLS policies, grants, relationships, and audit triggers.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Match existing optional profile text defaults. A missing member number or
-- baptism date remains NULL; do not generate identifiers or infer a baptism date.
alter table public.members
  add column member_number text,
  add column gender text not null default '',
  add column emergency_contact_name text not null default '',
  add column emergency_contact_phone text not null default '',
  add column baptism_date date;

-- Assigned member numbers are unique within each church, not across churches.
-- Exclude NULL, empty, and space-only numbers so unassigned members can coexist.
-- This index also supports church-scoped member-number lookups.
create unique index idx_members_church_member_number
  on public.members(church_id, member_number)
  where member_number is not null and btrim(member_number) <> '';

commit;
