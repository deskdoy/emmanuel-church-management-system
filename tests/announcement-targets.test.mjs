import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

const compiled = ts.transpileModule(fs.readFileSync(new URL("../src/services/announcementTargets.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const target = (id, type, targetId, church = "church-a", announcement = "announcement-a") => ({ id, church_id: church, announcement_id: announcement, target_type: type, target_id: targetId, created_at: "2026-09-20T00:00:00Z" });
const member = (id, family = "family-a", status = "Active", church = "church-a") => ({ id, church_id: church, family_id: family, membership_status: status, first_name: id, middle_name: "", last_name: "Member" });
const membership = (id, userId, role = "role-a", status = "active", active = true, church = "church-a") => ({ id, church_id: church, user_id: userId, role_id: role, status, users: { id: userId, full_name: userId, is_active: active } });
const fixtures = () => ({
  announcement_targets: [target("t1", "Member", "m1"), target("t2", "Family", "family-a"), target("t3", "Event", "event-a"), target("t4", "Role", "role-a"), target("foreign", "All", null, "church-b"), target("other", "All", null, "church-a", "other")],
  announcements: [{ id: "announcement-a", church_id: "church-a" }, { id: "foreign", church_id: "church-b" }],
  members: [member("m1"), member("m2"), member("m3", "family-a", "Inactive"), member("m4", "family-b"), member("foreign", "family-a", "Active", "church-b")],
  families: [{ id: "family-a", church_id: "church-a" }, { id: "family-b", church_id: "church-a" }, { id: "foreign", church_id: "church-b" }],
  events: [{ id: "event-a", church_id: "church-a" }, { id: "foreign", church_id: "church-b" }],
  attendance: [
    { id: "a1", church_id: "church-a", event_id: "event-a", member_id: "m1", status: "Present" },
    { id: "a2", church_id: "church-a", event_id: "event-a", member_id: "m1", status: "Late" },
    { id: "a3", church_id: "church-a", event_id: "event-a", member_id: "m2", status: "Late" },
    { id: "a4", church_id: "church-a", event_id: "event-a", member_id: "m4", status: "Absent" },
    { id: "a5", church_id: "church-a", event_id: "event-a", member_id: "m4", status: "Excused" },
    { id: "a6", church_id: "church-a", event_id: "event-a", member_id: "m3", status: "Present" },
    { id: "a7", church_id: "church-b", event_id: "event-a", member_id: "foreign", status: "Present" },
    { id: "a8", church_id: "church-a", event_id: "other", member_id: "m4", status: "Present" },
  ],
  church_memberships: [membership("c1", "u1"), membership("c2", "u2", "role-b"), membership("c3", "disabled", "role-a", "active", false), membership("c4", "revoked", "role-a", "revoked"), membership("c5", "foreign", "role-a", "active", true, "church-b")],
});
function setup({ data = fixtures(), configured = true, fail, pageCap = 1000, missingCount, emptyPageAt, hiddenUsers = [] } = {}) {
  const requests = [];
  const db = createClient("https://target-tests.invalid", "test-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      const parsed = new URL(url), table = parsed.pathname.split("/").at(-1), params = parsed.searchParams;
      assert.equal(parsed.origin, "https://target-tests.invalid");
      const request = { table, params, method: init.method, headers: new Headers(init.headers), payload: init.body ? JSON.parse(init.body) : undefined };
      requests.push(request);
      const response = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
      const offset = Number(params.get("offset") || 0);
      if (fail && fail.table === table && (fail.offset === undefined || fail.offset === offset)) return response({ message: fail.message || "Permission denied", code: fail.code || "42501" }, fail.status || 403);
      if (init.method === "POST") return response({ id: "new", created_at: "2026-09-20T00:00:00Z", ...request.payload }, 201);
      let rows = data[table];
      if (table === "attendance") rows = rows.map(row => ({ ...row, members: data.members.find(m => m.id === row.member_id && m.church_id === row.church_id) || null }));
      if (table === "church_memberships") rows = rows.filter(row => !hiddenUsers.includes(row.user_id));
      rows = rows.filter(row => [...params].every(([key, filter]) => {
        if (["select", "order", "offset", "limit"].includes(key)) return true;
        let value = row;
        for (const part of key.split(".")) { if (Array.isArray(value)) value = value[0]; value = value?.[part]; }
        if (filter.startsWith("eq.")) return String(value) === filter.slice(3);
        if (filter.startsWith("in.(")) return filter.slice(4, -1).split(",").includes(value);
        throw new Error(`Unexpected filter ${key}: ${filter}`);
      })).sort((a, b) => a.id.localeCompare(b.id));
      const single = request.headers.get("Accept")?.includes("vnd.pgrst.object");
      if (single) return rows.length === 1 ? response(rows[0]) : response({ message: "Row unavailable", code: "PGRST116" }, 406);
      const total = rows.length;
      const page = table === "members" && offset === emptyPageAt ? [] : rows.slice(offset, offset + Math.min(Number(params.get("limit") || pageCap), pageCap));
      const headers = missingCount === table ? {} : { "Content-Range": page.length ? `${offset}-${offset + page.length - 1}/${total}` : `*/${total}` };
      return response(page, 200, headers);
    } },
  });
  db.auth.getUser = async () => { throw new Error("Unexpected auth lookup"); };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: id => { assert.equal(id, "../lib/supabase"); return { supabase: configured ? db : null }; } });
  return { service: exports, requests };
}
const input = { targetType: "Member", targetId: "m1" };
const operations = (s, church) => [() => s.loadAnnouncementTargets(church, "announcement-a"), () => s.addAnnouncementTarget(church, "announcement-a", input), () => s.removeAnnouncementTarget(church, "t1"), () => s.getAnnouncementAudience(church, "announcement-a"), () => s.getTargetRecipients(church, input)];
const ids = rows => Array.from(rows, row => `${row.kind}:${row.id}`);
const plain = value => JSON.parse(JSON.stringify(value));
function scoped(requests) { for (const r of requests) assert.equal(r.method === "POST" ? r.payload.church_id : r.params.get("church_id"), r.method === "POST" ? "church-a" : "eq.church-a", `${r.table} is tenant-scoped`); }

