import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

const source = fs.readFileSync(new URL("../src/services/announcements.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const record = { id: "announcement-a", church_id: "church-a", title: "Church picnic", content: "Bring lunch",
  publish_at: "2026-09-20T01:00:00.000Z", expires_at: "2026-09-21T01:00:00.000Z", is_published: true,
  created_by: "original-user", created_at: "2026-09-15T00:00:00Z", updated_at: "2026-09-15T00:00:00Z" };
const input = { title: " Church picnic ", content: " Bring lunch ", publishAt: "2026-09-20T09:00:00+08:00", expiresAt: "2026-09-21T09:00:00+08:00" };
function setup({ failure, user = { id: "user-a" }, authError = null, rows = [record], configured = true } = {}) {
  const requests = [], state = { authCalls: 0 };
  const supabase = createClient("https://announcements-tests.invalid", "test-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      const parsed = new URL(url);
      assert.equal(parsed.origin, "https://announcements-tests.invalid");
      const request = { url: parsed, method: init.method, payload: init.body ? JSON.parse(init.body) : undefined, headers: new Headers(init.headers) };
      requests.push(request);
      const params = parsed.searchParams;
      const filtered = rows.filter(row => {
        if (params.has("church_id") && `eq.${row.church_id}` !== params.get("church_id")) return false;
        if (params.has("is_published") && `eq.${row.is_published}` !== params.get("is_published")) return false;
        if (params.has("publish_at") && Date.parse(row.publish_at) > Date.parse(params.get("publish_at").slice(4))) return false;
        if (params.has("or")) {
          const match = /^\(expires_at\.is\.null,expires_at\.gt\.(.+)\)$/.exec(params.get("or"));
          assert.ok(match, "Only the intended null-or-future expiry predicate is expected");
          if (row.expires_at !== null && Date.parse(row.expires_at) <= Date.parse(match[1])) return false;
        }
        return true;
      });
      const single = request.headers.get("Accept")?.includes("vnd.pgrst.object");
      const body = failure?.body || (single ? { ...record, ...request.payload } : filtered);
      return new Response(JSON.stringify(body), { status: failure?.status || 200, headers: { "Content-Type": "application/json" } });
    } },
  });
  supabase.auth.getUser = async () => { state.authCalls++; return { data: { user }, error: authError }; };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: id => { assert.equal(id, "../lib/supabase"); return { supabase: configured ? supabase : null }; } });
  return { service: exports, requests, state };
}
const operations = (service, churchId) => [
  () => service.loadAnnouncements(churchId), () => service.createAnnouncement(churchId, input),
  () => service.updateAnnouncement(churchId, "announcement-a", input), () => service.deleteAnnouncement(churchId, "announcement-a"),
  () => service.publishAnnouncement(churchId, "announcement-a"), () => service.getActiveAnnouncements(churchId),
];
function assertScope(request, filters = {}) {
  assert.equal(request.url.pathname, "/rest/v1/announcements");
  for (const [key, value] of Object.entries({ church_id: "church-a", ...filters })) assert.equal(request.url.searchParams.get(key), `eq.${value}`);
}
function assertMapping(result, row) {
  assert.equal(Object.keys(result).length, Object.keys(row).length);
  for (const [key, value] of Object.entries(row)) assert.equal(result[key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())], value);
}

test("every announcement operation requires church scope before requests or authentication", async () => {
  const { service, requests, state } = setup();
  for (const churchId of ["", " ", null, undefined]) {
    for (const call of operations(service, churchId)) await assert.rejects(call, /Church workspace is required/);
  }
  assert.equal(requests.length, 0); assert.equal(state.authCalls, 0);
});

test("announcement lists map metadata, include drafts, and preserve nullable fields with tenant ordering", async () => {
  const draft = { ...record, id: "draft", expires_at: null, created_by: null, is_published: false };
  const { service, requests } = setup({ rows: [record, draft, { ...record, church_id: "church-b" }] });
  const result = await service.loadAnnouncements("church-a");
  assert.equal(result.length, 2);
  assertMapping(result[0], record); assertMapping(result[1], draft);
  assertScope(requests[0]); assert.equal(requests[0].method, "GET");
  assert.equal(requests[0].url.searchParams.get("order"), "publish_at.desc,id.asc");
  assert.equal(requests[0].url.searchParams.has("is_published"), false);
  const empty = setup({ rows: [] });
  assert.equal((await empty.service.loadAnnouncements("church-a")).length, 0);
  assert.equal((await empty.service.getActiveAnnouncements("church-a")).length, 0);
});

