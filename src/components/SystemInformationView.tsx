import { useCallback, useEffect, useState } from "react";
import packageInfo from "../../package.json";
import { loadSystemInformation, type SystemInformation } from "../services/operationalManagement";
import type { AppUser } from "../types";
import { AppIcon } from "./ui/AppIcon";
import { EmptyState } from "./ui/EmptyState";
import { BRAND } from "../branding";

export function SystemInformationView({ churchId,profile }: { churchId:string;profile: AppUser }) {
  const [information, setInformation] = useState<SystemInformation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setInformation(await loadSystemInformation(churchId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load system information."); }
    finally { setLoading(false); }
  },[churchId]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  if (profile.role !== "Admin") return null;
  const environment = import.meta.env.PROD ? "Production" : `${import.meta.env.MODE || "development"} preview`;
  return <div className="system-information">
    {error && <div className="error-banner" role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>Try again</button></div>}
    {loading ? <section className="panel"><EmptyState title="Checking system health" description="Verifying the current database session and operational record counts."/></section> : information && <>
      <section className="system-card-grid">
        <article className="panel system-summary"><span><AppIcon name="system"/></span><small>Application version</small><strong>v{packageInfo.version}</strong><p>{BRAND.productName}</p></article>
        <article className="panel system-summary"><span><AppIcon name="system"/></span><small>Environment</small><strong>{environment}</strong><p>{import.meta.env.PROD ? "Production build is operational" : "Local development build"}</p></article>
        <article className="panel system-summary"><span className={information.connected ? "healthy" : "warning"}><AppIcon name="system"/></span><small>Database</small><strong>{information.connected ? "Connected" : "Unavailable"}</strong><p>Checked through the signed-in Admin session</p></article>
      </section>
      <section className="panel table-panel system-counts"><div className="panel-head"><div><p className="eyebrow">RLS-visible records</p><h2>Usage overview</h2></div><span className="operations-badge">No secrets displayed</span></div><div className="metric-list"><div><span>Total users</span><b>{information.totalUsers}</b></div><div><span>Active users</span><b>{information.activeUsers}</b></div><div><span>Financial records</span><b>{information.totalTransactions}</b></div><div><span>Payables</span><b>{information.totalPayables}</b></div><div><span>Payable payments</span><b>{information.totalPayablePayments}</b></div><div><span>Projects</span><b>{information.totalProjects}</b></div><div><span>Audit records</span><b>{information.totalAuditRecords}</b></div></div></section>
      <section className="panel cleanup-guidance"><div><p className="eyebrow">Production cleanup support</p><h2>Safe test-data cleanup</h2><p>Back up the affected records first, identify explicit record IDs, and use a reviewed transaction. Roles, the Admin account, categories, and accounts must never be removed.</p></div><a className="outline-button" href="/ADMIN_TEST_DATA_CLEANUP.md" target="_blank" rel="noreferrer">Open cleanup procedure</a></section>
    </>}
  </div>;
}
