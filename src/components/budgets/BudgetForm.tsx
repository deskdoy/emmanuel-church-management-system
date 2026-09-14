import type { FormEvent } from "react";
import type { Budget, BudgetInput } from "../../services/budgets";

export interface BudgetFormProps {
  budget?: Budget | null;
  canManage: boolean;
  saving: boolean;
  error?: string;
  onSubmit: (input: BudgetInput) => Promise<void>;
  onCancel: () => void;
}

export function BudgetForm({ budget, canManage, saving, error, onSubmit, onCancel }: BudgetFormProps) {
  if (!canManage) return null;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !canManage) return;
    const form = new FormData(event.currentTarget);
    void onSubmit({
      name: String(form.get("name") || ""),
      fiscalYear: Number(form.get("fiscalYear")),
      notes: String(form.get("notes") || ""),
    });
  };
  return <section className="panel">
    <div className="panel-head"><h2>{budget ? "Edit budget" : "New budget"}</h2></div>
    <form className="record-form" onSubmit={submit} aria-label={budget ? "Edit budget" : "New budget"} aria-busy={saving}>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="form-grid">
        <label>Budget name<input name="name" defaultValue={budget?.name || ""} required disabled={saving} placeholder="Annual church budget" /></label>
        <label>Fiscal year<input name="fiscalYear" type="number" min="1" max="9999" step="1" defaultValue={budget?.fiscalYear ?? new Date().getFullYear()} required disabled={saving} /></label>
        <label className="full">Notes<textarea name="notes" rows={3} defaultValue={budget?.notes || ""} disabled={saving} /></label>
      </div>
      <p className="form-help">{budget ? "Update the name, fiscal year, and planning notes." : "New budgets start as Draft. Add category allocations before submitting for approval."}</p>
      <div className="row-actions budget-actions">
        <button type="button" className="outline-button" disabled={saving} onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving..." : budget ? "Save changes" : "Create budget"}</button>
      </div>
    </form>
  </section>;
}
