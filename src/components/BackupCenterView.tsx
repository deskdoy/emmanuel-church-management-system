import { useCallback, useEffect, useMemo, useState } from "react";
import { buildBackupCsv, createExportId, downloadBackupCsv, scopeLabel, type BackupDataset, type BackupExportMetadata, type BackupExportScope, type BackupExportType } from "../operations/backupExport";
import { loadBackupDataset, loadExportHistory, recordExportActivity, type ExportHistoryItem } from "../services/operationalManagement";
import type { AppUser } from "../types";
import { AppIcon } from "./ui/AppIcon";
import { EmptyState } from "./ui/EmptyState";
import { BRAND, BRAND_EXPORT_IDENTITY } from "../branding";

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;
const timestamp = (value: string) => new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const choices: { type: BackupExportType; label: string; detail: string }[] = [
  { type: "transactions", label: "Transactions", detail: "Money in and money out entries" },
  { type: "money-in", label: "Money In", detail: "Offerings and donations" },
  { type: "money-out", label: "Money Out", detail: "Expense records" },
  { type: "transfers", label: "Transfers", detail: "Internal account movements" },
  { type: "payables", label: "Payables", detail: "Commitments and balances" },
  { type: "payable-payments", label: "Payable Payments", detail: "Immutable payment history" },
  { type: "users", label: "Users", detail: "Profiles, roles, and status" },
  { type: "projects", label: "Projects", detail: "Project planning records" },
  { type: "audit-logs", label: "Audit Logs", detail: "Secured activity history" },
];

