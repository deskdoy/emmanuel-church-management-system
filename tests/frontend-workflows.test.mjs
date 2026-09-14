import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { assertAdminNavigation, assertNavigationWiring } from "./helpers/navigation.mjs";
import { getNavigationItems, getViewHeadings, navigationSections, navigationSectionByView } from "../src/navigation/viewRegistry.ts";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("financial navigation and entry actions are restored", () => {
  const page = read("app/page.tsx");
  const transactionForm = read("src/components/transactions/TransactionForm.tsx");
  const payableDetails = read("src/components/transactions/PayableDetails.tsx");
  for (const component of ["TransactionForm", "TransactionDetails", "PayableForm", "PayablePaymentForm", "PayableDetails", "AccountForm"]) {
    assert.match(page, new RegExp(`import\\s*\\{[^}]*\\b${component}\\b[^}]*\\}\\s*from\\s*"\\.\\./src/components/transactions/${component}"`));
    assert.match(page, new RegExp(`<${component}\\b`));
    assert.match(read(`src/components/transactions/${component}.tsx`), new RegExp(`export\\s+function\\s+${component}\\b`));
  }
  assertNavigationWiring(page);
  const nav = getNavigationItems({ isChurchAdmin: true, canApproveFinance: true });
  const labels = ["Dashboard", "Transactions", "Offerings", "Donations", "Expenses", "Payables", "Accounts", "Categories", "Payment Methods", "Projects", "Reports", "Members", "Users", "Audit Logs", "Backup Center", "System Information", "Financial Approvals", "Settings"];
  assert.deepEqual(nav.map(([, , label]) => label), labels);
  assert.deepEqual(navigationSections.map(section => nav.filter(([key]) => navigationSectionByView[key] === section).map(([key]) => key)), [
    ["dashboard"],
    ["transactions", "offerings", "donations", "expenses", "payables", "accounts", "categories", "payment-methods", "reports", "financial-approvals"],
    ["projects", "members"],
    ["users", "audit", "backup", "system", "settings"],
  ]);
  assert.match(page, /view\s*===\s*"expenses"\s*&&\s*activeChurch\s*&&\s*profile\s*&&\s*<ExpensesView\s+churchId\s*=\s*\{\s*activeChurch\.id\s*\}\s+userId\s*=\s*\{\s*profile\.id\s*\}\s*\/>/);
  assert.match(page, /New Transaction/);
  assert.match(page, /Money In/);
  assert.match(page, /Money Out/);
  assert.match(read("src/components/layout/Sidebar.tsx"), /Logout/);
  assert.match(page, /Add Payable/);
  assert.match(page, /Record payment/);
  assert.match(payableDetails, /Payment history/);
  assert.match(page, /Transaction details/);
  assert.match(page, /Edit transaction/);
  assert.match(transactionForm, /Specify Other Expense Details/);
  assert.match(transactionForm, /Specify Other Income Details/);
  assert.match(transactionForm, /isOtherCategory\(\s*categoryName\s*\)\s*&&\s*<label\b/);
  assert.match(transactionForm, /<input\s+name="specifiedDetails"(?:(?!\/>)[\s\S])*\srequired\s*\/>/);
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
  assert.match(read("src/components/transactions/TransactionForm.tsx"), /Transfers move money between accounts only/);
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
  const sidebar = read("src/components/layout/Sidebar.tsx");
  const navigation = read("src/components/layout/NavigationSections.tsx");
  const css = read("app/globals.css");
  assert.match(page, /<Sidebar\b/);
  assert.match(page, /navItems=\{navItems\}/);
  assert.match(page, /onNavigate=\{setView\}/);
  assert.match(page, /onSignOut=\{signOut\}/);
  assert.match(sidebar, /mobile-menu-button/);
  assert.match(sidebar, /sidebar-overlay/);
  assert.match(sidebar, /aria-controls="main-sidebar"/);
  assert.match(sidebar, /aria-expanded=\{mobileNavOpen\}/);
  assert.match(sidebar, /event\.key === "Escape"/);
  assert.match(sidebar, /document\.body\.classList\.add\("drawer-open"\)/);
  assert.match(sidebar, /document\.body\.classList\.remove\("drawer-open"\)/);
  assert.match(sidebar, /document\.removeEventListener\("keydown", closeOnEscape\)/);
  assert.match(sidebar, /onNavigate=\{key=>\{onNavigate\(key\);setMobileNavOpen\(false\);\}\}/);
  assert.match(sidebar, /onClick=\{\(\)=>\{setMobileNavOpen\(false\);void onSignOut\(\);\}\}/);
  assert.match(navigation, /navigationSections\.map/);
  assert.match(navigation, /navItems\.filter\(\(\[key\]\) => navigationSectionByView\[key\] === section\)/);
  assert.match(navigation, /view === key \? "active" : ""/);
  assert.match(navigation, /aria-current=\{view===key\?"page":undefined\}/);
  assert.match(navigation, /onClick=\{\(\) => onNavigate\(key\)\}/);
  assert.match(css, /sidebar\.mobile-drawer\.open/);
  assert.match(css, /translateX\(-105%\)/);
  assert.match(css, /@media\(max-width:720px\)/);
});

