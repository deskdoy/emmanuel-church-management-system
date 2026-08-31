import { FormEvent, useCallback, useEffect, useState } from "react";
import { auditModules, loadAuditLogs, loadAuditUsers, type AuditLogFilters } from "../services/auditLogs";
import type { AppUser, AuditLog } from "../types";
import { BRAND } from "../branding";

const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const initialFilters = (): AuditLogFilters => ({
  dateFrom: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`,
  dateTo: localDate(new Date()),
  userId: "",
  action: "",
  module: "",
});
const moduleLabel = (name: string) => name.split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
const auditModuleLabel = (log: AuditLog) => log.tableName === "reports" && log.newValues?.report_type === "backup_export" ? "Backup Center" : moduleLabel(log.tableName);
const timestampLabel = (value: string) => new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function JsonValues({ value }: { value: Record<string, unknown> | null }) {
  if (!value) return <span className="audit-empty-value">—</span>;
  return <details className="audit-json"><summary>View values</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>;
}

export function AuditLogsView({churchId}:{churchId:string}) {
  const [draft, setDraft] = useState<AuditLogFilters>(initialFilters);
  const [filters, setFilters] = useState<AuditLogFilters>(initialFilters);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<Pick<AppUser, "id" | "fullName" | "email">[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [nextLogs, nextUsers] = await Promise.all([loadAuditLogs(churchId,filters), loadAuditUsers(churchId)]);
      setLogs(nextLogs); setUsers(nextUsers);
    } catch (cause) {
      setLogs([]);
      setError(cause instanceof Error ? cause.message : "Unable to load audit logs.");
    } finally { setLoading(false); }
  }, [churchId,filters]);

  useEffect(() => { queueMicrotask(() => void refresh()); }, [refresh]);

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft.dateFrom > draft.dateTo) { setError("Start date must be on or before end date."); return; }
    setFilters(draft);
  };
  const clearFilters = () => { const cleared = initialFilters(); setDraft(cleared); setFilters(cleared); };

  return <section className="audit-layout">
    <form className="panel audit-filters" onSubmit={applyFilters}>
      <div className="panel-head"><div><p className="eyebrow">Admin controls</p><h2>Filter activity</h2></div></div>
      <div className="audit-filter-grid">
        <label>Start date<input type="date" value={draft.dateFrom} onChange={event => setDraft(current => ({ ...current, dateFrom: event.target.value }))} required /></label>
        <label>End date<input type="date" value={draft.dateTo} onChange={event => setDraft(current => ({ ...current, dateTo: event.target.value }))} required /></label>
        <label>User<select value={draft.userId} onChange={event => setDraft(current => ({ ...current, userId: event.target.value }))}><option value="">All users</option>{users.map(user => <option key={user.id} value={user.id}>{user.fullName || user.email}</option>)}</select></label>
        <label>Action<select value={draft.action} onChange={event => setDraft(current => ({ ...current, action: event.target.value as AuditLogFilters["action"] }))}><option value="">All actions</option><option value="INSERT">Created</option><option value="UPDATE">Updated</option><option value="DELETE">Deleted</option></select></label>
        <label>Module<select value={draft.module} onChange={event => setDraft(current => ({ ...current, module: event.target.value }))}><option value="">All modules</option>{auditModules.map(module => <option key={module} value={module}>{moduleLabel(module)}</option>)}</select></label>
      </div>
      <div className="audit-filter-actions"><button className="primary-button" type="submit">Apply filters</button><button className="outline-button" type="button" onClick={clearFilters}>Clear</button></div>
    </form>

    <section className="panel table-panel audit-panel">
      <div className="panel-head"><div><p className="eyebrow">Immutable history</p><h2>Audit logs</h2></div><span className="period-button">{logs.length}{logs.length === 500 ? "+" : ""} records</span></div>
      <p className="audit-note">Audit records are read-only and cannot be edited or deleted from {BRAND.productName}.</p>
      {error && <div className="error-banner audit-error" role="alert"><span>{error}</span><button type="button" onClick={() => void refresh()}>Try again</button></div>}
      {loading ? <div className="empty-state audit-loading" role="status"><div className="empty-icon">◷</div><h3>Loading audit history</h3><p>Retrieving secured activity records…</p></div> : !error && <div className="table-wrap audit-table-wrap"><table className="audit-table"><thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Table / module</th><th>Record affected</th><th>Before values</th><th>After values</th></tr></thead><tbody>{logs.map(log => <tr key={log.id}><td className="audit-time">{timestampLabel(log.createdAt)}</td><td><b>{log.actorName || "System / unknown"}</b><small>{log.actorEmail || log.actorUserId || "No user ID"}</small></td><td><span className={`status audit-${log.action.toLowerCase()}`}>{log.action === "INSERT" ? "Created" : log.action === "UPDATE" ? "Updated" : "Deleted"}</span></td><td><b>{auditModuleLabel(log)}</b><small>{log.tableName}</small></td><td><code className="record-id">{log.recordId || "—"}</code></td><td><JsonValues value={log.oldValues} /></td><td><JsonValues value={log.newValues} /></td></tr>)}{!logs.length && <tr><td colSpan={7} className="blank-row">No audit activity matches these filters.</td></tr>}</tbody></table></div>}
    </section>
  </section>;
}
