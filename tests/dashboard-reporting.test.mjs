import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("leadership dashboard exposes the requested KPIs and visual summaries", () => {
  const dashboard = read("src/components/DashboardView.tsx");
  for (const label of ["Current Balance", "Current Month Income", "Current Month Expenses", "Outstanding Payables", "Active Projects", "Income trend", "Expense categories", "Account balances", "Recent activity"]) {
    assert.match(dashboard, new RegExp(label));
  }
  assert.match(dashboard, /isAdmin\?loadDashboardAuditActivity\(\):Promise\.resolve\(\[\]\)/);
  assert.match(dashboard, /User and audit activity is visible only to administrators/);
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
  assert.match(reports, /organization="Emmanuel Cash Flow"|const organization="Emmanuel Cash Flow"/);
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
