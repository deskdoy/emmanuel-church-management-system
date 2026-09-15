import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

const source = fs.readFileSync(new URL("../src/services/attendance.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const record = { id: "attendance-a", church_id: "church-a", member_id: "member-a", event_id: "event-a", attendance_date: "2026-09-15", status: "Present", notes: "Recorded notes", recorded_by: "original-user", created_at: "2026-09-15T01:00:00Z", updated_at: "2026-09-15T01:00:00Z" };
const input = { memberId: "member-a", eventId: "event-a", attendanceDate: "2026-09-15", status: "Late", notes: "  Arrived late  " };

function setup({ failure, user = { id: "user-a" }, authError = null, rows = [record], configured = true } = {}) {
  const requests = [];
  const state = { authCalls: 0 };
  const supabase = createClient("https://attendance-tests.invalid", "test-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      const parsed = new URL(url);
      assert.equal(parsed.origin, "https://attendance-tests.invalid");
      const request = { url: parsed, method: init.method, payload: init.body ? JSON.parse(init.body) : undefined, headers: new Headers(init.headers) };
      requests.push(request);
      const single = request.headers.get("Accept")?.includes("vnd.pgrst.object");
      const body = failure?.body || (single ? { ...record, ...request.payload } : rows);
      return new Response(JSON.stringify(body), { status: failure?.status || 200, headers: { "Content-Type": "application/json" } });
    } },
  });
  supabase.auth.getUser = async () => { state.authCalls++; return { data: { user }, error: authError }; };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => {
    assert.equal(name, "../lib/supabase");
    return { supabase: configured ? supabase : null };
  } });
  return { service: exports, requests, state };
}
const operations = (service, churchId) => [
  () => service.loadAttendanceRecords(churchId), () => service.loadAttendanceByEvent(churchId, "event-a"),
  () => service.recordAttendance(churchId, input), () => service.updateAttendance(churchId, "attendance-a", { status: "Absent" }),
  () => service.getMemberAttendanceHistory(churchId, "member-a"), () => service.getFamilyAttendanceHistory(churchId, "family-a"),
];
function assertScope(request, filters = {}) {
  assert.equal(request.url.pathname, "/rest/v1/attendance");
  for (const [key, value] of Object.entries({ church_id: "church-a", ...filters })) {
    assert.equal(request.url.searchParams.get(key), `eq.${value}`, `${key} must scope the real HTTP request`);
  }
}

test("every attendance operation rejects missing church scope before HTTP or auth", async () => {
  const { service, requests, state } = setup();
  for (const churchId of ["", "   ", null, undefined]) {
    for (const call of operations(service, churchId)) await assert.rejects(call, /Church workspace is required/);
  }
  assert.equal(requests.length, 0);
  assert.equal(state.authCalls, 0);
});

test("attendance lists map all metadata and scope event/member history with stable newest-first ordering", async () => {
  const { service, requests } = setup();
  const [result] = await service.loadAttendanceRecords("church-a");
  for (const [key, value] of Object.entries(record)) {
    assert.equal(result[key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())], value);
  }
  await service.loadAttendanceByEvent("church-a", "event-a");
  await service.getMemberAttendanceHistory("church-a", "member-a");
  assertScope(requests[0]);
  assertScope(requests[1], { event_id: "event-a" });
  assertScope(requests[2], { member_id: "member-a" });
  for (const request of requests) {
    assert.equal(request.method, "GET");
    assert.equal(request.url.searchParams.get("order"), "attendance_date.desc,created_at.desc,id.asc");
  }
});

test("family history uses an inner composite-member join with church filters on both tables", async () => {
  const { service, requests } = setup();
  const rows = await service.getFamilyAttendanceHistory("church-a", "family-a");
  assert.equal(rows.length, 1);
  assertScope(requests[0], { "members.church_id": "church-a", "members.family_id": "family-a" });
  assert.match(requests[0].url.searchParams.get("select"), /members!attendance_member_id_fkey!inner\(church_id,family_id\)/);
  assert.equal(requests.length, 1, "Family filtering must not depend on a separately limited list of members");
  assert.equal(rows[0].memberId, "member-a");
  assert.equal("members" in rows[0], false, "Join internals are not exposed in the attendance record");
  const empty = setup({ rows: [] });
  for (const call of [
    () => empty.service.loadAttendanceRecords("church-a"), () => empty.service.loadAttendanceByEvent("church-a", "event-missing"),
    () => empty.service.getMemberAttendanceHistory("church-a", "member-missing"), () => empty.service.getFamilyAttendanceHistory("church-a", "family-missing"),
  ]) assert.equal((await call()).length, 0);
});

test("recording attendance binds church and recorder to trusted arguments and never upserts", async () => {
  const { service, requests, state } = setup();
  const result = await service.recordAttendance("church-a", { ...input, church_id: "church-b", recorded_by: "forged", id: "forged", created_at: "forged" });
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].url.pathname, "/rest/v1/attendance");
  assert.deepEqual(requests[0].payload, { church_id: "church-a", recorded_by: "user-a", member_id: "member-a", event_id: "event-a", attendance_date: "2026-09-15", status: "Late", notes: "Arrived late" });
  assert.doesNotMatch(requests[0].headers.get("Prefer") || "", /resolution=/);
  assert.equal(result.recordedBy, "user-a");
  assert.equal(state.authCalls, 1);
  await service.recordAttendance("church-a", { memberId: "member-a", attendanceDate: "2024-02-29" });
  assert.equal(requests[1].payload.event_id, null);
  assert.equal(requests[1].payload.status, "Present");
  assert.equal(requests[1].payload.notes, "");
  assert.equal(requests[1].payload.attendance_date, "2024-02-29");
});

