import { useEffect, useState } from "react";
import type { RoleName, UserProfile } from "../../types";
import { AppIcon } from "../ui/AppIcon";
import { ChurchBrand } from "../ui/ChurchBrand";
import { UserProfileIndicator } from "../ui/UserProfileIndicator";
import { ChurchWorkspaceSwitcher } from "../tenancy/ChurchWorkspaceSwitcher";
import { NavigationSections } from "./NavigationSections";
import type { NavigationItem, View } from "./types";

type SidebarProps = {
  view:View;
  navItems:NavigationItem[];
  onNavigate:(view:View)=>void;
  profile:UserProfile|null;
  activeRole:RoleName|null;
  connected:boolean;
  onSignOut:()=>Promise<void>;
};

export function Sidebar({view,navItems,onNavigate,profile,activeRole,connected,onSignOut}:SidebarProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useEffect(() => {
    if (!mobileNavOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileNavOpen(false); };
    document.addEventListener("keydown", closeOnEscape);
    document.body.classList.add("drawer-open");
    return () => { document.removeEventListener("keydown", closeOnEscape); document.body.classList.remove("drawer-open"); };
  }, [mobileNavOpen]);

  return <>
    <button type="button" className="mobile-menu-button" aria-label="Open navigation menu" aria-controls="main-sidebar" aria-expanded={mobileNavOpen} onClick={()=>setMobileNavOpen(true)}><span /><span /><span /></button>
    <button type="button" className={`sidebar-overlay ${mobileNavOpen?"open":""}`} aria-label="Close navigation menu" onClick={()=>setMobileNavOpen(false)} />
    <aside id="main-sidebar" className={`sidebar mobile-drawer ${mobileNavOpen?"open":""}`}><div className="brand"><ChurchBrand inverse/></div><ChurchWorkspaceSwitcher onSwitched={()=>setMobileNavOpen(false)}/><nav aria-label="Main navigation">
        <NavigationSections view={view} navItems={navItems} onNavigate={key=>{onNavigate(key);setMobileNavOpen(false);}}/>
        <button className="nav-item logout-nav" onClick={()=>{setMobileNavOpen(false);void onSignOut();}}><span className="nav-icon"><AppIcon name="logout"/></span><span className="nav-label">Logout</span></button></nav><div className="sidebar-foot">{profile&&activeRole&&<UserProfileIndicator name={profile.fullName} email={profile.email} role={activeRole}/>}<div className="connection-state"><div className={`sync-dot ${connected ? "" : "pending"}`} /><span>{connected ? "Database connected" : "Connection pending"}</span></div></div></aside>
  </>;
}