test("active announcements include publish boundaries and exclude drafts, future, expired and other-church rows", async () => {
  const at = "2026-09-20T01:00:00.000Z";
  const rows = [
    { ...record, id: "starts-now" },
    { ...record, id: "no-expiry", publish_at: "2026-09-19T01:00:00Z", expires_at: null },
    { ...record, id: "draft", is_published: false },
    { ...record, id: "future", publish_at: "2026-09-20T01:00:00.001Z" },
    { ...record, id: "expired", publish_at: "2026-09-19T00:00:00Z", expires_at: "2026-09-19T01:00:00Z" },
    { ...record, id: "expires-now", expires_at: at },
    { ...record, id: "foreign", church_id: "church-b" },
  ];
  const { service, requests } = setup({ rows });
  const result = await service.getActiveAnnouncements("church-a", "2026-09-20T09:00:00+08:00");
  assert.deepEqual(Array.from(result, row => row.id), ["starts-now", "no-expiry"]);
  assertScope(requests[0], { is_published: true });
  assert.equal(requests[0].url.searchParams.get("publish_at"), `lte.${at}`);
  assert.equal(requests[0].url.searchParams.get("or"), `(expires_at.is.null,expires_at.gt.${at})`);
  assert.equal(requests[0].url.searchParams.get("order"), "publish_at.desc,id.asc");
  const before = Date.now();
  await service.getActiveAnnouncements("church-a");
  const instant = requests[1].url.searchParams.get("publish_at").slice(4);
  assert.ok(Date.parse(instant) >= before && Date.parse(instant) <= Date.now());
  assert.equal(requests[1].url.searchParams.get("or"), `(expires_at.is.null,expires_at.gt.${instant})`, "Both boundaries must share one reference instant");
});

test("creation binds trusted church and creator, defaults to draft, and ignores forged metadata", async () => {
  const { service, requests, state } = setup();
  const result = await service.createAnnouncement("church-a", { ...input, church_id: "church-b", churchId: "church-b", created_by: "forged", id: "forged", is_published: true, isPublished: true, created_at: "forged", updated_at: "forged" });
  assert.equal(requests[0].method, "POST");
  assert.deepEqual(requests[0].payload, { title: "Church picnic", content: "Bring lunch", publish_at: "2026-09-20T01:00:00.000Z", expires_at: "2026-09-21T01:00:00.000Z", church_id: "church-a", created_by: "user-a", is_published: false });
  assert.equal(result.createdBy, "user-a"); assert.equal(result.isPublished, false);
  assert.doesNotMatch(requests[0].headers.get("Prefer") || "", /resolution=/);
  assert.equal(state.authCalls, 1);
  const before = Date.now();
  await service.createAnnouncement("church-a", { title: "Notice", content: "Details" });
  assert.equal(requests[1].payload.expires_at, null);
  assert.equal(requests[1].payload.is_published, false);
  assert.ok(Date.parse(requests[1].payload.publish_at) >= before && Date.parse(requests[1].payload.publish_at) <= Date.now());
});

test("partial announcement edits preserve schedule and publication state unless explicitly changing editable fields", async () => {
  const { service, requests } = setup();
  const result = await service.updateAnnouncement("church-a", "announcement-a", { title: " New title ", church_id: "church-b", created_by: "forged", is_published: false, isPublished: false, updated_at: "forged" });
  assertScope(requests[0], { id: "announcement-a" });
  assert.equal(requests[0].method, "PATCH");
  assert.deepEqual(requests[0].payload, { title: "New title" });
  assert.equal(result.createdBy, "original-user"); assert.equal(result.isPublished, true);
  assert.equal(result.publishAt, record.publish_at); assert.equal(result.content, record.content);
  await service.updateAnnouncement("church-a", "announcement-a", { expiresAt: null });
  assert.deepEqual(requests[1].payload, { expires_at: null });
  await service.updateAnnouncement("church-a", "announcement-a", { publishAt: "2026-09-20T10:00:00+08:00", content: " Updated content " });
  assert.deepEqual(requests[2].payload, { publish_at: "2026-09-20T02:00:00.000Z", content: "Updated content" });
  for (const request of requests) assertScope(request, { id: "announcement-a" });
});

