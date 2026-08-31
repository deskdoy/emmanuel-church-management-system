import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import type { Church, ChurchMembership, RoleName, WorkspaceMode } from "../types";

type ActiveChurchContextValue={
  activeChurch:Church|null;
  activeMembership:ChurchMembership|null;
  activeRole:RoleName|null;
  activeMemberships:ChurchMembership[];
  workspaceMode:WorkspaceMode;
  selectionRequired:boolean;
  scopeVersion:number;
  switching:boolean;
  switchChurch:(churchId:string)=>boolean;
  enterPlatformMode:()=>void;
};

const ActiveChurchContext=createContext<ActiveChurchContextValue|null>(null);
const preferenceKey=(userId:string)=>`faithful-steward.active-church:${userId}`;

export function ActiveChurchProvider({children}:{children:ReactNode}){
  const {profile,memberships,isPlatformOwner}=useAuth();
  const activeMemberships=useMemo(()=>memberships.filter(item=>item.status==="active"&&item.church.status==="active"),[memberships]);
  const [selectedChurchId,setSelectedChurchId]=useState<string|null>(null);
  const [workspaceMode,setWorkspaceMode]=useState<WorkspaceMode>("church");
  const [scopeVersion,setScopeVersion]=useState(0);
  const [switching,setSwitching]=useState(false);

  const storedPreference=useMemo(()=>{
    if(!profile)return "";
    try{return window.localStorage.getItem(preferenceKey(profile.id))||"";}catch{return "";}
  },[profile]);
  const activeMembership=activeMemberships.find(item=>item.churchId===selectedChurchId)
    ||activeMemberships.find(item=>item.churchId===storedPreference)
    ||activeMemberships[0]
    ||null;
  const effectiveWorkspaceMode:WorkspaceMode=activeMembership
    ?workspaceMode
    :isPlatformOwner?"platform":"church";

  const switchChurch=useCallback((churchId:string)=>{
    if(!profile||!activeMemberships.some(item=>item.churchId===churchId))return false;
    setSwitching(true);setSelectedChurchId(churchId);setWorkspaceMode("church");setScopeVersion(value=>value+1);
    try{window.localStorage.setItem(preferenceKey(profile.id),churchId);}catch{/* The in-memory selection remains authoritative for this session. */}
    queueMicrotask(()=>setSwitching(false));return true;
  },[activeMemberships,profile]);
  const enterPlatformMode=useCallback(()=>{if(isPlatformOwner){setWorkspaceMode("platform");setScopeVersion(value=>value+1);}},[isPlatformOwner]);
  const value=useMemo(()=>({activeChurch:activeMembership?.church||null,activeMembership,activeRole:activeMembership?.role||null,activeMemberships,workspaceMode:effectiveWorkspaceMode,selectionRequired:activeMemberships.length>0&&!activeMembership,scopeVersion,switching,switchChurch,enterPlatformMode}),[activeMembership,activeMemberships,effectiveWorkspaceMode,enterPlatformMode,scopeVersion,switchChurch,switching]);
  return <ActiveChurchContext.Provider value={value}>{children}</ActiveChurchContext.Provider>;
}

export function useActiveChurch(){const value=useContext(ActiveChurchContext);if(!value)throw new Error("useActiveChurch must be used within ActiveChurchProvider");return value;}