test("every targeting operation rejects absent church scope and configuration before HTTP", async () => {
  const { service, requests } = setup();
  for (const church of ["", " ", undefined, null]) for (const call of operations(service, church)) await assert.rejects(call, /Church workspace is required/);
  assert.equal(requests.length, 0);
  const unavailable = setup({ configured: false });
  for (const call of operations(unavailable.service, "church-a")) await assert.rejects(call, /Supabase is not configured/);
  assert.equal(unavailable.requests.length, 0);
});

test("target input validation fails before requests and never treats invalid targets as All", async () => {
  const { service, requests } = setup();
  for (const bad of [null, {}, { targetType: "Unknown" }, { targetType: "All", targetId: "m1" }, ...["Member", "Family", "Event", "Role"].flatMap(targetType => [null, "", " ", undefined].map(targetId => ({ targetType, targetId })))]) {
    await assert.rejects(() => service.addAnnouncementTarget("church-a", "announcement-a", bad), /target|Target/);
    await assert.rejects(() => service.getTargetRecipients("church-a", bad), /target|Target/);
  }
  await assert.rejects(() => service.loadAnnouncementTargets("church-a", ""), /Announcement is required/);
  await assert.rejects(() => service.addAnnouncementTarget("church-a", "", input), /Announcement is required/);
  await assert.rejects(() => service.getAnnouncementAudience("church-a", ""), /Announcement is required/);
  await assert.rejects(() => service.removeAnnouncementTarget("church-a", ""), /Announcement target is required/);
  assert.equal(requests.length, 0);
});

test("load maps all target metadata and filters church and announcement on every page", async () => {
  const { service, requests } = setup({ pageCap: 2 });
  const rows = await service.loadAnnouncementTargets("church-a", "announcement-a");
  assert.deepEqual(plain(rows[0]), { id: "t1", churchId: "church-a", announcementId: "announcement-a", targetType: "Member", targetId: "m1", createdAt: "2026-09-20T00:00:00Z" });
  assert.equal(rows.length, 4); assert.equal(requests.length, 2);
  scoped(requests);
  for (const r of requests) { assert.equal(r.params.get("announcement_id"), "eq.announcement-a"); assert.equal(r.params.get("order"), "id.asc"); }
});

