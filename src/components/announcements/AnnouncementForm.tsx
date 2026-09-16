import { useId, useState, type FormEvent } from "react";
import type { AnnouncementInput, AnnouncementRecord } from "../../services/announcements";
import type { AnnouncementTargetInput } from "../../services/announcementTargets";
import { AnnouncementAudienceEditor } from "./AnnouncementAudienceEditor";
import { useActiveChurch } from "../../tenancy/ActiveChurchContext";
import { hasChurchRole } from "../../tenancy/permissions";
import { announcementManagerRoles, announcementTimeInput, announcementTimeToISO } from "./announcementHelpers";
import "./announcements.css";

export interface AnnouncementFormProps {
  churchId: string;
  announcement?: AnnouncementRecord;
  saving: boolean;
  error?: string;
  onSubmit: (input: AnnouncementInput, targets?: AnnouncementTargetInput[]) => Promise<void>;
  onCancel: () => void;
}
export function AnnouncementForm(props: AnnouncementFormProps) {
  const { activeChurch, activeRole, workspaceMode, scopeVersion } = useActiveChurch();
  if (!props.churchId || activeChurch?.id !== props.churchId || (props.announcement && props.announcement.churchId !== props.churchId)
    || workspaceMode !== "church" || !hasChurchRole(activeRole, announcementManagerRoles)) return null;
  return <DetailsForm key={`${props.churchId}:${props.announcement?.id || "new"}:${activeRole}:${scopeVersion}`} {...props} />;
}
function DetailsForm({ churchId, announcement, saving, error, onSubmit, onCancel }: AnnouncementFormProps) {
  const contentId = useId();
  const [targets, setTargets] = useState<AnnouncementTargetInput[] | undefined>(undefined);
  const [validation, setValidation] = useState("");
  const [initialPublishTime] = useState(() => announcementTimeInput(announcement?.publishAt || new Date().toISOString()));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setValidation("");
    const form = new FormData(event.currentTarget);
    try {
      const title = String(form.get("title") || "").trim(), content = String(form.get("content") || "").trim();
      if (!title || !content) throw new Error("Announcement title and content are required.");
      const publishAt = announcementTimeToISO(String(form.get("publishAt") || ""), announcement?.publishAt);
      const expiry = String(form.get("expiresAt") || "");
      const expiresAt = expiry ? announcementTimeToISO(expiry, announcement?.expiresAt) : null;
      if (expiresAt && Date.parse(expiresAt) < Date.parse(publishAt)) throw new Error("Expiry time must be on or after publish time.");
      void onSubmit({ title, content, publishAt, expiresAt }, targets);
    } catch (cause) { setValidation(cause instanceof Error ? cause.message : "Unable to read announcement details."); }
  };
  return <section className="panel">
    <div className="panel-head"><h2>{announcement ? "Edit announcement" : "New announcement"}</h2></div>
    <form className="record-form" aria-label={announcement ? "Edit announcement" : "New announcement"} aria-busy={saving} onSubmit={submit}>
      {(validation || error) && <div className="error-banner" role="alert">{validation || error}</div>}
      <p className="form-help">Dates and times use your device's local timezone. {announcement ? "Saving keeps the current publication state." : "New announcements are saved as drafts. Publish from the announcement profile."}</p>
      <div className="form-grid">
        <label className="full">Title<input name="title" required disabled={saving} defaultValue={announcement?.title || ""} /></label>
        <div className="full"><label htmlFor={contentId}>Content</label><textarea id={contentId} name="content" rows={6} required disabled={saving} defaultValue={announcement?.content || ""} /></div>
        <label>Publish at<input type="datetime-local" name="publishAt" step="0.001" required disabled={saving} defaultValue={initialPublishTime} /></label>
        <label>Expires at<input type="datetime-local" name="expiresAt" step="0.001" disabled={saving} defaultValue={announcementTimeInput(announcement?.expiresAt)} /></label>
      </div>
      <p className="form-help">Leave expiry blank for no expiration.</p>
      <AnnouncementAudienceEditor churchId={churchId} announcementId={announcement?.id} saving={saving} onChange={setTargets} />
      <div className="row-actions announcement-actions"><button type="button" className="outline-button" disabled={saving} onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving..." : announcement ? "Save changes" : "Save draft"}</button></div>
    </form>
  </section>;
}
