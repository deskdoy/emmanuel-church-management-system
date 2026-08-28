import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("financial navigation and entry actions are restored", () => {
  const page = read("app/page.tsx");
  const nav = page.slice(page.indexOf("const navItems"), page.indexOf("const showFinanceNotice"));
  const labels = ["Dashboard", "Transactions", "Payables", "Accounts", "Projects", "Reports", "Users", "Audit Logs", "Backup Center", "System Information", "Settings"];
  let previous = -1;
  for (const label of labels) {
    const position = nav.indexOf(`"${label}"`);
    assert.ok(position > previous, `${label} should appear in sidebar order`);
    previous = position;
  }
  assert.doesNotMatch(nav, /"Income"|"Expenses"|"Analytics"|"Access Requests"/);
  assert.match(page, /New Transaction/);
  assert.match(page, /Money In/);
  assert.match(page, /Money Out/);
  assert.match(page, /Logout/);
  assert.match(page, /Add Payable/);
  assert.match(page, /Record payment/);
  assert.match(page, /Payment history/);
  assert.match(page, /Transaction details/);
  assert.match(page, /Edit transaction/);
  assert.match(page, /Specify details/);
  assert.match(page, /New Account/);
  assert.match(page, /Transfer history/);
  assert.match(page, /From account/);
  assert.match(page, /To account/);
});

test("account transfers are append-only and isolated from income and expense reporting", () => {
  const page = read("app/page.tsx");
  const service = read("src/services/cashflow.ts");
  const reporting = read("src/reporting/calculations.ts");
  const migration = read("supabase/migrations/20260828114420_add_account_transfers.sql");
  assert.match(service, /from\("account_transfers"\)\.insert/);
  assert.match(service, /currentBalance:openingBalance\+moneyIn-moneyOut\+transferIn-transferOut/);
  assert.match(page, /data\.transactions\.reduce[\s\S]*moneyIn/);
  assert.match(page, /Transfers move money between accounts only/);
  assert.match(reporting, /const income=period\.filter\(row=>row\.type==="Income"\),expenses=period\.filter\(row=>row\.type==="Expense"\)/);
  assert.match(reporting, /transferIn[\s\S]*transferOut[\s\S]*currentBalance/);
  assert.doesNotMatch(reporting, /totalIncome[^;]*transfers|totalExpenses[^;]*transfers/);
  assert.match(migration, /check \(from_account_id <> to_account_id\)/);
  assert.match(migration, /amount numeric\(14,2\) not null check \(amount > 0\)/);
  assert.match(migration, /grant select, insert on public\.account_transfers to authenticated/);
  assert.doesNotMatch(migration, /grant[^;]*(update|delete)[^;]*account_transfers/i);
  assert.doesNotMatch(migration, /alter policy|drop policy/);
});

test("password fields are hidden by default and have accessible visibility toggles", () => {
  const field = read("src/auth/PasswordField.tsx");
  const login = read("src/auth/ProtectedRoute.tsx");
  const invitation = read("src/auth/InvitePasswordSetup.tsx");
  assert.match(field, /useState\(false\)/);
  assert.match(field, /visible \? "text" : "password"/);
  assert.match(field, /aria-pressed=\{visible\}/);
  assert.match(login, /PasswordField label="Password"/);
  assert.match(invitation, /PasswordField label="New password"/);
  assert.match(invitation, /PasswordField label="Confirm password"/);
});

test("mobile navigation uses a responsive drawer and overlay", () => {
  const page = read("app/page.tsx");
  const css = read("app/globals.css");
  assert.match(page, /mobile-menu-button/);
  assert.match(page, /sidebar-overlay/);
  assert.match(page, /aria-controls="main-sidebar"/);
  assert.match(page, /event\.key === "Escape"/);
  assert.match(css, /sidebar\.mobile-drawer\.open/);
  assert.match(css, /translateX\(-105%\)/);
  assert.match(css, /@media\(max-width:720px\)/);
});

test("frontend permissions mirror existing financial roles", () => {
  const page = read("app/page.tsx");
  assert.match(page, /\["Admin", "Treasurer", "Encoder"\]\.includes\(profile\.role\)/);
  assert.match(page, /\["Admin", "Treasurer"\]\.includes\(profile\.role\)/);
  assert.match(page, /Read-only access/);
  assert.match(page, /only Admin, Treasurer, and Encoder accounts can create or update/);
  assert.match(page, /only Admin and Treasurer accounts can manage accounts/);
});

