import { useEffect, useRef, useState } from "react";
import { createAnnouncement, getActiveAnnouncements, loadAnnouncements, type AnnouncementInput, type AnnouncementRecord } from "../../services/announcements";
import { useActiveChurch } from "../../tenancy/ActiveChurchContext";
import { hasChurchRole } from "../../tenancy/permissions";
import type { RoleName } from "../../types";
import { EmptyState } from "../ui/EmptyState";
import { LoadingSkeleton } from "../ui/LoadingSkeleton";
import { AnnouncementForm } from "./AnnouncementForm";
import { AnnouncementProfile } from "./AnnouncementProfile";
import { announcementManagerRoles, displayAnnouncementTime } from "./announcementHelpers";
import "./announcements.css";

type Filter = "all" | "active";
export function AnnouncementView({ churchId }: { churchId: string }) {
  const { activeChurch, activeRole, workspaceMode, scopeVersion } = useActiveChurch();
  if (!churchId || activeChurch?.id !== churchId || !activeRole || workspaceMode !== "church") {
    return <section className="panel"><EmptyState title="Choose a church workspace" description="Open announcements from your active church workspace." /></section>;
  }
  return <Workspace key={`${churchId}:${activeRole}:${scopeVersion}`} churchId={churchId} role={activeRole} />;
}
function Workspace({ churchId, role }: { churchId: string; role: RoleName }) {
  const canManage = hasChurchRole(role, announcementManagerRoles);
  const [filter, setFilter] = useState<Filter>("all");
  const [result, setResult] = useState<{ filter: Filter; rows: AnnouncementRecord[]; error: string } | null>(null);
  const [reload, setReload] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const alive = useRef(true), busy = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    setResult(null);
    const load = filter === "active" ? getActiveAnnouncements(churchId) : loadAnnouncements(churchId);
    void load.then(rows => { if (!cancelled) setResult({ filter, rows: rows.filter(row => row.churchId === churchId), error: "" }); })
      .catch(cause => { if (!cancelled) setResult({ filter, rows: [], error: cause instanceof Error ? cause.message : "Unable to load announcements." }); });
    return () => { cancelled = true; };
  }, [churchId, filter, reload]);
  const current = result?.filter === filter ? result : null;
  const create = async (input: AnnouncementInput) => {
    if (!canManage || busy.current) return;
    busy.current = true; setSaving(true); setError("");
    try {
      const announcement = await createAnnouncement(churchId, input);
      if (alive.current) { setResult(previous => ({ filter, rows: [...(previous?.rows || []), announcement], error: "" })); setCreating(false); setSelectedId(announcement.id); }
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "Unable to create announcement."); }
    finally { busy.current = false; if (alive.current) setSaving(false); }
  };
  const back = () => { setSelectedId(""); setResult(null); setReload(value => value + 1); };
  const selected = current?.rows.find(row => row.id === selectedId && row.churchId === churchId);
  if (selected) return <AnnouncementProfile churchId={churchId} announcement={selected} onBack={back}
    onAnnouncementChange={announcement => setResult(previous => previous ? { ...previous, rows: previous.rows.map(row => row.id === announcement.id ? announcement : row) } : previous)}
    onDeleted={() => { back(); setNotice("Announcement deleted."); }} />;
  return <section className="announcement-workspace" aria-label="Announcements">
    <section className="panel"><div className="panel-head"><div><p className="eyebrow">Church community</p><h2>Announcements</h2><p className="section-copy">Share church news and manage announcement schedules.</p></div>
      {canManage && !creating && <button className="primary-button" disabled={!current || !!current.error} onClick={() => { setCreating(true); setError(""); setNotice(""); }}>New announcement</button>}</div>
      {!canManage && <p className="form-help">Read-only access. Admin, Pastor, and Secretary can manage announcements.</p>}
      <div className="row-actions announcement-actions"><button className="outline-button" disabled={creating} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All announcements</button>
        <button className="outline-button" disabled={creating} aria-pressed={filter === "active"} onClick={() => setFilter("active")}>Active announcements</button>
        <button className="outline-button" disabled={creating} onClick={() => setReload(value => value + 1)}>Refresh announcements</button></div>
      {filter === "active" && <p className="form-help">Published announcements within their schedule at the last refresh.</p>}
    </section>
    {notice && <div className="form-success" role="status">{notice}</div>}
    {creating && <AnnouncementForm churchId={churchId} saving={saving} error={error} onSubmit={create} onCancel={() => setCreating(false)} />}
    {!current ? <section className="panel"><LoadingSkeleton rows={4} label="Loading announcements" /></section>
      : current.error ? <div className="error-banner" role="alert">{current.error}<button onClick={() => setReload(value => value + 1)}>Try again</button></div>
      : !current.rows.length ? <section className="panel"><EmptyState title={filter === "active" ? "No active announcements" : "No announcements yet"} description={filter === "active" ? "No published announcements match the current schedule." : canManage ? "Create a draft to begin sharing church news." : "Announcements will appear here when your church creates them."} /></section>
      : <div className="project-grid">{current.rows.map(announcement => <article className="project-card" key={announcement.id}>
        <p className="eyebrow">{announcement.isPublished ? "Published" : "Draft"}</p><h3>{announcement.title}</h3><p className="announcement-preview">{announcement.content}</p><p>Publish at {displayAnnouncementTime(announcement.publishAt)}</p>
        <button className="outline-button" disabled={creating} onClick={() => { setSelectedId(announcement.id); setNotice(""); }}>View announcement</button>
      </article>)}</div>}
  </section>;
}
