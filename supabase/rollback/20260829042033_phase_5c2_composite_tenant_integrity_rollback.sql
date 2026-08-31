-- Guarded manual rollback for Phase 5C-2 only.
-- Corresponding linked-project migration version: 20260829042033.
-- Run only before Phase 5C-3 and after taking a fresh backup.
-- This script restores the original single-column FKs under their original
-- names. It does not change RLS, authentication, data, churches, or natural keys.

begin;

set local lock_timeout='10s';
set local statement_timeout='120s';

create temp table phase5c2_rollback_relationships (
  child_table text not null,
  constraint_name text not null,
  child_column text not null,
  parent_table text not null,
  delete_clause text not null,
  index_name text not null,
  primary key(child_table,constraint_name)
) on commit drop;

insert into phase5c2_rollback_relationships values
  ('offerings','offerings_account_id_fkey','account_id','accounts','no action','idx_offerings_church_account'),
  ('offerings','offerings_category_id_fkey','category_id','categories','no action','idx_offerings_church_category'),
  ('donations','donations_account_id_fkey','account_id','accounts','no action','idx_donations_church_account'),
  ('donations','donations_category_id_fkey','category_id','categories','no action','idx_donations_church_category'),
  ('donations','donations_project_id_fkey','project_id','projects','set null','idx_donations_church_project'),
  ('donations','donations_donor_member_id_fkey','donor_member_id','members','set null','idx_donations_church_donor_member'),
  ('expenses','expenses_account_id_fkey','account_id','accounts','no action','idx_expenses_church_account'),
  ('expenses','expenses_category_id_fkey','category_id','categories','no action','idx_expenses_church_category'),
  ('expenses','expenses_project_id_fkey','project_id','projects','set null','idx_expenses_church_project'),
  ('account_transfers','account_transfers_from_account_id_fkey','from_account_id','accounts','restrict','idx_account_transfers_church_from_account'),
  ('account_transfers','account_transfers_to_account_id_fkey','to_account_id','accounts','restrict','idx_account_transfers_church_to_account'),
  ('payables','payables_category_id_fkey','category_id','categories','no action','idx_payables_church_category'),
  ('payable_payments','payable_payments_payable_id_fkey','payable_id','payables','restrict','idx_payable_payments_church_payable'),
  ('attendance','attendance_member_id_fkey','member_id','members','cascade','idx_attendance_church_member'),
  ('attendance','attendance_event_id_fkey','event_id','events','cascade','idx_attendance_church_event');

create temp table phase5c2_rollback_parents (
  table_name text primary key,
  constraint_name text not null
) on commit drop;
insert into phase5c2_rollback_parents values
  ('accounts','accounts_church_id_id_key'),
  ('categories','categories_church_id_id_key'),
  ('projects','projects_church_id_id_key'),
  ('members','members_church_id_id_key'),
  ('events','events_church_id_id_key'),
  ('payables','payables_church_id_id_key');

lock table public.churches in share mode;
lock table
  public.accounts,public.categories,public.offerings,public.donations,
  public.expenses,public.account_transfers,public.payables,
  public.payable_payments,public.members,public.attendance,
  public.projects,public.events
in access exclusive mode;

do $guard$
declare
  relation_row record;
  parent_row record;
begin
  if (select count(*) from public.churches)<>1
     or (select count(*) from public.churches where slug='emmanuel-church' and status='active')<>1
  then
    raise exception 'Phase 5C-2 rollback refused: database is no longer single-church';
  end if;

  for relation_row in select * from phase5c2_rollback_relationships loop
    if not exists (
      select 1 from pg_constraint c
      where c.conrelid=format('public.%I',relation_row.child_table)::regclass
        and c.conname=relation_row.constraint_name
        and c.contype='f' and c.convalidated and cardinality(c.conkey)=2
    ) then
      raise exception 'Phase 5C-2 rollback refused: composite FK %.% is missing',
        relation_row.child_table,relation_row.constraint_name;
    end if;
  end loop;

  for parent_row in select * from phase5c2_rollback_parents loop
    if not exists (
      select 1 from pg_constraint
      where conrelid=format('public.%I',parent_row.table_name)::regclass
        and conname=parent_row.constraint_name and contype='u'
    ) then
      raise exception 'Phase 5C-2 rollback refused: parent key % is missing',
        parent_row.constraint_name;
    end if;
  end loop;
