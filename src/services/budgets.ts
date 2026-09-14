import { supabase } from "../lib/supabase";

export type BudgetStatus = "Draft" | "Submitted" | "Approved" | "Active" | "Closed";

export interface Budget {
  id: string;
  churchId: string;
  name: string;
  fiscalYear: number;
  status: BudgetStatus;
  notes: string;
  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetInput {
  name: string;
  fiscalYear: number;
  notes?: string;
}

export interface BudgetLine {
  id: string;
  churchId: string;
  budgetId: string;
  categoryId: string;
  amount: number;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetLineInput {
  id?: string;
  categoryId: string;
  amount: number;
  notes?: string;
}

interface BudgetRow {
  id: string;
  church_id: string;
  name: string;
  fiscal_year: number;
  status: BudgetStatus;
  notes: string;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface BudgetLineRow {
  id: string;
  church_id: string;
  budget_id: string;
  category_id: string;
  amount: number | string;
  notes: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const budgetColumns = "id,church_id,name,fiscal_year,status,notes,created_by,approved_by,approved_at,created_at,updated_at";
const lineColumns = "id,church_id,budget_id,category_id,amount,notes,created_by,created_at,updated_at";

const requireId = (value: string, label: string) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
};

const client = (churchId: string) => {
  requireId(churchId, "Church workspace");
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

async function currentUserId(churchId: string): Promise<string> {
  const { data, error } = await client(churchId).auth.getUser();
  if (error || !data.user) throw new Error(error?.message || "Your session has expired.");
  return data.user.id;
}

const mapBudget = (row: BudgetRow): Budget => ({
  id: row.id,
  churchId: row.church_id,
  name: row.name,
  fiscalYear: Number(row.fiscal_year),
  status: row.status,
  notes: row.notes,
  createdBy: row.created_by,
  approvedBy: row.approved_by,
  approvedAt: row.approved_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapBudgetLine = (row: BudgetLineRow): BudgetLine => ({
  id: row.id,
  churchId: row.church_id,
  budgetId: row.budget_id,
  categoryId: row.category_id,
  amount: Number(row.amount),
  notes: row.notes,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const budgetValues = (budget: BudgetInput) => {
  if (!budget.name.trim()) throw new Error("Budget name is required.");
  if (!Number.isInteger(budget.fiscalYear) || budget.fiscalYear < 1 || budget.fiscalYear > 9999) {
    throw new Error("Enter a fiscal year between 1 and 9999.");
  }
  // Explicit fields prevent general edits from changing tenant or approval metadata.
  return { name: budget.name.trim(), fiscal_year: budget.fiscalYear, notes: budget.notes?.trim() || "" };
};

export async function loadBudgets(churchId: string): Promise<Budget[]> {
  const { data, error } = await client(churchId).from("budgets")
    .select(budgetColumns)
    .eq("church_id", churchId)
    .order("fiscal_year", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Unable to load budgets: ${error.message}`);
  return (data || []).map(mapBudget);
}

export async function createBudget(churchId: string, budget: BudgetInput): Promise<Budget> {
  const db = client(churchId);
  const values = budgetValues(budget);
  const userId = await currentUserId(churchId);
  const { data, error } = await db.from("budgets")
    .insert({ ...values, church_id: churchId, created_by: userId, status: "Draft" })
    .select(budgetColumns).single();
  if (error) throw new Error(`Unable to create budget: ${error.message}`);
  return mapBudget(data);
}

export async function updateBudget(churchId: string, budgetId: string, budget: BudgetInput): Promise<Budget> {
  const db = client(churchId);
  requireId(budgetId, "Budget");
  const { data, error } = await db.from("budgets")
    .update(budgetValues(budget))
    .eq("church_id", churchId).eq("id", budgetId)
    .select(budgetColumns).single();
  if (error) throw new Error(`Unable to update budget: ${error.message}`);
  return mapBudget(data);
}

export async function deleteBudget(churchId: string, budgetId: string): Promise<void> {
  const db = client(churchId);
  requireId(budgetId, "Budget");
  // The restrictive budget_lines FK requires explicit line deletion first.
  const { error } = await db.from("budgets").delete()
    .eq("church_id", churchId).eq("id", budgetId)
    .select("id").single();
  if (error) throw new Error(`Unable to delete budget: ${error.message}`);
}

export async function loadBudgetLines(churchId: string, budgetId: string): Promise<BudgetLine[]> {
  const db = client(churchId);
  requireId(budgetId, "Budget");
  const { data, error } = await db.from("budget_lines")
    .select(lineColumns)
    .eq("church_id", churchId).eq("budget_id", budgetId)
    .order("created_at");
  if (error) throw new Error(`Unable to load budget lines: ${error.message}`);
  return (data || []).map(mapBudgetLine);
}

export async function saveBudgetLine(churchId: string, budgetId: string, line: BudgetLineInput): Promise<BudgetLine> {
  const db = client(churchId);
  requireId(budgetId, "Budget");
  requireId(line.categoryId, "Category");
  if (!Number.isFinite(line.amount) || line.amount < 0 || line.amount > 999999999999.99) {
    throw new Error("Enter a valid non-negative budget amount up to 999999999999.99.");
  }
  const values = { category_id: line.categoryId, amount: line.amount, notes: line.notes?.trim() || "" };
  if (line.id !== undefined) {
    requireId(line.id, "Budget line");
    const { data, error } = await db.from("budget_lines").update(values)
      .eq("church_id", churchId).eq("budget_id", budgetId).eq("id", line.id)
      .select(lineColumns).single();
    if (error) throw new Error(`Unable to update budget line: ${error.message}`);
    return mapBudgetLine(data);
  }
  const userId = await currentUserId(churchId);
  const { data, error } = await db.from("budget_lines")
    .insert({ ...values, church_id: churchId, budget_id: budgetId, created_by: userId })
    .select(lineColumns).single();
  if (error) throw new Error(`Unable to create budget line: ${error.message}`);
  return mapBudgetLine(data);
}

export async function deleteBudgetLine(churchId: string, budgetId: string, lineId: string): Promise<void> {
  const db = client(churchId);
  requireId(budgetId, "Budget");
  requireId(lineId, "Budget line");
  const { error } = await db.from("budget_lines").delete()
    .eq("church_id", churchId).eq("budget_id", budgetId).eq("id", lineId)
    .select("id").single();
  if (error) throw new Error(`Unable to delete budget line: ${error.message}`);
}

// These filters guard service workflow transitions and stale requests.
// Database RLS and triggers remain the authority for church roles and approvals.
async function transitionBudget(
  churchId: string,
  budgetId: string,
  fromStatus: BudgetStatus,
  toStatus: BudgetStatus,
): Promise<Budget> {
  const db = client(churchId);
  requireId(budgetId, "Budget");
  const values: { status: BudgetStatus; approved_by?: string } = { status: toStatus };
  if (toStatus === "Approved") values.approved_by = await currentUserId(churchId);
  // The existing trigger sets approved_at from the database clock.
  const { data, error } = await db.from("budgets").update(values)
    .eq("church_id", churchId).eq("id", budgetId).eq("status", fromStatus)
    .select(budgetColumns).single();
  if (error) throw new Error(`Unable to move budget from ${fromStatus} to ${toStatus}: ${error.message}`);
  return mapBudget(data);
}

export async function submitBudget(churchId: string, budgetId: string): Promise<Budget> {
  return transitionBudget(churchId, budgetId, "Draft", "Submitted");
}

export async function approveBudget(churchId: string, budgetId: string): Promise<Budget> {
  return transitionBudget(churchId, budgetId, "Submitted", "Approved");
}

export async function activateBudget(churchId: string, budgetId: string): Promise<Budget> {
  return transitionBudget(churchId, budgetId, "Approved", "Active");
}

export async function closeBudget(churchId: string, budgetId: string): Promise<Budget> {
  return transitionBudget(churchId, budgetId, "Active", "Closed");
}
