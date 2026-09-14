import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

const source = fs.readFileSync(new URL("../src/services/budgets.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const budget = { id: "budget-a", church_id: "church-a", name: "Annual plan", fiscal_year: 2026, status: "Draft", notes: "", created_by: "user-a", approved_by: null, approved_at: null, created_at: "2026-09-14T10:00:00Z", updated_at: "2026-09-14T10:00:00Z" };
const line = { id: "line-a", church_id: "church-a", budget_id: "budget-a", category_id: "category-a", amount: "125.50", notes: "", created_by: "user-a", created_at: budget.created_at, updated_at: budget.updated_at };
const input = { name: " Annual plan ", fiscalYear: 2026, notes: " Notes " };
const lineInput = { categoryId: "category-a", amount: 125.5, notes: " Notes " };

function setup({ failure, user = { id: "user-a" } } = {}) {
  const requests = [];
  const state = { authCalls: 0 };
  const supabase = createClient("https://budget-tests.invalid", "test-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      const parsed = new URL(url);
      assert.equal(parsed.origin, "https://budget-tests.invalid");
      const payload = init.body ? JSON.parse(init.body) : undefined;
      requests.push({ url: parsed, method: init.method, payload });
      const row = parsed.pathname.endsWith("/budget_lines") ? line : budget;
      const updated = { ...row, ...payload };
      if (payload?.approved_by) updated.approved_at = "2026-09-14T11:00:00Z";
      const single = new Headers(init.headers).get("Accept")?.includes("vnd.pgrst.object");
      return new Response(JSON.stringify(failure?.body || (single ? updated : [updated])), {
        status: failure?.status || 200,
        headers: { "Content-Type": "application/json" },
      });
    } },
  });
  supabase.auth.getUser = async () => { state.authCalls++; return { data: { user }, error: null }; };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => {
    assert.equal(name, "../lib/supabase");
    return { supabase };
  } });
  return { service: exports, requests, state };
}

function assertScope(request, table, filters = {}) {
  assert.equal(request.url.pathname, `/rest/v1/${table}`);
  for (const [key, value] of Object.entries({ church_id: "church-a", ...filters })) {
    assert.equal(request.url.searchParams.get(key), `eq.${value}`, `${key} must scope the actual request`);
  }
}

test("every budget operation rejects missing church scope before HTTP or auth requests", async () => {
  const { service, requests, state } = setup();
  const calls = [
    () => service.loadBudgets(""), () => service.createBudget(" ", input),
    () => service.updateBudget(undefined, "budget-a", input), () => service.deleteBudget(null, "budget-a"),
    () => service.loadBudgetLines("", "budget-a"), () => service.saveBudgetLine("", "budget-a", lineInput),
    () => service.deleteBudgetLine("", "budget-a", "line-a"),
    ...["submitBudget", "approveBudget", "activateBudget", "closeBudget"].map(name => () => service[name]("", "budget-a")),
  ];
  for (const call of calls) await assert.rejects(call, /Church workspace is required/);
  assert.equal(requests.length, 0);
  assert.equal(state.authCalls, 0);
});

test("budget reads filter the requested church and parent and map database values", async () => {
  const { service, requests } = setup();
  const [result] = await service.loadBudgets("church-a");
  assert.equal(result.churchId, "church-a");
  assert.equal(result.fiscalYear, 2026);
  assert.equal(result.createdBy, "user-a");
  assert.equal(result.approvedBy, null);
  assert.equal(result.approvedAt, null);
  assertScope(requests[0], "budgets");
  const [allocation] = await service.loadBudgetLines("church-a", "budget-a");
  assert.equal(allocation.amount, 125.5);
  assert.equal(allocation.categoryId, "category-a");
  assertScope(requests[1], "budget_lines", { budget_id: "budget-a" });
});

test("new budgets and lines bind ownership to churchId and the authenticated creator", async () => {
  const { service, requests, state } = setup();
  await service.createBudget("church-a", { ...input, church_id: "church-b", created_by: "forged", approved_by: "forged", status: "Active" });
  assert.equal(requests[0].method, "POST");
  assert.deepEqual(requests[0].payload, { name: "Annual plan", fiscal_year: 2026, notes: "Notes", church_id: "church-a", created_by: "user-a", status: "Draft" });
  await service.saveBudgetLine("church-a", "budget-a", { ...lineInput, church_id: "church-b", budget_id: "budget-b", created_by: "forged" });
  assert.deepEqual(requests[1].payload, { category_id: "category-a", amount: 125.5, notes: "Notes", church_id: "church-a", budget_id: "budget-a", created_by: "user-a" });
  assert.equal(state.authCalls, 2);
});

