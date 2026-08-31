-- Phase 5C-2 only: composite tenant integrity constraints.
-- Canonical linked-project migration version: 20260829042033.
-- This migration intentionally does not change RLS, authentication, frontend
-- behavior, roles, churches, or existing natural-key uniqueness.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

create temp table phase5c2_relationships (
  child_table text not null,
  constraint_name text not null,
  child_column text not null,
  parent_table text not null,
  delete_code "char" not null,
  delete_clause text not null,
  index_name text not null,
  primary key (child_table, constraint_name)
) on commit drop;

insert into phase5c2_relationships values
  ('offerings','offerings_account_id_fkey','account_id','accounts','a','no action','idx_offerings_church_account'),
  ('offerings','offerings_category_id_fkey','category_id','categories','a','no action','idx_offerings_church_category'),
  ('donations','donations_account_id_fkey','account_id','accounts','a','no action','idx_donations_church_account'),
  ('donations','donations_category_id_fkey','category_id','categories','a','no action','idx_donations_church_category'),
  ('donations','donations_project_id_fkey','project_id','projects','n','set null (project_id)','idx_donations_church_project'),
  ('donations','donations_donor_member_id_fkey','donor_member_id','members','n','set null (donor_member_id)','idx_donations_church_donor_member'),
  ('expenses','expenses_account_id_fkey','account_id','accounts','a','no action','idx_expenses_church_account'),
  ('expenses','expenses_category_id_fkey','category_id','categories','a','no action','idx_expenses_church_category'),
  ('expenses','expenses_project_id_fkey','project_id','projects','n','set null (project_id)','idx_expenses_church_project'),
  ('account_transfers','account_transfers_from_account_id_fkey','from_account_id','accounts','r','restrict','idx_account_transfers_church_from_account'),
  ('account_transfers','account_transfers_to_account_id_fkey','to_account_id','accounts','r','restrict','idx_account_transfers_church_to_account'),
  ('payables','payables_category_id_fkey','category_id','categories','a','no action','idx_payables_church_category'),
  ('payable_payments','payable_payments_payable_id_fkey','payable_id','payables','r','restrict','idx_payable_payments_church_payable'),
  ('attendance','attendance_member_id_fkey','member_id','members','c','cascade','idx_attendance_church_member'),
  ('attendance','attendance_event_id_fkey','event_id','events','c','cascade','idx_attendance_church_event');

create temp table phase5c2_parent_keys (
  table_name text primary key,
  constraint_name text not null
) on commit drop;

insert into phase5c2_parent_keys values
  ('accounts','accounts_church_id_id_key'),
  ('categories','categories_church_id_id_key'),
  ('projects','projects_church_id_id_key'),
  ('members','members_church_id_id_key'),
  ('events','events_church_id_id_key'),
  ('payables','payables_church_id_id_key');

create temp table phase5c2_target_tables (table_name text primary key) on commit drop;
insert into phase5c2_target_tables values
  ('accounts'),('categories'),('offerings'),('donations'),('expenses'),
  ('account_transfers'),('payables'),('payable_payments'),('members'),
  ('attendance'),('projects'),('events'),('announcements'),('reports'),
  ('access_requests'),('audit_logs');

-- Prevent concurrent relationship or data changes while the constraint names
-- are replaced. The database is currently small, so this keeps the operation
-- atomic and the PostgREST relationship names continuously stable at commit.
lock table public.churches in share mode;
lock table
  public.accounts,
  public.categories,
  public.offerings,
  public.donations,
  public.expenses,
  public.account_transfers,
  public.payables,
  public.payable_payments,
  public.members,
  public.attendance,
  public.projects,
  public.events,
  public.announcements,
  public.reports,
  public.access_requests,
  public.audit_logs
in access exclusive mode;

do $preconditions$
declare
  relation_row record;
  parent_row record;
  object_count integer;
  mismatch_count bigint;
  duplicate_count bigint;
  church_count integer;
  emmanuel_count integer;
