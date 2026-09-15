import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

const compile = name => ts.transpileModule(fs.readFileSync(new URL(`../src/services/${name}.ts`, import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const compiled = { events: compile("events"), attendance: compile("attendance") };
const event = { id: "event-a", church_id: "church-a", title: "Sunday worship", description: "Weekly service", location: "Main hall",
  starts_at: "2026-09-20T01:00:00.000Z", ends_at: "2026-09-20T03:00:00.000Z", capacity: 100,
  created_by: "original-user", created_at: "2026-09-15T00:00:00Z", updated_at: "2026-09-15T00:00:00Z" };
const attendance = { id: "attendance-a", church_id: "church-a", member_id: "member-a", event_id: "event-a", attendance_date: "2026-09-20",
  status: "Present", notes: "", recorded_by: null, created_at: "2026-09-20T01:00:00Z", updated_at: "2026-09-20T01:00:00Z" };
const input = { title: "  Sunday worship  ", description: " Weekly service ", location: " Main hall ",
  startsAt: "2026-09-20T09:00:00+08:00", endsAt: "2026-09-20T11:00:00+08:00", capacity: 100 };

function setup({ failure, user = { id: "user-a" }, authError = null, rows = [event], attendanceRows = [attendance], configured = true } = {}) {
  const requests = [], state = { authCalls: 0 };
  const supabase = createClient("https://events-tests.invalid", "test-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      const parsed = new URL(url);
      assert.equal(parsed.origin, "https://events-tests.invalid");
      const request = { url: parsed, method: init.method, payload: init.body ? JSON.parse(init.body) : undefined, headers: new Headers(init.headers) };
      requests.push(request);
      const single = request.headers.get("Accept")?.includes("vnd.pgrst.object");
      const body = failure?.body || (parsed.pathname.endsWith("/attendance") ? attendanceRows : single ? { ...event, ...request.payload } : rows);
      return new Response(JSON.stringify(body), { status: failure?.status || 200, headers: { "Content-Type": "application/json" } });
    } },
  });
  supabase.auth.getUser = async () => { state.authCalls++; return { data: { user }, error: authError }; };
  const modules = {};
  function load(name) {
    if (modules[name]) return modules[name];
    const exports = {}; modules[name] = exports;
    vm.runInNewContext(compiled[name], { exports, require: id => {
      if (id === "../lib/supabase") return { supabase: configured ? supabase : null };
      if (id === "./attendance") return load("attendance");
      throw new Error(`Unexpected dependency: ${id}`);
    } });
    return exports;
  }
  return { service: load("events"), requests, state };
}
const operations = (service, churchId) => [
  () => service.loadEvents(churchId), () => service.createEvent(churchId, input),
  () => service.updateEvent(churchId, "event-a", input), () => service.deleteEvent(churchId, "event-a"),
  () => service.loadUpcomingEvents(churchId), () => service.loadEventAttendance(churchId, "event-a"),
];
function assertScope(request, filters = {}, table = "events") {
  assert.equal(request.url.pathname, `/rest/v1/${table}`);
  for (const [key, value] of Object.entries({ church_id: "church-a", ...filters })) {
    assert.equal(request.url.searchParams.get(key), `eq.${value}`, `${key} must scope the real request`);
  }
}
function assertMapping(result, row) {
  assert.equal(Object.keys(result).length, Object.keys(row).length);
  for (const [key, value] of Object.entries(row)) assert.equal(result[key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())], value);
}

test("all event operations reject missing church scope before any query or authentication", async () => {
  const { service, requests, state } = setup();
  for (const churchId of ["", " ", null, undefined]) {
    for (const call of operations(service, churchId)) await assert.rejects(call, /Church workspace is required/);
  }
  assert.equal(requests.length, 0);
  assert.equal(state.authCalls, 0);
});

test("event lists map all fields, nullable metadata, and deterministic church-scoped ordering", async () => {
  const { service, requests } = setup();
  assertMapping((await service.loadEvents("church-a"))[0], event);
  assertScope(requests[0]);
  assert.equal(requests[0].method, "GET");
  assert.equal(requests[0].url.searchParams.get("order"), "starts_at.desc,id.asc");
  const nullable = { ...event, ends_at: null, capacity: null, created_by: null };
  assertMapping((await setup({ rows: [nullable] }).service.loadEvents("church-a"))[0], nullable);
  const empty = setup({ rows: [], attendanceRows: [] });
  assert.equal((await empty.service.loadEvents("church-a")).length, 0);
  assert.equal((await empty.service.loadUpcomingEvents("church-a")).length, 0);
  assert.equal((await empty.service.loadEventAttendance("church-a", "event-missing")).length, 0);
});

test("upcoming events use an inclusive timestamp filter and soonest-first ordering", async () => {
  const { service, requests } = setup();
  assertMapping((await service.loadUpcomingEvents("church-a", "2026-09-20T09:00:00+08:00"))[0], event);
  assertScope(requests[0]);
  assert.equal(requests[0].url.searchParams.get("starts_at"), "gte.2026-09-20T01:00:00.000Z");
  assert.equal(requests[0].url.searchParams.get("order"), "starts_at.asc,id.asc");
  const before = Date.now();
  await service.loadUpcomingEvents("church-a");
  const time = Date.parse(requests[1].url.searchParams.get("starts_at").slice(4));
  assert.ok(time >= before && time <= Date.now(), "Default reference time is now");
  assertScope(requests[1]);
});

