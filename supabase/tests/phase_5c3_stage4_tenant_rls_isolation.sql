-- Phase 5C-3 Stage 4: Church A / Church B RLS isolation tests.
-- Every fixture is enclosed by this transaction and the final statement is ROLLBACK.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

create temp table phase5c3_ids (
  key text primary key,
  id uuid not null
) on commit drop;

grant select on phase5c3_ids to authenticated, anon;

do $fixture_setup$
declare
  church_a uuid;
  church_b uuid := gen_random_uuid();
  admin_a uuid;
  admin_b uuid;
  a_only_user uuid;
  admin_role uuid;
  viewer_role uuid;
  account_a uuid := gen_random_uuid();
  account_b_from uuid := gen_random_uuid();
  account_b_to uuid := gen_random_uuid();
  category_b_income uuid := gen_random_uuid();
  category_b_expense uuid := gen_random_uuid();
  member_b uuid := gen_random_uuid();
  project_b uuid := gen_random_uuid();
  event_b uuid := gen_random_uuid();
  payable_b uuid := gen_random_uuid();
  token text := substr(replace(church_b::text, '-', ''), 1, 12);
begin
  select id into strict church_a
  from public.churches
  where slug = 'emmanuel-church' and status = 'active';

  select cm.user_id into strict admin_a
  from public.church_memberships cm
  join public.roles r on r.id = cm.role_id
  join public.platform_user_roles pur on pur.user_id = cm.user_id and pur.is_active = true
  join public.platform_roles pr on pr.id = pur.platform_role_id and pr.code = 'platform_owner'
  join public.users u on u.id = cm.user_id and u.is_active = true
  where cm.church_id = church_a and cm.status = 'active' and r.name = 'Admin';

  select cm.user_id into strict admin_b
  from public.church_memberships cm
  join public.roles r on r.id = cm.role_id
  join public.users u on u.id = cm.user_id and u.is_active = true
  where cm.church_id = church_a and cm.status = 'active'
    and r.name <> 'Admin' and cm.user_id <> admin_a
  order by cm.user_id
  limit 1;

  select cm.user_id into strict a_only_user
  from public.church_memberships cm
  join public.users u on u.id = cm.user_id and u.is_active = true
  where cm.church_id = church_a and cm.status = 'active'
    and cm.user_id not in (admin_a, admin_b)
  order by cm.user_id
  limit 1;

  select id into strict admin_role from public.roles where name = 'Admin';
  select id into strict viewer_role from public.roles where name = 'Viewer';

  insert into public.churches (
    id, name, slug, address, status, timezone, currency
  ) values (
    church_b, 'Phase 5C-3 Temporary Church B',
    'phase-5c3-temporary-' || lower(substr(church_b::text, 1, 8)),
    '', 'active', 'Asia/Manila', 'PHP'
  );

  -- Church B Admin is temporarily removed from Church A to create a B-only identity.
  update public.church_memberships
  set status = 'inactive'
  where church_id = church_a and user_id = admin_b;

  insert into public.church_memberships (
    church_id, user_id, role_id, status, joined_at
  ) values (
    church_b, admin_b, admin_role, 'active', now()
  );

  insert into phase5c3_ids (key, id) values
    ('church_a', church_a), ('church_b', church_b),
    ('admin_a', admin_a), ('admin_b', admin_b), ('a_only_user', a_only_user),
    ('viewer_role', viewer_role),
    ('account_a', account_a), ('account_b_from', account_b_from),
    ('account_b_to', account_b_to), ('category_b_income', category_b_income),
    ('category_b_expense', category_b_expense), ('member_b', member_b),
    ('project_b', project_b), ('event_b', event_b), ('payable_b', payable_b);

  insert into public.accounts (
    id, name, account_type, opening_balance, church_id
  ) values
    (account_a, '__phase5c3_a_' || token, 'Cash', 0, church_a),
    (account_b_from, '__phase5c3_b_from_' || token, 'Cash', 1000, church_b),
    (account_b_to, '__phase5c3_b_to_' || token, 'Bank', 0, church_b);

  insert into public.categories (
    id, name, transaction_type, category_group, church_id
  ) values
    (category_b_income, '__phase5c3_b_income_' || token, 'Income', 'Income', church_b),
    (category_b_expense, '__phase5c3_b_expense_' || token, 'Expense', 'Expenses', church_b);

  insert into public.members (id, first_name, last_name, church_id)
  values (member_b, 'Temporary', 'Church B Member', church_b);

  insert into public.projects (id, name, status, church_id)
  values (project_b, '__phase5c3_b_project_' || token, 'Active', church_b);

  insert into public.events (id, title, starts_at, church_id)
  values (event_b, '__phase5c3_b_event_' || token, now(), church_b);

  insert into public.attendance (
    member_id, event_id, attendance_date, status, recorded_by, church_id
  ) values (member_b, event_b, current_date, 'Present', admin_b, church_b);

  insert into public.announcements (title, content, is_published, church_id)
  values ('__phase5c3_b_announcement_' || token, 'Temporary isolation test.', true, church_b);

  insert into public.offerings (
    offering_date, description, amount, account_id, category_id, recorded_by, church_id
  ) values (current_date, 'Temporary Church B offering', 100, account_b_from,
    category_b_income, admin_b, church_b);

  insert into public.donations (
    donation_date, donor_member_id, donor_name, description, amount,
    account_id, category_id, project_id, recorded_by, church_id
  ) values (current_date, member_b, 'Temporary Donor', 'Temporary Church B donation', 50,
    account_b_from, category_b_income, project_b, admin_b, church_b);

  insert into public.expenses (
    expense_date, vendor, description, amount, account_id, category_id,
    project_id, recorded_by, church_id
  ) values (current_date, 'Temporary Vendor', 'Temporary Church B expense', 25,
    account_b_from, category_b_expense, project_b, admin_b, church_b);

  insert into public.account_transfers (
    transfer_date, from_account_id, to_account_id, amount, recorded_by, church_id
  ) values (current_date, account_b_from, account_b_to, 10, admin_b, church_b);

  insert into public.payables (
    id, vendor, due_date, category_id, amount, recorded_by, church_id
  ) values (payable_b, 'Temporary Payable', current_date + 7,
    category_b_expense, 40, admin_b, church_b);

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', admin_b, 'role', 'authenticated')::text,
    true
  );
  insert into public.payable_payments (
    payable_id, payment_date, amount, recorded_by, church_id
  ) values (payable_b, current_date, 5, admin_b, church_b);
  perform set_config('request.jwt.claims', '{}', true);

  insert into public.reports (
    title, report_type, parameters, generated_data, generated_by, church_id
  ) values (
    '__phase5c3_b_backup_' || token, 'backup_export', '{}'::jsonb,
    '{}'::jsonb, admin_b, church_b
  );

  insert into public.access_requests (
    full_name, email, requested_role, reason, church_id
  ) values
    ('Temporary Church A Request', 'phase5c3-a-' || token || '@example.invalid',
      'Viewer', 'Temporary Church A access isolation request.', church_a),
    ('Temporary Church B Request', 'phase5c3-b-' || token || '@example.invalid',
      'Viewer', 'Temporary Church B access isolation request.', church_b);
