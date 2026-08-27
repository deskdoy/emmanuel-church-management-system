create table public.payable_payments (
  id uuid primary key default gen_random_uuid(),
  payable_id uuid not null references public.payables(id) on delete restrict,
  payment_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null default 'Cash',
  reference text not null default '',
  notes text not null default '',
  recorded_by uuid references public.users(id) on delete set null default auth.uid(),
  recorded_by_name text not null default '',
  created_at timestamptz not null default now()
);

create index idx_payable_payments_payable_date
  on public.payable_payments(payable_id, payment_date desc, created_at desc);
create index idx_payable_payments_recorded_by
  on public.payable_payments(recorded_by);

-- Preserve previously accumulated payments without inventing unavailable details.
insert into public.payable_payments (
  payable_id, payment_date, amount, payment_method, notes, recorded_by, recorded_by_name, created_at
)
select
  id,
  updated_at::date,
  amount_paid,
  'Legacy',
  'Backfilled from the existing paid balance; original payment details were not available.',
  null,
  'Imported pre-history',
  updated_at
from public.payables
where amount_paid > 0;

create or replace function private.apply_payable_payment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  payable_amount numeric(14,2);
  current_paid numeric(14,2);
  payable_due_date date;
  actor_name text;
begin
  if new.recorded_by is distinct from (select auth.uid()) then
    raise exception 'Payment recorder must match the signed-in user' using errcode = '42501';
  end if;

  if new.payment_date > current_date then
    raise exception 'Payment date cannot be in the future' using errcode = '23514';
  end if;

  select amount, amount_paid, due_date
  into payable_amount, current_paid, payable_due_date
  from public.payables
  where id = new.payable_id
  for update;

  if not found then
    raise exception 'Payable not found or unavailable' using errcode = 'P0002';
  end if;

  if new.amount > payable_amount - current_paid then
    raise exception 'Payment exceeds the remaining payable balance' using errcode = '23514';
  end if;

  select coalesce(nullif(full_name, ''), email)
  into actor_name
  from public.users
  where id = (select auth.uid());

  new.recorded_by_name := coalesce(actor_name, 'Unknown user');

  update public.payables
  set
    amount_paid = current_paid + new.amount,
    status = case
      when current_paid + new.amount >= payable_amount then 'Paid'
      when payable_due_date < current_date then 'Overdue'
      else 'Partially Paid'
    end
  where id = new.payable_id;

  return new;
end;
$$;

revoke all on function private.apply_payable_payment() from public;

create trigger payable_payments_apply
before insert on public.payable_payments
for each row execute function private.apply_payable_payment();

create trigger audit_payable_payments
after insert or update or delete on public.payable_payments
for each row execute function private.audit_row_change();

alter table public.payable_payments enable row level security;

revoke all on public.payable_payments from anon, authenticated;
grant select, insert on public.payable_payments to authenticated;

create policy payable_payments_read on public.payable_payments
for select to authenticated
using ((select private.current_user_role()) is not null);

create policy payable_payments_insert on public.payable_payments
for insert to authenticated
with check (
  (select private.has_any_role(array['Admin','Treasurer','Encoder']))
  and recorded_by = (select auth.uid())
);
