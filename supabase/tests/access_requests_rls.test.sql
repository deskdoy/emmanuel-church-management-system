begin;

select plan(13);

select has_table('public', 'access_requests', 'access request table exists');
select has_column('public', 'access_requests', 'requested_role', 'requested role suggestion is stored');
select has_column('public', 'access_requests', 'approved_role', 'final approved role is stored separately');
select has_index('public', 'access_requests', 'idx_access_requests_pending_email', 'duplicate pending request index exists');
select has_index('public', 'access_requests', 'idx_access_requests_status_created', 'Admin queue index exists');
select ok((select relrowsecurity from pg_class where oid = 'public.access_requests'::regclass), 'RLS is enabled');
select results_eq(
  $$select command from pg_policies where schemaname = 'public' and tablename = 'access_requests' order by command$$,
  $$values ('INSERT'::text), ('SELECT'::text)$$,
  'only public insert and Admin read policies exist'
);
select ok(
  (select qual like '%Admin%' from pg_policies where schemaname = 'public' and tablename = 'access_requests' and policyname = 'access_requests_admin_read'),
  'read policy checks the Admin application role'
);
select table_privs_are('public', 'access_requests', 'authenticated', array['SELECT'], 'authenticated table privileges remain read-only');
select table_privs_are('public', 'access_requests', 'anon', array[]::text[], 'anonymous callers receive no table-wide privileges');
select function_privs_are('public', 'finalize_access_request', array['uuid','uuid','text'], 'authenticated', array['EXECUTE'], 'authenticated may call the guarded approval function');
select function_privs_are('public', 'reject_access_request', array['uuid'], 'authenticated', array['EXECUTE'], 'authenticated may call the guarded rejection function');
select has_trigger('public', 'access_requests', 'audit_access_requests', 'access request changes are audited');

select * from finish();
rollback;
