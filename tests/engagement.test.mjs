import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";
import { buildAttendanceReport } from "../src/reporting/attendanceCalculations.ts";

const source = fs.readFileSync(new URL("../src/services/engagement.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const at = "2026-09-20T01:00:00.000Z";
const row = (id, status, member = "member-a", date = "2026-09-15", event = "event-a", church = "church-a") => ({ id, church_id: church, member_id: member, attendance_date: date, event_id: event, status });
const fixtures = () => ({
  members: [{ id: "member-a", church_id: "church-a", membership_status: "Active" }, { id: "member-b", church_id: "church-a", membership_status: "Inactive" }, { id: "unrecorded", church_id: "church-a" }, { id: "foreign", church_id: "church-b" }],
  families: [{ id: "family-a", church_id: "church-a" }, { id: "family-b", church_id: "church-a" }, { id: "foreign", church_id: "church-b" }],
  attendance: [row("1", "Present"), row("2", "Late", "member-b"), row("3", "Absent", "member-a", "2026-09-16", null), row("4", "Excused", "member-b", "2026-09-16", "event-b"), row("5", "Present", "foreign", "2026-09-17", "foreign", "church-b")],
  events: [
    { id: "now", church_id: "church-a", starts_at: at },
    { id: "future", church_id: "church-a", starts_at: "2026-09-21T01:00:00Z" },
    { id: "past", church_id: "church-a", starts_at: "2026-09-19T01:00:00Z", ends_at: "2026-09-22T01:00:00Z" },
    { id: "foreign", church_id: "church-b", starts_at: at },
  ],
  announcements: [
    { id: "now", church_id: "church-a", is_published: true, publish_at: at, expires_at: "2026-09-21T01:00:00Z" },
    { id: "indefinite", church_id: "church-a", is_published: true, publish_at: "2026-09-19T01:00:00Z", expires_at: null },
    { id: "draft", church_id: "church-a", is_published: false, publish_at: at, expires_at: null },
    { id: "future", church_id: "church-a", is_published: true, publish_at: "2026-09-20T01:00:00.001Z", expires_at: null },
    { id: "expires-now", church_id: "church-a", is_published: true, publish_at: at, expires_at: at },
    { id: "expired", church_id: "church-a", is_published: true, publish_at: "2026-09-18T01:00:00Z", expires_at: "2026-09-19T01:00:00Z" },
    { id: "foreign", church_id: "church-b", is_published: true, publish_at: at, expires_at: null },
  ],
});
function setup({ data = fixtures(), pageCap = 1000, configured = true, failure, missingCount, emptyPageAt, pause } = {}) {
  const requests = [], state = { authCalls: 0 };
  const supabase = createClient("https://engagement-tests.invalid", "test-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      const parsed = new URL(url), table = parsed.pathname.split("/").at(-1), params = parsed.searchParams;
      assert.equal(parsed.origin, "https://engagement-tests.invalid");
      const request = { url: parsed, method: init.method, headers: new Headers(init.headers), table };
      requests.push(request);
      const offset = Number(params.get("offset") || 0);
      if (pause) await pause(table);
      if (failure?.table === table && (failure.offset === undefined || failure.offset === offset)) {
        return new Response(init.method === "HEAD" ? null : JSON.stringify({ code: "42501", message: "Permission denied" }), { status: failure.status || 403, statusText: "Permission denied", headers: { "Content-Type": "application/json" } });
      }
      let rows = data[table].filter(row => `eq.${row.church_id}` === params.get("church_id"));
      if (table === "events" && params.has("starts_at")) rows = rows.filter(row => Date.parse(row.starts_at) >= Date.parse(params.get("starts_at").slice(4)));
      if (table === "announcements") {
        if (params.has("is_published")) rows = rows.filter(row => `eq.${row.is_published}` === params.get("is_published"));
        if (params.has("publish_at")) rows = rows.filter(row => Date.parse(row.publish_at) <= Date.parse(params.get("publish_at").slice(4)));
        if (params.has("or")) {
          const match = /^\(expires_at\.is\.null,expires_at\.gt\.(.+)\)$/.exec(params.get("or"));
          assert.ok(match);
          rows = rows.filter(row => row.expires_at === null || Date.parse(row.expires_at) > Date.parse(match[1]));
        }
      }
      rows.sort((a, b) => a.id.localeCompare(b.id));
      const total = rows.length;
      const limit = Math.min(Number(params.get("limit") || pageCap), pageCap);
      const page = table === "attendance" && offset === emptyPageAt ? [] : rows.slice(offset, offset + limit);
      const headers = { "Content-Type": "application/json" };
      if (missingCount !== table) headers["Content-Range"] = page.length ? `${offset}-${offset + page.length - 1}/${total}` : `*/${total}`;
      return new Response(init.method === "HEAD" ? null : JSON.stringify(page), { status: 200, headers });
    } },
  });
  supabase.auth.getUser = async () => { state.authCalls++; throw new Error("Read-only aggregation must not use privileged auth operations"); };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: id => { assert.equal(id, "../lib/supabase"); return { supabase: configured ? supabase : null }; } });
  return { service: exports, requests, state };
}
const plain = value => JSON.parse(JSON.stringify(value));
const reportRecords = rows => rows.map(row => ({ id: row.id, churchId: row.church_id, memberId: row.member_id, eventId: row.event_id, attendanceDate: row.attendance_date, status: row.status, notes: "", recordedBy: null, createdAt: "", updatedAt: "" }));

