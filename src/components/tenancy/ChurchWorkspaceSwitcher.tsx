import { useId } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useActiveChurch } from "../../tenancy/ActiveChurchContext";

export function ChurchWorkspaceSwitcher({compact=false,onSwitched}:{compact?:boolean;onSwitched?:()=>void}){
  const selectId=useId();
  const {isPlatformOwner}=useAuth();
  const {activeChurch,activeMemberships,workspaceMode,switchChurch,enterPlatformMode,switching}=useActiveChurch();
  if(!activeChurch)return null;
  const initials=activeChurch.name.split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join("").toUpperCase();
  return <section className={`church-workspace-switcher ${compact?"compact":""}`} aria-label="Active church workspace">
    <span className="church-workspace-mark" aria-hidden="true">{activeChurch.logoUrl?<img src={activeChurch.logoUrl} alt=""/>:initials}</span>
    <div>
      <label htmlFor={selectId}>{activeMemberships.length>1?"Church workspace":"Active church"}</label>
      {activeMemberships.length>1||isPlatformOwner?<select id={selectId} value={workspaceMode==="platform"?"__platform__":activeChurch.id} disabled={switching} onChange={event=>{if(event.target.value==="__platform__"){enterPlatformMode();onSwitched?.();return;}if(switchChurch(event.target.value))onSwitched?.();}}>{isPlatformOwner&&<option value="__platform__">Platform Administration</option>}{activeMemberships.map(membership=><option key={membership.id} value={membership.churchId}>{membership.church.name}</option>)}</select>:<b>{activeChurch.name}</b>}
      {!compact&&<small>{activeChurch.currency} · {activeChurch.timezone}</small>}
    </div>
  </section>;
}

export function ActiveChurchIdentity(){
  const {activeChurch,activeRole,workspaceMode}=useActiveChurch();
  if(workspaceMode==="platform")return <div className="active-church-identity"><span>Faithful Steward Platform</span><small>Platform Owner</small></div>;
  if(!activeChurch)return null;
  return <div className="active-church-identity" title={`${activeChurch.name} · ${activeRole||"Member"}`}><span>{activeChurch.name}</span><small>{activeRole||"Member"}</small></div>;
}
