import { useState, type FormEvent } from "react";
import { localDate, type AttendanceEvent, type AttendanceSession } from "./types";

export interface AttendanceSessionFormProps {
  churchId: string;
  events: AttendanceEvent[];
  initialSession?: AttendanceSession;
  onOpen: (session: AttendanceSession) => void;
}

export function AttendanceSessionForm({ churchId, events, initialSession, onOpen }: AttendanceSessionFormProps) {
  const [error, setError] = useState("");
  const available = events.filter(event => event.churchId === churchId);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const eventId = String(form.get("eventId") || "") || null;
    const attendanceDate = String(form.get("attendanceDate") || "");
    if (!churchId || !attendanceDate || (eventId && !available.some(event => event.id === eventId))) {
      setError("Choose a date and an event from this church."); return;
    }
    setError("");
    onOpen({ eventId, attendanceDate });
  };
  return <section className="panel">
    <div className="panel-head"><div><h2>Open attendance register</h2><p className="section-copy">Choose a date and an optional church event.</p></div></div>
    <form className="record-form" aria-label="Attendance session" onSubmit={submit}>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="form-grid">
        <label>Attendance date<input name="attendanceDate" type="date" required defaultValue={initialSession?.attendanceDate || localDate()} /></label>
        <div><label htmlFor="attendance-session-event">Event</label><select id="attendance-session-event" name="eventId" defaultValue={initialSession?.eventId || ""}>
          <option value="">General attendance (no event)</option>
          {available.map(event => <option key={event.id} value={event.id}>{event.title} ({event.startsAt.slice(0, 10)})</option>)}
        </select></div>
      </div>
      {!available.length && <p className="form-help">No events available. You can still open a general attendance register.</p>}
      <div className="row-actions"><button type="submit" className="primary-button">Open register</button></div>
    </form>
  </section>;
}
