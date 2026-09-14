import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("leadership dashboard exposes the requested KPIs and visual summaries", () => {
  const dashboard = read("src/components/DashboardView.tsx");
  const sections = {
    DashboardMetrics: ["Current Balance", "Current Month Income", "Current Month Expenses", "Outstanding Payables", "Active Projects", "Pending Financial Approvals"],
    DashboardQuickActions: ["Quick Actions", "Record Income", "Record Expense", "Review Financial Approvals"],
    FinancialTrendChart: ["Income trend"],
    ExpenseCategoryPanel: ["Expense categories"],
    AccountBalancePanel: ["Account balances"],
    BudgetHealthCard: ["Budget Health", "Total budget", "Actual approved expenses", "Remaining budget", "Usage percentage", "Healthy", "Warning", "Over Budget"],
    DashboardActivityFeed: ["Recent activity"],
  };
  for (const [component, labels] of Object.entries(sections)) {
    const section = read(`src/components/dashboard/${component}.tsx`);
    assert.match(dashboard, new RegExp(`<${component}\\b`));
    assert.match(dashboard, new RegExp(`from "\\./dashboard/${component}"`));
    for (const label of labels) assert.match(section, new RegExp(label));
  }
  const activity = read("src/components/dashboard/DashboardActivityFeed.tsx");
  const metrics = read("src/components/dashboard/DashboardMetrics.tsx");
  const actions = read("src/components/dashboard/DashboardQuickActions.tsx");
  assert.match(dashboard, /isAdmin\?loadDashboardAuditActivity\(churchId\):Promise\.resolve\(\[\]\)/);
  assert.match(dashboard, /<DashboardActivityFeed\s+isAdmin=\{isAdmin\}/);
  assert.match(activity, /isAdmin&&\(latestUserActivity/);
  assert.match(activity, /User and audit activity is visible only to administrators/);
  assert.match(dashboard, /canApproveFinance\s*&&\s*<BudgetHealthCard\s+churchId=\{churchId\}\s+data=\{data\}/);
  const budgetHealth = read("src/components/dashboard/BudgetHealthCard.tsx");
  assert.match(budgetHealth, /!hasChurchRole\(activeRole, accountManagerRoles\)/);
  assert.match(budgetHealth, /activeChurch\?\.id !== churchId/);
  assert.match(budgetHealth, /buildBudgetVsActualReport\(selected, allocation\.lines, data\)/);
  assert.match(metrics, /canApproveFinance&&<article/);
  assert.match(actions, /canApproveFinance&&<button/);
  assert.match(actions, /disabled=\{!canWriteFinance\} onClick=\{onRecordIncome\}/);
  assert.match(actions, /disabled=\{!canWriteFinance\} onClick=\{onRecordExpense\}/);
  assert.match(dashboard, /<DashboardQuickActions\s+canWriteFinance=\{canWriteFinance\}\s+canApproveFinance=\{canApproveFinance\}/);
  assert.match(dashboard, /<DashboardMetrics\s+metricsClassName=\{metricsClassName\}\s+canApproveFinance=\{canApproveFinance\}/);
});

test("dashboard audit summaries avoid sensitive before and after values", () => {
  const service = read("src/services/auditLogs.ts");
  const dashboardLoader = service.slice(service.indexOf("export async function loadDashboardAuditActivity"));
  assert.match(dashboardLoader, /from\("audit_logs"\)/);
  assert.doesNotMatch(dashboardLoader, /old_values|new_values/);
  assert.doesNotMatch(dashboardLoader, /\.insert\(|\.update\(|\.delete\(/);
});

test("report module includes all leadership statements, date controls, print, and CSV", () => {
  const reports = read("src/components/ReportsView.tsx");
  for (const label of ["Cash Flow Statement", "Income vs Expense Report", "Account Summary Report", "Payables Report", "Financial Analytics", "As of Date", "Print / Save PDF", "Export CSV"]) {
    assert.match(reports, new RegExp(label));
  }
  assert.match(reports, /const organization=BRAND_EXPORT_IDENTITY/);
  assert.match(reports, /Custom date range/);
  assert.match(reports, /Transfers are excluded|Transfers remain excluded|Internal transfers are excluded/);
});

test("financial calculations remain outside React UI components", () => {
  const calculations = read("src/reporting/calculations.ts");
  const reports = read("src/components/ReportsView.tsx");
  const dashboard = read("src/components/DashboardView.tsx");
  assert.doesNotMatch(calculations, /from "react"|supabase|JSX/);
  assert.match(reports, /from "\.\.\/reporting\/calculations"/);
  assert.match(dashboard, /from "\.\.\/reporting\/calculations"/);
});

test("project goals panel is future-ready without database coupling", () => {
  const panel = read("src/components/ProjectGoalsPanel.tsx");
  const types = read("src/types.ts");
  for (const field of ["Project Name", "Goal Amount", "Amount Raised", "Progress", "Target Date"]) assert.match(panel, new RegExp(field));
  assert.match(types, /interface ProjectGoalView/);
  assert.doesNotMatch(panel, /supabase|from\(/);
});

test("print stylesheet isolates the active report", () => {
  const css = read("app/globals.css");
  assert.match(css, /@media print[\s\S]*\.report-output>\.report-sheet/);
  assert.match(css, /@page\{size:auto;margin:16mm\}/);
});
