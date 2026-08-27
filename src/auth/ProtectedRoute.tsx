import { FormEvent, ReactNode, useState } from "react";
import { useAuth } from "./AuthContext";
import { supabaseConfigError } from "../lib/supabase";

function Login() {
  const { signIn, loading, error } = useAuth();
  const [email,setEmail]=useState(""); const [password,setPassword]=useState("");
  const submit=async(e:FormEvent)=>{e.preventDefault();await signIn(email,password)};
  return <main className="login-shell"><section className="login-card" aria-labelledby="login-title">
    <div className="login-brand"><span className="brand-mark">E</span><div><b>Emmanuel Cash Flow</b><small>Church financial management</small></div></div>
    <p className="eyebrow">Secure access</p><h1 id="login-title">Welcome back.</h1><p className="login-copy">Sign in with your authorized church account.</p>
    {(error||supabaseConfigError)&&<div className="form-error" role="alert">{error||supabaseConfigError}</div>}
    <form className="login-form" onSubmit={submit}><label>Email address<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button className="primary-button" disabled={loading||!!supabaseConfigError}>{loading?"Signing in…":"Sign in"}</button></form>
  </section></main>;
}

export function ProtectedRoute({children}:{children:ReactNode}){
  const {session,profile,loading}=useAuth();
  if(loading)return <main className="auth-loading"><span className="brand-mark">E</span><p>Loading your workspace…</p></main>;
  if(!session||!profile)return <Login/>;
  return children;
}
