-- Phase 5C-3 Stage 2 rollback. Safe only while Emmanuel is the sole tenant.

begin;

do $drop_ownership_triggers$
declare
  target_table text;
begin
  foreach target_table in array array[
    'accounts','categories','offerings','donations','expenses','account_transfers',
    'payables','payable_payments','members','attendance','projects','events',
    'announcements','reports','access_requests','church_memberships'
  ]
  loop
    execute format(
      'drop trigger if exists %I on public.%I',
      'tenant_immutable_' || target_table || '_church_id', target_table
    );
  end loop;
end
$drop_ownership_triggers$;

drop trigger if exists audit_church_memberships on public.church_memberships;
drop function if exists private.prevent_church_id_change();

create or replace function private.assign_single_active_church()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  active_count integer;
  active_church_id uuid;
begin
  if tg_op <> 'INSERT'
    or tg_table_schema <> 'public'
    or not (tg_table_name = any(array[
      'accounts','categories','offerings','donations','expenses','account_transfers',
      'payables','payable_payments','members','attendance','projects','events',
      'announcements','reports','access_requests','audit_logs'
    ]))
  then
    raise exception 'assign_single_active_church may only run as an approved INSERT trigger';
  end if;

  select count(*), (array_agg(id order by id))[1]
  into active_count, active_church_id
  from public.churches
  where status = 'active';

  if active_count <> 1 or active_church_id is null then
    raise exception 'A church_id is required because exactly one active church could not be resolved';
  end if;

  if new.church_id is null then
    new.church_id := active_church_id;
  elsif new.church_id <> active_church_id then
    raise exception 'The supplied church_id does not match the sole active church';
  end if;

  return new;
end
$function$;

revoke all on function private.assign_single_active_church()
  from public, anon, authenticated, service_role;

create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  row_id text;
begin
  if tg_op = 'DELETE' then
    row_id := old.id::text;
    insert into public.audit_logs (actor_user_id, action, table_name, record_id, old_values)
    values ((select auth.uid()), tg_op, tg_table_name, row_id, to_jsonb(old));
    return old;
  elsif tg_op = 'UPDATE' then
    row_id := new.id::text;
    insert into public.audit_logs (actor_user_id, action, table_name, record_id, old_values, new_values)
    values ((select auth.uid()), tg_op, tg_table_name, row_id, to_jsonb(old), to_jsonb(new));
    return new;
  else
    row_id := new.id::text;
    insert into public.audit_logs (actor_user_id, action, table_name, record_id, new_values)
    values ((select auth.uid()), tg_op, tg_table_name, row_id, to_jsonb(new));
    return new;
  end if;
end
$function$;

revoke all on function private.audit_row_change()
  from public, anon, authenticated, service_role;

create or replace function public.finalize_access_request(
  p_request_id uuid,
  p_invited_user_id uuid,
  p_approved_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_row public.access_requests%rowtype;
  final_role_id uuid;
  invited_email text;
begin
  if not (select private.has_any_role(array['Admin'])) then
    raise exception 'Only an active Admin can approve access requests' using errcode = '42501';
  end if;
  select * into request_row from public.access_requests where id = p_request_id for update;
  if not found then raise exception 'Access request not found' using errcode = 'P0002'; end if;
  if request_row.status <> 'Pending' then
    raise exception 'Access request has already been processed' using errcode = '23514';
  end if;
  select id into final_role_id from public.roles where name = p_approved_role;
  if final_role_id is null then raise exception 'Approved role is invalid' using errcode = '23514'; end if;
  select lower(email) into invited_email from auth.users where id = p_invited_user_id;
  if invited_email is null or invited_email <> request_row.email then
    raise exception 'Invited Auth user does not match this request' using errcode = '23514';
  end if;
  insert into public.users (id, email, full_name, role_id, is_active)
  values (p_invited_user_id, request_row.email, btrim(request_row.full_name), final_role_id, true)
  on conflict (id) do update set email = excluded.email, full_name = excluded.full_name,
    role_id = excluded.role_id, is_active = true, updated_at = now();
  update public.access_requests
  set status = 'Approved', approved_role = final_role_id,
      approved_by = (select auth.uid()), approved_at = now()
  where id = p_request_id;
end
$function$;

create or replace function public.reject_access_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_status text;
begin
  if not (select private.has_any_role(array['Admin'])) then
    raise exception 'Only an active Admin can reject access requests' using errcode = '42501';
  end if;
  select status into request_status from public.access_requests where id = p_request_id for update;
  if not found then raise exception 'Access request not found' using errcode = 'P0002'; end if;
  if request_status <> 'Pending' then
    raise exception 'Access request has already been processed' using errcode = '23514';
  end if;
  update public.access_requests
  set status = 'Rejected', approved_role = null,
      approved_by = (select auth.uid()), approved_at = now()
  where id = p_request_id;
end
$function$;

revoke all on function public.finalize_access_request(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.reject_access_request(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_access_request(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.reject_access_request(uuid) to authenticated, service_role;

commit;
