import { useState, type FormEvent } from "react";
import type { EventInput, EventRecord } from "../../services/events";
import { useActiveChurch } from "../../tenancy/ActiveChurchContext";
import { hasChurchRole } from "../../tenancy/permissions";
import { eventManagerRoles, eventTimeInput, eventTimeToISO } from "./eventHelpers";
import "./events.css";

export interface EventFormProps {
  churchId: string;
  event?: EventRecord;
  saving: boolean;
  error?: string;
  onSubmit: (input: EventInput) => Promise<void>;
  onCancel: () => void;
}
export function EventForm(props: EventFormProps) {
  const { activeChurch, activeRole, workspaceMode, scopeVersion } = useActiveChurch();
  if (!props.churchId || activeChurch?.id !== props.churchId || (props.event && props.event.churchId !== props.churchId)
    || workspaceMode !== "church" || !hasChurchRole(activeRole, eventManagerRoles)) return null;
  return <DetailsForm key={`${props.churchId}:${props.event?.id || "new"}:${activeRole}:${scopeVersion}`} {...props} />;
}
function DetailsForm({ event, saving, error, onSubmit, onCancel }: EventFormProps) {
  const [validation, setValidation] = useState("");
  const submit = (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    if (saving) return;
    setValidation("");
    const form = new FormData(submitEvent.currentTarget);
    try {
      const title = String(form.get("title") || "").trim();
      if (!title) throw new Error("Event title is required.");
      const startsAt = eventTimeToISO(String(form.get("startsAt") || ""));
      const end = String(form.get("endsAt") || "");
      const endsAt = end ? eventTimeToISO(end) : null;
      if (endsAt && Date.parse(endsAt) < Date.parse(startsAt)) throw new Error("End time must be on or after start time.");
      const capacityText = String(form.get("capacity") || "");
      const capacity = capacityText === "" ? null : Number(capacityText);
      if (capacity !== null && (!Number.isInteger(capacity) || capacity < 0 || capacity > 2147483647)) throw new Error("Enter a valid nonnegative capacity.");
      void onSubmit({ title, startsAt, endsAt, capacity, description: String(form.get("description") || ""), location: String(form.get("location") || "") });
    } catch (cause) { setValidation(cause instanceof Error ? cause.message : "Unable to read event details."); }
  };
  return <section className="panel">
    <div className="panel-head"><h2>{event ? "Edit event" : "New event"}</h2></div>
    <form className="record-form" aria-label={event ? "Edit event" : "New event"} aria-busy={saving} onSubmit={submit}>
      {(validation || error) && <div className="error-banner" role="alert">{validation || error}</div>}
      <p className="form-help">Dates and times use your device's local timezone.</p>
      <div className="form-grid">
        <label className="full">Event title<input name="title" defaultValue={event?.title || ""} required disabled={saving} /></label>
        <label>Starts at<input type="datetime-local" name="startsAt" step="0.001" defaultValue={eventTimeInput(event?.startsAt)} required disabled={saving} /></label>
        <label>Ends at<input type="datetime-local" name="endsAt" step="0.001" defaultValue={eventTimeInput(event?.endsAt)} disabled={saving} /></label>
        <label>Location<input name="location" defaultValue={event?.location || ""} disabled={saving} /></label>
        <label>Capacity<input type="number" name="capacity" min="0" max="2147483647" step="1" defaultValue={event?.capacity ?? ""} disabled={saving} /><span className="form-help">Leave blank for no capacity limit.</span></label>
        <label className="full">Description<textarea name="description" rows={3} defaultValue={event?.description || ""} disabled={saving} /></label>
      </div>
      <div className="row-actions event-actions"><button type="button" className="outline-button" disabled={saving} onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving..." : event ? "Save changes" : "Create event"}</button></div>
    </form>
  </section>;
}