test("publishing changes only publication state and deletion targets exactly one church-owned row", async () => {
  const { service, requests } = setup();
  const published = await service.publishAnnouncement("church-a", "announcement-a");
  assertScope(requests[0], { id: "announcement-a" });
  assert.equal(requests[0].method, "PATCH");
  assert.deepEqual(requests[0].payload, { is_published: true });
  assert.equal(published.isPublished, true);
  assert.equal(published.publishAt, record.publish_at); assert.equal(published.expiresAt, record.expires_at);
  await service.deleteAnnouncement("church-a", "announcement-a");
  assertScope(requests[1], { id: "announcement-a" });
  assert.equal(requests[1].method, "DELETE");
  assert.equal(requests[1].url.searchParams.get("select"), "id");
  for (const request of requests) assert.match(request.headers.get("Accept"), /vnd.pgrst.object/);
  assert.equal(requests.length, 2);
});

test("invalid announcement content, dates, IDs and empty edits fail before HTTP or auth", async () => {
  const { service, requests, state } = setup();
  for (const id of ["", " ", null, undefined]) {
    await assert.rejects(() => service.publishAnnouncement("church-a", id), /Announcement is required/);
    await assert.rejects(() => service.deleteAnnouncement("church-a", id), /Announcement is required/);
    await assert.rejects(() => service.updateAnnouncement("church-a", id, { title: "New" }), /Announcement is required/);
  }
  for (const value of ["", " ", null, undefined]) {
    await assert.rejects(() => service.createAnnouncement("church-a", { ...input, title: value }), /Announcement title/);
    await assert.rejects(() => service.createAnnouncement("church-a", { ...input, content: value }), /Announcement content/);
  }
  for (const value of ["", "2026-02-30T09:00Z", "2026-09-20", "2026-09-20T09:00", "0000-01-01T00:00Z", "2026-09-20T24:00Z", "2026-09-20T01:00Z),church_id.neq.church-a"]) {
    await assert.rejects(() => service.createAnnouncement("church-a", { ...input, publishAt: value }), /valid ISO timestamp/);
    await assert.rejects(() => service.updateAnnouncement("church-a", "announcement-a", { expiresAt: value }), /valid ISO timestamp/);
    await assert.rejects(() => service.getActiveAnnouncements("church-a", value), /valid ISO timestamp/);
  }
  await assert.rejects(() => service.createAnnouncement("church-a", { ...input, publishAt: null }), /valid ISO timestamp/);
  await assert.rejects(() => service.createAnnouncement("church-a", { ...input, expiresAt: "2026-09-19T00:00Z" }), /Expiry time/);
  await assert.rejects(() => service.updateAnnouncement("church-a", "announcement-a", { ...input, expiresAt: "2026-09-19T00:00Z" }), /Expiry time/);
  await assert.rejects(() => service.updateAnnouncement("church-a", "announcement-a", { content: " " }), /Announcement content/);
  for (const edit of [{}, { isPublished: true, church_id: "church-b" }, { title: undefined }]) await assert.rejects(() => service.updateAnnouncement("church-a", "announcement-a", edit), /at least one announcement field/);
  assert.equal(requests.length, 0); assert.equal(state.authCalls, 0);
  await service.createAnnouncement("church-a", { ...input, expiresAt: "2026-09-20T01:00:00Z" });
  assert.equal(requests.length, 1, "Equal schedule instants match the schema constraint");
});

test("expired sessions and missing configuration stop announcement operations", async () => {
  for (const options of [{ user: null }, { authError: { message: "Invalid session" } }]) {
    const { service, requests } = setup(options);
    await assert.rejects(() => service.createAnnouncement("church-a", input), /session/i);
    assert.equal(requests.length, 0);
  }
  const { service, requests } = setup({ configured: false });
  for (const call of operations(service, "church-a")) await assert.rejects(call, /Supabase is not configured/);
  assert.equal(requests.length, 0);
});

test("announcement RLS, missing-row and schedule constraint failures propagate without fallback", async () => {
  for (const failure of [
    { status: 403, body: { code: "42501", message: "Permission denied" } },
    { status: 406, body: { code: "PGRST116", message: "No matching announcement" } },
    { status: 409, body: { code: "23503", message: "Foreign key constraint" } },
    { status: 400, body: { code: "23514", message: "Announcement schedule constraint" } },
  ]) {
    const { service, requests } = setup({ failure });
    const calls = operations(service, "church-a");
    for (const call of calls) await assert.rejects(call, new RegExp(failure.body.message));
    await assert.rejects(() => service.updateAnnouncement("church-a", "announcement-a", { expiresAt: "2026-09-19T01:00:00Z" }), new RegExp(failure.body.message));
    assert.equal(requests.length, calls.length + 1, "Partial schedule checks use the database constraint without an unsafe read/write race or retry");
  }
});
