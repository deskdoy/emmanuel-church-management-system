alter table public.expenses

add column if not exists approval_status text
default 'approved';

update public.expenses
set approval_status = 'approved'
where approval_status is null;


alter table public.expenses
alter column approval_status set not null;


alter table public.expenses

add column if not exists approved_by uuid
references auth.users(id),

add column if not exists approved_at timestamptz,

add column if not exists rejected_by uuid
references auth.users(id),

add column if not exists rejected_at timestamptz,

add column if not exists rejection_reason text;


alter table public.expenses

drop constraint if exists expenses_approval_status_check;


alter table public.expenses

add constraint expenses_approval_status_check

check (
  approval_status in (
    'pending',
    'approved',
    'rejected'
  )
);