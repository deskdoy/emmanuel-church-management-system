import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test, { before, after } from "node:test";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "@playwright/test";

// Isolated component harness: no app login, Supabase connection, or migration execution.
const methods = ["loadBudgets", "createBudget", "updateBudget", "deleteBudget", "loadBudgetLines", "saveBudgetLine", "deleteBudgetLine", "submitBudget", "approveBudget", "activateBudget", "closeBudget"];
let browser;
let bundle;
let css;
before(async () => {
  const result = await build({
    configFile: false, logLevel: "silent", define: { "process.env.NODE_ENV": JSON.stringify("production") },
    plugins: [react(), {
      name: "budget-component-fixtures", enforce: "pre",
      resolveId(id) {
        if (id === "budget-ui-entry" || id.replaceAll("\\", "/").endsWith("/budget-ui-entry")) return "\0budget-ui-entry";
        if (id.endsWith("/services/cashflow")) return "\0budget-cashflow";
        if (id.endsWith("/services/budgets")) return "\0budget-service";
        if (id.endsWith("/tenancy/ActiveChurchContext")) return "\0budget-context";
        if (id.endsWith("/lib/supabase")) return "\0budget-categories";
      },
      load(id) {
        if (id === "\0budget-ui-entry") return `
          import React from "react";
          import { createRoot } from "react-dom/client";
          import { BudgetView } from ${JSON.stringify(fileURLToPath(new URL("../../src/components/budgets/BudgetView.tsx", import.meta.url)).replaceAll("\\", "/"))};
          import { BudgetHealthCard } from ${JSON.stringify(fileURLToPath(new URL("../../src/components/dashboard/BudgetHealthCard.tsx", import.meta.url)).replaceAll("\\", "/"))};
          const root = createRoot(document.getElementById("root"));
          window.updateBudgetHealth = () => root.render(React.createElement(BudgetHealthCard, { churchId: window.healthChurchId, data: window.healthData, asOf: new Date(2026, 8, 14) }));
          window.renderBudgetHealth = (role = "Admin", churchId = "church-a", viewChurchId = churchId) => {
            window.scope = { activeRole: role, activeChurch: { id: churchId }, scopeVersion: (window.scope?.scopeVersion || 0) + 1, workspaceMode: "church" };
            window.healthChurchId = viewChurchId;
            window.updateBudgetHealth();
          };
          window.renderBudget = (role = "Admin", churchId = "church-a", viewChurchId = churchId) => {
            window.scope = { activeRole: role, activeChurch: { id: churchId }, scopeVersion: (window.scope?.scopeVersion || 0) + 1, workspaceMode: "church" };
            root.render(React.createElement(BudgetView, { churchId: viewChurchId }));
          };
        `;
        if (id === "\0budget-service") return methods.map(name => `export const ${name} = (...args) => window.budgetCall("${name}", args);`).join("\n");
        if (id === "\0budget-cashflow") return 'export const loadCashFlow = churchId => window.budgetCall("loadCashFlow", [churchId]);';
        if (id === "\0budget-context") return "export const useActiveChurch = () => window.scope;";
        if (id === "\0budget-categories") return `export const getSupabase = () => ({ from: table => ({ select: () => ({ eq: (column, churchId) => ({ order: async () => {
          window.calls.push({ name: "categories", args: [table, column, churchId] });
          return { data: window.categories, error: null };
        } }) }) }) });`;
      },
    }],
    build: { write: false, minify: false, lib: { entry: "budget-ui-entry", name: "BudgetUITest", formats: ["iife"] } },
  });
  const output = (Array.isArray(result) ? result[0] : result).output;
  bundle = output.find(item => item.type === "chunk").code;
  css = ["../../app/globals.css", "../../src/styles/tokens.css", "../../src/styles/primitives.css", "../../src/styles/motion.css"].map(path => fs.readFileSync(new URL(path, import.meta.url), "utf8")).join("\n") + output.filter(item => item.type === "asset" && item.fileName.endsWith(".css")).map(item => item.source).join("\n");
  browser = await chromium.launch({ channel: process.env.BUDGET_TEST_BROWSER || "msedge", headless: true });
});
after(async () => { await browser?.close(); });

