import { useEffect, useState, type FormEvent } from "react";
import {
  activateBudget, approveBudget, closeBudget, deleteBudget, deleteBudgetLine,
  loadBudgetLines, saveBudgetLine, submitBudget, updateBudget,
  type Budget, type BudgetInput, type BudgetLine, type BudgetStatus,
} from "../../services/budgets";
import { getSupabase } from "../../lib/supabase";
import { useActiveChurch } from "../../tenancy/ActiveChurchContext";
import { accountManagerRoles, hasChurchRole } from "../../tenancy/permissions";
import type { RoleName } from "../../types";
import { EmptyState } from "../ui/EmptyState";
import { LoadingSkeleton } from "../ui/LoadingSkeleton";
import { peso } from "../transactions/formatters";
import { BudgetForm } from "./BudgetForm";
import "./budgets.css";

export interface BudgetBuilderProps {
  churchId: string;
  budget: Budget;
  onBudgetChange: (budget: Budget) => void;
  onBack: () => void;
  onDeleted: () => void;
}

type Category = { id: string; name: string; transaction_type: "Income" | "Expense"; is_active: boolean };
const nextActions: Partial<Record<BudgetStatus, { label: string; run: (churchId: string, budgetId: string) => Promise<Budget> }>> = {
  Draft: { label: "Submit for approval", run: submitBudget },
  Submitted: { label: "Approve budget", run: approveBudget },
  Approved: { label: "Activate budget", run: activateBudget },
  Active: { label: "Close budget", run: closeBudget },
};

export function BudgetBuilder(props: BudgetBuilderProps) {
  const { activeChurch, activeRole, scopeVersion, workspaceMode } = useActiveChurch();
  if (!props.churchId || props.budget.churchId !== props.churchId || activeChurch?.id !== props.churchId || !activeRole || workspaceMode !== "church") {
    return <section className="panel"><EmptyState title="Budget unavailable" description="Select a budget from your active church workspace." /></section>;
  }
  return <ScopedBudgetBuilder key={`${props.churchId}:${props.budget.id}:${activeRole}:${scopeVersion}`} {...props} role={activeRole} />;
}