end
$fixture_setup$;

-- Church A Admin has no Church B membership at this point.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id from phase5c3_ids where key = 'admin_a'),
    'role', 'authenticated'
  )::text,
  true
);

do $church_a_admin_tests$
declare
  church_a uuid := (select id from phase5c3_ids where key = 'church_a');
  church_b uuid := (select id from phase5c3_ids where key = 'church_b');
  account_b uuid := (select id from phase5c3_ids where key = 'account_b_from');
  affected integer;
begin
  if (select count(*) from public.accounts where church_id = church_b) <> 0 then
    raise exception 'Church A Admin can read Church B accounts';
  end if;
  if (select count(*) from public.accounts where church_id = church_a
      and id = (select id from phase5c3_ids where key = 'account_a')) <> 1 then
    raise exception 'Church A Admin cannot read Church A account';
  end if;
  if (select count(*) from public.access_requests where church_id = church_b) <> 0
    or (select count(*) from public.audit_logs where church_id = church_b) <> 0
  then
    raise exception 'Church A Admin can read Church B protected records';
  end if;

  begin
    insert into public.accounts (name, account_type, church_id)
    values ('__phase5c3_forbidden_b_insert__', 'Cash', church_b);
    raise exception 'Church A Admin inserted a Church B account';
  exception when insufficient_privilege then null;
  end;

  update public.accounts set is_active = false where id = account_b;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Church A Admin updated a Church B account'; end if;

  delete from public.accounts where id = account_b;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Church A Admin deleted a Church B account'; end if;