begin
  select count(*), count(*) filter (
    where slug='emmanuel-church' and name='Emmanuel Church' and status='active'
  )
  into church_count, emmanuel_count
  from public.churches;

  if church_count <> 1 or emmanuel_count <> 1 then
    raise exception
      'Phase 5C-2 requires exactly one church, the active Emmanuel Church (churches=%, Emmanuel=%)',
      church_count, emmanuel_count;
  end if;

  for relation_row in select * from phase5c2_relationships order by child_table, constraint_name loop
    select count(*) into object_count
    from pg_constraint c
    where c.conrelid = format('public.%I', relation_row.child_table)::regclass
      and c.conname = relation_row.constraint_name
      and c.contype = 'f'
      and c.confrelid = format('public.%I', relation_row.parent_table)::regclass
      and c.convalidated
      and not c.condeferrable
      and c.confupdtype = 'a'
      and c.confdeltype = relation_row.delete_code
      and cardinality(c.conkey) = 1
      and cardinality(c.confkey) = 1
      and (
        select a.attname from pg_attribute a
        where a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      ) = relation_row.child_column
      and (
        select a.attname from pg_attribute a
        where a.attrelid = c.confrelid and a.attnum = c.confkey[1]
      ) = 'id';

    if object_count <> 1 then
      raise exception
        'Phase 5C-2 expected one validated legacy FK public.%.%, found %',
        relation_row.child_table, relation_row.constraint_name, object_count;
    end if;

    if to_regclass(format('public.%I', relation_row.index_name)) is not null then
      raise exception 'Phase 5C-2 index already exists: %', relation_row.index_name;
    end if;

    execute format(
      'select count(*) from public.%1$I child_row
       left join public.%2$I parent_row on parent_row.id = child_row.%3$I
       where child_row.%3$I is not null
         and (parent_row.id is null or parent_row.church_id is distinct from child_row.church_id)',
      relation_row.child_table,
      relation_row.parent_table,
      relation_row.child_column
    ) into mismatch_count;

    if mismatch_count <> 0 then
      raise exception
        'Phase 5C-2 found % cross-church rows for public.%.%',
        mismatch_count, relation_row.child_table, relation_row.child_column;
    end if;
  end loop;

  for parent_row in select * from phase5c2_parent_keys order by table_name loop
    if exists (
      select 1 from pg_constraint
      where conrelid = format('public.%I', parent_row.table_name)::regclass
        and conname = parent_row.constraint_name
    ) then
      raise exception 'Phase 5C-2 parent unique constraint already exists: %', parent_row.constraint_name;
    end if;

    execute format(
      'select count(*) from (
         select church_id, id from public.%I
         group by church_id, id having count(*) > 1
       ) duplicates',
      parent_row.table_name
    ) into duplicate_count;

    if duplicate_count <> 0 then
      raise exception
        'Phase 5C-2 found % duplicate tenant keys in public.%',
        duplicate_count, parent_row.table_name;
    end if;
  end loop;

  select count(*) into object_count
  from pg_constraint
  where conname = any(array[
    'accounts_name_key',
    'categories_name_transaction_type_key',
    'attendance_member_id_event_id_attendance_date_key'
  ]);
  if object_count <> 3 then
    raise exception 'Phase 5C-2 natural-key constraint precondition failed';
  end if;

  if to_regclass('public.idx_access_requests_pending_email') is null then
    raise exception 'Phase 5C-2 pending-access natural-key index is missing';
  end if;
end
$preconditions$;

