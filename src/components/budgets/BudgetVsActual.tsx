import { useEffect, useState } from "react";
import { buildBudgetVsActualReport, type BudgetVsActualReport } from "../../reporting/budgetCalculations";
import { loadBudgetLines, type Budget } from "../../services/budgets";
import { loadCashFlow } from "../../services/cashflow";
import { useActiveChurch } from "../../tenancy/ActiveChurchContext";
import { EmptyState } from "../ui/EmptyState";
import { LoadingSkeleton } from "../ui/LoadingSkeleton";
import { peso } from "../transactions/formatters";
import "./budgets.css";

export interface BudgetVsActualProps {
  churchId: string;
  budget: Budget;
  onBack?: () => void;
}

const usageLabel = (percentage: number | null) => percentage === null
  ? "Not applicable"
  : `${percentage.toLocaleString("en-PH", { maximumFractionDigits: 2 })}%`;
const varianceClass = (variance: number) => variance < 0 ? "budget-over" : variance > 0 ? "income-text" : "";

export function BudgetVsActual(props: BudgetVsActualProps) {
  const { activeChurch, activeRole, scopeVersion, workspaceMode } = useActiveChurch();
  if (!props.churchId || props.budget.churchId !== props.churchId || activeChurch?.id !== props.churchId || !activeRole || workspaceMode !== "church") {
    return <section className="panel"><EmptyState title="Budget report unavailable" description="Select a budget from your active church workspace." /></section>;
  }
  return <ScopedBudgetVsActual key={`${props.churchId}:${props.budget.id}:${props.budget.fiscalYear}:${props.budget.updatedAt}:${activeRole}:${scopeVersion}`} {...props} />;
}

function ScopedBudgetVsActual({ churchId, budget, onBack }: BudgetVsActualProps) {
  const [report, setReport] = useState<BudgetVsActualReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const load = async () => {
      try {
        const [lines, data] = await Promise.all([
          loadBudgetLines(churchId, budget.id),
          loadCashFlow(churchId),
        ]);
        const result = buildBudgetVsActualReport(budget, lines, data);
        if (!cancelled) setReport(result);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load budget vs actual expenses.");
      } finally { if (!cancelled) setLoading(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, [churchId, budget, reload]);

  return <section className="panel budget-comparison" aria-label="Budget vs Actual report" aria-busy={loading}>
    <div className="panel-head budget-toolbar">
      <div><p className="eyebrow">FY {budget.fiscalYear} / Expense reporting</p><h2>Budget vs Actual</h2><p className="section-copy">{budget.name}</p></div>
      <div className="row-actions budget-actions">
        <button className="outline-button" disabled={loading} onClick={() => setReload(value => value + 1)}>Refresh report</button>
        {onBack && <button className="outline-button" onClick={onBack}>Back to budgets</button>}
      </div>
    </div>
    <p className="form-help">Approved expenses only, January 1 through December 31, {budget.fiscalYear}. Income is excluded.</p>
    {loading ? <LoadingSkeleton rows={4} label="Loading budget vs actual" />
      : error ? <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setReload(value => value + 1)}>Try again</button></div>
      : report && report.rows.length ? <>
        <dl className="budget-summary">
          <div><dt>Expense budget</dt><dd>{peso(report.totals.budgetAmount)}</dd></div>
          <div><dt>Actual expense</dt><dd>{peso(report.totals.actualExpenseAmount)}</dd></div>
          <div><dt>Variance</dt><dd className={varianceClass(report.totals.variance)}>{peso(report.totals.variance)}</dd></div>
        </dl>
        <p className="form-help">Total usage: {usageLabel(report.totals.usagePercentage)}. Status: {report.totals.status}.</p>
        <p className="form-help">Variance is budget minus actual: positive means under budget, negative means over budget. Usage is not applicable when spending has no budget.</p>
        <div className="table-wrap responsive-table"><table>
          <caption className="sr-only">Expense budget compared with approved actual expenses for {budget.fiscalYear}</caption>
          <thead><tr><th scope="col">Category</th><th scope="col" className="num">Budget amount</th><th scope="col" className="num">Actual expense</th><th scope="col" className="num">Variance</th><th scope="col" className="num">Usage percentage</th><th scope="col">Status</th></tr></thead>
          <tbody>{report.rows.map(row => <tr key={row.categoryId}>
            <td data-label="Category"><b>{row.category}</b></td>
            <td data-label="Budget amount" className="num">{peso(row.budgetAmount)}</td>
            <td data-label="Actual expense" className="num">{peso(row.actualExpenseAmount)}</td>
            <td data-label="Variance" className={`num ${varianceClass(row.variance)}`}>{peso(row.variance)}</td>
            <td data-label="Usage percentage" className="num">{usageLabel(row.usagePercentage)}</td>
            <td data-label="Status"><span className={`status ${row.status === "Over budget" ? "budget-status-over" : ""}`}>{row.status}</span></td>
          </tr>)}</tbody>
        </table></div>
      </> : <EmptyState title="No expense budget activity" description="Expense allocations and approved expenses for this fiscal year will appear here. Income allocations and unapproved expenses are excluded." />}
  </section>;
}
