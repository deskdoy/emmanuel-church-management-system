begin;

select plan(10);

select has_table('public', 'account_transfers', 'account transfer ledger exists');
select has_column('public', 'account_transfers', 'from_account_id', 'source account is stored');
select has_column('public', 'account_transfers', 'to_account_id', 'destination account is stored');
select has_index('public', 'account_transfers', 'idx_account_transfers_from_date', 'source history index exists');
select has_index('public', 'account_transfers', 'idx_account_transfers_to_date', 'destination history index exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.account_transfers'::regclass),
  'RLS is enabled'
);
select results_eq(
  $$select cmd from (select case command when 'SELECT' then 1 else 2 end as position, command as cmd from pg_policies where schemaname = 'public' and tablename = 'account_transfers') policies order by position$$,
  $$values ('SELECT'::text), ('INSERT'::text)$$,
  'only read and insert policies exist'
);
select table_privs_are('public', 'account_transfers', 'authenticated', array['SELECT', 'INSERT'], 'authenticated receives append-only privileges');
select table_privs_are('public', 'account_transfers', 'anon', array[]::text[], 'anonymous users receive no transfer privileges');
select has_trigger('public', 'account_transfers', 'audit_account_transfers', 'transfer inserts are audit logged');

select * from finish();
rollback;
