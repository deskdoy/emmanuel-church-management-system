-- Permit public request forms to provide the tenant owner selected by exact church slug.
-- The existing RLS policy still requires that church_id identify an active church.
begin;
grant insert (church_id) on public.access_requests to anon,authenticated;
commit;
