-- Budget Planning: annual budgets and category allocations.
-- Financial master permissions mirror accounts/categories:
-- active church members read; Admin/Treasurer insert/update; Admin delete.
-- Approval metadata belongs to the budget header. Totals are derived from lines.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  fiscal_year integer not null check (fiscal_year between 1 and 9999),
  status text not null default 'Draft'
    constraint budgets_status_check check (status in ('Draft', 'Submitted', 'Approved', 'Active', 'Closed')),
  notes text not null default '',
  created_by uuid not null default auth.uid() references public.users(id) on delete restrict,
  approved_by uuid references public.users(id) on delete restrict,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_church_id_id_key unique (church_id, id),
  constraint budgets_approval_metadata_check check (
    (approved_by is null and approved_at is null)
    or (approved_by is not null and approved_at is not null)
  )
);

create table public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete restrict,
  budget_id uuid not null,
  category_id uuid not null,
  amount numeric(14,2) not null default 0 check (amount >= 0 and amount <> 'NaN'::numeric),
  notes text not null default '',
  created_by uuid not null default auth.uid() references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budget_lines_budget_id_fkey foreign key (church_id, budget_id)
    references public.budgets(church_id, id) on delete restrict,
  constraint budget_lines_category_id_fkey foreign key (church_id, category_id)
    references public.categories(church_id, id) on delete restrict,
  constraint budget_lines_church_budget_category_key unique (church_id, budget_id, category_id)
);

-- Leading church_id indexes support tenant filters. The line unique key also
-- covers (church_id, budget_id); categories already has a (church_id, id) key.
create index idx_budgets_church_fiscal_year on public.budgets(church_id, fiscal_year);
create index idx_budgets_fiscal_year on public.budgets(fiscal_year);
create index idx_budgets_created_by on public.budgets(created_by);
create index idx_budgets_approved_by on public.budgets(approved_by) where approved_by is not null;
create index idx_budget_lines_budget_id on public.budget_lines(budget_id);
create index idx_budget_lines_category_id on public.budget_lines(category_id);
create index idx_budget_lines_church_category on public.budget_lines(church_id, category_id);
create index idx_budget_lines_created_by on public.budget_lines(created_by);

-- The existing prevent_church_id_change helper has a fixed table allowlist.
-- Keep it unchanged and protect only the new tables with this invoker trigger.
create function private.guard_budget_metadata()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_table_schema <> 'public'
    or tg_table_name not in ('budgets', 'budget_lines')
    or tg_op not in ('INSERT', 'UPDATE')
  then
    raise exception 'guard_budget_metadata only supports budget INSERT/UPDATE triggers';
  end if;

  if tg_op = 'UPDATE' then
    if new.church_id is distinct from old.church_id then
      raise exception 'church_id is immutable after insert' using errcode = '23514';
    end if;
    if new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Budget creation metadata is immutable' using errcode = '23514';
    end if;
  end if;

  if tg_table_name = 'budgets' then
    if tg_op = 'INSERT' then
      if new.approved_by is not null then
        if new.approved_by is distinct from (select auth.uid())
          or not private.has_church_role(new.church_id, array['Admin','Treasurer'])
        then
          raise exception 'Budget approval requires the current Church Admin or Treasurer' using errcode = '42501';
        end if;
        new.approved_at := now();
      else
        new.approved_at := null;
      end if;
    elsif new.approved_by is distinct from old.approved_by then
      if not private.has_church_role(new.church_id, array['Admin','Treasurer']) then
        raise exception 'Budget approval changes require Church Admin or Treasurer' using errcode = '42501';
      end if;
      if new.approved_by is not null then
        if new.approved_by is distinct from (select auth.uid()) then
          raise exception 'Budget approval must identify the current user' using errcode = '42501';
        end if;
        new.approved_at := now();
      else
        new.approved_at := null;
      end if;
    else
      -- Clients cannot rewrite the timestamp of an unchanged approval.
      new.approved_at := old.approved_at;
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_budget_metadata() from public, anon, authenticated, service_role;

create trigger budgets_guard_metadata before insert or update on public.budgets
for each row execute function private.guard_budget_metadata();
create trigger budget_lines_guard_metadata before insert or update on public.budget_lines
for each row execute function private.guard_budget_metadata();
create trigger budgets_set_updated_at before update on public.budgets
for each row execute function private.set_updated_at();
create trigger budget_lines_set_updated_at before update on public.budget_lines
for each row execute function private.set_updated_at();
create trigger audit_budgets after insert or update or delete on public.budgets
for each row execute function private.audit_row_change();
create trigger audit_budget_lines after insert or update or delete on public.budget_lines
for each row execute function private.audit_row_change();

alter table public.budgets enable row level security;
alter table public.budget_lines enable row level security;

revoke all on public.budgets, public.budget_lines from public, anon, authenticated;
grant select, insert, update, delete on public.budgets, public.budget_lines to authenticated;

-- No platform-owner bypass: each policy uses active church membership.
create policy budgets_tenant_fence on public.budgets as restrictive for all to authenticated
using ((select private.is_active_church_member(church_id)))
with check ((select private.is_active_church_member(church_id)));
create policy budget_lines_tenant_fence on public.budget_lines as restrictive for all to authenticated
using ((select private.is_active_church_member(church_id)))
with check ((select private.is_active_church_member(church_id)));

create policy budgets_read on public.budgets for select to authenticated
using ((select private.is_active_church_member(church_id)));
create policy budgets_insert on public.budgets for insert to authenticated
with check (
  (select private.has_church_role(church_id, array['Admin','Treasurer']))
  and created_by = (select auth.uid())
);
create policy budgets_update on public.budgets for update to authenticated
using ((select private.has_church_role(church_id, array['Admin','Treasurer'])))
with check ((select private.has_church_role(church_id, array['Admin','Treasurer'])));
create policy budgets_delete on public.budgets for delete to authenticated
using ((select private.has_church_role(church_id, array['Admin'])));

create policy budget_lines_read on public.budget_lines for select to authenticated
using ((select private.is_active_church_member(church_id)));
create policy budget_lines_insert on public.budget_lines for insert to authenticated
with check (
  (select private.has_church_role(church_id, array['Admin','Treasurer']))
  and created_by = (select auth.uid())
);
create policy budget_lines_update on public.budget_lines for update to authenticated
using ((select private.has_church_role(church_id, array['Admin','Treasurer'])))
with check ((select private.has_church_role(church_id, array['Admin','Treasurer'])));
create policy budget_lines_delete on public.budget_lines for delete to authenticated
using ((select private.has_church_role(church_id, array['Admin'])));

commit;
