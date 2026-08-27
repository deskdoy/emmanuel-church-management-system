begin;

select plan(8);

select has_table('public', 'payable_payments', 'payable payment history table exists');
select has_column('public', 'payable_payments', 'payable_id', 'history references its payable');
select has_column('public', 'payable_payments', 'recorded_by_name', 'history snapshots the recorder name');
select has_index('public', 'payable_payments', 'idx_payable_payments_payable_date', 'history lookup index exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.payable_payments'::regclass),
  'RLS is enabled'
);
select results_eq(
  $$select cmd from (select case command when 'SELECT' then 1 else 2 end as position, command as cmd from pg_policies where schemaname = 'public' and tablename = 'payable_payments') policies order by position$$,
  $$values ('SELECT'::text), ('INSERT'::text)$$,
  'only read and insert policies exist'
);
select table_privs_are('public', 'payable_payments', 'authenticated', array['SELECT', 'INSERT'], 'authenticated receives immutable history privileges');
select table_privs_are('public', 'payable_payments', 'anon', array[]::text[], 'anonymous users receive no history privileges');

select * from finish();
rollback;
