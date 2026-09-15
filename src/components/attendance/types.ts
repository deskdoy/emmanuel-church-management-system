import type { Family } from "../../services/families";
import type { AttendanceStatus } from "../../services/attendance";
import type { RoleName } from "../../types";

export interface AttendanceMember { id: string; churchId: string; name: string; memberNumber: string | null; familyId: string | null }
export interface AttendanceEvent { id: string; churchId: string; title: string; startsAt: string }
export interface AttendanceDirectory { churchId: string; members: AttendanceMember[]; events: AttendanceEvent[]; families: Family[] }
export interface AttendanceSession { attendanceDate: string; eventId: string | null }
export const attendanceWriterRoles: readonly RoleName[] = ["Admin", "Pastor", "Secretary", "Encoder"];
export const attendanceStatuses: readonly AttendanceStatus[] = ["Present", "Absent", "Late", "Excused"];
export const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
