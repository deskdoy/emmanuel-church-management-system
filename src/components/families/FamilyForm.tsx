import type { FormEvent } from "react";
import type { Family, FamilyInput } from "../../services/families";

export interface FamilyFormProps {
  family?: Family;
  canManage: boolean;
  saving: boolean;
  error?: string;
  onSubmit: (input: FamilyInput) => Promise<void>;
  onCancel: () => void;
}

export function FamilyForm({ family, canManage, saving, error, onSubmit, onCancel }: FamilyFormProps) {
  if (!canManage) return null;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !canManage) return;
    const form = new FormData(event.currentTarget);
    void onSubmit({ name: String(form.get("name") || ""), notes: String(form.get("notes") || "") });
  };
  return <section className="panel">
    <div className="panel-head"><h2>{family ? "Edit family" : "New family"}</h2></div>
    <form className="record-form" aria-label={family ? "Edit family" : "New family"} aria-busy={saving} onSubmit={submit}>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="form-grid">
        <label className="full">Family name<input name="name" defaultValue={family?.name || ""} required disabled={saving} /></label>
        <label className="full">Notes<textarea name="notes" rows={3} defaultValue={family?.notes || ""} disabled={saving} /></label>
      </div>
      <div className="row-actions family-actions">
        <button type="button" className="outline-button" disabled={saving} onClick={onCancel}>Cancel</button>
        <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving..." : family ? "Save changes" : "Create family"}</button>
      </div>
    </form>
  </section>;
}
