import { useEffect, useRef, useState } from "react";
import { createEvent, loadEvents, type EventRecord, type EventInput } from "../../services/events";
import { useActiveChurch } from "../../tenancy/ActiveChurchContext";
import { hasChurchRole } from "../../tenancy/permissions";
import type { RoleName } from "../../types";
import { EmptyState } from "../ui/EmptyState";
import { LoadingSkeleton } from "../ui/LoadingSkeleton";
import { EventForm } from "./EventForm";
import { EventProfile } from "./EventProfile";
import { EventCalendar } from "./EventCalendar";
import { displayEventTime, eventManagerRoles } from "./eventHelpers";
import "./events.css";

export function EventView({ churchId }: { churchId: string }) {
  const { activeChurch, activeRole, workspaceMode, scopeVersion } = useActiveChurch();
  if (!churchId || activeChurch?.id !== churchId || !activeRole || workspaceMode !== "church") {
    return <section className="panel"><EmptyState title="Choose a church workspace" description="Open events from your active church workspace." /></section>;
  }
  return <Workspace key={`${churchId}:${activeRole}:${scopeVersion}`} churchId={churchId} role={activeRole} />;
}
function Workspace({ churchId, role }: { churchId: string; role: RoleName }) {
  const canManage = hasChurchRole(role, eventManagerRoles);
  const [events, setEvents] = useState<EventRecord[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [layout, setLayout] = useState<"list" | "calendar">("list");
  const alive = useRef(true), busy = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    setEvents(null); setLoadError("");
    void loadEvents(churchId).then(rows => { if (!cancelled) setEvents(rows.filter(row => row.churchId === churchId)); })
      .catch(cause => { if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "Unable to load events."); });
    return () => { cancelled = true; };
  }, [churchId, reload]);
  const create = async (input: EventInput) => {
    if (!canManage || busy.current) return;
    busy.current = true; setSaving(true); setError("");
    try {
      const event = await createEvent(churchId, input);
      if (alive.current) { setEvents(rows => [...(rows || []), event]); setCreating(false); setSelectedId(event.id); }
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "Unable to create event."); }
    finally { busy.current = false; if (alive.current) setSaving(false); }
  };
  const selected = events?.find(event => event.id === selectedId && event.churchId === churchId);
  if (selected) return <EventProfile churchId={churchId} event={selected} onBack={() => setSelectedId("")}
    onEventChange={event => setEvents(rows => (rows || []).map(row => row.id === event.id ? event : row))}
    onDeleted={() => { setEvents(rows => (rows || []).filter(row => row.id !== selected.id)); setSelectedId(""); setNotice("Event deleted."); }} />;
  const open = (event: EventRecord) => { if (!creating && event.churchId === churchId) { setSelectedId(event.id); setNotice(""); } };
  return <section className="event-workspace" aria-label="Events">
    <section className="panel"><div className="panel-head"><div><p className="eyebrow">Church community</p><h2>Events</h2><p className="section-copy">Plan church events and review event attendance.</p></div>
      {canManage && !creating && <button className="primary-button" disabled={!events || !!loadError} onClick={() => { setCreating(true); setError(""); setNotice(""); }}>New event</button>}</div>
      {!canManage && <p className="form-help">Read-only access. Admin, Pastor, and Secretary can manage events.</p>}
      <div className="row-actions event-actions"><button className="outline-button" aria-pressed={layout === "list"} disabled={creating} onClick={() => setLayout("list")}>Event list</button>
        <button className="outline-button" aria-pressed={layout === "calendar"} disabled={creating} onClick={() => setLayout("calendar")}>Calendar</button>
        <button className="outline-button" disabled={creating} onClick={() => setReload(value => value + 1)}>Refresh events</button></div>
    </section>
    {notice && <div className="form-success" role="status">{notice}</div>}
    {creating && <EventForm churchId={churchId} saving={saving} error={error} onSubmit={create} onCancel={() => setCreating(false)} />}
    {loadError ? <div className="error-banner" role="alert">{loadError}<button onClick={() => setReload(value => value + 1)}>Try again</button></div>
      : !events ? <section className="panel"><LoadingSkeleton rows={4} label="Loading events" /></section>
      : layout === "calendar" ? <EventCalendar churchId={churchId} events={events} onSelect={open} disabled={creating} />
      : !events.length ? <section className="panel"><EmptyState title="No events yet" description={canManage ? "Create an event to begin planning." : "Events will appear here when your church creates them."} /></section>
      : <div className="project-grid">{events.map(event => <article className="project-card" key={event.id}><h3>{event.title}</h3><p>{displayEventTime(event.startsAt)}</p><p>{event.location || "Location not specified"}</p>
        <button className="outline-button" disabled={creating} onClick={() => open(event)}>View event</button></article>)}</div>}
  </section>;
}
