create table public.account_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_date date not null default current_date,
  from_account_id uuid not null references public.accounts(id) on delete restrict,
  to_account_id uuid not null references public.accounts(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  reference text not null default '' check (char_length(reference) <= 200),
  notes text not null default '' check (char_length(notes) <= 2000),
  recorded_by uuid not null references public.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  constraint account_transfers_distinct_accounts check (from_account_id <> to_account_id)
);

create index idx_account_transfers_from_date
  on public.account_transfers(from_account_id, transfer_date desc, created_at desc);
create index idx_account_transfers_to_date
  on public.account_transfers(to_account_id, transfer_date desc, created_at desc);

create trigger audit_account_transfers
after insert or update or delete on public.account_transfers
for each row execute function private.audit_row_change();

alter table public.account_transfers enable row level security;

revoke all on public.account_transfers from anon, authenticated;
grant select, insert on public.account_transfers to authenticated;

create policy account_transfers_read on public.account_transfers
for select to authenticated
using ((select private.current_user_role()) is not null);

create policy account_transfers_insert on public.account_transfers
for insert to authenticated
with check (
  (select private.has_any_role(array['Admin','Treasurer','Encoder']))
  and recorded_by = (select auth.uid())
);
