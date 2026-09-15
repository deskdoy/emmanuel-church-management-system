import { supabase } from "../lib/supabase";
import type { Attendance } from "../types";

export type AttendanceStatus = Attendance["status"];

export interface AttendanceRecord extends Attendance {
  churchId: string;
  recordedBy: string | null;
  updatedAt: string;
}

export interface AttendanceInput {
  memberId: string;
  eventId?: string | null;
  attendanceDate: string;
  status?: AttendanceStatus;
  notes?: string;
}

export type AttendanceUpdate = Partial<AttendanceInput>;

interface AttendanceRow {
  id: string;
  church_id: string;
  member_id: string;
  event_id: string | null;
  attendance_date: string;
  status: AttendanceStatus;
  notes: string;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
}

type AttendanceValues = Partial<Pick<AttendanceRow, "member_id" | "event_id" | "attendance_date" | "status" | "notes">>;
const attendanceColumns = "id,church_id,member_id,event_id,attendance_date,status,notes,recorded_by,created_at,updated_at";
const attendanceStatuses: readonly AttendanceStatus[] = ["Present", "Absent", "Late", "Excused"];

const requireId = (value: string, label: string) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
};

const client = (churchId: string) => {
  requireId(churchId, "Church workspace");
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

const requireDate = (value: string) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) {
    throw new Error("Enter a valid attendance date (YYYY-MM-DD).");
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Enter a valid attendance date (YYYY-MM-DD).");
  }
};

const attendanceValues = (input: AttendanceUpdate): AttendanceValues => {
  const values: AttendanceValues = {};
  // Explicit fields prevent changes to tenant ownership and recording metadata.
  if (input.memberId !== undefined) {
    requireId(input.memberId, "Member");
    values.member_id = input.memberId;
  }
  if (input.eventId !== undefined) {
    if (input.eventId !== null) requireId(input.eventId, "Event");
    values.event_id = input.eventId;
  }
  if (input.attendanceDate !== undefined) {
    requireDate(input.attendanceDate);
    values.attendance_date = input.attendanceDate;
  }
  if (input.status !== undefined) {
    if (!attendanceStatuses.includes(input.status)) throw new Error("Choose a valid attendance status.");
    values.status = input.status;
  }
  if (input.notes !== undefined) {
    if (typeof input.notes !== "string") throw new Error("Attendance notes must be text.");
    values.notes = input.notes.trim();
  }
  return values;
};

const mapAttendance = (row: AttendanceRow): AttendanceRecord => ({
  id: row.id, churchId: row.church_id, memberId: row.member_id, eventId: row.event_id,
  attendanceDate: row.attendance_date, status: row.status, notes: row.notes,
  recordedBy: row.recorded_by, createdAt: row.created_at, updatedAt: row.updated_at,
});

export async function loadAttendanceRecords(churchId: string): Promise<AttendanceRecord[]> {
  const { data, error } = await client(churchId).from("attendance").select(attendanceColumns)
    .eq("church_id", churchId)
    .order("attendance_date", { ascending: false }).order("created_at", { ascending: false }).order("id");
  if (error) throw new Error(`Unable to load attendance records: ${error.message}`);
  return (data || []).map(mapAttendance);
}

export async function loadAttendanceByEvent(churchId: string, eventId: string): Promise<AttendanceRecord[]> {
  const db = client(churchId);
  requireId(eventId, "Event");
  const { data, error } = await db.from("attendance").select(attendanceColumns)
    .eq("church_id", churchId).eq("event_id", eventId)
    .order("attendance_date", { ascending: false }).order("created_at", { ascending: false }).order("id");
  if (error) throw new Error(`Unable to load event attendance: ${error.message}`);
  return (data || []).map(mapAttendance);
}

export async function recordAttendance(churchId: string, input: AttendanceInput): Promise<AttendanceRecord> {
  const db = client(churchId);
  requireId(input.memberId, "Member");
  requireDate(input.attendanceDate);
  const values = attendanceValues(input);
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) throw new Error(authError?.message || "Your session has expired.");
  // RLS and the composite foreign keys authorize the member/event relationship.
  // Keep inserts explicit: duplicate attendance must not silently overwrite history.
  const { data, error } = await db.from("attendance").insert({
    event_id: null, status: "Present", notes: "", ...values,
    church_id: churchId, recorded_by: auth.user.id,
  }).select(attendanceColumns).single();
  if (error) throw new Error(`Unable to record attendance: ${error.message}`);
  return mapAttendance(data);
}

export async function updateAttendance(churchId: string, attendanceId: string, input: AttendanceUpdate): Promise<AttendanceRecord> {
  const db = client(churchId);
  requireId(attendanceId, "Attendance record");
  const values = attendanceValues(input);
  if (!Object.keys(values).length) throw new Error("Provide at least one attendance field to update.");
  const { data, error } = await db.from("attendance").update(values)
    .eq("church_id", churchId).eq("id", attendanceId)
    .select(attendanceColumns).single();
  if (error) throw new Error(`Unable to update attendance: ${error.message}`);
  return mapAttendance(data);
}

export async function getMemberAttendanceHistory(churchId: string, memberId: string): Promise<AttendanceRecord[]> {
  const db = client(churchId);
  requireId(memberId, "Member");
  const { data, error } = await db.from("attendance").select(attendanceColumns)
    .eq("church_id", churchId).eq("member_id", memberId)
    .order("attendance_date", { ascending: false }).order("created_at", { ascending: false }).order("id");
  if (error) throw new Error(`Unable to load member attendance history: ${error.message}`);
  return (data || []).map(mapAttendance);
}

export async function getFamilyAttendanceHistory(churchId: string, familyId: string): Promise<AttendanceRecord[]> {
  const db = client(churchId);
  requireId(familyId, "Family");
  // Family history means attendance of CURRENT family members; the schema has
  // no historical family assignment snapshots. An inner join filters attendance
  // itself, and avoids building a potentially truncated list of member IDs.
  const { data, error } = await db.from("attendance")
    .select(`${attendanceColumns},members!attendance_member_id_fkey!inner(church_id,family_id)`)
    .eq("church_id", churchId).eq("members.church_id", churchId).eq("members.family_id", familyId)
    .order("attendance_date", { ascending: false }).order("created_at", { ascending: false }).order("id");
  if (error) throw new Error(`Unable to load family attendance history: ${error.message}`);
  return (data || []).map(mapAttendance);
}
