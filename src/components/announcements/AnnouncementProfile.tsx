import { useEffect, useRef, useState } from "react";
import { deleteAnnouncement, publishAnnouncement, updateAnnouncement, type AnnouncementInput, type AnnouncementRecord } from "../../services/announcements";
import { useActiveChurch } from "../../tenancy/ActiveChurchContext";
import { hasChurchRole } from "../../tenancy/permissions";
import type { RoleName } from "../../types";
import { EmptyState } from "../ui/EmptyState";
import { AnnouncementForm } from "./AnnouncementForm";
import { announcementManagerRoles, displayAnnouncementTime } from "./announcementHelpers";
import "./announcements.css";

export interface AnnouncementProfileProps {
  churchId: string;
  announcement: AnnouncementRecord;
  onBack: () => void;
  onAnnouncementChange: (announcement: AnnouncementRecord) => void;
  onDeleted: () => void;
}
export function AnnouncementProfile(props: AnnouncementProfileProps) {
  const { activeChurch, activeRole, workspaceMode, scopeVersion } = useActiveChurch();
  if (!props.churchId || activeChurch?.id !== props.churchId || props.announcement.churchId !== props.churchId || !activeRole || workspaceMode !== "church") {
    return <EmptyState title="Choose a church workspace" description="This announcement must belong to your active church." />;
  }
  return <Profile key={`${props.churchId}:${props.announcement.id}:${activeRole}:${scopeVersion}`} {...props} role={activeRole} />;
}
function Profile({ churchId, announcement, onBack, onAnnouncementChange, onDeleted, role }: AnnouncementProfileProps & { role: RoleName }) {
  const canManage = hasChurchRole(role, announcementManagerRoles);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const alive = useRef(true), busy = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const save = async (input: AnnouncementInput) => {
    if (!canManage || busy.current) return;
    busy.current = true; setSaving(true); setError(""); setNotice("");
    try {
      const updated = await updateAnnouncement(churchId, announcement.id, input);
      if (alive.current) { onAnnouncementChange(updated); setEditing(false); setNotice("Announcement updated."); }
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "Unable to update announcement."); }
    finally { busy.current = false; if (alive.current) setSaving(false); }
  };
  const publish = async () => {
    if (!canManage || busy.current || announcement.isPublished) return;
    busy.current = true; setSaving(true); setError(""); setNotice("");
    try {
      const updated = await publishAnnouncement(churchId, announcement.id);
      if (alive.current) { onAnnouncementChange(updated); setNotice("Announcement published. Its publish and expiry schedule is unchanged."); }
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "Unable to publish announcement."); }
    finally { busy.current = false; if (alive.current) setSaving(false); }
  };
  const remove = async () => {
    if (!canManage || busy.current || !window.confirm(`Delete announcement "${announcement.title}"? This cannot be undone.`)) return;
    busy.current = true; setSaving(true); setError(""); setNotice("");
    try { await deleteAnnouncement(churchId, announcement.id); if (alive.current) onDeleted(); }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "Unable to delete announcement."); }
    finally { busy.current = false; if (alive.current) setSaving(false); }
  };
  return <section className="announcement-workspace" aria-label="Announcement profile">
    <section className="panel"><div className="panel-head"><div><p className="eyebrow">{announcement.isPublished ? "Published" : "Draft"}</p><h2>{announcement.title}</h2></div>
      <div className="row-actions announcement-actions"><button className="outline-button" disabled={saving} onClick={onBack}>Back to announcements</button>
        {canManage && !editing && <><button className="outline-button" disabled={saving} onClick={() => { setError(""); setEditing(true); }}>Edit announcement</button>
          {!announcement.isPublished && <button className="primary-button" disabled={saving} onClick={() => void publish()}>Publish announcement</button>}
          <button className="outline-button" disabled={saving} onClick={() => void remove()}>Delete announcement</button></>}
      </div></div>
      <p className="announcement-content">{announcement.content}</p>
      <dl className="announcement-details"><div><dt>Publish at</dt><dd>{displayAnnouncementTime(announcement.publishAt)}</dd></div><div><dt>Expires at</dt><dd>{announcement.expiresAt ? displayAnnouncementTime(announcement.expiresAt) : "No expiration"}</dd></div>
        <div><dt>Created</dt><dd>{displayAnnouncementTime(announcement.createdAt)}</dd></div><div><dt>Updated</dt><dd>{displayAnnouncementTime(announcement.updatedAt)}</dd></div></dl>
      <p className="form-help">Times use your device's local timezone. Publishing preserves this schedule. Published announcements are active from their publish time until expiry.</p>
      {!canManage && <p className="form-help">Read-only access. Admin, Pastor, and Secretary can manage announcements.</p>}
    </section>
    {notice && <div className="form-success" role="status">{notice}</div>}
    {error && !editing && <div className="error-banner" role="alert">{error}</div>}
    {editing && <AnnouncementForm churchId={churchId} announcement={announcement} saving={saving} error={error} onSubmit={save} onCancel={() => { setEditing(false); setError(""); }} />}
  </section>;
}
