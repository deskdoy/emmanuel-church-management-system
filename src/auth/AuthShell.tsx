import type { ReactNode } from "react";
import { ChurchBrand } from "../components/ui/ChurchBrand";
import { AppIcon } from "../components/ui/AppIcon";

export function AuthShell({children,context="Secure church financial stewardship"}:{children:ReactNode;context?:string}){
  return <main className="login-shell auth-shell-pro"><aside className="auth-welcome"><ChurchBrand inverse/><div className="auth-welcome-copy"><span className="auth-kicker">Stewardship with clarity</span><h2>Faithful finances.<br/>Confident leadership.</h2><p>A secure workspace for recording, reviewing, and reporting the resources entrusted to your church.</p><div className="auth-assurance"><span><AppIcon name="audit" size={18}/><b>Accountable</b><small>Clear records and audit history</small></span><span><AppIcon name="reports" size={18}/><b>Insightful</b><small>Leadership-ready reporting</small></span><span><AppIcon name="users" size={18}/><b>Role-aware</b><small>Access appropriate to every ministry role</small></span></div></div><p className="auth-welcome-foot">{context}</p></aside><section className="auth-form-area"><div className="login-card">{children}</div><p className="auth-copyright">Emmanuel Church · Financial Management</p></section></main>;
}