function ScopedBudgetBuilder({ churchId, budget, role, onBudgetChange, onBack, onDeleted }: BudgetBuilderProps & { role: RoleName }) {
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editDetails, setEditDetails] = useState(false);
  // undefined closes the form; null opens a new line; a record edits that line.
  const [editLine, setEditLine] = useState<BudgetLine | null | undefined>(undefined);
  const canManage = hasChurchRole(role, accountManagerRoles);
  const canDelete = role === "Admin";
  const canEdit = canManage && budget.status !== "Closed" && !loading && !loadError;
  const formOpen = editDetails || editLine !== undefined;
  const next = nextActions[budget.status];
  const availableCategories = categories.filter(category =>
    (category.is_active || category.id === editLine?.categoryId)
    && !lines.some(line => line.categoryId === category.id && line.id !== editLine?.id));
  const total = lines.reduce((sum, line) => sum + line.amount, 0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    const load = async () => {
      try {
        const [budgetLines, categoryResult] = await Promise.all([
          loadBudgetLines(churchId, budget.id),
          getSupabase().from("categories").select("id,name,transaction_type,is_active")
            .eq("church_id", churchId).order("name"),
        ]);
        if (categoryResult.error) throw new Error(categoryResult.error.message);
        if (!cancelled) {
          setLines(budgetLines);
          setCategories((categoryResult.data || []) as Category[]);
        }
      } catch (cause) {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "Unable to load budget allocations.");
      } finally { if (!cancelled) setLoading(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, [churchId, budget.id, reload]);

  const run = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try { await operation(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update the budget."); }
    finally { setBusy(false); }
  };

  const saveDetails = async (input: BudgetInput) => {
    if (!canEdit) return;
    await run(async () => {
      onBudgetChange(await updateBudget(churchId, budget.id, input));
      setEditDetails(false);
      setNotice("Budget details saved.");
    });
  };

  const saveLine = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit || busy) return;
    const form = new FormData(event.currentTarget);
    const categoryId = String(form.get("categoryId") || "");
    if (!availableCategories.some(category => category.id === categoryId)) {
      setError("Choose an available category for this church.");
      return;
    }
    void run(async () => {
      const saved = await saveBudgetLine(churchId, budget.id, {
        id: editLine?.id, categoryId,
        amount: Number(form.get("amount")), notes: String(form.get("notes") || ""),
      });
      setLines(rows => editLine ? rows.map(row => row.id === saved.id ? saved : row) : [...rows, saved]);
      setEditLine(undefined);
      setNotice("Budget allocation saved.");
    });
  };

  const removeLine = (line: BudgetLine) => {
    if (!canDelete || !canEdit || busy || !window.confirm("Delete this budget allocation?")) return;
    void run(async () => {
      await deleteBudgetLine(churchId, budget.id, line.id);
      setLines(rows => rows.filter(row => row.id !== line.id));
      setNotice("Budget allocation deleted.");
    });
  };

  const removeBudget = () => {
    if (!canDelete || !canEdit || busy || lines.length || !window.confirm(`Delete budget "${budget.name}"? This cannot be undone.`)) return;
    void run(async () => { await deleteBudget(churchId, budget.id); onDeleted(); });
  };

  const advance = () => {
    if (!canManage || busy || loading || loadError || formOpen || !next) return;
    if (!window.confirm(`${next.label} for "${budget.name}"?`)) return;
    void run(async () => {
      const updated = await next.run(churchId, budget.id);
      onBudgetChange(updated);
      setNotice(`Budget is now ${updated.status.toLowerCase()}.`);
    });
  };

  return <section className="budget-workspace" aria-label="Budget builder" aria-busy={busy}>
    <div className="panel">
      <div className="panel-head budget-toolbar">
        <div><p className="eyebrow">FY {budget.fiscalYear}</p><h2>{budget.name}</h2><p className="section-copy"><span className="status">{budget.status}</span></p></div>
        <button className="outline-button" disabled={busy} onClick={onBack}>Back to budgets</button>
      </div>
      {budget.notes && <p className="section-copy budget-notes">{budget.notes}</p>}
      {budget.approvedAt && <p className="form-help">Approved on {new Date(budget.approvedAt).toLocaleString("en-PH")}</p>}
      {!canManage && <p className="form-help">Read-only access. Church Admin and Treasurer can manage budgets.</p>}
      {budget.status === "Closed" && <p className="form-help">This budget is closed and available for review.</p>}
      <div className="row-actions budget-actions">
        {canEdit && <button className="outline-button" disabled={busy || formOpen} onClick={() => { setError(""); setEditDetails(true); }}>Edit details</button>}
        {canManage && next && <button className="primary-button" disabled={busy || loading || !!loadError || formOpen} onClick={advance}>{busy ? "Saving..." : next.label}</button>}
        {canDelete && canEdit && <button className="table-action danger" disabled={busy || formOpen || lines.length > 0} onClick={removeBudget}>Delete budget</button>}
      </div>
      {canDelete && canEdit && lines.length > 0 && <p className="form-help">Delete all allocations before deleting this budget.</p>}
    </div>
    {notice && <div className="form-success" role="status">{notice}</div>}
    {error && !editDetails && <div className="error-banner" role="alert">{error}</div>}
    {editDetails && canEdit && <BudgetForm key={budget.id} budget={budget} canManage={canEdit} saving={busy} error={error} onSubmit={saveDetails} onCancel={() => { setEditDetails(false); setError(""); }} />}
    {loading ? <section className="panel"><LoadingSkeleton rows={4} label="Loading budget allocations" /></section>
      : loadError ? <div className="error-banner" role="alert"><span>{loadError}</span><button onClick={() => setReload(value => value + 1)}>Try again</button></div>
      : <section className="panel table-panel">
        <div className="panel-head budget-toolbar"><div><p className="eyebrow">Category planning</p><h2>Budget allocations</h2></div>
          {canEdit && <button className="primary-button" disabled={busy || formOpen || !availableCategories.length} onClick={() => { setError(""); setEditLine(null); }}>Add allocation</button>}
        </div>
        <dl className="budget-summary"><div><dt>Total planned</dt><dd>{peso(total)}</dd></div><div><dt>Categories allocated</dt><dd>{lines.length}</dd></div><div><dt>Fiscal year</dt><dd>{budget.fiscalYear}</dd></div></dl>
        {canEdit && !categories.some(category => category.is_active) && <p className="form-help">Create or activate a category in Categories before adding allocations.</p>}
        {editLine !== undefined && canEdit && <form key={editLine?.id || "new"} className="record-form" onSubmit={saveLine} aria-label={editLine ? "Edit allocation" : "Add allocation"}>
          <div className="form-grid">
            <label>Category<select name="categoryId" aria-label="Category" defaultValue={editLine?.categoryId || ""} required disabled={busy}>
              <option value="" disabled>Choose a category</option>
              {availableCategories.map(category => <option key={category.id} value={category.id}>{category.name} ({category.transaction_type}){category.is_active ? "" : " - inactive"}</option>)}
            </select></label>
            <label>Planned amount (PHP)<input name="amount" type="number" min="0" max="999999999999.99" step="0.01" inputMode="decimal" defaultValue={editLine?.amount ?? ""} required disabled={busy} /></label>
            <label className="full">Notes<textarea name="notes" rows={2} defaultValue={editLine?.notes || ""} disabled={busy} /></label>
          </div>
          <div className="row-actions budget-actions"><button type="button" className="outline-button" disabled={busy} onClick={() => { setEditLine(undefined); setError(""); }}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving..." : "Save allocation"}</button></div>
        </form>}
        {lines.length ? <div className="table-wrap responsive-table"><table><thead><tr><th>Category</th><th>Type</th><th className="num">Planned amount</th><th>Notes</th>{canEdit && <th>Actions</th>}</tr></thead><tbody>{lines.map(line => {
          const category = categories.find(item => item.id === line.categoryId);
          return <tr key={line.id}>
            <td data-label="Category"><b>{category?.name || "Unavailable category"}</b>{category && !category.is_active && <small>Inactive</small>}</td>
            <td data-label="Type">{category?.transaction_type || "Not available"}</td>
            <td data-label="Planned amount" className="num">{peso(line.amount)}</td>
            <td data-label="Notes" className="budget-notes">{line.notes || "No notes"}</td>
            {canEdit && <td data-label="Actions"><div className="row-actions budget-actions"><button className="table-action" disabled={busy || formOpen} onClick={() => { setError(""); setEditLine(line); }}>Edit</button>{canDelete && <button className="table-action danger" disabled={busy || formOpen} onClick={() => removeLine(line)}>Delete</button>}</div></td>}
          </tr>;
        })}</tbody></table></div> : <EmptyState compact title="No allocations yet" description={canEdit ? "Add an amount for each category included in this budget." : "Category allocations will appear here when they are added."} />}
      </section>}
  </section>;
}
