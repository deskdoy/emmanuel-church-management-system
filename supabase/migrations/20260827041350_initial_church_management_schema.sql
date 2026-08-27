-- Emmanuel Cash Flow / Church Management System
-- Core relational schema and reference data.

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (name in ('Admin', 'Pastor', 'Treasurer', 'Secretary', 'Encoder', 'Viewer')),
  description text not null default '',
  created_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role_id uuid not null references public.roles(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  account_type text not null check (account_type in ('Cash', 'Bank', 'Other')),
  opening_balance numeric(14,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  transaction_type text not null check (transaction_type in ('Income', 'Expense')),
  category_group text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, transaction_type)
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  middle_name text not null default '',
  last_name text not null,
  birth_date date,
  joined_at date not null default current_date,
  phone text not null default '',
  email text,
  address text not null default '',
  membership_status text not null default 'Active' check (membership_status in ('Active', 'Inactive', 'Transferred', 'Deceased')),
  ministry text not null default '',
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  budget numeric(14,2) not null default 0 check (budget >= 0),
  start_date date,
  end_date date,
  status text not null default 'Planned' check (status in ('Planned', 'Active', 'On Hold', 'Completed', 'Cancelled')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  location text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  capacity integer check (capacity is null or capacity >= 0),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  attendance_date date not null default current_date,
  status text not null default 'Present' check (status in ('Present', 'Absent', 'Late', 'Excused')),
  notes text not null default '',
  recorded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, event_id, attendance_date)
);

create table public.offerings (
  id uuid primary key default gen_random_uuid(),
  offering_date date not null,
  service_name text not null default '',
  description text not null default '',
  amount numeric(14,2) not null check (amount > 0),
  account_id uuid not null references public.accounts(id),
  category_id uuid not null references public.categories(id),
  payment_method text not null default 'Cash',
  reference text not null default '',
  notes text not null default '',
  recorded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.donations (
  id uuid primary key default gen_random_uuid(),
  donation_date date not null,
  donor_member_id uuid references public.members(id) on delete set null,
  donor_name text not null default '',
  description text not null default '',
  amount numeric(14,2) not null check (amount > 0),
  account_id uuid not null references public.accounts(id),
  category_id uuid not null references public.categories(id),
  project_id uuid references public.projects(id) on delete set null,
  payment_method text not null default 'Cash',
  reference text not null default '',
  notes text not null default '',
  recorded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  vendor text not null default '',
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  account_id uuid not null references public.accounts(id),
  category_id uuid not null references public.categories(id),
  project_id uuid references public.projects(id) on delete set null,
  payment_method text not null default 'Cash',
  reference text not null default '',
  notes text not null default '',
  recorded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payables (
  id uuid primary key default gen_random_uuid(),
  vendor text not null,
  due_date date not null,
  category_id uuid not null references public.categories(id),
  amount numeric(14,2) not null check (amount > 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  status text not null default 'Unpaid' check (status in ('Unpaid', 'Partially Paid', 'Paid', 'Overdue')),
  notes text not null default '',
  recorded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount_paid <= amount)
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  publish_at timestamptz not null default now(),
  expires_at timestamptz,
  is_published boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at >= publish_at)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  report_type text not null,
  date_from date,
  date_to date,
  parameters jsonb not null default '{}'::jsonb,
  generated_data jsonb not null default '{}'::jsonb,
  generated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (date_to is null or date_from is null or date_to >= date_from)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references public.users(id) on delete set null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  table_name text not null,
  record_id text,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

insert into public.roles (name, description) values
  ('Admin', 'Full system administration'),
  ('Pastor', 'Pastoral oversight and ministry management'),
  ('Treasurer', 'Financial management and reporting'),
  ('Secretary', 'Membership, events, and records management'),
  ('Encoder', 'Authorized data entry'),
  ('Viewer', 'Read-only access');

insert into public.accounts (name, account_type) values
  ('PT Cash Fund', 'Cash'),
  ('Cash on Hand', 'Cash'),
  ('Cash In Bank', 'Bank');

insert into public.categories (name, transaction_type, category_group) values
  ('Tithes', 'Income', 'Income'), ('Offerings', 'Income', 'Income'),
  ('Donations', 'Income', 'Income'), ('Fundraising', 'Income', 'Income'),
  ('Other Income', 'Income', 'Income'), ('Ministry Programs', 'Expense', 'Expenses'),
  ('Utilities', 'Expense', 'Expenses'), ('Rent', 'Expense', 'Expenses'),
  ('Salaries & Allowances', 'Expense', 'Expenses'), ('Transportation', 'Expense', 'Expenses'),
  ('Office & Supplies', 'Expense', 'Expenses'), ('Maintenance', 'Expense', 'Expenses'),
  ('Outreach', 'Expense', 'Expenses'), ('Bank Fees', 'Expense', 'Expenses'),
  ('Other Expense', 'Expense', 'Expenses');

create index idx_users_role_id on public.users(role_id);
create index idx_members_name on public.members(last_name, first_name);
create index idx_members_status on public.members(membership_status);
create index idx_attendance_member_date on public.attendance(member_id, attendance_date desc);
create index idx_attendance_event_id on public.attendance(event_id);
create index idx_offerings_date on public.offerings(offering_date desc);
create index idx_offerings_account_id on public.offerings(account_id);
create index idx_offerings_category_id on public.offerings(category_id);
create index idx_donations_date on public.donations(donation_date desc);
create index idx_donations_account_id on public.donations(account_id);
create index idx_donations_category_id on public.donations(category_id);
create index idx_donations_project_id on public.donations(project_id);
create index idx_expenses_date on public.expenses(expense_date desc);
create index idx_expenses_account_id on public.expenses(account_id);
create index idx_expenses_category_id on public.expenses(category_id);
create index idx_expenses_project_id on public.expenses(project_id);
create index idx_projects_status on public.projects(status);
create index idx_events_starts_at on public.events(starts_at desc);
create index idx_announcements_publish on public.announcements(is_published, publish_at desc);
create index idx_payables_due_status on public.payables(due_date, status);
create index idx_reports_type_created on public.reports(report_type, created_at desc);
create index idx_audit_logs_actor_created on public.audit_logs(actor_user_id, created_at desc);
create index idx_audit_logs_table_record on public.audit_logs(table_name, record_id);
