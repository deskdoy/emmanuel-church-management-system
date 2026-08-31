import type { ReactNode } from "react";
import { useActiveChurch } from "../tenancy/ActiveChurchContext";
import { useAuth } from "./AuthContext";
import { AuthShell } from "./AuthShell";
import { ChurchBrand } from "../components/ui/ChurchBrand";

export function WorkspaceGate({children}:{children:ReactNode}){
  const {isPlatformOwner,refreshAuthorization,signOut}=useAuth();
  const {activeChurch,activeMemberships,workspaceMode,switchChurch}=useActiveChurch();
  if(isPlatformOwner&&workspaceMode==="platform")return children;
  if(activeChurch&&workspaceMode==="church")return children;
  if(activeMemberships.length>1)return <AuthShell><section><ChurchBrand compact/><p className="eyebrow">Choose workspace</p><h1>Select a church.</h1><p className="login-copy">Choose the church workspace you want to open.</p><div className="workspace-choice-list">{activeMemberships.map(item=><button className="outline-button" key={item.id} onClick={()=>switchChurch(item.churchId)}>{item.church.name} · {item.role}</button>)}</div></section></AuthShell>;
  return <AuthShell><section><ChurchBrand compact/><p className="eyebrow">Church access</p><h1>No active church access.</h1><p className="login-copy">Your account is signed in, but it does not currently have an active church membership.</p><div className="workspace-gate-actions"><button className="primary-button" onClick={()=>void refreshAuthorization()}>Refresh access</button><button className="outline-button" onClick={()=>void signOut()}>Sign out</button></div></section></AuthShell>;
}
