import { FormEvent, useState } from "react";
import { accessRequestRoles, resolveChurchWorkspace, submitAccessRequest } from "../services/accessRequests";
import type { RoleName } from "../types";

export function RequestAccessForm({onBack}:{onBack:()=>void}){
  const [saving,setSaving]=useState(false),[error,setError]=useState(""),[submitted,setSubmitted]=useState(false),[churchName,setChurchName]=useState("");
  const initialChurch=new URLSearchParams(window.location.search).get("church")||"emmanuel-church";
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setSaving(true);setError("");
    const form=new FormData(event.currentTarget);
    try{
      const church=await resolveChurchWorkspace(String(form.get("churchSlug")||""));
      await submitAccessRequest({churchId:church.id,fullName:String(form.get("fullName")||""),email:String(form.get("email")||""),phone:String(form.get("phone")||""),requestedRole:String(form.get("requestedRole")||"Viewer") as RoleName,reason:String(form.get("reason")||"")});
      setChurchName(church.name);setSubmitted(true);
    }catch(cause){setError(cause instanceof Error?cause.message:"Unable to submit your request.");}
    finally{setSaving(false);}
  };
  if(submitted)return <div className="request-success" role="status"><div className="empty-icon">✓</div><h2>Request received</h2><p>A {churchName} administrator will review your request. If approved, you will receive an email invitation and password setup link.</p><button className="outline-button" onClick={onBack}>Back to sign in</button></div>;
  return <><p className="eyebrow">Request access</p><h1 id="login-title">Join Faithful Steward.</h1><p className="login-copy">Choose your church workspace and explain why you need access. Your requested role is a suggestion; the Church Admin chooses the final role.</p>
    {error&&<div className="form-error" role="alert">{error}</div>}
    <form className="login-form request-form" onSubmit={submit}>
      <label>Church workspace<input name="churchSlug" defaultValue={initialChurch} autoCapitalize="none" spellCheck={false} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required/><small>Provided by your church administrator</small></label>
      <label>Full name<input name="fullName" autoComplete="name" minLength={2} maxLength={150} required/></label>
      <label>Email address<input name="email" type="email" autoComplete="email" maxLength={254} required/></label>
      <label>Phone <small>Optional</small><input name="phone" type="tel" autoComplete="tel" maxLength={50}/></label>
      <label>Requested role <small>Suggestion only</small><select name="requestedRole" defaultValue="Viewer">{accessRequestRoles.map(role=><option key={role} value={role}>{role==="Admin"?"Church Admin":role}</option>)}</select></label>
      <label>Reason<textarea name="reason" rows={4} minLength={10} maxLength={2000} placeholder="Why do you need access?" required/></label>
      <button className="primary-button" disabled={saving}>{saving?"Submitting…":"Submit request"}</button>
      <button className="auth-link-button" type="button" onClick={onBack}>Back to sign in</button>
    </form>
  </>;
}
