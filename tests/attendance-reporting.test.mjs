import assert from "node:assert/strict";
import test from "node:test";
import { buildAttendanceReport } from "../src/reporting/attendanceCalculations.ts";

const members = [
  { id: "a", churchId: "church-a", name: "Ana", familyId: "family-a" },
  { id: "b", churchId: "church-a", name: "Ben", familyId: "family-a" },
  { id: "c", churchId: "church-a", name: "Cara", familyId: null },
  { id: "d", churchId: "church-a", name: "Dan", familyId: "family-empty" },
  { id: "foreign", churchId: "church-b", name: "Foreign member", familyId: "family-a" },
];
const families = [
  { id: "family-a", churchId: "church-a", name: "Family A" },
  { id: "family-empty", churchId: "church-a", name: "Empty family" },
  { id: "family-b", churchId: "church-b", name: "Foreign family" },
];
const row = (id, memberId, status, attendanceDate = "2026-09-15", eventId = "event-a", churchId = "church-a") =>
  ({ id, memberId, status, attendanceDate, eventId, churchId, notes: "", recordedBy: null, createdAt: "2026-09-15T00:00:00Z", updatedAt: "2026-09-15T00:00:00Z" });
const records = [row("1", "a", "Present"), row("2", "a", "Late", "2026-09-16"), row("3", "b", "Absent"), row("4", "c", "Excused")];
const report = (rows = records, range = {}) => buildAttendanceReport("church-a", rows, members, families, range);

test("overall attendance includes every recorded status and counts Late as attended", () => {
  assert.deepEqual(report().summary, { totalRecords: 4, present: 1, late: 1, absent: 1, excused: 1,
    attended: 2, memberCount: 3, sessionCount: 2, attendanceRate: 50 });
  assert.equal(report([row("1", "a", "Present"), row("2", "b", "Absent"), row("3", "c", "Excused")]).summary.attendanceRate, 33.33);
  assert.equal(report([row("1", "a", "Absent")]).summary.attendanceRate, 0);
});

test("unrecorded members and empty reports do not invent absences or a zero rate", () => {
  assert.equal(report().members.find(member => member.memberId === "d").summary.attendanceRate, null);
  const empty = report([]);
  assert.equal(empty.summary.totalRecords, 0);
  assert.equal(empty.summary.attendanceRate, null);
  assert.equal(empty.summary.absent, 0);
  assert.deepEqual(empty.trend, []);
  assert.ok(empty.members.every(member => member.history.length === 0));
  assert.equal(empty.families[0].memberCount, 2);
});

test("member history is newest first and input records remain unchanged", () => {
  const frozen = Object.freeze(records.map(record => Object.freeze({ ...record })));
  const result = report(frozen);
  assert.deepEqual(result.members[0].history.map(record => record.id), ["2", "1"]);
  assert.equal(result.members[0].summary.attendanceRate, 100);
  assert.deepEqual(frozen.map(record => record.id), ["1", "2", "3", "4"]);
});

test("families aggregate current members' records with a weighted rate", () => {
  const result = report();
  assert.equal(result.families[0].summary.attendanceRate, 66.67);
  assert.equal(result.families[0].summary.totalRecords, 3);
  assert.equal(result.families[0].memberCount, 2);
  assert.equal(result.families[1].summary.attendanceRate, null);
  const reassigned = buildAttendanceReport("church-a", records, members.map(member => member.id === "a" ? { ...member, familyId: "family-empty" } : member), families);
  assert.equal(reassigned.families[0].summary.attendanceRate, 0);
  assert.equal(reassigned.families[1].summary.attendanceRate, 100);
});

test("church filtering applies to records, members, families, histories and trend", () => {
  const result = report([...records, row("foreign", "a", "Absent", "2026-09-17", "event-a", "church-b")]);
  assert.deepEqual(result, report());
  assert.equal(result.members.length, 4);
  assert.equal(result.families.length, 2);
  assert.ok(result.members.every(member => member.name !== "Foreign member"));
  assert.throws(() => buildAttendanceReport(" ", records, members, families), /Church workspace/);
});

test("trend is chronological and distinguishes events and general attendance on the same date", () => {
  const result = report([...records, row("5", "a", "Present", "2026-09-15", "event-b"), row("6", "a", "Absent", "2026-09-15", null)]);
  assert.deepEqual(result.trend.map(point => point.date), ["2026-09-15", "2026-09-16"]);
  assert.equal(result.trend[0].summary.sessionCount, 3);
  assert.equal(result.trend[0].summary.totalRecords, 5);
  assert.equal(result.trend[0].summary.attendanceRate, 40);
  assert.equal(result.summary.sessionCount, 4);
});

test("date ranges are inclusive for every report and invalid dates fail clearly", () => {
  const selected = report(records, { from: "2026-09-15", to: "2026-09-15" });
  assert.equal(selected.summary.totalRecords, 3);
  assert.equal(selected.members[0].history.length, 1);
  assert.equal(selected.families[0].summary.totalRecords, 2);
  assert.equal(selected.trend.length, 1);
  assert.equal(report(records, { from: "2026-09-16" }).summary.totalRecords, 1);
  assert.equal(report(records, { to: "2026-09-14" }).summary.attendanceRate, null);
  for (const range of [{ from: "2026-02-30" }, { to: "not-a-date" }, { from: "0000-01-01" }, { from: "2026-09-16", to: "2026-09-15" }]) {
    assert.throws(() => report(records, range), /valid report dates|From date/);
  }
});
