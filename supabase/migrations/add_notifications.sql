-- Phase 20.2: Notification Center foundation. Review only; not applied.
-- Requires the existing church membership, tenant authorization, and audit helpers.
-- Trusted server-side code creates notifications with an explicit church scope.
-- Browser clients can read their own notifications and change only read_at.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  type text not null,
  title text not null,
  message text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  -- Enforce recipient membership in the same church even for RLS-bypassing
  -- service-role inserts. Membership status is enforced at read/update time.
  constraint notifications_church_user_fkey
    foreign key (church_id, user_id)
    references public.church_memberships(church_id, user_id) on delete restrict,
  constraint notifications_type_check
    check (type in ('finance', 'budget', 'event', 'announcement', 'attendance', 'system')),
  constraint notifications_title_not_blank check (btrim(title) <> ''),
  constraint notifications_message_not_blank check (btrim(message) <> ''),
  constraint notifications_link_not_blank check (link is null or btrim(link) <> '')
);

-- Church-wide history and individual inboxes, newest first. ID breaks timestamp
-- ties for stable pagination. Church-leading indexes also cover the church FK.
create index idx_notifications_church_created
  on public.notifications(church_id, created_at desc, id desc);
create index idx_notifications_user_created
  on public.notifications(user_id, created_at desc, id desc);
-- Covers the composite membership FK and a recipient's inbox in one church.
create index idx_notifications_church_user_created
  on public.notifications(church_id, user_id, created_at desc, id desc);
create index idx_notifications_unread
  on public.notifications(church_id, user_id, created_at desc, id desc)
  where read_at is null;

-- The shared church metadata guard has a fixed table allowlist. Protect this
-- table without changing that helper. Even trusted updates cannot move a
-- notification to another recipient/church or rewrite its creation metadata.
create function private.guard_notification_metadata()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if tg_op <> 'UPDATE'
    or tg_table_schema <> 'public'
    or tg_table_name <> 'notifications'
  then
    raise exception 'guard_notification_metadata only supports notification UPDATE triggers';
  end if;

  if new.id is distinct from old.id
    or new.church_id is distinct from old.church_id
    or new.user_id is distinct from old.user_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Notification identity, recipient, and creation metadata are immutable'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_notification_metadata()
  from public, anon, authenticated, service_role;

create trigger notifications_guard_metadata before update on public.notifications
for each row execute function private.guard_notification_metadata();
create trigger audit_notifications after insert or update or delete on public.notifications
for each row execute function private.audit_row_change();
-- No updated_at column: created_at defaults to now() and is immutable on update.
-- The shared audit trigger records changes, including read/unread updates.

alter table public.notifications enable row level security;

revoke all on public.notifications from public, anon, authenticated, service_role;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;

-- No platform-owner or church-admin bypass for another user's notifications.
-- The restrictive fence applies to existing and proposed rows for all client
-- operations, including any permissive policies added in future migrations.
create policy notifications_tenant_fence on public.notifications
as restrictive for all to authenticated
using ((select private.is_active_church_member(church_id)))
with check ((select private.is_active_church_member(church_id)));

create policy notifications_read_own on public.notifications
for select to authenticated
using (user_id = (select auth.uid()));

create policy notifications_update_own on public.notifications
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- No authenticated INSERT/DELETE grants or policies. Creation and retention are
-- server-side operations using service_role, which bypasses RLS by design.
-- Explicit church_id and the same-church membership FK remain mandatory there.

commit;