test("engagement requires church scope and valid reference time before any request", async () => {
  const { service, requests, state } = setup();
  for (const churchId of ["", " ", null, undefined]) await assert.rejects(() => service.loadEngagementSummary(churchId), /Church workspace is required/);
  for (const invalid of ["", null, "2026-02-30T00:00Z", "2026-09-20", "2026-09-20T01:00", "0000-01-01T00:00Z", "2026-09-20T01:00Z),church_id.neq.church-a"]) {
    await assert.rejects(() => service.loadEngagementSummary("church-a", invalid), /valid ISO timestamp/);
  }
  assert.equal(requests.length, 0); assert.equal(state.authCalls, 0);
  const unavailable = setup({ configured: false });
  await assert.rejects(() => unavailable.service.loadEngagementSummary("church-a"), /Supabase is not configured/);
  assert.equal(unavailable.requests.length, 0);
});

test("engagement aggregates every requested metric without foreign-church data or inferred absences", async () => {
  const { service, requests, state } = setup();
  const result = await service.loadEngagementSummary("church-a", "2026-09-20T09:00:00+08:00");
  assert.deepEqual(plain(result), { churchId: "church-a", asOf: at, memberCount: 3, familyCount: 2,
    attendanceSummary: { totalRecords: 4, present: 1, late: 1, absent: 1, excused: 1, attended: 2, memberCount: 2, sessionCount: 3, attendanceRate: 50 }, upcomingEventsCount: 2, activeAnnouncementsCount: 2 });
  assert.deepEqual(plain(result.attendanceSummary), buildAttendanceReport("church-a", reportRecords(fixtures().attendance), [], []).summary);
  assert.equal(requests.length, 5);
  for (const request of requests) {
    assert.equal(request.url.searchParams.get("church_id"), "eq.church-a");
    assert.match(request.headers.get("Prefer"), /count=exact/);
    assert.equal(request.method, request.table === "attendance" ? "GET" : "HEAD");
    assert.equal(request.url.searchParams.get("select"), request.table === "attendance" ? "id,church_id,member_id,event_id,attendance_date,status" : "id");
  }
  assert.equal(state.authCalls, 0);
});

test("event and announcement counts use the same instant and preserve schedule boundaries", async () => {
  const { service, requests } = setup();
  await service.loadEngagementSummary("church-a", at);
  const events = requests.find(row => row.table === "events").url.searchParams;
  const announcements = requests.find(row => row.table === "announcements").url.searchParams;
  assert.equal(events.get("starts_at"), `gte.${at}`);
  assert.equal(announcements.get("is_published"), "eq.true");
  assert.equal(announcements.get("publish_at"), `lte.${at}`);
  assert.equal(announcements.get("or"), `(expires_at.is.null,expires_at.gt.${at})`);
  const before = Date.now();
  const current = await service.loadEngagementSummary("church-a");
  assert.ok(Date.parse(current.asOf) >= before && Date.parse(current.asOf) <= Date.now());
  const later = requests.slice(5);
  assert.equal(later.find(row => row.table === "events").url.searchParams.get("starts_at"), `gte.${current.asOf}`);
  assert.equal(later.find(row => row.table === "announcements").url.searchParams.get("publish_at"), `lte.${current.asOf}`);
});

