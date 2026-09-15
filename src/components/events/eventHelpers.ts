import type { EventRecord } from "../../services/events";
import type { RoleName } from "../../types";

export const eventManagerRoles: readonly RoleName[] = ["Admin", "Pastor", "Secretary"];
const pad = (value: number) => String(value).padStart(2, "0");
export const localDay = (date: Date) => `${String(date.getFullYear()).padStart(4, "0")}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const currentMonth = () => localDay(new Date()).slice(0, 7);
export const displayEventTime = (value: string) => new Date(value).toLocaleString();
export function eventTimeInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${localDay(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}
export function eventTimeToISO(value: string): string {
  const date = new Date(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value)
    || value.startsWith("0000-") || !Number.isFinite(date.getTime()) || eventTimeInput(date.toISOString()).slice(0, 16) !== value.slice(0, 16)) {
    throw new Error("Enter a valid local date and time.");
  }
  return date.toISOString();
}
export interface EventCalendarDay { date: string; events: EventRecord[] }
/** Local calendar days, including multi-day events; an end at midnight excludes that next day. */
export function buildEventCalendar(churchId: string, events: readonly EventRecord[], month: string): EventCalendarDay[] {
  if (!churchId.trim()) throw new Error("Church workspace is required.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month.startsWith("0000-")) throw new Error("Choose a valid month.");
  const [year, number] = month.split("-").map(Number);
  const first = new Date(`${month}-01T00:00:00`);
  const rows = events.filter(event => event.churchId === churchId).map(event => ({ event, start: Date.parse(event.startsAt), end: event.endsAt ? Date.parse(event.endsAt) : Date.parse(event.startsAt) }));
  const days: EventCalendarDay[] = [];
  for (let date = first; date.getFullYear() === year && date.getMonth() === number - 1;) {
    const next = new Date(date); next.setDate(next.getDate() + 1);
    days.push({ date: localDay(date), events: rows.filter(row => row.start < next.getTime() && (row.end > date.getTime() || row.start >= date.getTime()))
      .sort((a, b) => a.start - b.start || a.event.id.localeCompare(b.event.id)).map(row => row.event) });
    date = next;
  }
  return days;
}

/** Move one calendar month without day-of-month or daylight-saving rollover. */
export function shiftCalendarMonth(month: string, direction: -1 | 1): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month.startsWith("0000-")) return null;
  const [year, number] = month.split("-").map(Number);
  const index = (year - 1) * 12 + number - 1 + direction;
  if (index < 0 || index >= 9999 * 12) return null;
  return `${String(Math.floor(index / 12) + 1).padStart(4, "0")}-${pad(index % 12 + 1)}`;
}
