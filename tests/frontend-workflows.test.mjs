import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("financial navigation and entry actions are restored", () => {
  const page = read("app/page.tsx");
  const nav = page.slice(page.indexOf("const navItems"), page.indexOf("const showFinanceNotice"));
  const labels = ["Dashboard", "Transactions", "Income", "Expenses", "Payables", "Accounts", "Reports", "Analytics"];
  let previous = -1;
  for (const label of labels) {
    const position = nav.indexOf(`"${label}"`);
    assert.ok(position > previous, `${label} should appear in sidebar order`);
    previous = position;
  }
  assert.match(page, /Record Income/);
  assert.match(page, /Record Expense/);
  assert.match(page, /Add Payable/);
  assert.match(page, /Record payment/);
  assert.match(page, /Payment history/);
  assert.match(page, /Transaction details/);
  assert.match(page, /Edit transaction/);
  assert.match(page, /Specify details/);
  assert.match(page, /New Account/);
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
