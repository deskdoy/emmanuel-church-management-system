import { supabase } from "../lib/supabase";
import type { ChurchEvent } from "../types";
import { loadAttendanceByEvent, type AttendanceRecord } from "./attendance";

export interface EventRecord extends ChurchEvent {
  churchId: string;
  createdBy: string | null;
  updatedAt: string;
}

/** Complete editable event details for creation and replacement updates. */
export interface EventInput {
  title: string;
  description?: string;
  location?: string;
  /** ISO timestamp with an explicit timezone, e.g. 2026-09-15T09:00:00+08:00. */
  startsAt: string;
  endsAt?: string | null;
  capacity?: number | null;
}

interface EventRow {
  id: string;
  church_id: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const eventColumns = "id,church_id,title,description,location,starts_at,ends_at,capacity,created_by,created_at,updated_at";
const requireId = (value: string, label: string) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
};
const client = (churchId: string) => {
  requireId(churchId, "Church workspace");
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

function timestamp(value: string, label: string): string {
  const match = typeof value === "string" && /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  const date = match ? new Date(`${match[1]}T00:00:00Z`) : null;
  if (!match || match[1].startsWith("0000-") || !date || !Number.isFinite(date.getTime())
    || date.toISOString().slice(0, 10) !== match[1] || Number(match[2]) > 23
    || Number(match[3]) > 59 || Number(match[4] || 0) > 59 || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be a valid ISO timestamp with a timezone.`);
  }
  return new Date(value).toISOString();
}

function textValue(value: string | undefined, label: string): string {
  if (value === undefined) return "";
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  return value.trim();
}

function eventValues(input: EventInput) {
  requireId(input.title, "Event title");
  const startsAt = timestamp(input.startsAt, "Start time");
  const endsAt = input.endsAt === undefined || input.endsAt === null ? null : timestamp(input.endsAt, "End time");
  if (endsAt !== null && Date.parse(endsAt) < Date.parse(startsAt)) throw new Error("End time must be on or after start time.");
  const capacity = input.capacity ?? null;
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 0 || capacity > 2147483647)) {
    throw new Error("Capacity must be a nonnegative integer up to 2147483647, or null.");
  }
  // Never accept tenant ownership, IDs, or audit metadata from editable input.
  return { title: input.title.trim(), description: textValue(input.description, "Description"),
    location: textValue(input.location, "Location"), starts_at: startsAt, ends_at: endsAt, capacity };
}

const mapEvent = (row: EventRow): EventRecord => ({
  id: row.id, churchId: row.church_id, title: row.title, description: row.description,
  location: row.location, startsAt: row.starts_at, endsAt: row.ends_at, capacity: row.capacity,
  createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
});

export async function loadEvents(churchId: string): Promise<EventRecord[]> {
  const { data, error } = await client(churchId).from("events").select(eventColumns)
    .eq("church_id", churchId).order("starts_at", { ascending: false }).order("id");
  if (error) throw new Error(`Unable to load events: ${error.message}`);
  return (data || []).map(mapEvent);
}

export async function createEvent(churchId: string, input: EventInput): Promise<EventRecord> {
  const db = client(churchId);
  const values = eventValues(input);
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) throw new Error(authError?.message || "Your session has expired.");
  const { data, error } = await db.from("events").insert({ ...values, church_id: churchId, created_by: auth.user.id })
    .select(eventColumns).single();
  if (error) throw new Error(`Unable to create event: ${error.message}`);
  return mapEvent(data);
}

/** Replaces editable details; omitted optional fields reset to schema defaults. */
export async function updateEvent(churchId: string, eventId: string, input: EventInput): Promise<EventRecord> {
  const db = client(churchId);
  requireId(eventId, "Event");
  const { data, error } = await db.from("events").update(eventValues(input))
    .eq("church_id", churchId).eq("id", eventId).select(eventColumns).single();
  if (error) throw new Error(`Unable to update event: ${error.message}`);
  return mapEvent(data);
}

/** Existing database foreign keys cascade this event's attendance on deletion. */
export async function deleteEvent(churchId: string, eventId: string): Promise<void> {
  const db = client(churchId);
  requireId(eventId, "Event");
  const { error } = await db.from("events").delete().eq("church_id", churchId).eq("id", eventId).select("id").single();
  if (error) throw new Error(`Unable to delete event: ${error.message}`);
}

/** Events starting at or after `from`, inclusive, with the soonest first. */
export async function loadUpcomingEvents(churchId: string, from = new Date().toISOString()): Promise<EventRecord[]> {
  const db = client(churchId);
  const startsFrom = timestamp(from, "Upcoming events start time");
  const { data, error } = await db.from("events").select(eventColumns)
    .eq("church_id", churchId).gte("starts_at", startsFrom).order("starts_at").order("id");
  if (error) throw new Error(`Unable to load upcoming events: ${error.message}`);
  return (data || []).map(mapEvent);
}

export async function loadEventAttendance(churchId: string, eventId: string): Promise<AttendanceRecord[]> {
  return loadAttendanceByEvent(churchId, eventId);
}