test("updates and deletes are scoped and general edits cannot write workflow metadata", async () => {
  const { service, requests } = setup();
  await service.updateBudget("church-a", "budget-a", { ...input, status: "Approved", approved_by: "forged", church_id: "church-b" });
  assertScope(requests[0], "budgets", { id: "budget-a" });
  assert.equal(requests[0].method, "PATCH");
  assert.deepEqual(requests[0].payload, { name: "Annual plan", fiscal_year: 2026, notes: "Notes" });
  await service.saveBudgetLine("church-a", "budget-a", { ...lineInput, id: "line-a", budget_id: "budget-b", created_by: "forged" });
  assertScope(requests[1], "budget_lines", { budget_id: "budget-a", id: "line-a" });
  assert.deepEqual(requests[1].payload, { category_id: "category-a", amount: 125.5, notes: "Notes" });
  await service.deleteBudgetLine("church-a", "budget-a", "line-a");
  assertScope(requests[2], "budget_lines", { budget_id: "budget-a", id: "line-a" });
  await service.deleteBudget("church-a", "budget-a");
  assertScope(requests[3], "budgets", { id: "budget-a" });
  assert.equal(requests[2].method, "DELETE");
  assert.equal(requests[3].method, "DELETE");
  assert.equal(requests.length, 4);
});

test("lifecycle writes compare current status and approval uses the authenticated actor", async () => {
  const { service, requests, state } = setup();
  for (const [name, from, to] of [["submitBudget", "Draft", "Submitted"], ["approveBudget", "Submitted", "Approved"], ["activateBudget", "Approved", "Active"], ["closeBudget", "Active", "Closed"]]) {
    const result = await service[name]("church-a", "budget-a");
    const request = requests.at(-1);
    assertScope(request, "budgets", { id: "budget-a", status: from });
    assert.equal(request.method, "PATCH");
    assert.deepEqual(request.payload, to === "Approved" ? { status: to, approved_by: "user-a" } : { status: to });
    assert.equal(result.status, to);
    if (to === "Approved") assert.equal(result.approvedAt, "2026-09-14T11:00:00Z");
  }
  assert.equal(state.authCalls, 1);
});

test("validation and expired sessions stop writes", async () => {
  const { service, requests } = setup({ user: null });
  await assert.rejects(() => service.createBudget("church-a", { ...input, fiscalYear: 1.5 }), /fiscal year/);
  await assert.rejects(() => service.createBudget("church-a", { ...input, name: " " }), /name is required/);
  for (const amount of [-1, NaN, Infinity, 1000000000000]) {
    await assert.rejects(() => service.saveBudgetLine("church-a", "budget-a", { ...lineInput, amount }), /valid non-negative/);
  }
  await assert.rejects(() => service.saveBudgetLine("church-a", "budget-a", { ...lineInput, id: "" }), /Budget line is required/);
  await assert.rejects(() => service.createBudget("church-a", input), /session has expired/);
  await assert.rejects(() => service.saveBudgetLine("church-a", "budget-a", lineInput), /session has expired/);
  await assert.rejects(() => service.approveBudget("church-a", "budget-a"), /session has expired/);
  assert.equal(requests.length, 0);
});

test("RLS denial, missing rows, stale transitions and restrictive FKs are surfaced without retry", async () => {
  for (const failure of [
    { status: 403, body: { code: "42501", message: "Permission denied" } },
    { status: 406, body: { code: "PGRST116", message: "No matching row" } },
    { status: 409, body: { code: "23503", message: "Budget still has lines" } },
  ]) {
    const { service, requests } = setup({ failure });
    const calls = [
      () => service.loadBudgets("church-a"), () => service.createBudget("church-a", input),
      () => service.updateBudget("church-a", "budget-a", input), () => service.deleteBudget("church-a", "budget-a"),
      () => service.loadBudgetLines("church-a", "budget-a"),
      () => service.saveBudgetLine("church-a", "budget-a", lineInput),
      () => service.saveBudgetLine("church-a", "budget-a", { ...lineInput, id: "line-a" }),
      () => service.deleteBudgetLine("church-a", "budget-a", "line-a"),
      ...["submitBudget", "approveBudget", "activateBudget", "closeBudget"].map(name => () => service[name]("church-a", "budget-a")),
    ];
    for (const call of calls) await assert.rejects(call, new RegExp(failure.body.message));
    assert.equal(requests.length, calls.length);
  }
});
