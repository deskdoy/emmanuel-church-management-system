import type { ReactNode } from "react";
import type { RoleName, UserProfile } from "../../types";
import { UserProfileIndicator } from "../ui/UserProfileIndicator";
import { ActiveChurchIdentity, ChurchWorkspaceSwitcher } from "../tenancy/ChurchWorkspaceSwitcher";

type TopbarProps = {
  heading:[string,string];
  profile:UserProfile|null;
  activeRole:RoleName|null;
  actions:ReactNode;
};

export function Topbar({heading,profile,activeRole,actions}:TopbarProps) {
  return <header className="topbar"><div className="welcome-heading"><div className="workspace-heading-line"><p className="eyebrow">{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</p><ActiveChurchIdentity/></div><h1>{heading[0]}</h1><p className="subhead">{heading[1]}</p></div><div className="topbar-actions"><ChurchWorkspaceSwitcher compact/>{profile&&activeRole&&<UserProfileIndicator name={profile.fullName} email={profile.email} role={activeRole} compact/>}{actions}</div></header>;
}
