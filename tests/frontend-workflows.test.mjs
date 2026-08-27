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
  assert.match(service, /from\("payables"\)\.update/);
  assert.match(service, /from\("accounts"\)\.insert/);
  assert.match(service, /from\("accounts"\)\.update/);
  assert.doesNotMatch(service, /service_role|localStorage|\/api\/cashflow/);
});
