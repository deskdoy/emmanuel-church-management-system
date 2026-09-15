import { useEffect, useState } from "react";
import { loadAttendanceByEvent, loadAttendanceRecords, recordAttendance, updateAttendance, type AttendanceRecord, type AttendanceStatus } from "../../services/attendance";
import { useActiveChurch } from "../../tenancy/ActiveChurchContext";
import { hasChurchRole } from "../../tenancy/permissions";
import { EmptyState } from "../ui/EmptyState";
import { LoadingSkeleton } from "../ui/LoadingSkeleton";
import { attendanceStatuses, attendanceWriterRoles, type AttendanceDirectory, type AttendanceMember, type AttendanceSession } from "./types";
import "./attendance.css";

export interface AttendanceRegisterProps {
  churchId: string;
  directory: AttendanceDirectory;
  session: AttendanceSession;
  onSavingChange?: (saving: boolean) => void;
}

export function AttendanceRegister(props: AttendanceRegisterProps) {
  const { activeChurch, activeRole, workspaceMode, scopeVersion } = useActiveChurch();
  if (!props.churchId || activeChurch?.id !== props.churchId || props.directory.churchId !== props.churchId || !activeRole || workspaceMode !== "church") {
    return <EmptyState title="Choose a church workspace" description="Attendance must belong to your active church." />;
  }
  return <Register key={`${props.churchId}:${activeRole}:${scopeVersion}:${props.session.eventId}:${props.session.attendanceDate}`} {...props} canWrite={hasChurchRole(activeRole, attendanceWriterRoles)} />;
}

function Register({ churchId, directory, session, onSavingChange, canWrite }: AttendanceRegisterProps & { canWrite: boolean }) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [familyId, setFamilyId] = useState("");
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const members = directory.members.filter(member => member.churchId === churchId);
  const families = directory.families.filter(family => family.churchId === churchId);
  const event = directory.events.find(event => event.id === session.eventId && event.churchId === churchId);
  const validSession = !!session.attendanceDate && (!session.eventId || !!event);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setLoadError("");
    if (!validSession) { setLoadError("Choose a valid attendance session for this church."); setLoading(false); return; }
    const load = session.eventId ? loadAttendanceByEvent(churchId, session.eventId) : loadAttendanceRecords(churchId);
    void load.then(rows => {
      if (!cancelled) setRecords(rows.filter(row => row.churchId === churchId && row.eventId === session.eventId && row.attendanceDate === session.attendanceDate));
    }).catch(cause => {
      if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "Unable to load attendance register.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [churchId, session.eventId, session.attendanceDate, validSession, reload]);

  const save = async (member: AttendanceMember, status: AttendanceStatus, notes: string, record?: AttendanceRecord) => {
    if (!canWrite || savingId || loading || loadError || !validSession || !attendanceStatuses.includes(status) || member.churchId !== churchId) return;
    setSavingId(member.id); onSavingChange?.(true); setError(""); setNotice("");
    try {
      const result = record
        ? await updateAttendance(churchId, record.id, { status, notes })
        : await recordAttendance(churchId, { memberId: member.id, eventId: session.eventId, attendanceDate: session.attendanceDate, status, notes });
      setRecords(rows => [...rows.filter(row => row.id !== result.id), result]);
      setNotice(`Attendance saved for ${member.name}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save attendance."); }
    finally { setSavingId(null); onSavingChange?.(false); }
  };
  const visible = members.filter(member => (!familyId || (familyId === "unassigned" ? !member.familyId : member.familyId === familyId))
    && `${member.name} ${member.memberNumber || ""}`.toLowerCase().includes(search.trim().toLowerCase()));

  return <section className="attendance-workspace" aria-label="Session register">
    <section className="panel"><div className="panel-head"><div><h2>{event?.title || "General attendance"}</h2><p>{session.attendanceDate}</p></div></div>
      {!canWrite && <p className="form-help">Read-only access. Admin, Pastor, Secretary, and Encoder can record attendance.</p>}
      <p className="form-help">Unrecorded members remain unrecorded until a status is selected and saved.</p>
    </section>
    {notice && <div className="form-success" role="status">{notice}</div>}
    {error && <div className="error-banner" role="alert">{error}</div>}
    {loading ? <section className="panel"><LoadingSkeleton rows={4} label="Loading attendance register" /></section>
      : loadError ? <div className="error-banner" role="alert">{loadError}<button onClick={() => setReload(value => value + 1)}>Try again</button></div>
      : !members.length ? <section className="panel"><EmptyState title="No members available" description="Add church members before recording attendance." /></section>
      : <><section className="panel"><div className="form-grid">
        <label>Search members<input value={search} disabled={!!savingId} onChange={event => setSearch(event.target.value)} placeholder="Name or member number" /></label>
        <div><label htmlFor="register-family">Family filter</label><select id="register-family" value={familyId} disabled={!!savingId} onChange={event => setFamilyId(event.target.value)}>
          <option value="">All families</option><option value="unassigned">No family</option>
          {families.map(family => <option key={family.id} value={family.id}>{family.name}</option>)}
        </select></div>
      </div></section>
      {!visible.length ? <section className="panel"><EmptyState title="No matching members" description="Change the member search or family filter." /></section>
        : visible.map(member => {
          const matches = records.filter(record => record.memberId === member.id);
          return <RegisterMember key={`${member.id}:${matches[0]?.id || "new"}`} member={member} records={matches} canWrite={canWrite} saving={!!savingId} onSave={save} />;
        })}</>}
  </section>;
}

function RegisterMember({ member, records, canWrite, saving, onSave }: {
  member: AttendanceMember; records: AttendanceRecord[]; canWrite: boolean; saving: boolean;
  onSave: (member: AttendanceMember, status: AttendanceStatus, notes: string, record?: AttendanceRecord) => Promise<void>;
}) {
  const record = records[0];
  const [status, setStatus] = useState<AttendanceStatus | "">(record?.status || "");
  const [notes, setNotes] = useState(record?.notes || "");
  return <article className="panel">
    <div className="panel-head"><div><h3>{member.name}</h3><p className="form-help">{member.memberNumber || "No member number"}</p></div><span className="status">{record?.status || "Not recorded"}</span></div>
    {records.length > 1 ? <p role="alert">Multiple attendance records exist for this member and session. Review them in Attendance history.</p>
      : canWrite ? <form className="record-form" aria-label={`${member.name} attendance`} onSubmit={event => { event.preventDefault(); if (status) void onSave(member, status, notes, record); }}>
        <div className="form-grid">
          <div><label htmlFor={`status-${member.id}`}>Status</label><select id={`status-${member.id}`} required value={status} disabled={saving} onChange={event => setStatus(event.target.value as AttendanceStatus | "")}>
            <option value="">Select status</option>{attendanceStatuses.map(value => <option key={value} value={value}>{value}</option>)}
          </select></div>
          <label>Notes<input value={notes} disabled={saving} onChange={event => setNotes(event.target.value)} /></label>
        </div><div className="row-actions"><button className="primary-button" disabled={saving || !status}>{record ? "Update attendance" : "Save attendance"}</button></div>
      </form> : <p>{record?.notes || "No attendance notes."}</p>}
  </article>;
}
