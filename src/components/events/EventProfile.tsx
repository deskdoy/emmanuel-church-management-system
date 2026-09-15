import { useEffect, useRef, useState } from "react";
import { deleteEvent, loadEventAttendance, updateEvent, type EventRecord, type EventInput } from "../../services/events";
import type { AttendanceRecord } from "../../services/attendance";
import { getSupabase } from "../../lib/supabase";
import { useActiveChurch } from "../../tenancy/ActiveChurchContext";
import { hasChurchRole } from "../../tenancy/permissions";
import type { RoleName } from "../../types";
import { EmptyState } from "../ui/EmptyState";
import { LoadingSkeleton } from "../ui/LoadingSkeleton";
import { EventForm } from "./EventForm";
import { displayEventTime, eventManagerRoles } from "./eventHelpers";
import "./events.css";

export interface EventProfileProps { churchId: string; event: EventRecord; onBack: () => void; onEventChange: (event: EventRecord) => void; onDeleted: () => void }
export function EventProfile(props: EventProfileProps) {
  const { activeChurch, activeRole, workspaceMode, scopeVersion } = useActiveChurch();
  if (!props.churchId || activeChurch?.id !== props.churchId || props.event.churchId !== props.churchId || !activeRole || workspaceMode !== "church") {
    return <EmptyState title="Choose a church workspace" description="This event must belong to your active church." />;
  }
  return <Profile key={`${props.churchId}:${props.event.id}:${activeRole}:${scopeVersion}`} {...props} role={activeRole} />;
}
function Profile({ churchId, event, onBack, onEventChange, onDeleted, role }: EventProfileProps & { role: RoleName }) {
  const canManage = hasChurchRole(role, eventManagerRoles);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [attendance, setAttendance] = useState<{ records: AttendanceRecord[]; names: Map<string, string> } | null>(null);
  const [loadError, setLoadError] = useState("");
  const alive = useRef(true), busy = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    setAttendance(null); setLoadError("");
    const load = async () => {
      const [records, members] = await Promise.all([
        loadEventAttendance(churchId, event.id),
        getSupabase().from("members").select("id,church_id,first_name,middle_name,last_name").eq("church_id", churchId),
      ]);
      if (members.error) throw new Error(`Unable to load member names: ${members.error.message}`);
      if (!cancelled) setAttendance({ records: records.filter(row => row.churchId === churchId && row.eventId === event.id),
        names: new Map((members.data || []).filter(row => row.church_id === churchId).map(row => [row.id, [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" ")])) });
    };
    void load().catch(cause => { if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "Unable to load event attendance."); });
    return () => { cancelled = true; };
  }, [churchId, event.id, reload]);
  const save = async (input: EventInput) => {
    if (!canManage || busy.current) return;
    busy.current = true; setSaving(true); setError(""); setNotice("");
    try {
      const updated = await updateEvent(churchId, event.id, input);
      if (alive.current) { onEventChange(updated); setEditing(false); setNotice("Event updated."); }
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "Unable to update event."); }
    finally { busy.current = false; if (alive.current) setSaving(false); }
  };
  const remove = async () => {
    if (!canManage || busy.current || !window.confirm(`Delete event "${event.title}" and all its attendance records? This cannot be undone.`)) return;
    busy.current = true; setSaving(true); setError(""); setNotice("");
    try { await deleteEvent(churchId, event.id); if (alive.current) onDeleted(); }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "Unable to delete event."); }
    finally { busy.current = false; if (alive.current) setSaving(false); }
  };
  return <section className="event-workspace" aria-label="Event profile">
    <section className="panel"><div className="panel-head"><div><p className="eyebrow">Event profile</p><h2>{event.title}</h2></div>
      <div className="row-actions event-actions"><button className="outline-button" disabled={saving} onClick={onBack}>Back to events</button>
        {canManage && !editing && <><button className="outline-button" disabled={saving} onClick={() => { setError(""); setEditing(true); }}>Edit event</button><button className="outline-button" disabled={saving} onClick={() => void remove()}>Delete event</button></>}
      </div></div>
      <dl className="event-details"><div><dt>Starts</dt><dd>{displayEventTime(event.startsAt)}</dd></div><div><dt>Ends</dt><dd>{event.endsAt ? displayEventTime(event.endsAt) : "Not specified"}</dd></div>
        <div><dt>Location</dt><dd>{event.location || "Not specified"}</dd></div><div><dt>Capacity</dt><dd>{event.capacity ?? "No capacity limit"}</dd></div></dl>
      <p className="event-description">{event.description || "No description yet."}</p><p className="form-help">Times are shown in your device's local timezone.</p>
      {!canManage && <p className="form-help">Read-only access. Admin, Pastor, and Secretary can manage events.</p>}
    </section>
    {notice && <div className="form-success" role="status">{notice}</div>}
    {error && !editing && <div className="error-banner" role="alert">{error}</div>}
    {editing && <EventForm churchId={churchId} event={event} saving={saving} error={error} onSubmit={save} onCancel={() => { setEditing(false); setError(""); }} />}
    <section className="panel" aria-label="Event attendance"><div className="panel-head"><h3>Event attendance</h3><button className="outline-button" disabled={saving} onClick={() => setReload(value => value + 1)}>Refresh attendance</button></div>
      {loadError ? <div className="error-banner" role="alert">{loadError}<button onClick={() => setReload(value => value + 1)}>Try again</button></div>
        : !attendance ? <LoadingSkeleton rows={3} label="Loading event attendance" />
        : !attendance.records.length ? <EmptyState title="No attendance recorded" description="Attendance will appear here when it is recorded for this event." />
        : <div className="table-wrap responsive-table"><table><thead><tr><th>Member</th><th>Date</th><th>Status</th><th>Notes</th></tr></thead>
          <tbody>{attendance.records.map(row => <tr key={row.id}><td data-label="Member">{attendance.names.get(row.memberId) || "Member unavailable"}</td><td data-label="Date">{row.attendanceDate}</td><td data-label="Status">{row.status}</td><td data-label="Notes">{row.notes || "-"}</td></tr>)}</tbody>
        </table></div>}
    </section>
  </section>;
}
