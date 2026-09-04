alter table public.expenses

add column if not exists approval_status text
not null
default 'approved',

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