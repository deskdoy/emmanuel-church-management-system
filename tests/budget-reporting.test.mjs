import assert from "node:assert/strict";
import test from "node:test";
import { buildBudgetVsActualReport } from "../src/reporting/budgetCalculations.ts";

const budget = { id: "budget-a", churchId: "church-a", fiscalYear: 2026 };
const categories = [
  { id: "utilities", name: "Utilities", type: "Expense", group: "Operations", active: "Yes" },
  { id: "ministry", name: "Ministry", type: "Expense", group: "Ministry", active: "No" },
  { id: "giving", name: "Giving", type: "Income", group: "Giving", active: "Yes" },
];
const line = (categoryId, amount, overrides = {}) => ({
  id: `line-${categoryId}`, churchId: budget.churchId, budgetId: budget.id, categoryId, amount,
  notes: "", createdBy: "user-a", createdAt: "", updatedAt: "", ...overrides,
});
const expense = (amount, overrides = {}) => ({
  id: "expense-a", source: "expenses", type: "Expense", category: "Utilities", date: "2026-06-15",
  account: "Cash", description: "Expense", moneyIn: 0, moneyOut: amount, approvalStatus: "approved",
  paymentMethod: "Cash", reference: "", notes: "", createdAt: "2026-06-15T10:00:00Z", ...overrides,
});
const report = (transactions, lines = [line("utilities", 1000)]) => buildBudgetVsActualReport(budget, lines, { transactions, categories });

test("approved expenses are included and aggregated by expense category", () => {
  const result = report([expense(150), expense(250, { id: "expense-b" })]);
  assert.deepEqual(result.rows, [{
    categoryId: "utilities", category: "Utilities", budgetAmount: 1000, actualExpenseAmount: 400,
    variance: 600, usagePercentage: 40, status: "Under budget",
  }]);
  assert.equal(result.totals.actualExpenseAmount, 400);
});

test("pending expenses are excluded from category actuals and totals", () => {
  const result = report([expense(100), expense(5000, { approvalStatus: "pending" })]);
  assert.equal(result.rows[0].actualExpenseAmount, 100);
  assert.equal(result.totals.actualExpenseAmount, 100);
  assert.equal(result.totals.variance, 900);
});

test("rejected expenses are excluded from category actuals and totals", () => {
  const result = report([expense(100), expense(5000, { approvalStatus: "rejected" })]);
  assert.equal(result.rows[0].actualExpenseAmount, 100);
  assert.equal(result.totals.actualExpenseAmount, 100);
  assert.equal(result.totals.usagePercentage, 10);
});

test("an expense requires explicit approved status", () => {
  const result = report([undefined, null, "", "Approved"].map(approvalStatus => expense(500, { approvalStatus })));
  assert.equal(result.totals.actualExpenseAmount, 0);
  assert.equal(result.rows[0].variance, 1000);
});

test("income transactions and income budget categories never contribute", () => {
  const result = report([
    expense(100),
    expense(9999, { type: "Income", source: "offerings", moneyIn: 9999 }),
    expense(8888, { category: "Giving" }),
    expense(7777, { category: "Unknown category" }),
  ], [line("utilities", 1000), line("giving", 9000), line("unknown", 7000)]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.totals.budgetAmount, 1000);
  assert.equal(result.totals.actualExpenseAmount, 100);
});

test("variance and usage distinguish under, exactly on, and over budget", () => {
  for (const [amount, variance, usagePercentage, status] of [
    [750, 250, 75, "Under budget"], [1000, 0, 100, "On budget"], [1250, -250, 125, "Over budget"],
  ]) {
    const result = report([expense(amount)]);
    assert.deepEqual(result.totals, { budgetAmount: 1000, actualExpenseAmount: amount, variance, usagePercentage, status });
    assert.equal(result.rows[0].status, status);
  }
});

test("money comparisons avoid floating point variance and percentages are rounded", () => {
  const exact = report([expense(0.1), expense(0.2)], [line("utilities", 0.3)]);
  assert.equal(exact.totals.actualExpenseAmount, 0.3);
  assert.equal(exact.totals.variance, 0);
  assert.equal(exact.totals.status, "On budget");
  assert.equal(report([expense(1)], [line("utilities", 3)]).totals.usagePercentage, 33.33);
});

test("only the selected budget and church allocations contribute, including inactive expense categories", () => {
  const result = report([expense(75, { category: "Ministry" })], [
    line("utilities", 100), line("ministry", 200),
    line("utilities", 9999, { churchId: "church-b" }),
    line("utilities", 8888, { budgetId: "budget-b" }),
  ]);
  assert.deepEqual(result.rows.map(row => [row.category, row.budgetAmount, row.actualExpenseAmount]), [["Utilities", 100, 0], ["Ministry", 200, 75]]);
  assert.equal(result.totals.budgetAmount, 300);
  assert.equal(result.totals.variance, 225);
  assert.equal(result.totals.usagePercentage, 25);
});

test("approved actuals use the budget fiscal year with inclusive boundaries", () => {
  const result = report([
    expense(9999, { date: "2025-12-31" }), expense(10, { date: "2026-01-01" }),
    expense(20, { date: "2026-12-31" }), expense(8888, { date: "2027-01-01" }),
  ]);
  assert.equal(result.totals.actualExpenseAmount, 30);
});

test("unbudgeted spending is visible as over budget without an infinite percentage", () => {
  const result = report([expense(50, { category: "Ministry" })], [line("utilities", 0)]);
  assert.deepEqual(result.rows, [
    { categoryId: "utilities", category: "Utilities", budgetAmount: 0, actualExpenseAmount: 0, variance: 0, usagePercentage: 0, status: "On budget" },
    { categoryId: "ministry", category: "Ministry", budgetAmount: 0, actualExpenseAmount: 50, variance: -50, usagePercentage: null, status: "Over budget" },
  ]);
  assert.equal(result.totals.usagePercentage, null);
  assert.equal(result.totals.variance, -50);
});

test("empty inputs return zero totals and calculations do not mutate their inputs", () => {
  const empty = report([], []);
  assert.deepEqual(empty.rows, []);
  assert.deepEqual(empty.totals, { budgetAmount: 0, actualExpenseAmount: 0, variance: 0, usagePercentage: 0, status: "On budget" });
  const lines = Object.freeze([Object.freeze(line("utilities", 100))]);
  const data = Object.freeze({ transactions: Object.freeze([Object.freeze(expense(50))]), categories: Object.freeze(categories.map(category => Object.freeze({ ...category }))) });
  assert.equal(buildBudgetVsActualReport(Object.freeze({ ...budget }), lines, data).totals.variance, 50);
});

test("budget identity and fiscal year must be valid", () => {
  for (const overrides of [{ id: "" }, { churchId: " " }, { fiscalYear: 0 }, { fiscalYear: 10000 }, { fiscalYear: 2026.5 }]) {
    assert.throws(() => buildBudgetVsActualReport({ ...budget, ...overrides }, [], { transactions: [], categories }), /required|fiscal year/);
  }
});