end
$church_a_admin_tests$;

reset role;
select set_config('request.jwt.claims', '{}', true);

-- Give the same actor Viewer membership in Church B to prove roles are church-specific.
insert into public.church_memberships (
  church_id, user_id, role_id, status, joined_at
)
select
  (select id from phase5c3_ids where key = 'church_b'),
  (select id from phase5c3_ids where key = 'admin_a'),
  (select id from phase5c3_ids where key = 'viewer_role'),
  'active', now();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id from phase5c3_ids where key = 'admin_a'),
    'role', 'authenticated'
  )::text,
  true
);

do $multi_church_role_tests$
declare
  church_b uuid := (select id from phase5c3_ids where key = 'church_b');
  account_a uuid := (select id from phase5c3_ids where key = 'account_a');
begin
  if (select count(*) from public.accounts where church_id = church_b) < 2 then
    raise exception 'Church B Viewer membership cannot read Church B accounts';
  end if;

  begin
    insert into public.accounts (name, account_type, church_id)
    values ('__phase5c3_viewer_forbidden__', 'Cash', church_b);
    raise exception 'Church B Viewer inserted a Church B account';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.accounts set church_id = church_b where id = account_a;
    raise exception 'A tenant-owned account changed churches';
  exception
    when check_violation or insufficient_privilege then null;
  end;
end
$multi_church_role_tests$;

reset role;
select set_config('request.jwt.claims', '{}', true);

-- Church B Admin is B-only and must see every Church B tenant module, never Church A.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id from phase5c3_ids where key = 'admin_b'),
    'role', 'authenticated'
  )::text,
  true
);

do $church_b_admin_tests$
declare
  church_a uuid := (select id from phase5c3_ids where key = 'church_a');
  church_b uuid := (select id from phase5c3_ids where key = 'church_b');
begin
  if (select count(*) from public.accounts where church_id = church_a) <> 0 then
    raise exception 'Church B-only Admin can read Church A accounts';
  end if;

  if (select count(*) from public.accounts where church_id = church_b) = 0
    or (select count(*) from public.categories where church_id = church_b) = 0
    or (select count(*) from public.offerings where church_id = church_b) = 0
    or (select count(*) from public.donations where church_id = church_b) = 0
    or (select count(*) from public.expenses where church_id = church_b) = 0
    or (select count(*) from public.account_transfers where church_id = church_b) = 0
    or (select count(*) from public.payables where church_id = church_b) = 0
    or (select count(*) from public.payable_payments where church_id = church_b) = 0
    or (select count(*) from public.members where church_id = church_b) = 0
    or (select count(*) from public.attendance where church_id = church_b) = 0
    or (select count(*) from public.projects where church_id = church_b) = 0
    or (select count(*) from public.events where church_id = church_b) = 0
    or (select count(*) from public.announcements where church_id = church_b) = 0
    or (select count(*) from public.reports where church_id = church_b) = 0
    or (select count(*) from public.access_requests where church_id = church_b) = 0
    or (select count(*) from public.audit_logs where church_id = church_b) = 0
  then
    raise exception 'Church B Admin cannot read one or more Church B modules';
  end if;

  insert into public.reports (
    title, report_type, parameters, generated_data, generated_by, church_id
  ) values (
    '__phase5c3_b_admin_positive__', 'cash_flow', '{}'::jsonb, '{}'::jsonb,
    (select auth.uid()), church_b
  );

  begin
    insert into public.reports (
      title, report_type, parameters, generated_data, generated_by, church_id
    ) values (
      '__phase5c3_cross_church_forbidden__', 'cash_flow', '{}'::jsonb, '{}'::jsonb,
      (select auth.uid()), church_a
    );
    raise exception 'Church B-only Admin inserted a Church A report';
  exception when insufficient_privilege then null;
  end;
