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
        if (id.endsWith("/services/budgets")) return "\0budget-service";
        if (id.endsWith("/tenancy/ActiveChurchContext")) return "\0budget-context";
        if (id.endsWith("/lib/supabase")) return "\0budget-categories";
      },
      load(id) {
        if (id === "\0budget-ui-entry") return `
          import React from "react";
          import { createRoot } from "react-dom/client";
          import { BudgetView } from ${JSON.stringify(fileURLToPath(new URL("../../src/components/budgets/BudgetView.tsx", import.meta.url)).replaceAll("\\", "/"))};
          const root = createRoot(document.getElementById("root"));
          window.renderBudget = (role = "Admin", churchId = "church-a", viewChurchId = churchId) => {
            window.scope = { activeRole: role, activeChurch: { id: churchId }, scopeVersion: (window.scope?.scopeVersion || 0) + 1, workspaceMode: "church" };
            root.render(React.createElement(BudgetView, { churchId: viewChurchId }));
          };
        `;
        if (id === "\0budget-service") return methods.map(name => `export const ${name} = (...args) => window.budgetCall("${name}", args);`).join("\n");
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
    window.categories = [{ id: "cat-a", name: "Ministry", transaction_type: "Expense", is_active: true }, { id: "cat-b", name: "Giving", transaction_type: "Income", is_active: true }];
    window.budgetCall = async (name, args) => {
      window.calls.push({ name, args });
      if (window.fail === name) throw new Error("Test permission failure");
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
