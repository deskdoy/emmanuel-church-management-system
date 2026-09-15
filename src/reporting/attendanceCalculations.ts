import type { AttendanceRecord } from "../services/attendance";

export interface AttendanceReportMember { id: string; churchId: string; name: string; familyId: string | null }
export interface AttendanceReportFamily { id: string; churchId: string; name: string }
export interface AttendanceDateRange { from?: string; to?: string }
export interface AttendanceSummary {
  totalRecords: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  attended: number;
  memberCount: number;
  sessionCount: number;
  /** (Present + Late) / all recorded statuses, rounded to two decimals; null with no records. */
  attendanceRate: number | null;
}
export interface MemberAttendanceReport {
  memberId: string;
  name: string;
  summary: AttendanceSummary;
  history: AttendanceRecord[];
}
export interface FamilyAttendanceReport {
  familyId: string;
  name: string;
  /** Current family members, including members with no recorded attendance. */
  memberCount: number;
  summary: AttendanceSummary;
}
export interface AttendanceTrendPoint { date: string; summary: AttendanceSummary }
export interface AttendanceReport {
  churchId: string;
  summary: AttendanceSummary;
  members: MemberAttendanceReport[];
  families: FamilyAttendanceReport[];
  trend: AttendanceTrendPoint[];
}

function summarize(records: readonly AttendanceRecord[]): AttendanceSummary {
  const counts = { Present: 0, Late: 0, Absent: 0, Excused: 0 };
  const members = new Set<string>();
  const sessions = new Set<string>();
  for (const record of records) {
    counts[record.status]++;
    members.add(record.memberId);
    sessions.add(JSON.stringify([record.attendanceDate, record.eventId]));
  }
  const attended = counts.Present + counts.Late;
  return { totalRecords: records.length, present: counts.Present, late: counts.Late,
    absent: counts.Absent, excused: counts.Excused, attended, memberCount: members.size,
    sessionCount: sessions.size,
    attendanceRate: records.length ? Math.round(attended / records.length * 10000) / 100 : null };
}

function validateRange(range: AttendanceDateRange) {
  for (const value of [range.from, range.to]) {
    if (!value) continue;
    const date = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-") || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new Error("Enter valid report dates (YYYY-MM-DD).");
    }
  }
  if (range.from && range.to && range.from > range.to) throw new Error("From date must be on or before To date.");
}

/**
 * Read-only reporting over church-scoped service results. Missing records are
 * never inferred as absences. Excused records remain in the rate denominator.
 * Families use current assignments, not historical family membership.
 * Trends contain recorded dates only; separate events on a date remain separate sessions.
 */
export function buildAttendanceReport(
  churchId: string,
  records: readonly AttendanceRecord[],
  members: readonly AttendanceReportMember[],
  families: readonly AttendanceReportFamily[],
  range: AttendanceDateRange = {},
): AttendanceReport {
  if (!churchId.trim()) throw new Error("Church workspace is required.");
  validateRange(range);
  const scoped = records.filter(row => row.churchId === churchId
    && (!range.from || row.attendanceDate >= range.from) && (!range.to || row.attendanceDate <= range.to));
  const byMember = new Map<string, AttendanceRecord[]>();
  const byDate = new Map<string, AttendanceRecord[]>();
  for (const row of scoped) {
    const memberRows = byMember.get(row.memberId) || [];
    memberRows.push(row); byMember.set(row.memberId, memberRows);
    const dateRows = byDate.get(row.attendanceDate) || [];
    dateRows.push(row); byDate.set(row.attendanceDate, dateRows);
  }
  const scopedMembers = members.filter(row => row.churchId === churchId);
  const memberReports = scopedMembers.map(member => {
    const history = [...(byMember.get(member.id) || [])].sort((a, b) =>
      b.attendanceDate.localeCompare(a.attendanceDate) || a.id.localeCompare(b.id));
    return { memberId: member.id, name: member.name, summary: summarize(history), history };
  });
  const familyReports = families.filter(row => row.churchId === churchId).map(family => {
    const currentMembers = scopedMembers.filter(member => member.familyId === family.id);
    const familyRecords = currentMembers.flatMap(member => byMember.get(member.id) || []);
    return { familyId: family.id, name: family.name, memberCount: currentMembers.length, summary: summarize(familyRecords) };
  });
  return { churchId, summary: summarize(scoped), members: memberReports, families: familyReports,
    trend: [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => ({ date, summary: summarize(rows) })) };
}