end
$church_b_admin_tests$;

reset role;
select set_config('request.jwt.claims', '{}', true);

-- Platform Owner keeps platform visibility but loses all business access without membership.
update public.church_memberships
set status = 'inactive'
where user_id = (select id from phase5c3_ids where key = 'admin_a');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id from phase5c3_ids where key = 'admin_a'),
    'role', 'authenticated'
  )::text,
  true
);

do $platform_owner_tests$
begin
  if not (select private.is_platform_owner()) then
    raise exception 'Platform Owner helper unexpectedly failed';
  end if;
  if (select private.has_active_church_membership()) then
    raise exception 'Platform Owner unexpectedly retained church membership';
  end if;
  if (select count(*) from public.accounts) <> 0
    or (select count(*) from public.offerings) <> 0
    or (select count(*) from public.expenses) <> 0
    or (select count(*) from public.reports) <> 0
    or (select count(*) from public.audit_logs where church_id is not null) <> 0
  then
    raise exception 'Platform Owner received automatic church business access';
  end if;
  if (select count(*) from public.churches) <> 2 then
    raise exception 'Platform Owner cannot view the temporary church directory';
  end if;
end
$platform_owner_tests$;

reset role;
select set_config('request.jwt.claims', '{}', true);

-- With two active churches and no tenant selector, the unchanged public form fails closed.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $anonymous_fail_closed_test$
begin
  begin
    insert into public.access_requests (
      full_name, email, requested_role, reason
    ) values (
      'Temporary Ambiguous Request', 'phase5c3-ambiguous@example.invalid',
      'Viewer', 'This request must fail closed while tenant selection is ambiguous.'
    );
    raise exception 'Ambiguous public access request unexpectedly succeeded';
  exception
    when raise_exception or insufficient_privilege then
      if sqlerrm = 'Ambiguous public access request unexpectedly succeeded' then
        raise;
      end if;
  end;
end
$anonymous_fail_closed_test$;
reset role;
select set_config('request.jwt.claims', '{}', true);

rollback;

select
  (select count(*) from public.churches) as persistent_church_count,
  (select count(*) from public.churches where slug like 'phase-5c3-temporary-%') as temporary_churches,
  (select count(*) from public.access_requests where email like 'phase5c3-%@example.invalid') as temporary_requests,
  (select count(*) from public.reports where title like '__phase5c3_%') as temporary_reports,
  coalesce((select sum(amount) from public.offerings),0) as offering_income,
  coalesce((select sum(amount) from public.donations),0) as donation_income,
  coalesce((select sum(amount) from public.expenses),0) as expense_total,
  coalesce((select sum(amount) from public.account_transfers),0) as transfer_total,
  coalesce((select sum(amount) from public.payables),0) as payable_total,
  coalesce((select sum(amount_paid) from public.payables),0) as payable_paid,
  coalesce((select sum(amount) from public.payable_payments),0) as payable_payment_total;
