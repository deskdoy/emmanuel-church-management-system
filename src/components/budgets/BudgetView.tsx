import { useEffect, useId, useState } from "react";
import { createBudget, loadBudgets, type Budget, type BudgetInput } from "../../services/budgets";
import { useActiveChurch } from "../../tenancy/ActiveChurchContext";
import { accountManagerRoles, hasChurchRole } from "../../tenancy/permissions";
import type { RoleName } from "../../types";
import { EmptyState } from "../ui/EmptyState";
import { LoadingSkeleton } from "../ui/LoadingSkeleton";
import { BudgetBuilder } from "./BudgetBuilder";
import { BudgetForm } from "./BudgetForm";
import { BudgetVsActual } from "./BudgetVsActual";
import "./budgets.css";

export function BudgetView({ churchId }: { churchId: string }) {
  const { activeChurch, activeRole, scopeVersion, workspaceMode } = useActiveChurch();
  if (!churchId || activeChurch?.id !== churchId || !activeRole || workspaceMode !== "church") {
    return <section className="panel"><EmptyState title="Choose a church workspace" description="Open Budget Planning from your active church workspace." /></section>;
  }
  // Remount on church or membership changes so old forms and results cannot cross workspaces.
  return <BudgetWorkspace key={`${churchId}:${activeRole}:${scopeVersion}`} churchId={churchId} role={activeRole} />;
}

function BudgetWorkspace({ churchId, role }: { churchId: string; role: RoleName }) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"builder" | "actual">("builder");
  const tabId = useId();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canManage = hasChurchRole(role, accountManagerRoles);
  const selected = budgets.find(budget => budget.id === selectedId);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    void loadBudgets(churchId).then(rows => {
      if (!cancelled) setBudgets(rows);
    }).catch(cause => {
      if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "Unable to load budgets.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [churchId, reload]);

  const create = async (input: BudgetInput) => {
    if (!canManage || saving) return;
    setSaving(true);
    setError("");
    try {
      const budget = await createBudget(churchId, input);
      setBudgets(rows => [budget, ...rows]);
      setFormOpen(false);
      setSelectedId(budget.id);
      setNotice("Budget created.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create the budget.");
    } finally { setSaving(false); }
  };

  const backToBudgets = () => { setSelectedId(null); setTab("builder"); setNotice(""); };
  if (selected) return <section className="budget-workspace" aria-label="Selected budget">
    <div className="module-tabs" role="tablist" aria-label="Budget sections" onKeyDown={event => {
      const target = event.key === "Home" ? "builder" : event.key === "End" ? "actual"
        : event.key === "ArrowLeft" || event.key === "ArrowRight" ? tab === "builder" ? "actual" : "builder" : null;
      if (!target) return;
      event.preventDefault();
      setTab(target);
      event.currentTarget.querySelector<HTMLButtonElement>(`[data-budget-tab="${target}"]`)?.focus();
    }}>
      <button id={`${tabId}-builder-tab`} data-budget-tab="builder" role="tab" aria-selected={tab === "builder"} aria-controls={`${tabId}-builder-panel`} tabIndex={tab === "builder" ? 0 : -1} className={tab === "builder" ? "active" : ""} onClick={() => setTab("builder")}>Budget builder</button>
      <button id={`${tabId}-actual-tab`} data-budget-tab="actual" role="tab" aria-selected={tab === "actual"} aria-controls={`${tabId}-actual-panel`} tabIndex={tab === "actual" ? 0 : -1} className={tab === "actual" ? "active" : ""} onClick={() => setTab("actual")}>Budget vs Actual</button>
    </div>
    <div id={`${tabId}-builder-panel`} role="tabpanel" aria-labelledby={`${tabId}-builder-tab`} hidden={tab !== "builder"}>
      <BudgetBuilder
        churchId={churchId}
        budget={selected}
        onBudgetChange={budget => setBudgets(rows => rows.map(row => row.id === budget.id ? budget : row))}
        onBack={backToBudgets}
        onDeleted={() => {
          setBudgets(rows => rows.filter(row => row.id !== selected.id));
          backToBudgets();
          setNotice("Budget deleted.");
        }}
      />
    </div>
    <div id={`${tabId}-actual-panel`} role="tabpanel" aria-labelledby={`${tabId}-actual-tab`} hidden={tab !== "actual"}>
      {tab === "actual" && <BudgetVsActual churchId={churchId} budget={selected} onBack={backToBudgets} />}
    </div>
  </section>;

  return <section className="budget-workspace" aria-label="Budget Planning">
    <div className="panel">
      <div className="panel-head budget-toolbar">
        <div><p className="eyebrow">Financial planning</p><h2>Budget Planning</h2><p className="section-copy">Plan church income and expenses by fiscal year and category.</p></div>
        {canManage && !formOpen && <button className="primary-button" disabled={loading || !!loadError} onClick={() => { setError(""); setFormOpen(true); }}>New budget</button>}
      </div>
      {!canManage && <p className="form-help">Read-only access. Church Admin and Treasurer can create and manage budgets.</p>}
    </div>
    {notice && <div className="form-success" role="status">{notice}</div>}
    {formOpen && canManage && <BudgetForm canManage={canManage} saving={saving} error={error} onSubmit={create} onCancel={() => setFormOpen(false)} />}
    {loading ? <section className="panel"><LoadingSkeleton rows={4} label="Loading budgets" /></section>
      : loadError ? <div className="error-banner" role="alert"><span>{loadError}</span><button onClick={() => setReload(value => value + 1)}>Try again</button></div>
      : budgets.length ? <div className="project-grid">{budgets.map(budget => <article className="project-card" key={budget.id}>
        <div className="project-card-head"><span className="status">{budget.status}</span><span>FY {budget.fiscalYear}</span></div>
        <h3>{budget.name}</h3><p>{budget.notes || "No planning notes yet."}</p>
        <p className="form-help">Created {new Date(budget.createdAt).toLocaleDateString("en-PH")}</p>
        <button className="outline-button" disabled={formOpen} onClick={() => { setSelectedId(budget.id); setNotice(""); }}>View budget</button>
      </article>)}</div>
      : <section className="panel"><EmptyState title="No budgets yet" description={canManage ? "Create your first budget to begin planning category allocations." : "Budgets will appear here when your church creates them."} /></section>}
  </section>;
}
