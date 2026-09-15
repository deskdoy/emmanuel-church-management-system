import { useMemo, useState } from "react";
import type { EventRecord } from "../../services/events";
import { useActiveChurch } from "../../tenancy/ActiveChurchContext";
import { EmptyState } from "../ui/EmptyState";
import { buildEventCalendar, currentMonth, displayEventTime, localDay, shiftCalendarMonth } from "./eventHelpers";
import "./events.css";

export interface EventCalendarProps { churchId: string; events: readonly EventRecord[]; onSelect: (event: EventRecord) => void; disabled?: boolean }
export function EventCalendar(props: EventCalendarProps) {
  const { activeChurch, activeRole, workspaceMode, scopeVersion } = useActiveChurch();
  if (!props.churchId || activeChurch?.id !== props.churchId || !activeRole || workspaceMode !== "church") {
    return <EmptyState title="Choose a church workspace" description="The calendar must belong to your active church." />;
  }
  return <Calendar key={`${props.churchId}:${activeRole}:${scopeVersion}`} {...props} />;
}
function Calendar({ churchId, events, onSelect, disabled }: EventCalendarProps) {
  const [month, setMonth] = useState(currentMonth);
  const calendar = useMemo(() => {
    try { return { days: month ? buildEventCalendar(churchId, events, month) : [], error: "" }; }
    catch (cause) { return { days: [], error: cause instanceof Error ? cause.message : "Unable to display calendar." }; }
  }, [churchId, events, month]);
  const days = calendar.days;
  const offset = days.length ? new Date(`${days[0].date}T00:00:00`).getDay() : 0;
  const previousMonth = shiftCalendarMonth(month, -1), nextMonth = shiftCalendarMonth(month, 1);
  const today = localDay(new Date());
  const monthLabel = days.length ? new Date(`${days[0].date}T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "Month not selected";
  const eventCount = new Set(days.flatMap(day => day.events.map(event => event.id))).size;
  const selectEvent = (event: EventRecord) => {
    if (!disabled && event.churchId === churchId) onSelect(event);
  };
  return <section className="panel event-calendar" aria-label="Event calendar">
    <div className="panel-head"><h2>Event calendar</h2><label>Calendar month<input type="month" value={month} min="0001-01" max="9999-12" disabled={disabled} onChange={event => setMonth(event.target.value)} /></label></div>
    <div className="event-calendar-toolbar">
      <div aria-live="polite" aria-atomic="true"><h3>{monthLabel}</h3>{days.length > 0 && <p className="form-help">{eventCount} {eventCount === 1 ? "event" : "events"} this month</p>}</div>
      <div className="row-actions event-calendar-navigation" aria-label="Calendar navigation">
        <button type="button" className="outline-button" disabled={disabled || !previousMonth} onClick={() => { if (previousMonth) setMonth(previousMonth); }}>Previous month</button>
        <button type="button" className="outline-button" disabled={disabled} onClick={() => setMonth(currentMonth())}>This month</button>
        <button type="button" className="outline-button" disabled={disabled || !nextMonth} onClick={() => { if (nextMonth) setMonth(nextMonth); }}>Next month</button>
      </div>
    </div>
    <p className="form-help">Dates and times use your device's local timezone. Multi-day events appear on each day they cover. Select an event to view its details and attendance.</p>
    {calendar.error ? <div className="error-banner" role="alert">{calendar.error}</div> : !month ? <EmptyState title="Choose a month" description="Select a month to view the calendar." /> : <>
      {!days.some(day => day.events.length) && <EmptyState title="No events this month" description="Choose another month to explore church events." />}
      <div className="event-calendar-grid">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <span className="event-weekday" key={day}>{day}</span>)}
        {Array.from({ length: offset }, (_, index) => <div className="event-calendar-spacer" key={`space-${index}`} />)}
        {days.map(day => <article className={`event-calendar-day${day.events.length ? " has-events" : ""}`} key={day.date} aria-label={day.date}>
          <div className="event-calendar-day-heading"><time dateTime={day.date} aria-current={day.date === today ? "date" : undefined}>{new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</time>
            {day.events.length > 0 && <span className="event-calendar-count">{day.events.length} {day.events.length === 1 ? "event" : "events"}</span>}
          </div>
          {day.events.length > 0 && <ul className="event-calendar-entries">{day.events.map(event => <li key={event.id}>
            <button type="button" className="outline-button" disabled={disabled} onClick={() => selectEvent(event)}>
              <strong>{event.title}</strong><small>{localDay(new Date(event.startsAt)) < day.date ? "Continues from " : "Starts "}{displayEventTime(event.startsAt)}</small>
              {event.endsAt && <small>Ends {displayEventTime(event.endsAt)}</small>}
              {event.location && <small>{event.location}</small>}
            </button>
          </li>)}</ul>}
        </article>)}
      </div>
    </>}
  </section>;
}
