-- Keep audit history visible only to administrators and immutable to API clients.
alter policy audit_logs_read on public.audit_logs
using ((select private.has_any_role(array['Admin'])));

revoke insert, update, delete, truncate on public.audit_logs from anon, authenticated;

-- Support the page's date, action, module, and user filters.
create index if not exists idx_audit_logs_created_at
on public.audit_logs(created_at desc);

create index if not exists idx_audit_logs_action_created
on public.audit_logs(action, created_at desc);

create index if not exists idx_audit_logs_table_created
on public.audit_logs(table_name, created_at desc);