test("partial attendance updates preserve omitted fields and original recording metadata", async () => {
  const { service, requests } = setup();
  const result = await service.updateAttendance("church-a", "attendance-a", { status: "Excused", notes: "  ", church_id: "church-b", recorded_by: "forged", created_at: "forged" });
  assertScope(requests[0], { id: "attendance-a" });
  assert.equal(requests[0].method, "PATCH");
  assert.deepEqual(requests[0].payload, { status: "Excused", notes: "" });
  assert.equal(result.recordedBy, "original-user");
  assert.equal(result.memberId, "member-a");
  assert.equal(result.eventId, "event-a");
  await service.updateAttendance("church-a", "attendance-a", { eventId: null });
  assert.deepEqual(requests[1].payload, { event_id: null });
  await service.updateAttendance("church-a", "attendance-a", { memberId: "member-b", eventId: "event-b", attendanceDate: "2026-09-16" });
  assert.deepEqual(requests[2].payload, { member_id: "member-b", event_id: "event-b", attendance_date: "2026-09-16" });
  assertScope(requests[2], { id: "attendance-a" });
});

test("attendance validates dates, statuses, identifiers, and nonempty updates before writes", async () => {
  const { service, requests, state } = setup();
  for (const attendanceDate of ["", "2026-02-29", "2026-04-31", "2026-13-01", "2026-00-01", "2026-09-00", "2026-9-1", "2026-09-15T00:00:00Z", "0000-01-01", null]) {
    await assert.rejects(() => service.recordAttendance("church-a", { ...input, attendanceDate }), /valid attendance date/);
    await assert.rejects(() => service.updateAttendance("church-a", "attendance-a", { attendanceDate }), /valid attendance date/);
  }
  await assert.rejects(() => service.recordAttendance("church-a", { ...input, attendanceDate: undefined }), /valid attendance date/);
  for (const status of ["present", "Unknown", "", null]) {
    await assert.rejects(() => service.recordAttendance("church-a", { ...input, status }), /valid attendance status/);
    await assert.rejects(() => service.updateAttendance("church-a", "attendance-a", { status }), /valid attendance status/);
  }
  for (const id of ["", " ", null, undefined]) {
    await assert.rejects(() => service.loadAttendanceByEvent("church-a", id), /Event is required/);
    await assert.rejects(() => service.getMemberAttendanceHistory("church-a", id), /Member is required/);
    await assert.rejects(() => service.getFamilyAttendanceHistory("church-a", id), /Family is required/);
    await assert.rejects(() => service.updateAttendance("church-a", id, { status: "Late" }), /Attendance record is required/);
    await assert.rejects(() => service.recordAttendance("church-a", { ...input, memberId: id }), /Member is required/);
  }
  for (const eventId of ["", " "]) await assert.rejects(() => service.recordAttendance("church-a", { ...input, eventId }), /Event is required/);
  await assert.rejects(() => service.updateAttendance("church-a", "attendance-a", {}), /at least one attendance field/);
  await assert.rejects(() => service.updateAttendance("church-a", "attendance-a", { church_id: "church-b", recorded_by: "forged" }), /at least one attendance field/);
  await assert.rejects(() => service.recordAttendance("church-a", { ...input, notes: null }), /notes must be text/);
  assert.equal(requests.length, 0);
  assert.equal(state.authCalls, 0);
});

test("all four attendance statuses are supported and nullable record metadata is preserved", async () => {
  const { service } = setup();
  for (const status of ["Present", "Absent", "Late", "Excused"]) {
    assert.equal((await service.recordAttendance("church-a", { ...input, status })).status, status);
  }
  const nullable = setup({ rows: [{ ...record, event_id: null, recorded_by: null }] });
  const [result] = await nullable.service.loadAttendanceRecords("church-a");
  assert.equal(result.eventId, null);
  assert.equal(result.recordedBy, null);
});

test("expired sessions and missing Supabase configuration stop attendance operations", async () => {
  for (const options of [{ user: null }, { authError: { message: "Invalid session" } }]) {
    const { service, requests } = setup(options);
    await assert.rejects(() => service.recordAttendance("church-a", input), /session/i);
    assert.equal(requests.length, 0);
  }
  const { service, requests } = setup({ configured: false });
  for (const call of operations(service, "church-a")) await assert.rejects(call, /Supabase is not configured/);
  assert.equal(requests.length, 0);
});

test("attendance surfaces RLS, missing-row, cross-church FK, and duplicate errors without fallback writes", async () => {
  for (const failure of [
    { status: 403, body: { code: "42501", message: "Permission denied" } },
    { status: 406, body: { code: "PGRST116", message: "No matching attendance row" } },
    { status: 409, body: { code: "23503", message: "Cross-church member or event foreign key violation" } },
    { status: 409, body: { code: "23505", message: "Duplicate attendance record" } },
  ]) {
    const { service, requests } = setup({ failure });
    const calls = operations(service, "church-a");
    for (const call of calls) await assert.rejects(call, new RegExp(failure.body.message));
    assert.equal(requests.length, calls.length, "Failure must not retry or change the operation");
  }
});