async function pageFor(role = "Admin") {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => route.abort());
  await page.setContent('<html><head></head><body><main id="root" style="padding:16px"></main></body></html>');
  await page.addStyleTag({ content: css });
  await page.evaluate(() => {
    window.calls = [];
    window.budgets = [];
    window.lines = [];
    window.transactions = [];
    window.categories = [{ id: "cat-a", name: "Ministry", transaction_type: "Expense", is_active: true }, { id: "cat-b", name: "Giving", transaction_type: "Income", is_active: true }];
    window.budgetCall = async (name, args) => {
      window.calls.push({ name, args });
      if (window.fail === name) throw new Error("Test permission failure");
      if (name === "loadCashFlow") {
        const data = { transactions: window.transactions, accounts: [], transfers: [], payables: [], categories: window.categories.map(category => ({ id: category.id, name: category.name, type: category.transaction_type, group: category.transaction_type, active: category.is_active ? "Yes" : "No" })) };
        if (window.deferCashFlow) return new Promise(resolve => { window.resolveCashFlow = () => resolve(data); });
        return data;
      }
      if (name === "loadBudgets") {
        if (window.deferLoad) return new Promise(resolve => { window.resolveLoad = resolve; });
        return window.budgets.filter(row => row.churchId === args[0]);
      }
      if (name === "loadBudgetLines") return window.lines.filter(row => row.churchId === args[0] && row.budgetId === args[1]);
      if (name === "createBudget") {
        const row = { id: "budget-a", churchId: args[0], ...args[1], status: "Draft", createdBy: "user-a", approvedBy: null, approvedAt: null, createdAt: "2026-09-14T10:00:00Z", updatedAt: "2026-09-14T10:00:00Z" };
        window.budgets.push(row); return row;
      }
      if (name === "saveBudgetLine") {
        const row = { ...args[2], id: args[2].id || "line-a", churchId: args[0], budgetId: args[1], createdBy: "user-a", createdAt: "2026-09-14T10:00:00Z", updatedAt: "2026-09-14T10:00:00Z" };
        window.lines = [...window.lines.filter(line => line.id !== row.id), row]; return row;
      }
      if (name === "deleteBudgetLine") { window.lines = window.lines.filter(row => row.id !== args[2]); return; }
      if (name === "deleteBudget") { window.budgets = window.budgets.filter(row => row.id !== args[1]); return; }
      const status = { submitBudget: "Submitted", approveBudget: "Approved", activateBudget: "Active", closeBudget: "Closed" }[name];
      const row = window.budgets.find(row => row.id === args[1]);
      const updated = { ...row, ...(name === "updateBudget" ? args[2] : { status }) };
      window.budgets = window.budgets.map(row => row.id === updated.id ? updated : row);
      return updated;
    };
  });
  await page.addScriptTag({ content: bundle });
  assert.deepEqual(errors, [], "The isolated component bundle must execute without browser errors");
  page.on("dialog", dialog => dialog.accept());
  await page.evaluate(role => window.renderBudget(role), role);
  await page.waitForTimeout(50);
  assert.deepEqual(errors, [], "Budget rendering must not throw");
  return page;
}

async function createPlan(page) {
  await page.getByRole("heading", { name: "No budgets yet" }).waitFor();
  await page.getByRole("button", { name: "New budget", exact: true }).click();
  await page.getByLabel("Budget name", { exact: true }).fill("Annual ministry plan");
  await page.getByLabel("Fiscal year", { exact: true }).fill("2026");
  await page.getByRole("button", { name: "Create budget", exact: true }).click();
  await page.getByRole("heading", { name: "No allocations yet" }).waitFor();
}

