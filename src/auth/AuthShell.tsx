import type { ReactNode } from "react";
import { ChurchBrand } from "../components/ui/ChurchBrand";
import { AppIcon } from "../components/ui/AppIcon";
import { BRAND } from "../branding";

export function AuthShell({children,context="Secure, accountable stewardship for every church community"}:{children:ReactNode;context?:string}){
  return <main className="login-shell auth-shell-pro"><aside className="auth-welcome"><ChurchBrand inverse/><div className="auth-welcome-copy"><span className="auth-kicker">Stewardship with clarity</span><h2>Steward faithfully.<br/>Lead confidently.</h2><p>Bring financial records, ministry accountability, and leadership reporting together in one secure workspace built to serve churches of every size.</p><div className="auth-assurance"><span><AppIcon name="audit" size={18}/><b>Accountable</b><small>Clear records and audit history</small></span><span><AppIcon name="reports" size={18}/><b>Insightful</b><small>Leadership-ready reporting</small></span><span><AppIcon name="users" size={18}/><b>Church-ready</b><small>Role-aware access for ministry teams</small></span></div></div><p className="auth-welcome-foot">{context}</p></aside><section className="auth-form-area"><div className="login-card">{children}</div><p className="auth-copyright">{BRAND.productName} · {BRAND.subtitle}</p></section></main>;
}