test("restored workflows use Supabase services without policy or auth changes", () => {
  const service = read("src/services/cashflow.ts");
  assert.match(service, /from\("payable_payments"\)\.insert/);
  assert.match(service, /export async function updateTransaction/);
  assert.match(service, /from\("accounts"\)\.insert/);
  assert.match(service, /from\("accounts"\)\.update/);
  assert.doesNotMatch(service, /service_role|localStorage|\/api\/cashflow/);
});

test("payment history migration is additive and immutable", () => {
  const migration = read("supabase/migrations/20260827163002_add_payable_payment_history.sql");
  assert.match(migration, /create table public\.payable_payments/);
  assert.match(migration, /references public\.payables\(id\) on delete restrict/);
  assert.match(migration, /create index idx_payable_payments_payable_date/);
  assert.match(migration, /before insert on public\.payable_payments/);
  assert.match(migration, /Payment exceeds the remaining payable balance/);
  assert.match(migration, /grant select, insert on public\.payable_payments to authenticated/);
  assert.doesNotMatch(migration, /grant[^;]*(update|delete)[^;]*payable_payments/i);
  assert.doesNotMatch(migration, /alter policy|drop policy/);
});

test("audit logs are Admin-only, filterable, and read-only", () => {
  const page = read("app/page.tsx");
  const view = read("src/components/AuditLogsView.tsx");
  const service = read("src/services/auditLogs.ts");
  const migration = read("supabase/migrations/20260827164514_admin_only_audit_logs.sql");
  assert.match(page, /profile\?\.role === "Admin"[^\n]+Audit Logs/);
  assert.match(page, /view === "audit" && profile\?\.role === "Admin"/);
  for (const label of ["Start date", "End date", "User", "Action", "Module", "Timestamp", "Record affected", "Before values", "After values"]) assert.match(view, new RegExp(label));
  assert.match(service, /from\("audit_logs"\)/);
  assert.match(service, /\.gte\("created_at"/);
  assert.match(service, /\.lte\("created_at"/);
  assert.doesNotMatch(service, /\.insert\(|\.update\(|\.delete\(/);
  assert.match(migration, /alter policy audit_logs_read/);
  assert.match(migration, /has_any_role\(array\['Admin'\]\)/);
  assert.doesNotMatch(migration, /Pastor/);
  assert.match(migration, /revoke insert, update, delete, truncate on public\.audit_logs/);
});

test("public access requests and Admin approval workflow are secured", () => {
  const route = read("src/auth/ProtectedRoute.tsx");
  const requestForm = read("src/auth/RequestAccessForm.tsx");
  const adminView = read("src/components/AccessRequestsView.tsx");
  const service = read("src/services/accessRequests.ts");
  const edgeFunction = read("supabase/functions/manage-access-request/index.ts");
  const page = read("app/page.tsx");
  const migration = read("supabase/migrations/20260827175035_add_access_request_workflow.sql");
  assert.match(route, /Request Access/);
  assert.match(route, /otp_expired/);
  assert.match(requestForm, /suggestion; the Admin chooses the final role/i);
  const usersView = read("src/components/UsersView.tsx");
  assert.match(page, /profile\?\.role === "Admin"[^\n]+"Users"/);
  assert.match(page, /view === "users" && profile\?\.role === "Admin"/);
  assert.match(usersView, /<AccessRequestsView\/>/);
  assert.match(adminView, /Select final role/);
  assert.match(adminView, /Approve and send invitation/);
  assert.match(service, /functions\.invoke\("manage-access-request"/);
  assert.match(edgeFunction, /relationName\(profile\.roles\) !== "Admin"/);
  assert.match(edgeFunction, /!body\.approvedRole/);
  assert.match(edgeFunction, /auth\.admin\.deleteUser/);
  assert.doesNotMatch(edgeFunction, /requested_role/);
  assert.match(migration, /grant insert \(full_name, email, phone, requested_role, reason\)/);
  assert.match(migration, /access_requests_admin_read/);
  assert.doesNotMatch(migration, /grant (update|delete) on public\.access_requests/i);
  assert.match(migration, /audit_access_requests/);
  assert.match(migration, /p_approved_role text/);
});