async function addLine(page) {
  await page.getByRole("button", { name: "Add allocation", exact: true }).click();
  await page.getByLabel("Category", { exact: true }).selectOption("cat-a");
  await page.getByLabel("Planned amount (PHP)").fill("500.25");
  await page.getByRole("button", { name: "Save allocation", exact: true }).click();
  await page.locator("tbody").getByText("Ministry", { exact: true }).waitFor();
}

test("Admin can create, edit allocations, and complete the budget lifecycle on mobile", async () => {
  const page = await pageFor();
  try {
    await createPlan(page);
    await addLine(page);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Planned amount (PHP)").fill("750.50");
    await page.getByRole("button", { name: "Save allocation", exact: true }).click();
    await page.getByText("Budget allocation saved.").waitFor();
    assert.equal(await page.evaluate(() => window.lines[0].amount), 750.5);
    await page.getByRole("button", { name: "Edit details", exact: true }).click();
    await page.getByLabel("Budget name", { exact: true }).fill("Updated annual plan");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByRole("heading", { name: "Updated annual plan" }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    for (const label of ["Submit for approval", "Approve budget", "Activate budget", "Close budget"]) {
      await page.getByRole("button", { name: label, exact: true }).click();
    }
    await page.getByText("This budget is closed and available for review.").waitFor();
    assert.equal(await page.getByRole("button", { name: "Add allocation", exact: true }).count(), 0);
    const calls = await page.evaluate(() => window.calls);
    for (const call of calls.filter(call => call.name !== "categories")) assert.equal(call.args[0], "church-a");
    assert.deepEqual(calls.find(call => call.name === "categories").args, ["categories", "church_id", "church-a"]);
  } catch (error) { console.error(await page.locator("body").innerText()); throw error; } finally { await page.close(); }
});

test("Treasurer can manage but only Admin can delete; other roles are read-only", async () => {
  const page = await pageFor("Treasurer");
  try {
    await createPlan(page);
    await addLine(page);
    assert.equal(await page.getByRole("button", { name: /Delete/ }).count(), 0);
    for (const role of ["Pastor", "Secretary", "Encoder", "Viewer"]) {
      await page.evaluate(role => window.renderBudget(role), role);
      await page.getByRole("button", { name: "View budget", exact: true }).click();
      await page.locator("tbody").getByText("Ministry", { exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: /Edit|Delete|Add allocation|Submit for approval/ }).count(), 0);
      await page.getByText(/Read-only access/).waitFor();
    }
    await page.evaluate(() => window.renderBudget("Admin"));
    await page.getByRole("button", { name: "View budget", exact: true }).click();
    await page.locator("tbody").getByText("Ministry", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Delete budget", exact: true }).isDisabled(), true);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("heading", { name: "No allocations yet" }).waitFor();
    await page.getByRole("button", { name: "Delete budget", exact: true }).click();
    await page.getByRole("heading", { name: "No budgets yet" }).waitFor();
  } catch (error) { console.error(await page.locator("body").innerText()); throw error; } finally { await page.close(); }
});

test("loading, failed writes, retry, and church changes do not expose stale budget data", async () => {
  const page = await pageFor();
  try {
    await createPlan(page);
    await page.getByRole("button", { name: "Add allocation", exact: true }).click();
    await page.getByLabel("Category", { exact: true }).selectOption("cat-a");
    await page.getByLabel("Planned amount (PHP)").fill("50");
    await page.evaluate(() => { window.fail = "saveBudgetLine"; });
    await page.getByRole("button", { name: "Save allocation", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Test permission failure" }).waitFor();
    assert.equal(await page.getByLabel("Planned amount (PHP)").inputValue(), "50");
    await page.evaluate(() => { window.fail = "loadBudgets"; window.renderBudget("Admin"); });
    await page.getByRole("alert").filter({ hasText: "Test permission failure" }).waitFor();
    await page.evaluate(() => { window.fail = null; });
    await page.getByRole("button", { name: "Try again" }).click();
    await page.getByRole("button", { name: "View budget" }).waitFor();
    await page.evaluate(() => { window.deferLoad = true; window.renderBudget("Admin"); });
    await page.getByRole("status", { name: "Loading budgets" }).waitFor();
    await page.evaluate(() => { window.staleResolve = window.resolveLoad; window.deferLoad = false; window.renderBudget("Admin", "church-b"); });
    await page.getByRole("heading", { name: "No budgets yet" }).waitFor();
    await page.evaluate(() => window.staleResolve(window.budgets));
    await page.waitForTimeout(50);
    assert.equal(await page.getByText("Annual ministry plan").count(), 0);
    const previousCount = await page.evaluate(() => window.calls.length);
    await page.evaluate(() => window.renderBudget("Admin", "church-a", "church-b"));
    await page.getByRole("heading", { name: "Choose a church workspace" }).waitFor();
    assert.equal(await page.evaluate(() => window.calls.length), previousCount);
  } catch (error) { console.error(await page.locator("body").innerText()); throw error; } finally { await page.close(); }
});


test("Budget vs Actual renders approved expense comparisons and preserves unsaved builder input", async () => {
  const page = await pageFor();
  try {
    await createPlan(page);
    await addLine(page);
    await page.evaluate(() => {
      window.categories.push({ id: "repairs", name: "Repairs", transaction_type: "Expense", is_active: true });
      const expense = { type: "Expense", category: "Ministry", date: "2026-06-01", approvalStatus: "approved", moneyOut: 200, moneyIn: 0 };
      window.transactions = [expense, { ...expense, moneyOut: 5000, approvalStatus: "pending" }, { ...expense, moneyOut: 9000, approvalStatus: "rejected" }, { ...expense, type: "Income", category: "Giving", moneyIn: 10000, moneyOut: 0 }, { ...expense, category: "Repairs", moneyOut: 75 }];
    });
    await page.getByRole("button", { name: "Edit details", exact: true }).click();
    await page.getByLabel("Budget name", { exact: true }).fill("Unsaved draft title");
    await page.getByRole("tab", { name: "Budget vs Actual", exact: true }).click();
    const report = page.getByRole("region", { name: "Budget vs Actual report", exact: true });
    await report.locator("tbody").getByText("Ministry", { exact: true }).waitFor();
    const ministry = report.locator("tbody tr").filter({ hasText: "Ministry" });
    assert.deepEqual(await ministry.locator("td").allTextContents(), ["Ministry", "\u20b1500.25", "\u20b1200.00", "\u20b1300.25", "39.98%", "Under budget"]);
    const repairs = report.locator("tbody tr").filter({ hasText: "Repairs" });
    assert.deepEqual(await repairs.locator("td").allTextContents(), ["Repairs", "\u20b10.00", "\u20b175.00", "-\u20b175.00", "Not applicable", "Over budget"]);
    assert.equal(await report.locator("tbody").getByText("Giving", { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const calls = await page.evaluate(() => window.calls.filter(call => call.name === "loadCashFlow" || call.name === "loadBudgetLines"));
    assert.ok(calls.some(call => call.name === "loadCashFlow"));
    for (const call of calls) assert.equal(call.args[0], "church-a");
    await page.getByRole("tab", { name: "Budget vs Actual", exact: true }).press("ArrowLeft");
    assert.equal(await page.getByRole("tab", { name: "Budget builder", exact: true }).getAttribute("aria-selected"), "true");
    assert.equal(await page.getByLabel("Budget name", { exact: true }).inputValue(), "Unsaved draft title");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
  } finally { await page.close(); }
});

test("Budget vs Actual supports read-only roles, loading, empty results, and retry", async () => {
  const page = await pageFor();
  try {
    await createPlan(page);
    await page.evaluate(() => { window.deferCashFlow = true; });
    await page.getByRole("tab", { name: "Budget vs Actual", exact: true }).click();
    await page.getByRole("status", { name: "Loading budget vs actual" }).waitFor();
    await page.evaluate(() => { window.deferCashFlow = false; window.resolveCashFlow(); });
    await page.getByRole("heading", { name: "No expense budget activity" }).waitFor();
    await page.evaluate(() => { window.fail = "loadCashFlow"; });
    await page.getByRole("button", { name: "Refresh report", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Test permission failure" }).waitFor();
    await page.evaluate(() => { window.fail = null; });
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.getByRole("heading", { name: "No expense budget activity" }).waitFor();
    for (const role of ["Treasurer", "Pastor", "Secretary", "Encoder", "Viewer"]) {
      await page.evaluate(role => window.renderBudget(role), role);
      await page.getByRole("button", { name: "View budget", exact: true }).click();
      await page.getByRole("tab", { name: "Budget vs Actual", exact: true }).click();
      await page.getByRole("heading", { name: "No expense budget activity" }).waitFor();
      assert.equal(await page.getByRole("region", { name: "Budget vs Actual report" }).getByRole("button", { name: /Edit|Delete|Approve|Save/ }).count(), 0);
    }
  } finally { await page.close(); }
});

test("a report request completing after a church switch cannot display old church amounts", async () => {
  const page = await pageFor();
  try {
    await createPlan(page);
    await addLine(page);
    await page.evaluate(() => { window.deferCashFlow = true; });
    await page.getByRole("tab", { name: "Budget vs Actual", exact: true }).click();
    await page.getByRole("status", { name: "Loading budget vs actual" }).waitFor();
    await page.evaluate(() => window.renderBudget("Admin", "church-b"));
    await page.getByRole("heading", { name: "No budgets yet" }).waitFor();
    await page.evaluate(() => window.resolveCashFlow());
    await page.waitForTimeout(50);
    assert.equal(await page.getByRole("region", { name: "Budget vs Actual report" }).count(), 0);
    assert.equal(await page.getByText("Annual ministry plan", { exact: true }).count(), 0);
  } finally { await page.close(); }
});


async function healthPage() {
  const page = await pageFor();
  await page.getByRole("heading", { name: "No budgets yet" }).waitFor();
  await page.evaluate(() => {
    const budget = { id: "budget-a", churchId: "church-a", name: "Active annual plan", fiscalYear: 2026, status: "Active", notes: "", createdBy: "user-a", approvedBy: "user-a", approvedAt: "2026-09-14T10:00:00Z", createdAt: "2026-09-14T10:00:00Z", updatedAt: "2026-09-14T10:00:00Z" };
    window.budgets = [budget];
    window.lines = [{ id: "line-a", churchId: "church-a", budgetId: "budget-a", categoryId: "cat-a", amount: 1000, notes: "", createdBy: "user-a", createdAt: budget.createdAt, updatedAt: budget.updatedAt }];
    const expense = { type: "Expense", category: "Ministry", date: "2026-06-01", moneyOut: 200, moneyIn: 0, approvalStatus: "approved" };
    window.healthData = { categories: [{ id: "cat-a", name: "Ministry", type: "Expense", group: "Expense", active: "Yes" }], transactions: [expense, { ...expense, moneyOut: 9999, approvalStatus: "pending" }, { ...expense, moneyOut: 9999, approvalStatus: "rejected" }] };
    window.renderBudgetHealth();
  });
  await page.getByRole("article", { name: "Budget Health" }).locator("dd").first().waitFor();
  return page;
}

test("Budget Health uses approved totals, updates with dashboard data, and marks health thresholds", async () => {
  const page = await healthPage();
  try {
    const card = page.getByRole("article", { name: "Budget Health" });
    assert.deepEqual(await card.locator("dd").allTextContents(), ["\u20b11,000.00", "\u20b1200.00", "\u20b1800.00", "20%"]);
    assert.equal(await card.locator(".status").innerText(), "Healthy");
    const callsBefore = await page.evaluate(() => window.calls.length);
    for (const [amount, status, usage] of [[799.99, "Healthy", "80%"], [800, "Warning", "80%"], [1000, "Warning", "100%"], [1000.01, "Over Budget", "100%"]]) {
      await page.evaluate(amount => { window.healthData = { ...window.healthData, transactions: [{ ...window.healthData.transactions[0], moneyOut: amount }] }; window.updateBudgetHealth(); }, amount);
      // Await the rendered amount so the assertion observes this update.
      const actual = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount);
      await card.locator("dd").nth(1).filter({ hasText: actual }).waitFor();
      assert.equal(await card.locator(".status").innerText(), status);
      assert.equal(await card.locator("dd").nth(3).innerText(), usage);
    }
    assert.equal(await page.evaluate(() => window.calls.length), callsBefore);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  } finally { await page.close(); }
});

test("Budget Health is available only to Admin/Treasurer and makes no requests for other roles", async () => {
  const page = await healthPage();
  try {
    await page.evaluate(() => window.renderBudgetHealth("Treasurer"));
    await page.getByRole("article", { name: "Budget Health" }).locator("dd").first().waitFor();
    for (const role of ["Pastor", "Secretary", "Encoder", "Viewer", null]) {
      await page.evaluate(role => { window.calls = []; window.renderBudgetHealth(role); }, role);
      await page.getByRole("article", { name: "Budget Health" }).waitFor({ state: "detached" });
      assert.equal(await page.evaluate(() => window.calls.length), 0);
    }
    await page.evaluate(() => { window.calls = []; window.renderBudgetHealth("Admin", "church-a", "church-b"); });
    await page.waitForTimeout(50);
    assert.equal(await page.getByRole("article", { name: "Budget Health" }).count(), 0);
    assert.equal(await page.evaluate(() => window.calls.length), 0);
  } finally { await page.close(); }
});

test("Budget Health selects current-year active budgets without combining their actuals", async () => {
  const page = await healthPage();
  try {
    await page.evaluate(() => {
      const original = window.budgets[0];
      window.budgets.push({ ...original, id: "budget-b", name: "Second active plan", updatedAt: "2026-01-01T00:00:00Z" }, { ...original, id: "draft", name: "Draft plan", status: "Draft" }, { ...original, id: "old", name: "Last year", fiscalYear: 2025 });
      window.lines.push({ ...window.lines[0], id: "line-b", budgetId: "budget-b", amount: 200 });
      window.renderBudgetHealth();
    });
    const selector = page.getByLabel("Active budget", { exact: true });
    await selector.waitFor();
    assert.deepEqual(await selector.locator("option").allTextContents(), ["Active annual plan", "Second active plan"]);
    await selector.selectOption("budget-b");
    const card = page.getByRole("article", { name: "Budget Health" });
    await card.locator("dd").first().filter({ hasText: "200.00" }).waitFor();
    assert.deepEqual(await card.locator("dd").allTextContents(), ["\u20b1200.00", "\u20b1200.00", "\u20b10.00", "100%"]);
    assert.equal(await card.locator(".status").innerText(), "Warning");
    const calls = await page.evaluate(() => window.calls.filter(call => call.name.startsWith("loadBudget")));
    for (const call of calls) assert.equal(call.args[0], "church-a");
    assert.ok(calls.some(call => call.name === "loadBudgetLines" && call.args[1] === "budget-b"));
  } finally { await page.close(); }
});

test("Budget Health handles missing budgets, failed loads, and spending with no allocation", async () => {
  const page = await healthPage();
  try {
    await page.evaluate(() => { window.budgets[0].status = "Draft"; window.renderBudgetHealth(); });
    await page.getByRole("heading", { name: "No active budget" }).waitFor();
    await page.evaluate(() => { window.budgets[0].status = "Active"; window.fail = "loadBudgetLines"; window.renderBudgetHealth(); });
    await page.getByRole("alert").filter({ hasText: "Test permission failure" }).waitFor();
    await page.evaluate(() => { window.fail = null; window.lines = []; });
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    const card = page.getByRole("article", { name: "Budget Health" });
    await card.locator(".status").filter({ hasText: "Over Budget" }).waitFor();
    assert.deepEqual(await card.locator("dd").allTextContents(), ["\u20b10.00", "\u20b1200.00", "-\u20b1200.00", "Not applicable"]);
  } finally { await page.close(); }
});
