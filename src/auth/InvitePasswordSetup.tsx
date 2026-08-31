import { FormEvent, useState } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "../lib/supabase";
import { PasswordField } from "./PasswordField";
import { AuthShell } from "./AuthShell";
import { ChurchBrand } from "../components/ui/ChurchBrand";

export function InvitePasswordSetup() {
  const { signOut } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || ""), confirmation = String(form.get("confirmation") || "");
    if (password.length < 8) { setError("Use at least 8 characters for your password."); setSaving(false); return; }
    if (password !== confirmation) { setError("Passwords do not match."); setSaving(false); return; }
    if (!supabase) { setError("Supabase is not configured."); setSaving(false); return; }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) { setError(updateError.message); setSaving(false); return; }
    window.history.replaceState(null, "", `${window.location.pathname}?setup=complete`);
    await signOut();
  };

  return <AuthShell context="Invitation-only access protects your Faithful Steward workspace."><section aria-labelledby="setup-title"><ChurchBrand compact/><p className="eyebrow">Invitation accepted</p><h1 id="setup-title">Set your password.</h1><p className="login-copy">Create a secure password to finish activating your approved account.</p>{error && <div className="form-error" role="alert">{error}</div>}<form className="login-form" onSubmit={submit}><PasswordField label="New password" name="password" autoComplete="new-password" minLength={8} required /><PasswordField label="Confirm password" name="confirmation" autoComplete="new-password" minLength={8} required /><p className="field-guidance">Use at least eight characters. A longer, unique password is recommended.</p><button className="primary-button" disabled={saving}>{saving?<span className="button-loading"><i/>Activating…</span>:"Set password"}</button></form></section></AuthShell>;
}