-- Catalog fingerprints prove that RLS, application triggers, and natural-key
-- uniqueness stay untouched.
create temp table phase5c2_catalog_control on commit drop as
select
  (select count(*) from pg_policies where schemaname='public') as policy_count,
  (select md5(coalesce(string_agg(
    concat_ws(E'\x1f',schemaname,tablename,policyname,permissive,roles::text,cmd,coalesce(qual,''),coalesce(with_check,'')),
    E'\x1e' order by tablename,policyname
  ),'')) from pg_policies where schemaname='public') as policy_hash,
  (select md5(coalesce(string_agg(
    concat_ws(E'\x1f',n.nspname,c.relname,c.relrowsecurity::text,c.relforcerowsecurity::text),
    E'\x1e' order by n.nspname,c.relname
  ),'')) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p')) as rls_hash,
  (select md5(coalesce(string_agg(
    concat_ws(E'\x1f',n.nspname,c.relname,t.tgname,t.tgenabled::text,pg_get_triggerdef(t.oid)),
    E'\x1e' order by n.nspname,c.relname,t.tgname
  ),'')) from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and not t.tgisinternal) as application_trigger_hash,
  (select md5(coalesce(string_agg(object_definition,E'\x1e' order by object_definition),'')) from (
    select c.conrelid::regclass::text||':'||c.conname||':'||pg_get_constraintdef(c.oid) object_definition
    from pg_constraint c
    where c.conname=any(array[
      'accounts_name_key',
      'categories_name_transaction_type_key',
      'attendance_member_id_event_id_attendance_date_key'
    ])
    union all
    select schemaname||'.'||tablename||':'||indexname||':'||indexdef
    from pg_indexes
    where schemaname='public' and indexname='idx_access_requests_pending_email'
  ) natural_objects) as natural_key_hash;

create temp table phase5c2_row_controls (
  phase text not null,
  table_name text not null,
  row_count bigint not null,
  distinct_id_count bigint not null,
  payload_hash text not null,
  primary key (phase, table_name)
) on commit drop;

do $row_controls_before$
declare
  target record;
  rows_count bigint;
  distinct_count bigint;
  rows_hash text;
begin
  for target in select table_name from phase5c2_target_tables order by table_name loop
    execute format(
      'select count(*), count(distinct id), md5(coalesce(string_agg(to_jsonb(t)::text, %L order by id::text), %L)) from public.%I t',
      '|', '', target.table_name
    ) into rows_count, distinct_count, rows_hash;
    insert into phase5c2_row_controls values
      ('before',target.table_name,rows_count,distinct_count,rows_hash);
  end loop;
end
$row_controls_before$;

create temp table phase5c2_financial_controls (
  phase text primary key,
  opening_balance numeric not null,
  offering_income numeric not null,
  donation_income numeric not null,
  expense_total numeric not null,
  transfer_total numeric not null,
  payable_total numeric not null,
  payable_paid numeric not null,
  payable_payment_total numeric not null,
  organization_balance numeric not null,
  account_balance_hash text not null
) on commit drop;

insert into phase5c2_financial_controls
select
  'before',
  coalesce((select sum(opening_balance) from public.accounts),0),
  coalesce((select sum(amount) from public.offerings),0),
  coalesce((select sum(amount) from public.donations),0),
  coalesce((select sum(amount) from public.expenses),0),
  coalesce((select sum(amount) from public.account_transfers),0),
  coalesce((select sum(amount) from public.payables),0),
  coalesce((select sum(amount_paid) from public.payables),0),
  coalesce((select sum(amount) from public.payable_payments),0),
  coalesce((select sum(opening_balance) from public.accounts),0)
    +coalesce((select sum(amount) from public.offerings),0)
    +coalesce((select sum(amount) from public.donations),0)
    -coalesce((select sum(amount) from public.expenses),0),
  (select md5(coalesce(string_agg(id::text||':'||current_balance::text,'|' order by id::text),'')) from (
    select a.id,a.opening_balance
      +coalesce((select sum(o.amount) from public.offerings o where o.account_id=a.id),0)
      +coalesce((select sum(d.amount) from public.donations d where d.account_id=a.id),0)
      -coalesce((select sum(e.amount) from public.expenses e where e.account_id=a.id),0)
      +coalesce((select sum(t.amount) from public.account_transfers t where t.to_account_id=a.id),0)
      -coalesce((select sum(t.amount) from public.account_transfers t where t.from_account_id=a.id),0)
      as current_balance
    from public.accounts a
  ) balances);

-- Required parent-side composite candidate keys.
alter table public.accounts
  add constraint accounts_church_id_id_key unique (church_id,id);
alter table public.categories
  add constraint categories_church_id_id_key unique (church_id,id);
alter table public.projects
  add constraint projects_church_id_id_key unique (church_id,id);
alter table public.members
  add constraint members_church_id_id_key unique (church_id,id);
alter table public.events
  add constraint events_church_id_id_key unique (church_id,id);
alter table public.payables
  add constraint payables_church_id_id_key unique (church_id,id);

-- Tenant-leading indexes for every composite referencing key.
do $create_indexes$
declare
  relation_row record;
begin
  for relation_row in select * from phase5c2_relationships order by child_table,constraint_name loop
    execute format(
      'create index %I on public.%I(church_id,%I)',
      relation_row.index_name,
      relation_row.child_table,
      relation_row.child_column
    );
  end loop;
end
$create_indexes$;

-- Replace rather than duplicate each relationship. Keeping the original names
-- preserves existing PostgREST/Supabase relationship hints.
do $replace_foreign_keys$
declare
  relation_row record;
begin
  for relation_row in select * from phase5c2_relationships order by child_table,constraint_name loop
    execute format(
      'alter table public.%I drop constraint %I',
      relation_row.child_table,
      relation_row.constraint_name
    );
    execute format(
      'alter table public.%I add constraint %I
       foreign key (church_id,%I)
       references public.%I(church_id,id)
       on update no action on delete %s not valid',
      relation_row.child_table,
      relation_row.constraint_name,
      relation_row.child_column,
      relation_row.parent_table,
      relation_row.delete_clause
    );
  end loop;
end
$replace_foreign_keys$;

do $validate_foreign_keys$
declare
  relation_row record;
begin
  for relation_row in select * from phase5c2_relationships order by child_table,constraint_name loop
    execute format(
      'alter table public.%I validate constraint %I',
      relation_row.child_table,
      relation_row.constraint_name
    );
  end loop;
end
$validate_foreign_keys$;

do $row_controls_after$
declare
  target record;
  rows_count bigint;
  distinct_count bigint;
  rows_hash text;
begin
  for target in select table_name from phase5c2_target_tables order by table_name loop
    execute format(
      'select count(*), count(distinct id), md5(coalesce(string_agg(to_jsonb(t)::text, %L order by id::text), %L)) from public.%I t',
      '|', '', target.table_name
    ) into rows_count, distinct_count, rows_hash;
    insert into phase5c2_row_controls values
      ('after',target.table_name,rows_count,distinct_count,rows_hash);
  end loop;
end
$row_controls_after$;

insert into phase5c2_financial_controls
select
  'after',
  coalesce((select sum(opening_balance) from public.accounts),0),
  coalesce((select sum(amount) from public.offerings),0),
  coalesce((select sum(amount) from public.donations),0),
  coalesce((select sum(amount) from public.expenses),0),
  coalesce((select sum(amount) from public.account_transfers),0),
  coalesce((select sum(amount) from public.payables),0),
  coalesce((select sum(amount_paid) from public.payables),0),
  coalesce((select sum(amount) from public.payable_payments),0),
  coalesce((select sum(opening_balance) from public.accounts),0)
    +coalesce((select sum(amount) from public.offerings),0)
    +coalesce((select sum(amount) from public.donations),0)
    -coalesce((select sum(amount) from public.expenses),0),
  (select md5(coalesce(string_agg(id::text||':'||current_balance::text,'|' order by id::text),'')) from (
    select a.id,a.opening_balance
      +coalesce((select sum(o.amount) from public.offerings o where o.account_id=a.id),0)
      +coalesce((select sum(d.amount) from public.donations d where d.account_id=a.id),0)
      -coalesce((select sum(e.amount) from public.expenses e where e.account_id=a.id),0)
      +coalesce((select sum(t.amount) from public.account_transfers t where t.to_account_id=a.id),0)
      -coalesce((select sum(t.amount) from public.account_transfers t where t.from_account_id=a.id),0)
      as current_balance
    from public.accounts a
  ) balances);

do $postconditions$
declare
  relation_row record;
  parent_row record;
  object_count integer;
  mismatch_count bigint;
  policy_count_after bigint;
  policy_hash_after text;
  rls_hash_after text;
  application_trigger_hash_after text;
  natural_key_hash_after text;
begin
  for relation_row in select * from phase5c2_relationships order by child_table,constraint_name loop
    select count(*) into object_count
    from pg_constraint c
    where c.conrelid=format('public.%I',relation_row.child_table)::regclass
      and c.conname=relation_row.constraint_name
      and c.contype='f'
      and c.confrelid=format('public.%I',relation_row.parent_table)::regclass
      and c.convalidated
      and not c.condeferrable
      and c.confupdtype='a'
      and c.confdeltype=relation_row.delete_code
      and cardinality(c.conkey)=2
      and cardinality(c.confkey)=2
      and (select a.attname from pg_attribute a where a.attrelid=c.conrelid and a.attnum=c.conkey[1])='church_id'
      and (select a.attname from pg_attribute a where a.attrelid=c.conrelid and a.attnum=c.conkey[2])=relation_row.child_column
      and (select a.attname from pg_attribute a where a.attrelid=c.confrelid and a.attnum=c.confkey[1])='church_id'
      and (select a.attname from pg_attribute a where a.attrelid=c.confrelid and a.attnum=c.confkey[2])='id';

    if object_count <> 1 then
      raise exception 'Phase 5C-2 composite FK validation failed: %.%',
        relation_row.child_table,relation_row.constraint_name;
    end if;

    select count(*) into object_count
    from pg_index ix
    where ix.indexrelid=format('public.%I',relation_row.index_name)::regclass
      and ix.indisvalid and ix.indisready
      and (
        select array_agg(a.attname::text order by keys.ordinality)
        from unnest(ix.indkey) with ordinality keys(attnum,ordinality)
        join pg_attribute a on a.attrelid=ix.indrelid and a.attnum=keys.attnum
        where keys.ordinality<=ix.indnkeyatts
      )=array['church_id',relation_row.child_column];

    if object_count <> 1 then
      raise exception 'Phase 5C-2 composite index validation failed: %',relation_row.index_name;
    end if;

    execute format(
      'select count(*) from public.%1$I child_row
       left join public.%2$I parent_row
         on parent_row.church_id=child_row.church_id
        and parent_row.id=child_row.%3$I
       where child_row.%3$I is not null and parent_row.id is null',
      relation_row.child_table,
      relation_row.parent_table,
      relation_row.child_column
    ) into mismatch_count;

    if mismatch_count <> 0 then
      raise exception 'Phase 5C-2 post-validation found % mismatches for public.%.%',
        mismatch_count,relation_row.child_table,relation_row.child_column;
    end if;
  end loop;

  for parent_row in select * from phase5c2_parent_keys order by table_name loop
    select count(*) into object_count
    from pg_constraint c
    where c.conrelid=format('public.%I',parent_row.table_name)::regclass
      and c.conname=parent_row.constraint_name
      and c.contype='u'
      and c.convalidated
      and cardinality(c.conkey)=2
      and (select a.attname from pg_attribute a where a.attrelid=c.conrelid and a.attnum=c.conkey[1])='church_id'
      and (select a.attname from pg_attribute a where a.attrelid=c.conrelid and a.attnum=c.conkey[2])='id';
    if object_count <> 1 then
      raise exception 'Phase 5C-2 parent unique validation failed: %',parent_row.constraint_name;
    end if;
  end loop;

  if exists (
    select 1
    from phase5c2_row_controls before_control
    join phase5c2_row_controls after_control using (table_name)
    where before_control.phase='before' and after_control.phase='after'
      and (
        before_control.row_count is distinct from after_control.row_count
        or before_control.distinct_id_count is distinct from after_control.distinct_id_count
        or before_control.payload_hash is distinct from after_control.payload_hash
      )
  ) then
    raise exception 'Phase 5C-2 row controls changed';
  end if;

  if (select to_jsonb(c)-'phase' from phase5c2_financial_controls c where phase='before')
     is distinct from
     (select to_jsonb(c)-'phase' from phase5c2_financial_controls c where phase='after')
  then
    raise exception 'Phase 5C-2 financial controls changed';
  end if;

  select count(*),
    md5(coalesce(string_agg(
      concat_ws(E'\x1f',schemaname,tablename,policyname,permissive,roles::text,cmd,coalesce(qual,''),coalesce(with_check,'')),
      E'\x1e' order by tablename,policyname
    ),''))
  into policy_count_after,policy_hash_after
  from pg_policies where schemaname='public';

  select md5(coalesce(string_agg(
    concat_ws(E'\x1f',n.nspname,c.relname,c.relrowsecurity::text,c.relforcerowsecurity::text),
    E'\x1e' order by n.nspname,c.relname
  ),''))
  into rls_hash_after
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p');

  select md5(coalesce(string_agg(
    concat_ws(E'\x1f',n.nspname,c.relname,t.tgname,t.tgenabled::text,pg_get_triggerdef(t.oid)),
    E'\x1e' order by n.nspname,c.relname,t.tgname
  ),''))
  into application_trigger_hash_after
  from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and not t.tgisinternal;

  select md5(coalesce(string_agg(object_definition,E'\x1e' order by object_definition),''))
  into natural_key_hash_after
  from (
    select c.conrelid::regclass::text||':'||c.conname||':'||pg_get_constraintdef(c.oid) object_definition
    from pg_constraint c
    where c.conname=any(array[
      'accounts_name_key',
      'categories_name_transaction_type_key',
      'attendance_member_id_event_id_attendance_date_key'
    ])
    union all
    select schemaname||'.'||tablename||':'||indexname||':'||indexdef
    from pg_indexes
    where schemaname='public' and indexname='idx_access_requests_pending_email'
  ) natural_objects;

  if exists (
    select 1 from phase5c2_catalog_control
    where policy_count is distinct from policy_count_after
      or policy_hash is distinct from policy_hash_after
      or rls_hash is distinct from rls_hash_after
      or application_trigger_hash is distinct from application_trigger_hash_after
      or natural_key_hash is distinct from natural_key_hash_after
  ) then
    raise exception 'Phase 5C-2 detected an out-of-scope catalog change';
  end if;

  if (select count(*) from public.churches)<>1
     or (select count(*) from public.churches where slug='emmanuel-church' and status='active')<>1
  then
    raise exception 'Phase 5C-2 church control changed';
  end if;
end
$postconditions$;

commit;
