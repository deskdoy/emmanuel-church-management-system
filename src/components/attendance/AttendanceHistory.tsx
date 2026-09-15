import { useEffect, useState } from "react";
import { getFamilyAttendanceHistory, getMemberAttendanceHistory, loadAttendanceByEvent, loadAttendanceRecords, type AttendanceRecord } from "../../services/attendance";
import { useActiveChurch } from "../../tenancy/ActiveChurchContext";
import { EmptyState } from "../ui/EmptyState";
import { LoadingSkeleton } from "../ui/LoadingSkeleton";
import type { AttendanceDirectory } from "./types";
import "./attendance.css";

type Scope = "all" | "event" | "member" | "family";
export interface AttendanceHistoryProps { churchId: string; directory: AttendanceDirectory }

export function AttendanceHistory(props: AttendanceHistoryProps) {
  const { activeChurch, activeRole, workspaceMode, scopeVersion } = useActiveChurch();
  if (!props.churchId || activeChurch?.id !== props.churchId || props.directory.churchId !== props.churchId || !activeRole || workspaceMode !== "church") {
    return <EmptyState title="Choose a church workspace" description="Attendance history must belong to your active church." />;
  }
  return <History key={`${props.churchId}:${activeRole}:${scopeVersion}`} {...props} />;
}

function History({ churchId, directory }: AttendanceHistoryProps) {
  const [scope, setScope] = useState<Scope>("all");
  const [targetId, setTargetId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [result, setResult] = useState<{ key: string; records: AttendanceRecord[]; error: string } | null>(null);
  const [reload, setReload] = useState(0);
  const key = `${scope}:${targetId}`;
  const members = directory.members.filter(row => row.churchId === churchId);
  const events = directory.events.filter(row => row.churchId === churchId);
  const families = directory.families.filter(row => row.churchId === churchId);
  const choices = scope === "event" ? events.map(row => ({ id: row.id, name: row.title }))
    : scope === "member" ? members.map(row => ({ id: row.id, name: row.name }))
    : families.map(row => ({ id: row.id, name: row.name }));
  const validTarget = scope === "all" || choices.some(row => row.id === targetId);
  useEffect(() => {
    let cancelled = false;
    setResult(null);
    if (!validTarget) return;
    const load = scope === "event" ? loadAttendanceByEvent(churchId, targetId)
      : scope === "member" ? getMemberAttendanceHistory(churchId, targetId)
      : scope === "family" ? getFamilyAttendanceHistory(churchId, targetId) : loadAttendanceRecords(churchId);
    void load.then(rows => {
      if (!cancelled) setResult({ key, records: rows.filter(row => row.churchId === churchId), error: "" });
    }).catch(cause => {
      if (!cancelled) setResult({ key, records: [], error: cause instanceof Error ? cause.message : "Unable to load attendance history." });
    });
    return () => { cancelled = true; };
  }, [churchId, scope, targetId, validTarget, key, reload]);
  const current = result?.key === key ? result : null;
  const invalidDates = !!dateFrom && !!dateTo && dateFrom > dateTo;
  const records = (current?.records || []).filter(row => (!dateFrom || row.attendanceDate >= dateFrom) && (!dateTo || row.attendanceDate <= dateTo));

  return <section className="attendance-workspace" aria-label="Attendance history">
    <section className="panel"><div className="panel-head"><h2>Attendance history</h2></div>
      <div className="form-grid">
        <div><label htmlFor="attendance-history-scope">History for</label><select id="attendance-history-scope" value={scope} onChange={event => { setScope(event.target.value as Scope); setTargetId(""); }}>
          <option value="all">All attendance</option><option value="event">Event</option><option value="member">Member</option><option value="family">Family</option>
        </select></div>
        {scope !== "all" && <div><label htmlFor="attendance-history-target">{scope === "event" ? "Event" : scope === "member" ? "Member" : "Family"}</label><select id="attendance-history-target" value={targetId} onChange={event => setTargetId(event.target.value)}>
          <option value="">Select {scope}</option>{choices.map(choice => <option key={choice.id} value={choice.id}>{choice.name}</option>)}
        </select></div>}
        <label>From date<input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} /></label>
        <label>To date<input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} /></label>
      </div>
      {scope === "family" && <p className="form-help">Family history includes attendance of members currently assigned to the selected family.</p>}
    </section>
    {!validTarget ? <section className="panel"><EmptyState title={`Choose a ${scope}`} description={choices.length ? "Select an option to review attendance history." : `No ${scope === "family" ? "families" : `${scope}s`} available in this church.`} /></section>
      : !current ? <section className="panel"><LoadingSkeleton rows={4} label="Loading attendance history" /></section>
      : current.error ? <div className="error-banner" role="alert">{current.error}<button onClick={() => setReload(value => value + 1)}>Try again</button></div>
      : invalidDates ? <div className="error-banner" role="alert">From date must be on or before To date.</div>
      : !records.length ? <section className="panel"><EmptyState title="No attendance records" description="No recorded attendance matches this selection." /></section>
      : <section className="panel table-panel"><div className="table-wrap responsive-table"><table>
        <thead><tr><th>Date</th><th>Member</th><th>Event</th><th>Status</th><th>Notes</th></tr></thead>
        <tbody>{records.map(record => <tr key={record.id}>
          <td data-label="Date">{record.attendanceDate}</td><td data-label="Member">{members.find(member => member.id === record.memberId)?.name || "Member unavailable"}</td>
          <td data-label="Event">{record.eventId ? events.find(event => event.id === record.eventId)?.title || "Event unavailable" : "General attendance"}</td>
          <td data-label="Status">{record.status}</td><td data-label="Notes">{record.notes || "-"}</td>
        </tr>)}</tbody>
      </table></div></section>}
  </section>;
}
