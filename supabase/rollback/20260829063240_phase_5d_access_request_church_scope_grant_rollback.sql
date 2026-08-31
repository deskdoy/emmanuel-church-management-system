begin;
revoke insert (church_id) on public.access_requests from anon,authenticated;
commit;