test("frontend permissions mirror existing financial roles", () => {
  const page = read("app/page.tsx");
  const permissions = read("src/tenancy/permissions.ts");
  assert.match(page, /hasChurchRole\(activeRole,financeWriterRoles\)/);
  assert.match(page, /hasChurchRole\(activeRole,accountManagerRoles\)/);
  assert.match(permissions, /\["Admin","Treasurer","Encoder"\]/);
  assert.match(permissions, /\["Admin","Treasurer"\]/);
  assert.doesNotMatch(page, /profile\?*\.role|profile\.role/);
  assert.match(page, /Read-only access/);
  assert.match(page, /only Church Admin, Treasurer, and Encoder accounts can create or update/);
  assert.match(page, /only Church Admin and Treasurer accounts can manage accounts/);
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
  assertAdminNavigation(page, "audit", "audit", "Audit Logs");
  assert.match(page, /view\s*===\s*"audit"\s*&&\s*isChurchAdmin\s*&&\s*activeChurch\s*&&\s*<AuditLogsView\s+churchId\s*=\s*\{\s*activeChurch\.id\s*\}/);
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
  assert.match(requestForm, /suggestion; the Church Admin chooses the final role/i);
  const usersView = read("src/components/UsersView.tsx");
  assertAdminNavigation(page, "users", "users", "Users");
  assert.match(page, /view\s*===\s*"users"\s*&&\s*isChurchAdmin\s*&&\s*profile\s*&&\s*activeChurch\s*&&\s*<UsersView\s+churchId\s*=\s*\{\s*activeChurch\.id\s*\}/);
  assert.match(usersView, /tab\s*===\s*"requests"\s*\?\s*\(\s*<AccessRequestsView\s+churchId\s*=\s*\{\s*churchId\s*\}\s*\/>/);
  assert.match(adminView, /Select final role/);
  assert.match(adminView, /Approve and send invitation/);
  assert.match(service, /functions\.invoke\("manage-access-request"/);
  assert.match(edgeFunction, /eq\("church_id",body\.churchId\)/);
  assert.doesNotMatch(edgeFunction, /profile\.roles|relationName/);
  assert.match(edgeFunction, /!body\.approvedRole/);
  assert.match(edgeFunction, /auth\.admin\.deleteUser/);
  assert.doesNotMatch(edgeFunction, /requested_role/);
  assert.match(migration, /grant insert \(full_name, email, phone, requested_role, reason\)/);
  assert.match(migration, /access_requests_admin_read/);
  assert.doesNotMatch(migration, /grant (update|delete) on public\.access_requests/i);
  assert.match(migration, /audit_access_requests/);
  assert.match(migration, /p_approved_role text/);
});

test("view registry keeps restricted navigation out of other church roles", () => {
  const page = read("app/page.tsx");
  assertNavigationWiring(page);
  const publicViews = ["dashboard", "transactions", "offerings", "donations", "expenses", "payables", "accounts", "categories", "payment-methods", "projects", "reports"];
  for (const role of ["Admin", "Treasurer", "Pastor", "Secretary", "Encoder", "Viewer", null]) {
    const items = getNavigationItems({ isChurchAdmin: role === "Admin", canApproveFinance: role === "Admin" || role === "Treasurer" });
    const expected = [...publicViews];
    if (role === "Admin") expected.push("members", "users", "audit", "backup", "system");
    if (role === "Admin" || role === "Treasurer") expected.push("financial-approvals");
    expected.push("settings");
    assert.deepEqual(items.map(([key]) => key), expected, `Navigation for ${role}`);
  }
});

test("view headings cover every view and preserve personalized greeting boundaries", () => {
  const page = read("app/page.tsx");
  assert.match(page, /const\s+headings\s*=\s*getViewHeadings\(profile\)/);
  assert.match(page, /<Topbar\s+heading=\{headings\[view\]\}/);
  const profile = { fullName: "  Maria Santos  ", email: "maria@example.org" };
  for (const [hour, greeting] of [[0, "Good morning"], [11, "Good morning"], [12, "Good afternoon"], [17, "Good afternoon"], [18, "Good evening"], [23, "Good evening"]]) {
    const headings = getViewHeadings(profile, new Date(2026, 8, 14, hour));
    assert.deepEqual(headings.dashboard, [`${greeting}, Maria.`, "Welcome to your Faithful Steward financial stewardship workspace."]);
  }
  const morning = new Date(2026, 8, 14, 9);
  assert.equal(getViewHeadings(null, morning).dashboard[0], "Good morning, Steward.");
  assert.equal(getViewHeadings({ fullName: "", email: "maria@example.org" }, morning).dashboard[0], "Good morning, maria@example.org.");
  const headings = getViewHeadings(profile, morning);
  const keys = getNavigationItems({ isChurchAdmin: true, canApproveFinance: true }).map(([key]) => key);
  assert.deepEqual(Object.keys(headings).sort(), [...keys].sort());
  assert.deepEqual(Object.keys(navigationSectionByView).sort(), [...keys].sort());
  for (const key of keys) {
    assert.equal(headings[key].length, 2);
    assert.ok(headings[key].every(text => typeof text === "string" && text.length > 0));
  }
  assert.equal(headings.audit[0], "Audit logs");
});
