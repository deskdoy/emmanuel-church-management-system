import { useEffect, useMemo, useState } from "react";
import { buildBudgetVsActualReport } from "../../reporting/budgetCalculations";
import { loadBudgets, loadBudgetLines, type Budget, type BudgetLine } from "../../services/budgets";
import { useActiveChurch } from "../../tenancy/ActiveChurchContext";
import { accountManagerRoles, hasChurchRole } from "../../tenancy/permissions";
import type { CashFlowData } from "../../types";
import { EmptyState } from "../ui/EmptyState";
import { LoadingSkeleton } from "../ui/LoadingSkeleton";
import { peso } from "./formatters";
import "./BudgetHealthCard.css";

export interface BudgetHealthCardProps {
  churchId: string;
  /** The current church's financial data, already loaded by the dashboard. */
  data: Pick<CashFlowData, "transactions" | "categories">;
  asOf?: Date;
}

export function BudgetHealthCard({ churchId, data, asOf = new Date() }: BudgetHealthCardProps) {
  const { activeChurch, activeRole, scopeVersion, workspaceMode } = useActiveChurch();
  if (!churchId || activeChurch?.id !== churchId || workspaceMode !== "church" || !hasChurchRole(activeRole, accountManagerRoles)) return null;
  const fiscalYear = asOf.getFullYear();
  return <ScopedBudgetHealthCard key={`${churchId}:${activeRole}:${scopeVersion}:${fiscalYear}`} churchId={churchId} data={data} fiscalYear={fiscalYear} />;
}

function ScopedBudgetHealthCard({ churchId, data, fiscalYear }: Omit<BudgetHealthCardProps, "asOf"> & { fiscalYear: number }) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [allocation, setAllocation] = useState<{ budgetId: string; lines: BudgetLine[]; loading: boolean; error: string }>({ budgetId: "", lines: [], loading: true, error: "" });
  const selected = budgets.find(budget => budget.id === selectedId) || budgets[0];
  const budgetId = selected?.id;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void loadBudgets(churchId).then(rows => {
      if (!cancelled) setBudgets(rows.filter(budget => budget.churchId === churchId && budget.fiscalYear === fiscalYear && budget.status === "Active")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)));
    }).catch(cause => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load budget health.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [churchId, fiscalYear, reload]);

  useEffect(() => {
    if (!budgetId) return;
    let cancelled = false;
    setAllocation({ budgetId, lines: [], loading: true, error: "" });
    void loadBudgetLines(churchId, budgetId).then(lines => {
      if (!cancelled) setAllocation({ budgetId, lines, loading: false, error: "" });
    }).catch(cause => {
      if (!cancelled) setAllocation({ budgetId, lines: [], loading: false, error: cause instanceof Error ? cause.message : "Unable to load budget allocations." });
    });
    return () => { cancelled = true; };
  }, [churchId, budgetId, reload]);

  const report = useMemo(() => selected && allocation.budgetId === selected.id && !allocation.loading && !allocation.error
    ? buildBudgetVsActualReport(selected, allocation.lines, data) : null, [selected, allocation, data]);
  const totals = report?.totals;
  const health = totals && totals.variance < 0 ? "Over Budget"
    : totals && totals.budgetAmount > 0 && totals.actualExpenseAmount >= totals.budgetAmount * 0.8 ? "Warning" : "Healthy";
  const busy = loading || (!error && !!selected && (allocation.budgetId !== selected.id || allocation.loading));
  const failure = error || (selected && allocation.budgetId === selected.id ? allocation.error : "");

  return <article className="panel budget-health-card" aria-label="Budget Health" aria-busy={busy}>
    <div className="panel-head budget-health-toolbar">
      <div><p className="eyebrow">FY {fiscalYear} / Active expense budget</p><h2>Budget Health</h2></div>
      <button className="outline-button" disabled={busy} onClick={() => setReload(value => value + 1)}>Refresh budget health</button>
    </div>
    {busy ? <LoadingSkeleton rows={2} label="Loading budget health" />
      : failure ? <div className="error-banner" role="alert"><span>{failure}</span><button onClick={() => setReload(value => value + 1)}>Try again</button></div>
      : !selected ? <EmptyState compact title="No active budget" description={`Activate a budget for ${fiscalYear} in Budget Planning to see its health here.`} />
      : <>
        {budgets.length > 1 ? <label className="budget-health-select">Active budget<select aria-label="Active budget" value={selected.id} onChange={event => setSelectedId(event.target.value)}>{budgets.map(budget => <option key={budget.id} value={budget.id}>{budget.name}</option>)}</select></label>
          : <p className="section-copy">{selected.name}</p>}
        {totals && <>
          <dl className="budget-health-metrics">
            <div><dt>Total budget</dt><dd>{peso(totals.budgetAmount)}</dd></div>
            <div><dt>Actual approved expenses</dt><dd>{peso(totals.actualExpenseAmount)}</dd></div>
            <div><dt>Remaining budget</dt><dd className={totals.variance < 0 ? "budget-health-over" : ""}>{peso(totals.variance)}</dd></div>
            <div><dt>Usage percentage</dt><dd>{totals.usagePercentage === null ? "Not applicable" : `${totals.usagePercentage.toLocaleString("en-PH", { maximumFractionDigits: 2 })}%`}</dd></div>
          </dl>
          <p><span className={`status budget-health-${health === "Over Budget" ? "over" : health.toLowerCase()}`}>{health}</span></p>
          <p className="form-help">Expense categories only. Healthy below 80% usage; Warning from 80% through 100%; Over Budget when actual expenses exceed the budget. Usage is not applicable when spending has no budget.</p>
        </>}
      </>}
  </article>;
}