test("add supports all five types and whitelists payload; remove is church/id scoped", async () => {
  const { service, requests } = setup();
  for (const targetType of ["All", "Member", "Family", "Event", "Role"]) {
    const targetId = targetType === "All" ? undefined : "target-a";
    const row = await service.addAnnouncementTarget("church-a", "announcement-a", { targetType, targetId, id: "forged", church_id: "foreign", announcement_id: "foreign", created_at: "forged" });
    assert.equal(row.targetType, targetType); assert.equal(row.targetId, targetId ?? null);
    const r = requests.at(-1);
    assert.deepEqual(r.payload, { church_id: "church-a", announcement_id: "announcement-a", target_type: targetType, target_id: targetId ?? null });
    assert.doesNotMatch(r.headers.get("Prefer") || "", /resolution=/);
  }
  await service.removeAnnouncementTarget("church-a", "t1");
  assert.equal(requests.at(-1).method, "DELETE"); assert.equal(requests.at(-1).params.get("id"), "eq.t1");
  assert.ok(requests.every(r => r.table === "announcement_targets")); scoped(requests);
});

test("Member and Family resolve only active same-church profiles; stale targets stay empty", async () => {
  const { service, requests } = setup();
  assert.deepEqual(ids(await service.getTargetRecipients("church-a", input)), ["member:m1"]);
  assert.deepEqual(ids(await service.getTargetRecipients("church-a", { targetType: "Family", targetId: "family-a" })), ["member:m1", "member:m2"]);
  for (const targetType of ["Member", "Family", "Event"]) {
    assert.deepEqual(ids(await service.getTargetRecipients("church-a", { targetType, targetId: "foreign" })), []);
    assert.deepEqual(ids(await service.getTargetRecipients("church-a", { targetType, targetId: "missing" })), []);
  }
  assert.deepEqual(ids(await service.getTargetRecipients("church-a", { targetType: "Member", targetId: "m3" })), []);
  scoped(requests);
});

test("Event resolves Present/Late attendees once and applies tenant filters to both attendance and member join", async () => {
  const { service, requests } = setup({ pageCap: 1 });
  assert.deepEqual(ids(await service.getTargetRecipients("church-a", { targetType: "Event", targetId: "event-a" })), ["member:m1", "member:m2"]);
  const reads = requests.filter(r => r.table === "attendance");
  assert.equal(reads.length, 3);
  for (const r of reads) {
    assert.equal(r.params.get("event_id"), "eq.event-a");
    assert.equal(r.params.get("status"), "in.(Present,Late)");
    assert.equal(r.params.get("members.church_id"), "eq.church-a");
    assert.equal(r.params.get("members.membership_status"), "eq.Active");
    assert.match(r.params.get("select"), /members!attendance_member_id_fkey!inner/);
  }
  scoped(requests);
});

test("Role resolves active church memberships and enabled users within existing RLS visibility", async () => {
  const { service, requests } = setup();
  assert.deepEqual(ids(await service.getTargetRecipients("church-a", { targetType: "Role", targetId: "role-a" })), ["user:u1"]);
  const r = requests[0];
  assert.equal(r.table, "church_memberships"); assert.equal(r.params.get("role_id"), "eq.role-a");
  assert.equal(r.params.get("status"), "eq.active"); assert.equal(r.params.get("users.is_active"), "eq.true");
  assert.match(r.params.get("select"), /users!church_memberships_user_id_fkey!inner/);
  const hidden = setup({ hiddenUsers: ["u1"] });
  assert.deepEqual(ids(await hidden.service.getTargetRecipients("church-a", { targetType: "Role", targetId: "role-a" })), []);
  assert.equal(hidden.requests.length, 1, "No privileged fallback when RLS hides recipients"); scoped(requests);
});

test("All unions active profiles and accounts without guessing identity links", async () => {
  const data = fixtures(); data.church_memberships.push(membership("same-id", "m1"));
  const { service, requests } = setup({ data });
  assert.deepEqual(ids(await service.getTargetRecipients("church-a", { targetType: "All" })), ["member:m1", "member:m2", "member:m4", "user:m1", "user:u1", "user:u2"]);
  scoped(requests);
  assert.ok(requests.every(r => !/email|phone|notes|address/.test(r.params.get("select"))), "Preview selects no contact or sensitive profile fields");
});

