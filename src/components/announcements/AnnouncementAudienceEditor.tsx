import { useEffect, useId, useRef, useState } from "react";
import { getTargetRecipients, loadAnnouncementTargets, type AnnouncementRecipient, type AnnouncementTargetInput, type AnnouncementTargetType } from "../../services/announcementTargets";
import { EmptyState } from "../ui/EmptyState";
import { LoadingSkeleton } from "../ui/LoadingSkeleton";
import { audienceKey, loadAudienceOptions, type AudienceOptions } from "./announcementAudience";

export function AnnouncementAudienceEditor({ churchId, announcementId, saving, onChange }: {
  churchId: string; announcementId?: string; saving: boolean; onChange: (targets: AnnouncementTargetInput[]) => void;
}) {
  const audienceId = useId(), targetSelectId = useId();
  const [targets, setTargets] = useState<AnnouncementTargetInput[]>([]);
  const [options, setOptions] = useState<AudienceOptions | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [type, setType] = useState<AnnouncementTargetType>("All");
  const [targetId, setTargetId] = useState("");
  const [preview, setPreview] = useState<AnnouncementRecipient[] | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const request = useRef(0), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current++; }; }, []);
  useEffect(() => {
    let cancelled = false;
    setOptions(null); setError("");
    void Promise.all([loadAudienceOptions(churchId), announcementId ? loadAnnouncementTargets(churchId, announcementId) : Promise.resolve([])])
      .then(([choices, rows]) => {
        if (cancelled) return;
        setTargets(rows.filter(row => row.churchId === churchId && row.announcementId === announcementId)
          .map(row => ({ targetType: row.targetType, targetId: row.targetId }) as AnnouncementTargetInput));
        setOptions(choices);
      }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load announcement audience."); });
    return () => { cancelled = true; };
  }, [churchId, announcementId, reload]);
  const change = (next: AnnouncementTargetInput[]) => {
    request.current++; setPreview(null); setPreviewError(""); setPreviewing(false);
    setTargets(next); onChange(next);
  };
  const selected: AnnouncementTargetInput = type === "All" ? { targetType: "All", targetId: null } : { targetType: type, targetId };
  const duplicate = targets.some(target => audienceKey(target) === audienceKey(selected));
  const label = (target: AnnouncementTargetInput) => target.targetType === "All" ? "All"
    : `${target.targetType}: ${options?.[target.targetType].find(option => option.id === target.targetId)?.label || "Unavailable target"}`;
  const showPreview = async () => {
    if (saving || previewing || !options) return;
    const version = ++request.current;
    setPreview(null); setPreviewError(""); setPreviewing(true);
    try {
      const groups = await Promise.all(targets.map(target => getTargetRecipients(churchId, target)));
      if (alive.current && request.current === version) {
        const rows = groups.flat().filter(row => row.churchId === churchId);
        setPreview([...new Map(rows.map(row => [`${row.kind}:${row.id}`, row])).values()]);
      }
    } catch (cause) { if (alive.current && request.current === version) setPreviewError(cause instanceof Error ? cause.message : "Unable to preview recipients."); }
    finally { if (alive.current && request.current === version) setPreviewing(false); }
  };
  return <section className="announcement-audience" aria-label="Announcement audience">
    <h3>Audience targeting</h3>
    <p className="form-help">Audience changes are saved with the announcement. Targeting does not change who can view announcements in the church workspace.</p>
    {error ? <div className="error-banner" role="alert"><span>{error} You can still save announcement details without changing its audience.</span><button type="button" disabled={saving} onClick={() => setReload(value => value + 1)}>Retry audience</button></div>
      : !options ? <LoadingSkeleton rows={2} label="Loading audience choices" /> : <>
        <fieldset disabled={saving} className="audience-controls"><legend className="sr-only">Choose an audience target</legend>
          <div className="form-grid"><div><label htmlFor={audienceId}>Audience</label><select id={audienceId} value={type} onChange={event => { setType(event.target.value as AnnouncementTargetType); setTargetId(""); }}>
            {["All", "Member", "Family", "Event", "Role"].map(value => <option key={value}>{value}</option>)}</select></div>
            {type !== "All" && <div><label htmlFor={targetSelectId}>Target</label><select id={targetSelectId} value={targetId} onChange={event => setTargetId(event.target.value)}>
              <option value="">Select {type.toLowerCase()}</option>{options[type].map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select></div>}
          </div>
          {type !== "All" && !options[type].length && <p className="form-help">No {type.toLowerCase()} choices are available in this workspace.</p>}
          <button type="button" className="outline-button" disabled={duplicate || (type !== "All" && !targetId)} onClick={() => { if (!duplicate && (type === "All" || options[type].some(option => option.id === targetId))) change([...targets, selected]); }}>Add target</button>
          {!targets.length ? <p className="form-help">No targets selected. The recipient preview will be empty.</p> : <ul className="audience-targets">{targets.map((target, index) => <li key={audienceKey(target)}>
            <span>{label(target)}</span><button type="button" className="outline-button" aria-label={`Remove ${label(target)} (${index + 1})`} onClick={() => change(targets.filter((_, i) => i !== index))}>Remove</button>
          </li>)}</ul>}
          <button type="button" className="outline-button" disabled={previewing} onClick={() => void showPreview()}>Preview recipients</button>
        </fieldset>
        <p className="form-help">Preview includes active member profiles and active church accounts visible to you. Event targets include Present and Late attendees. Profiles and accounts are counted separately; the same person may have both.</p>
        {previewing && <LoadingSkeleton rows={2} label="Loading recipient preview" />}
        {previewError && <div className="error-banner" role="alert">{previewError}</div>}
        {preview && <section aria-label="Recipient preview" aria-live="polite"><h4>{preview.length} visible recipient{preview.length === 1 ? "" : "s"}</h4>
          {!preview.length ? <EmptyState compact title="No visible recipients" description="No active recipients visible to you match the selected targets." />
            : <ul className="audience-recipients">{preview.map(row => <li key={`${row.kind}:${row.id}`}><span>{row.displayName || "Unnamed recipient"}</span> <small>{row.kind === "member" ? "Member profile" : "Church account"}</small></li>)}</ul>}
        </section>}
      </>}
  </section>;
}
