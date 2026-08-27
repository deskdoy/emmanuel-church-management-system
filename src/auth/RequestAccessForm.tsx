import { FormEvent, useState } from "react";
import { accessRequestRoles, submitAccessRequest } from "../services/accessRequests";
import type { RoleName } from "../types";

export function RequestAccessForm({ onBack }: { onBack: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await submitAccessRequest({
        fullName: String(form.get("fullName") || ""),
        email: String(form.get("email") || ""),
        phone: String(form.get("phone") || ""),
        requestedRole: String(form.get("requestedRole") || "Viewer") as RoleName,
        reason: String(form.get("reason") || ""),
      });
      setSubmitted(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to submit your request."); }
    finally { setSaving(false); }
  };

  if (submitted) return <div className="request-success" role="status"><div className="empty-icon">✓</div><h2>Request received</h2><p>An administrator will review your request. If approved, Supabase will email your invitation and password setup link.</p><button className="outline-button" onClick={onBack}>Back to sign in</button></div>;

  return <><p className="eyebrow">Request access</p><h1 id="login-title">Join Emmanuel.</h1><p className="login-copy">Tell the church administrator why you need access. Your requested role is a suggestion; the Admin chooses the final role.</p>
    {error && <div className="form-error" role="alert">{error}</div>}
    <form className="login-form request-form" onSubmit={submit}>
      <label>Full name<input name="fullName" autoComplete="name" minLength={2} maxLength={150} required /></label>
      <label>Email address<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
      <label>Phone <small>Optional</small><input name="phone" type="tel" autoComplete="tel" maxLength={50} /></label>
      <label>Requested role <small>Suggestion only</small><select name="requestedRole" defaultValue="Viewer">{accessRequestRoles.map(role => <option key={role}>{role}</option>)}</select></label>
      <label>Reason<textarea name="reason" rows={4} minLength={10} maxLength={2000} placeholder="Why do you need access?" required /></label>
      <button className="primary-button" disabled={saving}>{saving ? "Submitting…" : "Submit request"}</button>
      <button className="auth-link-button" type="button" onClick={onBack}>Back to sign in</button>
    </form>
  </>;
}
