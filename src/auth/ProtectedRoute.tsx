import { FormEvent, ReactNode, useState } from "react";
import { useAuth } from "./AuthContext";
import { supabaseConfigError } from "../lib/supabase";
import { InvitePasswordSetup } from "./InvitePasswordSetup";
import { RequestAccessForm } from "./RequestAccessForm";

function invitationNotice() {
  const query = new URLSearchParams(window.location.search), hash = new URLSearchParams(window.location.hash.slice(1));
  const code = query.get("error_code") || hash.get("error_code") || "";
  const description = query.get("error_description") || hash.get("error_description") || "";
  if (code === "otp_expired" || /expired/i.test(description)) return "This invitation link has expired. Contact an administrator so a new invitation can be issued.";
  if (query.get("setup") === "complete") return "Your password is set. Sign in with your email and new password.";
  return "";
}

function Login() {
  const { signIn, loading, error } = useAuth();
  const [email,setEmail]=useState(""); const [password,setPassword]=useState("");
  const [requestingAccess,setRequestingAccess]=useState(false);
  const submit=async(e:FormEvent)=>{e.preventDefault();await signIn(email,password)};
  return <main className="login-shell"><section className="login-card" aria-labelledby="login-title">
    <div className="login-brand"><span className="brand-mark">E</span><div><b>Emmanuel Cash Flow</b><small>Church financial management</small></div></div>
    {requestingAccess ? <RequestAccessForm onBack={()=>setRequestingAccess(false)} /> : <><p className="eyebrow">Secure access</p><h1 id="login-title">Welcome back.</h1><p className="login-copy">Sign in with your authorized church account.</p>
      {invitationNotice()&&<div className={new URLSearchParams(window.location.search).get("setup") === "complete" ? "form-success" : "form-error"} role="status">{invitationNotice()}</div>}
      {(error||supabaseConfigError)&&<div className="form-error" role="alert">{error||supabaseConfigError}</div>}
      <form className="login-form" onSubmit={submit}><label>Email address<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button className="primary-button" disabled={loading||!!supabaseConfigError}>{loading?"Signing in…":"Sign in"}</button><button className="auth-link-button" type="button" onClick={()=>setRequestingAccess(true)}>Request Access</button></form></>}
  </section></main>;
}

export function ProtectedRoute({children}:{children:ReactNode}){
  const {session,profile,loading}=useAuth();
  if(loading)return <main className="auth-loading"><span className="brand-mark">E</span><p>Loading your workspace…</p></main>;
  if(new URLSearchParams(window.location.search).get("invited") === "true"&&session&&profile)return <InvitePasswordSetup/>;
  if(!session||!profile)return <Login/>;
  return children;
}