test("announcement audience unions overlapping targets and checks the parent in the requested church", async () => {
  const { service, requests } = setup();
  const audience = await service.getAnnouncementAudience("church-a", "announcement-a");
  assert.equal(audience.churchId, "church-a"); assert.equal(audience.announcementId, "announcement-a");
  assert.equal(audience.targets.length, 4); assert.deepEqual(ids(audience.recipients), ["member:m1", "member:m2", "user:u1"]);
  assert.equal(requests[0].table, "announcements"); assert.equal(requests[0].params.get("id"), "eq.announcement-a");
  scoped(requests);
  const foreign = setup();
  await assert.rejects(() => foreign.service.getAnnouncementAudience("church-a", "foreign"), /Row unavailable/);
  assert.equal(foreign.requests.length, 1);
});

test("no configured targets produces no audience and invalid stored types fail closed", async () => {
  const data = fixtures(); data.announcement_targets = [];
  const empty = setup({ data });
  const audience = await empty.service.getAnnouncementAudience("church-a", "announcement-a");
  assert.equal(audience.targets.length, 0); assert.equal(audience.recipients.length, 0);
  assert.equal(empty.requests.length, 2);
  data.announcement_targets = [target("bad", "Unknown", null)];
  const invalid = setup({ data });
  await assert.rejects(() => invalid.service.getAnnouncementAudience("church-a", "announcement-a"), /valid announcement target type/);
  assert.equal(invalid.requests.length, 2);
});

test("large recipient sets and target lists page beyond API limits and lower server caps", async () => {
  const data = fixtures(); data.members = Array.from({ length: 2105 }, (_, i) => member(String(i).padStart(5, "0")));
  data.announcement_targets = Array.from({ length: 1105 }, (_, i) => target(String(i).padStart(5, "0"), "Member", `m${i}`));
  for (const pageCap of [1000, 137]) {
    const { service, requests } = setup({ data, pageCap });
    assert.equal((await service.getTargetRecipients("church-a", { targetType: "Family", targetId: "family-a" })).length, 2105);
    assert.equal((await service.loadAnnouncementTargets("church-a", "announcement-a")).length, 1105);
    scoped(requests);
    for (const table of ["members", "announcement_targets"]) {
      const pages = requests.filter(r => r.table === table);
      pages.forEach((r, i) => { assert.equal(r.params.get("offset"), String(i * pageCap)); assert.equal(r.params.get("limit"), "1000"); assert.equal(r.params.get("order"), "id.asc"); });
    }
  }
});

test("RLS, session, duplicate and reference errors propagate without writes or retries outside the target table", async () => {
  for (const [code, message, status] of [["42501", "Permission denied", 403], ["23505", "Duplicate target", 409], ["23503", "Invalid church reference", 409], ["PGRST301", "Expired session", 401]]) {
    const { service, requests } = setup({ fail: { table: "announcement_targets", code, message, status } });
    await assert.rejects(() => service.addAnnouncementTarget("church-a", "announcement-a", input), new RegExp(message));
    await assert.rejects(() => service.removeAnnouncementTarget("church-a", "t1"), new RegExp(message));
    assert.equal(requests.length, 2); scoped(requests);
  }
  const missing = setup();
  await assert.rejects(() => missing.service.removeAnnouncementTarget("church-a", "foreign"), /Row unavailable/);
  for (const table of ["announcement_targets", "members", "attendance", "church_memberships", "families", "events"]) {
    const { service, requests } = setup({ fail: { table } });
    await assert.rejects(() => service.getAnnouncementAudience("church-a", "announcement-a"), /Permission denied/);
    assert.ok(requests.every(r => r.method === "GET")); scoped(requests);
  }
});

test("missing counts, incomplete pages and later-page errors reject instead of returning partial recipients", async () => {
  for (const options of [{ missingCount: "members" }, { pageCap: 1, emptyPageAt: 1 }, { pageCap: 1, fail: { table: "members", offset: 1 } }]) {
    const { service } = setup(options);
    await assert.rejects(() => service.getTargetRecipients("church-a", { targetType: "All" }), /exact count unavailable|incomplete results|Permission denied/);
  }
});
