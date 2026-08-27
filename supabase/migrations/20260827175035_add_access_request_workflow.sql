-- Public access requests with Admin-only review and transactional decisions.
create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  requested_role text not null,
  reason text not null,
  status text not null default 'Pending',
  approved_role uuid references public.roles(id) on delete restrict,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint access_requests_full_name_length check (char_length(btrim(full_name)) between 2 and 150),
  constraint access_requests_email_normalized check (
    email = lower(btrim(email))
    and char_length(email) between 5 and 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint access_requests_phone_length check (phone is null or char_length(btrim(phone)) between 3 and 50),
  constraint access_requests_reason_length check (char_length(btrim(reason)) between 10 and 2000),
  constraint access_requests_requested_role check (requested_role in ('Admin','Pastor','Treasurer','Secretary','Encoder','Viewer')),
  constraint access_requests_status check (status in ('Pending','Approved','Rejected')),
  constraint access_requests_decision_fields check (
    (status = 'Pending' and approved_role is null and approved_by is null and approved_at is null)
    or (status = 'Approved' and approved_role is not null and approved_at is not null)
    or (status = 'Rejected' and approved_role is null and approved_at is not null)
  )
);

create unique index idx_access_requests_pending_email
on public.access_requests(lower(email)) where status = 'Pending';

create index idx_access_requests_status_created
on public.access_requests(status, created_at desc);

create index idx_access_requests_approved_by
on public.access_requests(approved_by) where approved_by is not null;

alter table public.access_requests enable row level security;

revoke all on public.access_requests from anon, authenticated;
grant insert (full_name, email, phone, requested_role, reason) on public.access_requests to anon, authenticated;
grant select on public.access_requests to authenticated;

create policy access_requests_public_insert on public.access_requests
for insert to anon, authenticated
with check (
  status = 'Pending'
  and approved_role is null
  and approved_by is null
  and approved_at is null
);

create policy access_requests_admin_read on public.access_requests
for select to authenticated
using ((select private.has_any_role(array['Admin'])));

create trigger audit_access_requests
after insert or update or delete on public.access_requests
for each row execute function private.audit_row_change();

create or replace function public.finalize_access_request(
  p_request_id uuid,
  p_invited_user_id uuid,
  p_approved_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.access_requests%rowtype;
  final_role_id uuid;
  invited_email text;
begin
  if not (select private.has_any_role(array['Admin'])) then
    raise exception 'Only an active Admin can approve access requests' using errcode = '42501';
  end if;

  select * into request_row
  from public.access_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Access request not found' using errcode = 'P0002';
  end if;
  if request_row.status <> 'Pending' then
    raise exception 'Access request has already been processed' using errcode = '23514';
  end if;

  select id into final_role_id from public.roles where name = p_approved_role;
  if final_role_id is null then
    raise exception 'Approved role is invalid' using errcode = '23514';
  end if;

  select lower(email) into invited_email from auth.users where id = p_invited_user_id;
  if invited_email is null or invited_email <> request_row.email then
    raise exception 'Invited Auth user does not match this request' using errcode = '23514';
  end if;

  insert into public.users (id, email, full_name, role_id, is_active)
  values (p_invited_user_id, request_row.email, btrim(request_row.full_name), final_role_id, true)
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role_id = excluded.role_id,
    is_active = true,
    updated_at = now();

  update public.access_requests
  set status = 'Approved',
      approved_role = final_role_id,
      approved_by = (select auth.uid()),
      approved_at = now()
  where id = p_request_id;
end;
$$;

create or replace function public.reject_access_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_status text;
begin
  if not (select private.has_any_role(array['Admin'])) then
    raise exception 'Only an active Admin can reject access requests' using errcode = '42501';
  end if;

  select status into request_status
  from public.access_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Access request not found' using errcode = 'P0002';
  end if;
  if request_status <> 'Pending' then
    raise exception 'Access request has already been processed' using errcode = '23514';
  end if;

  update public.access_requests
  set status = 'Rejected',
      approved_role = null,
      approved_by = (select auth.uid()),
      approved_at = now()
  where id = p_request_id;
end;
$$;

revoke all on function public.finalize_access_request(uuid, uuid, text) from public, anon;
revoke all on function public.reject_access_request(uuid) from public, anon;
grant execute on function public.finalize_access_request(uuid, uuid, text) to authenticated;
grant execute on function public.reject_access_request(uuid) to authenticated;