test("empty churches have zero totals and no invented attendance rate", async () => {
  const data = Object.fromEntries(Object.keys(fixtures()).map(table => [table, []]));
  const result = await setup({ data }).service.loadEngagementSummary("church-a", at);
  assert.equal(result.memberCount, 0); assert.equal(result.familyCount, 0);
  assert.equal(result.upcomingEventsCount, 0); assert.equal(result.activeAnnouncementsCount, 0);
  assert.deepEqual(plain(result.attendanceSummary), buildAttendanceReport("church-a", [], [], []).summary);
  assert.equal(result.attendanceSummary.attendanceRate, null);
});

test("exact counts and attendance pagination exceed API page limits, including lower server caps", async () => {
  const data = fixtures();
  data.members = Array.from({ length: 2505 }, (_, i) => ({ id: `member-${i}`, church_id: "church-a" }));
  data.families = Array.from({ length: 1505 }, (_, i) => ({ id: `family-${i}`, church_id: "church-a" }));
  data.events = Array.from({ length: 1105 }, (_, i) => ({ id: `event-${i}`, church_id: "church-a", starts_at: at }));
  data.announcements = Array.from({ length: 1205 }, (_, i) => ({ id: `announcement-${i}`, church_id: "church-a", is_published: true, publish_at: at, expires_at: null }));
  data.attendance = Array.from({ length: 2505 }, (_, i) => row(String(i).padStart(5, "0"), ["Present", "Late", "Absent", "Excused"][i % 4], `member-${i % 501}`));
  for (const pageCap of [1000, 137]) {
    const { service, requests } = setup({ data, pageCap });
    const result = await service.loadEngagementSummary("church-a", at);
    assert.equal(result.memberCount, 2505); assert.equal(result.familyCount, 1505);
    assert.equal(result.upcomingEventsCount, 1105); assert.equal(result.activeAnnouncementsCount, 1205);
    assert.deepEqual(plain(result.attendanceSummary), buildAttendanceReport("church-a", reportRecords(data.attendance), [], []).summary);
    const pages = requests.filter(request => request.table === "attendance");
    assert.equal(pages.length, Math.ceil(2505 / pageCap));
    pages.forEach((request, i) => {
      assert.equal(request.url.searchParams.get("offset"), String(i * pageCap));
      assert.equal(request.url.searchParams.get("limit"), "1000");
      assert.equal(request.url.searchParams.get("order"), "id.asc");
      assert.equal(request.url.searchParams.get("church_id"), "eq.church-a");
    });
  }
});

test("independent church counts and attendance reads start concurrently", async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { service, requests } = setup({ pause: () => gate });
  const pending = service.loadEngagementSummary("church-a", at);
  for (let i = 0; i < 20 && requests.length < 5; i++) await new Promise(resolve => setImmediate(resolve));
  const started = requests.length;
  release();
  await pending;
  assert.equal(started, 5, "Every independent read should begin before awaiting any one response");
});

test("RLS and later-page failures reject the aggregate instead of reporting partial totals", async () => {
  for (const table of Object.keys(fixtures())) {
    const { service, requests } = setup({ failure: { table } });
    await assert.rejects(() => service.loadEngagementSummary("church-a", at), /Unable to load engagement/);
    assert.equal(requests.length, 5, "No unscoped retry or fallback");
    assert.ok(requests.every(request => ["GET", "HEAD"].includes(request.method)));
  }
  const { service } = setup({ pageCap: 2, failure: { table: "attendance", offset: 2 } });
  await assert.rejects(() => service.loadEngagementSummary("church-a", at), /Unable to load engagement attendance/);
});

test("unavailable counts and incomplete attendance pages never silently become zero or partial summaries", async () => {
  for (const table of Object.keys(fixtures())) {
    const { service } = setup({ missingCount: table });
    await assert.rejects(() => service.loadEngagementSummary("church-a", at), /exact count was unavailable/);
  }
  await assert.rejects(() => setup({ pageCap: 2, emptyPageAt: 2 }).service.loadEngagementSummary("church-a", at), /incomplete attendance results/);
  const data = fixtures(); data.attendance[0].status = "Unknown";
  await assert.rejects(() => setup({ data }).service.loadEngagementSummary("church-a", at), /invalid attendance status/);
});
