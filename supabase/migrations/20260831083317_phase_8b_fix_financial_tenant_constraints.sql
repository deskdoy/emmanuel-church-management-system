-- Phase 8B:
-- Convert financial master data to tenant-aware uniqueness

begin;


-- =====================================
-- ACCOUNTS
-- =====================================

alter table public.accounts
drop constraint if exists accounts_name_key;


alter table public.accounts
add constraint accounts_church_id_name_key
unique (church_id, name);



-- =====================================
-- CATEGORIES
-- =====================================

alter table public.categories
drop constraint if exists categories_name_transaction_type_key;


alter table public.categories
add constraint categories_church_id_name_transaction_type_key
unique (
  church_id,
  name,
  transaction_type
);


commit;