test("creating events validates and whitelists details and binds trusted church and creator", async () => {
  const { service, requests, state } = setup();
  const result = await service.createEvent("church-a", { ...input, church_id: "church-b", churchId: "church-b", created_by: "forged", createdBy: "forged", id: "forged", created_at: "forged", updated_at: "forged" });
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].url.pathname, "/rest/v1/events");
  assert.deepEqual(requests[0].payload, { church_id: "church-a", created_by: "user-a", title: "Sunday worship", description: "Weekly service", location: "Main hall",
    starts_at: "2026-09-20T01:00:00.000Z", ends_at: "2026-09-20T03:00:00.000Z", capacity: 100 });
  assert.doesNotMatch(requests[0].headers.get("Prefer") || "", /resolution=/);
  assert.equal(result.createdBy, "user-a");
  assert.equal(state.authCalls, 1);
  await service.createEvent("church-a", { title: "Leap day", startsAt: "2024-02-29T12:00Z" });
  assert.deepEqual(requests[1].payload, { church_id: "church-a", created_by: "user-a", title: "Leap day", description: "", location: "", starts_at: "2024-02-29T12:00:00.000Z", ends_at: null, capacity: null });
});

test("event replacement updates and deletes are tenant/id scoped and never write attendance directly", async () => {
  const { service, requests } = setup();
  const result = await service.updateEvent("church-a", "event-a", { ...input, description: "", location: "", endsAt: null, capacity: 0, church_id: "church-b", created_by: "forged" });
  assertScope(requests[0], { id: "event-a" });
  assert.equal(requests[0].method, "PATCH");
  assert.deepEqual(requests[0].payload, { title: "Sunday worship", description: "", location: "", starts_at: "2026-09-20T01:00:00.000Z", ends_at: null, capacity: 0 });
  assert.equal(result.createdBy, "original-user");
  await service.updateEvent("church-a", "event-a", { title: "Short event", startsAt: input.startsAt });
  assert.equal(requests[1].payload.ends_at, null);
  assert.equal(requests[1].payload.capacity, null);
  await service.deleteEvent("church-a", "event-a");
  assertScope(requests[2], { id: "event-a" });
  assert.equal(requests[2].method, "DELETE");
  assert.equal(requests[2].url.searchParams.get("select"), "id");
  assert.match(requests[2].headers.get("Accept"), /vnd.pgrst.object/);
  assert.equal(requests.length, 3, "Existing database relationships handle event deletion; no extra service writes");
});

test("event attendance reuses the existing read with church and event filters and full metadata", async () => {
  const rows = ["Present", "Late", "Absent", "Excused"].map((status, index) => ({ ...attendance, id: `attendance-${index}`, status }));
  const { service, requests } = setup({ attendanceRows: rows });
  const result = await service.loadEventAttendance("church-a", "event-a");
  result.forEach((record, index) => assertMapping(record, rows[index]));
  assertScope(requests[0], { event_id: "event-a" }, "attendance");
  assert.equal(requests[0].method, "GET");
  assert.equal(requests[0].url.searchParams.get("order"), "attendance_date.desc,created_at.desc,id.asc");
  assert.equal(requests.length, 1);
});

test("invalid event details, identifiers and date ranges fail before HTTP or auth", async () => {
  const { service, requests, state } = setup();
  for (const id of ["", " ", null, undefined]) {
    await assert.rejects(() => service.updateEvent("church-a", id, input), /Event is required/);
    await assert.rejects(() => service.deleteEvent("church-a", id), /Event is required/);
    await assert.rejects(() => service.loadEventAttendance("church-a", id), /Event is required/);
  }
  const invalidInputs = [
    ...["", " ", null, undefined].map(title => ({ ...input, title })),
    ...["", "2026-02-30T09:00:00Z", "2026-09-20", "2026-09-20T09:00", "0000-01-01T00:00Z", "2026-09-20T24:00Z", "bad", null, undefined].map(startsAt => ({ ...input, startsAt })),
    { ...input, endsAt: "2026-09-20T00:59:59Z" }, { ...input, endsAt: "bad" },
    ...[-1, 1.5, Infinity, NaN, 2147483648, "100"].map(capacity => ({ ...input, capacity })),
    { ...input, description: null }, { ...input, location: 1 },
  ];
  for (const value of invalidInputs) {
    await assert.rejects(() => service.createEvent("church-a", value));
    await assert.rejects(() => service.updateEvent("church-a", "event-a", value));
  }
  for (const from of ["", "invalid", "2026-02-30T00:00Z", null]) await assert.rejects(() => service.loadUpcomingEvents("church-a", from), /valid ISO timestamp/);
  assert.equal(requests.length, 0);
  assert.equal(state.authCalls, 0);
  await service.createEvent("church-a", { ...input, endsAt: "2026-09-20T01:00:00Z", capacity: 2147483647 });
  assert.equal(requests.length, 1, "Equal instants in different timezones are valid");
});

test("expired authentication and missing configuration stop event operations", async () => {
  for (const options of [{ user: null }, { authError: { message: "Invalid session" } }]) {
    const { service, requests } = setup(options);
    await assert.rejects(() => service.createEvent("church-a", input), /session/i);
    assert.equal(requests.length, 0);
  }
  const { service, requests } = setup({ configured: false });
  for (const call of operations(service, "church-a")) await assert.rejects(call, /Supabase is not configured/);
  assert.equal(requests.length, 0);
});

test("event operations surface RLS, missing-row and constraint errors without fallback requests", async () => {
  for (const failure of [
    { status: 403, body: { code: "42501", message: "Permission denied" } },
    { status: 406, body: { code: "PGRST116", message: "No matching row" } },
    { status: 409, body: { code: "23503", message: "Foreign key constraint" } },
    { status: 400, body: { code: "23514", message: "Event check constraint" } },
  ]) {
    const { service, requests } = setup({ failure });
    const calls = operations(service, "church-a");
    for (const call of calls) await assert.rejects(call, new RegExp(failure.body.message));
    assert.equal(requests.length, calls.length, "No retry, upsert or unscoped fallback");
  }
});
