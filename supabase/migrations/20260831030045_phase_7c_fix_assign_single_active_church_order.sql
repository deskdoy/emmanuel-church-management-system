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
    or not (
      tg_table_name = any(array[
        'accounts','categories','offerings','donations','expenses',
        'account_transfers','payables','payable_payments',
        'members','attendance','projects','events',
        'announcements','reports','access_requests',
        'audit_logs'
      ])
    )
  then
    raise exception 'assign_single_active_church may only run as an approved INSERT trigger';
  end if;


  -- Allow audit records during onboarding.
  -- An inactive church may generate audit history before activation.
  if tg_table_name = 'audit_logs' then
    return new;
  end if;


  if new.church_id is not null then
    if not exists (
      select 1
      from public.churches c
      where c.id = new.church_id
        and c.status = 'active'
    ) then
      raise exception 'The supplied church_id does not reference an active church';
    end if;

    return new;
  end if;


  select count(*),
         (array_agg(id order by id))[1]
  into active_count,
       active_church_id
  from public.churches
  where status = 'active';


  if active_count <> 1
     or active_church_id is null then
    raise exception
      'A church_id is required because exactly one active church could not be resolved';
  end if;


  new.church_id := active_church_id;

  return new;

end

$function$;