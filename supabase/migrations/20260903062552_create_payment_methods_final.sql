create table public.payment_methods (

  id uuid primary key default gen_random_uuid(),

  name text not null,

  is_active boolean not null default true,

  church_id uuid not null
    references public.churches(id)
    on delete cascade,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()

);