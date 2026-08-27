begin;

select plan(7);

select has_table('public', 'audit_logs', 'audit log table exists');
select has_index('public', 'audit_logs', 'idx_audit_logs_created_at', 'date range index exists');
select has_index('public', 'audit_logs', 'idx_audit_logs_action_created', 'action filter index exists');
select has_index('public', 'audit_logs', 'idx_audit_logs_table_created', 'module filter index exists');
select ok(
  (select command = 'SELECT' and roles = array['authenticated']::name[] and qual like '%Admin%' and qual not like '%Pastor%'
   from pg_policies where schemaname = 'public' and tablename = 'audit_logs' and policyname = 'audit_logs_read'),
  'audit logs are readable only through the Admin role policy'
);
select table_privs_are('public', 'audit_logs', 'authenticated', array['SELECT'], 'authenticated clients receive read-only privileges');
select table_privs_are('public', 'audit_logs', 'anon', array[]::text[], 'anonymous clients receive no audit privileges');

select * from finish();
rollback;