export function BackupCenterView({ churchId,profile }: { churchId:string;profile: AppUser }) {
  const [type, setType] = useState<BackupExportType>("transactions");
  const [scope, setScope] = useState<BackupExportScope>({ allRecords: false, dateFrom: monthStart(), dateTo: today() });
  const [dataset, setDataset] = useState<BackupDataset | null>(null);
  const [metadata, setMetadata] = useState<BackupExportMetadata | null>(null);
  const [history, setHistory] = useState<ExportHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState("");

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    try { setHistory(await loadExportHistory(churchId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load export history."); }
    finally { setHistoryLoading(false); }
  }, [churchId]);
  useEffect(() => { queueMicrotask(() => void refreshHistory()); }, [refreshHistory]);

  const generate = async () => {
    setLoading(true); setError(""); setDataset(null); setMetadata(null);
    try {
      const nextDataset = await loadBackupDataset(churchId,type, scope);
      const nextMetadata: BackupExportMetadata = { exportId: createExportId(), organization: BRAND_EXPORT_IDENTITY, generatedAt: new Date().toISOString(), generatedBy: profile.fullName || profile.email, scopeLabel: scopeLabel(scope) };
      await recordExportActivity(churchId,nextDataset, nextMetadata, scope);
      setDataset(nextDataset); setMetadata(nextMetadata);
      await refreshHistory();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to generate this export."); }
    finally { setLoading(false); }
  };

  const previewRows = useMemo(() => dataset?.rows.slice(0, 25) || [], [dataset]);
  if (profile.role !== "Admin") return null;

  return <div className="operations-layout backup-center">
    <section className="panel backup-controls no-print">
      <div className="panel-head"><div><p className="eyebrow">Admin-only data portability</p><h2>Create a secure export</h2></div><span className="operations-badge"><AppIcon name="backup" size={17}/>Browser generated</span></div>
      <p className="operations-note">Exports are built in this browser and are not stored permanently. Generating an export creates metadata and an immutable audit event.</p>
      <div className="backup-choice-grid" role="radiogroup" aria-label="Export type">{choices.map(choice => <button type="button" key={choice.type} className={type === choice.type ? "selected" : ""} role="radio" aria-checked={type === choice.type} onClick={() => { setType(choice.type); setDataset(null); setMetadata(null); }}><b>{choice.label}</b><small>{choice.detail}</small></button>)}</div>
      <div className="backup-scope">
        <label className="scope-toggle"><input type="checkbox" checked={scope.allRecords} onChange={event => setScope(current => ({ ...current, allRecords: event.target.checked }))}/><span>Export all available records</span></label>
        <div className="date-pair"><label>Start date<input type="date" value={scope.dateFrom} disabled={scope.allRecords} onChange={event => setScope(current => ({ ...current, dateFrom: event.target.value }))}/></label><label>End date<input type="date" value={scope.dateTo} disabled={scope.allRecords} max={today()} onChange={event => setScope(current => ({ ...current, dateTo: event.target.value }))}/></label></div>
      </div>
      {error && <div className="error-banner" role="alert"><span>{error}</span></div>}
      <button className="primary-button backup-generate" type="button" disabled={loading} onClick={() => void generate()}>{loading ? <><span className="inline-spinner"/>Preparing secure export…</> : <><AppIcon name="backup" size={17}/>Generate export</>}</button>
    </section>

    {dataset && metadata ? <section className="panel backup-preview">
      <div className="panel-head no-print"><div><p className="eyebrow">Export ready</p><h2>{dataset.title}</h2></div><div className="row-actions"><button className="outline-button" type="button" onClick={() => downloadBackupCsv(dataset, metadata)}>Download CSV</button><button className="primary-button" type="button" onClick={() => window.print()}>Print summary</button></div></div>
      <article className="backup-print-sheet">
        <header><div><p>{BRAND.productName}</p><small>{BRAND.subtitle}</small><h2>{dataset.title} Backup Summary</h2></div><span>Export ID<br/><b>{metadata.exportId}</b></span></header>
        <dl><div><dt>Scope</dt><dd>{metadata.scopeLabel}</dd></div><div><dt>Generated</dt><dd>{timestamp(metadata.generatedAt)}</dd></div><div><dt>Generated by</dt><dd>{metadata.generatedBy}</dd></div><div><dt>Records</dt><dd>{dataset.rows.length}</dd></div></dl>
        <p className="print-summary-note">This printable summary shows up to 25 records. The CSV contains the complete generated dataset and matching Export ID.</p>
        <div className="table-wrap"><table><thead><tr>{dataset.headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{previewRows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((value, valueIndex) => <td key={valueIndex}>{value === null || value === "" ? "—" : String(value)}</td>)}</tr>)}{!previewRows.length && <tr><td colSpan={dataset.headers.length} className="blank-row">No records matched this export scope.</td></tr>}</tbody></table></div>
      </article>
    </section> : <section className="panel backup-preview no-print"><EmptyState title="Choose and generate an export" description="A preview, Export ID, CSV download, and printable summary will appear here after the export is securely audited."/></section>}

    <section className="panel table-panel export-history no-print">
      <div className="panel-head"><div><p className="eyebrow">Existing report metadata</p><h2>Export history</h2></div><button className="table-action" type="button" disabled={historyLoading} onClick={() => void refreshHistory()}>Refresh</button></div>
      {historyLoading ? <div className="empty-state audit-loading" role="status"><div className="empty-icon">◷</div><h3>Loading export history</h3><p>Reading secured report metadata…</p></div> : <div className="table-wrap responsive-table"><table><thead><tr><th>Export ID</th><th>Type</th><th>Scope</th><th>Records</th><th>Generated by</th><th>Generated</th></tr></thead><tbody>{history.map(item => <tr key={item.id}><td data-label="Export ID"><code className="record-id">{item.exportId}</code></td><td data-label="Type"><b>{item.exportType}</b></td><td data-label="Scope">{item.scope}</td><td data-label="Records">{item.recordCount}</td><td data-label="Generated by">{item.generatedBy}</td><td data-label="Generated">{timestamp(item.generatedAt)}</td></tr>)}{!history.length && <tr><td className="blank-row" colSpan={6}>No exports have been generated yet.</td></tr>}</tbody></table></div>}
    </section>
  </div>;
}

// Kept exported for focused unit coverage without invoking a browser download.
export { buildBackupCsv };
