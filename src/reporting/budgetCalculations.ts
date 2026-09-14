import type { Budget, BudgetLine } from "../services/budgets";
import type { CashFlowData } from "../types";

export type BudgetExpenseStatus = "Under budget" | "On budget" | "Over budget";

export interface BudgetExpenseAmounts {
  budgetAmount: number;
  actualExpenseAmount: number;
  /** Budget minus actual: positive is remaining budget, negative is overspending. */
  variance: number;
  /** Rounded to two decimals; null when spending is positive against a zero budget. */
  usagePercentage: number | null;
  status: BudgetExpenseStatus;
}

export interface BudgetExpenseRow extends BudgetExpenseAmounts {
  categoryId: string;
  category: string;
}

export interface BudgetVsActualReport {
  budgetId: string;
  churchId: string;
  fiscalYear: number;
  rows: BudgetExpenseRow[];
  totals: BudgetExpenseAmounts;
}

const cents = (amount: number) => Math.round(amount * 100);

function compareAmounts(budgetCents: number, actualCents: number): BudgetExpenseAmounts {
  const difference = budgetCents - actualCents;
  return {
    budgetAmount: budgetCents / 100,
    actualExpenseAmount: actualCents / 100,
    variance: difference / 100,
    usagePercentage: budgetCents > 0
      ? Math.round(actualCents / budgetCents * 10000) / 100
      : actualCents > 0 ? null : 0,
    status: difference > 0 ? "Under budget" : difference < 0 ? "Over budget" : "On budget",
  };
}

/**
 * Compare one budget with approved expenses for its calendar fiscal year.
 * Supply CashFlowData already loaded for budget.churchId: Transaction and
 * Category carry no churchId. Transactions use category names, so resolve
 * budget line category IDs through that same church's category list.
 * Inactive expense categories remain reportable; income is always excluded.
 */
export function buildBudgetVsActualReport(
  budget: Pick<Budget, "id" | "churchId" | "fiscalYear">,
  budgetLines: readonly BudgetLine[],
  data: Pick<CashFlowData, "transactions" | "categories">,
): BudgetVsActualReport {
  if (!budget.id.trim() || !budget.churchId.trim()) throw new Error("A budget and church workspace are required.");
  if (!Number.isInteger(budget.fiscalYear) || budget.fiscalYear < 1 || budget.fiscalYear > 9999) {
    throw new Error("Enter a fiscal year between 1 and 9999.");
  }
  const year = String(budget.fiscalYear).padStart(4, "0");
  const start = `${year}-01-01`, end = `${year}-12-31`;
  const categories = data.categories.filter(category => category.type === "Expense");
  const expenseNames = new Set(categories.map(category => category.name));
  const expenseIds = new Set(categories.map(category => category.id));
  const planned = new Map<string, number>();
  const actual = new Map<string, number>();

  for (const line of budgetLines) {
    if (line.churchId !== budget.churchId || line.budgetId !== budget.id || !expenseIds.has(line.categoryId)) continue;
    planned.set(line.categoryId, (planned.get(line.categoryId) || 0) + cents(line.amount));
  }
  for (const transaction of data.transactions) {
    if (transaction.type !== "Expense" || transaction.approvalStatus !== "approved"
      || transaction.date < start || transaction.date > end || !expenseNames.has(transaction.category)) continue;
    actual.set(transaction.category, (actual.get(transaction.category) || 0) + cents(transaction.moneyOut));
  }

  // Keep unspent allocations and unbudgeted spending; omit unused categories.
  const rows: BudgetExpenseRow[] = [];
  let totalBudgetCents = 0, totalActualCents = 0;
  for (const category of categories) {
    if (!planned.has(category.id) && !actual.has(category.name)) continue;
    const budgetCents = planned.get(category.id) || 0;
    const actualCents = actual.get(category.name) || 0;
    rows.push({ categoryId: category.id, category: category.name, ...compareAmounts(budgetCents, actualCents) });
    totalBudgetCents += budgetCents;
    totalActualCents += actualCents;
  }
  return {
    budgetId: budget.id,
    churchId: budget.churchId,
    fiscalYear: budget.fiscalYear,
    rows,
    totals: compareAmounts(totalBudgetCents, totalActualCents),
  };
}