end
$guard$;

create temp table phase5c2_rollback_security on commit drop as
select
  (select count(*) from pg_policies where schemaname='public') policy_count,
  (select md5(coalesce(string_agg(
    concat_ws(E'\x1f',schemaname,tablename,policyname,permissive,roles::text,cmd,coalesce(qual,''),coalesce(with_check,'')),
    E'\x1e' order by tablename,policyname
  ),'')) from pg_policies where schemaname='public') policy_hash,
  (select md5(coalesce(string_agg(object_definition,E'\x1e' order by object_definition),'')) from (
    select c.conrelid::regclass::text||':'||c.conname||':'||pg_get_constraintdef(c.oid) object_definition
    from pg_constraint c where c.conname=any(array[
      'accounts_name_key','categories_name_transaction_type_key',
      'attendance_member_id_event_id_attendance_date_key'
    ])
    union all
    select schemaname||'.'||tablename||':'||indexname||':'||indexdef
    from pg_indexes where schemaname='public' and indexname='idx_access_requests_pending_email'
  ) natural_objects) natural_key_hash;

do $restore_legacy_fks$
declare
  relation_row record;
begin
  for relation_row in select * from phase5c2_rollback_relationships order by child_table,constraint_name loop
    execute format('alter table public.%I drop constraint %I',
      relation_row.child_table,relation_row.constraint_name);
    execute format(
      'alter table public.%I add constraint %I
       foreign key (%I) references public.%I(id)
       on update no action on delete %s not valid',
      relation_row.child_table,relation_row.constraint_name,
      relation_row.child_column,relation_row.parent_table,
      relation_row.delete_clause
    );
    execute format('alter table public.%I validate constraint %I',
      relation_row.child_table,relation_row.constraint_name);
    execute format('drop index public.%I',relation_row.index_name);
  end loop;
end
$restore_legacy_fks$;

do $drop_parent_keys$
declare
  parent_row record;
begin
  for parent_row in select * from phase5c2_rollback_parents order by table_name loop
    execute format('alter table public.%I drop constraint %I',
      parent_row.table_name,parent_row.constraint_name);
  end loop;
end
$drop_parent_keys$;

do $postconditions$
declare
  relation_row record;
  policy_count_after bigint;
  policy_hash_after text;
  natural_key_hash_after text;
begin
  for relation_row in select * from phase5c2_rollback_relationships loop
    if (select count(*) from pg_constraint c
      where c.conrelid=format('public.%I',relation_row.child_table)::regclass
        and c.conname=relation_row.constraint_name and c.contype='f'
        and c.convalidated and cardinality(c.conkey)=1)<>1
    then
      raise exception 'Phase 5C-2 rollback FK validation failed: %.%',
        relation_row.child_table,relation_row.constraint_name;
    end if;
  end loop;

  select count(*),md5(coalesce(string_agg(
    concat_ws(E'\x1f',schemaname,tablename,policyname,permissive,roles::text,cmd,coalesce(qual,''),coalesce(with_check,'')),
    E'\x1e' order by tablename,policyname
  ),'')) into policy_count_after,policy_hash_after
  from pg_policies where schemaname='public';

  select md5(coalesce(string_agg(object_definition,E'\x1e' order by object_definition),''))
  into natural_key_hash_after from (
    select c.conrelid::regclass::text||':'||c.conname||':'||pg_get_constraintdef(c.oid) object_definition
    from pg_constraint c where c.conname=any(array[
      'accounts_name_key','categories_name_transaction_type_key',
      'attendance_member_id_event_id_attendance_date_key'
    ])
    union all
    select schemaname||'.'||tablename||':'||indexname||':'||indexdef
    from pg_indexes where schemaname='public' and indexname='idx_access_requests_pending_email'
  ) natural_objects;

  if exists(select 1 from phase5c2_rollback_security
    where policy_count is distinct from policy_count_after
      or policy_hash is distinct from policy_hash_after
      or natural_key_hash is distinct from natural_key_hash_after)
  then
    raise exception 'Phase 5C-2 rollback detected an out-of-scope change';
  end if;
end
$postconditions$;

commit;
