import { supabase } from "../lib/supabase";
import type { AttendanceStatus } from "./attendance";
import type { AttendanceSummary } from "../reporting/attendanceCalculations";

export interface EngagementSummary {
  churchId: string;
  /** Shared reference instant for upcoming events and active announcements. */
  asOf: string;
  memberCount: number;
  familyCount: number;
  attendanceSummary: AttendanceSummary;
  upcomingEventsCount: number;
  activeAnnouncementsCount: number;
}

type Database = NonNullable<typeof supabase>;
type CountResult = { count: number | null; error: { message: string } | null };
const client = (churchId: string): Database => {
  if (typeof churchId !== "string" || !churchId.trim()) throw new Error("Church workspace is required.");
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


function requireCount(count: number | null, label: string): number {
  if (count === null || !Number.isSafeInteger(count) || count < 0) throw new Error(`Unable to load engagement ${label}: exact count was unavailable.`);
  return count;
}
async function exactCount(query: PromiseLike<CountResult>, label: string): Promise<number> {
  const { count, error } = await query;
  if (error) throw new Error(`Unable to load engagement ${label}: ${error.message}`);
  return requireCount(count, label);
}

async function loadAttendanceSummary(db: Database, churchId: string): Promise<AttendanceSummary> {
  const counts: Record<AttendanceStatus, number> = { Present: 0, Late: 0, Absent: 0, Excused: 0 };
  const members = new Set<string>(), sessions = new Set<string>();
  let offset = 0;
  // Only aggregation fields are read. Stable ID ordering and exact counts allow
  // paging even when the server caps responses below our requested page size.
  while (true) {
    const { data, count, error } = await db.from("attendance")
      .select("id,church_id,member_id,event_id,attendance_date,status", { count: "exact" })
      .eq("church_id", churchId).order("id").range(offset, offset + 999);
    if (error) throw new Error(`Unable to load engagement attendance: ${error.message}`);
    const total = requireCount(count, "attendance");
    const rows = data || [];
    for (const row of rows) {
      if (row.church_id !== churchId) continue;
      const status = row.status as AttendanceStatus;
      if (!Object.hasOwn(counts, status)) throw new Error("Unable to load engagement attendance: invalid attendance status.");
      counts[status]++;
      members.add(row.member_id);
      sessions.add(JSON.stringify([row.attendance_date, row.event_id]));
    }
    offset += rows.length;
    if (offset >= total) break;
    if (!rows.length) throw new Error("Unable to load engagement attendance: incomplete attendance results.");
  }
  const totalRecords = counts.Present + counts.Late + counts.Absent + counts.Excused;
  const attended = counts.Present + counts.Late;
  return { totalRecords, present: counts.Present, late: counts.Late, absent: counts.Absent, excused: counts.Excused,
    attended, memberCount: members.size, sessionCount: sessions.size,
    attendanceRate: totalRecords ? Math.round(attended / totalRecords * 10000) / 100 : null };
}

/**
 * RLS-visible church totals. Attendance covers all recorded dates and follows the
 * existing reporting rate: (Present + Late) / all recorded statuses, including
 * Excused. Missing records never become absences. Members include all statuses.
 * Upcoming events start at/after `at`; active announcements satisfy publish_at
 * <= at < expires_at, with null expiry allowed. Reads share a reference time,
 * but are separate queries, not a transactional database snapshot.
 */
export async function loadEngagementSummary(churchId: string, at = new Date().toISOString()): Promise<EngagementSummary> {
  const db = client(churchId);
  const asOf = timestamp(at, "Engagement reference time");
  const [memberCount, familyCount, attendanceSummary, upcomingEventsCount, activeAnnouncementsCount] = await Promise.all([
    exactCount(db.from("members").select("id", { count: "exact", head: true }).eq("church_id", churchId), "member count"),
    exactCount(db.from("families").select("id", { count: "exact", head: true }).eq("church_id", churchId), "family count"),
    loadAttendanceSummary(db, churchId),
    exactCount(db.from("events").select("id", { count: "exact", head: true }).eq("church_id", churchId).gte("starts_at", asOf), "upcoming events count"),
    exactCount(db.from("announcements").select("id", { count: "exact", head: true }).eq("church_id", churchId)
      .eq("is_published", true).lte("publish_at", asOf).or(`expires_at.is.null,expires_at.gt.${asOf}`), "active announcements count"),
  ]);
  return { churchId, asOf, memberCount, familyCount, attendanceSummary, upcomingEventsCount, activeAnnouncementsCount };
}
