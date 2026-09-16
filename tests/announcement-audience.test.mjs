import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

const source = fs.readFileSync(new URL("../src/components/announcements/announcementAudience.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const member = { targetType: "Member", targetId: "member-a" }, family = { targetType: "Family", targetId: "family-a" };
function setup({ failTable, missingCount, pageCap = 1000 } = {}) {
  const requests = [], calls = [], state = { targets: [], failAdd: null, failRemove: null, current: true, afterAdd: null };
  const directories = {
    members: [{ id: "member-a", church_id: "church-a", first_name: "Maria", middle_name: "", last_name: "Santos" }, { id: "foreign", church_id: "church-b", first_name: "Foreign", last_name: "Member" }],
    families: [{ id: "family-a", church_id: "church-a", name: "Santos" }],
    events: [{ id: "event-a", church_id: "church-a", title: "Worship", starts_at: "2030-09-20T01:00:00Z" }],
    roles: [{ id: "role-a", name: "Pastor" }],
  };
  const db = createClient("https://audience-ui-tests.invalid", "test-anon-key", { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: async (url, init) => {
    const parsed = new URL(url), table = parsed.pathname.split("/").at(-1), params = parsed.searchParams;
    requests.push({ table, params, method: init.method });
    assert.equal(parsed.origin, "https://audience-ui-tests.invalid");
    if (failTable === table) return new Response(JSON.stringify({ message: "Permission denied" }), { status: 403 });
    const rows = directories[table].filter(row => !params.has("church_id") || params.get("church_id") === `eq.${row.church_id}`);
    const offset = Number(params.get("offset") || 0), limit = Math.min(pageCap, Number(params.get("limit") || pageCap));
    return new Response(JSON.stringify(rows.slice(offset, offset + limit)), { headers: { "Content-Type": "application/json", ...(missingCount === table ? {} : { "Content-Range": `*/${rows.length}` }) } });
  } } });
  let nextId = 0;
  const targets = {
    loadAnnouncementTargets: async (...args) => { calls.push(["load", ...args]); return state.targets.map(row => ({ ...row })); },
    addAnnouncementTarget: async (church, announcement, target) => {
      calls.push(["add", church, announcement, target]);
      if (state.failAdd === target.targetId) throw new Error("Target insert failed");
      state.targets.push({ id: `t${++nextId}`, churchId: church, announcementId: announcement, ...target });
      state.afterAdd?.();
    },
    removeAnnouncementTarget: async (church, id) => {
      calls.push(["remove", church, id]);
      if (state.failRemove === id) throw new Error("Target removal failed");
      state.targets = state.targets.filter(row => row.id !== id);
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: id => {
    if (id === "../../lib/supabase") return { getSupabase: () => db };
    if (id === "../../services/announcementTargets") return targets;
    throw new Error(`Unexpected dependency ${id}`);
  } });
  return { ...exports, requests, calls, state, directories };
}

test("audience choices page church-scoped directories with minimal fields and a shared role catalog", async () => {
  const fixture = setup({ pageCap: 1 });
  fixture.directories.members.push({ id: "member-b", church_id: "church-a", first_name: "John", middle_name: "", last_name: "Santos" });
  const options = await fixture.loadAudienceOptions("church-a");
  assert.deepEqual(Array.from(options.Member, row => row.label), ["John Santos", "Maria Santos"]);
  assert.equal(options.Role[0].label, "Pastor"); assert.match(options.Event[0].label, /Worship/);
  assert.equal(fixture.requests.filter(r => r.table === "members").length, 2);
  for (const r of fixture.requests) {
    assert.equal(r.method, "GET");
    assert.equal(r.params.get("church_id"), r.table === "roles" ? null : "eq.church-a");
    assert.equal(r.params.get("order"), "id.asc");
    assert.doesNotMatch(r.params.get("select"), /email|phone|notes|address/);
  }
});

test("audience options reject missing scope, permission failures, and incomplete count metadata", async () => {
  const fixture = setup();
  await assert.rejects(() => fixture.loadAudienceOptions(" "), /Church workspace is required/);
  assert.equal(fixture.requests.length, 0);
  await assert.rejects(() => setup({ failTable: "members" }).loadAudienceOptions("church-a"), /Permission denied/);
  await assert.rejects(() => setup({ missingCount: "members" }).loadAudienceOptions("church-a"), /completely/);
});

test("target reconciliation preserves matches and removes only deselected IDs within the church", async () => {
  const fixture = setup();
  fixture.state.targets = [{ id: "keep", ...member }, { id: "remove", targetType: "All", targetId: null }];
  await fixture.saveAudienceTargets("church-a", "announcement-a", [member, family, family], () => true);
  assert.deepEqual(fixture.calls.map(call => call[0]), ["load", "add", "remove"]);
  assert.deepEqual(fixture.calls[1], ["add", "church-a", "announcement-a", family]);
  assert.deepEqual(fixture.calls[2], ["remove", "church-a", "remove"]);
  assert.equal(fixture.state.targets.length, 2);
});

test("partial target inserts reconcile on retry without duplicating completed inserts", async () => {
  const fixture = setup(); fixture.state.failAdd = "family-a";
  await assert.rejects(() => fixture.saveAudienceTargets("church-a", "announcement-a", [member, family], () => true), /Target insert failed/);
  assert.equal(fixture.state.targets.length, 1);
  fixture.state.failAdd = null;
  await fixture.saveAudienceTargets("church-a", "announcement-a", [member, family], () => true);
  assert.equal(fixture.state.targets.length, 2);
  assert.equal(fixture.calls.filter(call => call[0] === "add" && call[3].targetId === "member-a").length, 1);
});

test("partial target removals reconcile on retry and an empty selection removes all configured targets", async () => {
  const fixture = setup(); fixture.state.targets = [{ id: "first", ...member }, { id: "second", ...family }]; fixture.state.failRemove = "second";
  await assert.rejects(() => fixture.saveAudienceTargets("church-a", "announcement-a", [], () => true), /Target removal failed/);
  assert.equal(fixture.state.targets.length, 1);
  fixture.state.failRemove = null;
  await fixture.saveAudienceTargets("church-a", "announcement-a", [], () => true);
  assert.equal(fixture.state.targets.length, 0);
  assert.equal(fixture.calls.filter(call => call[0] === "remove" && call[2] === "first").length, 1);
});

test("workspace cancellation stops audience writes before starting and between requests", async () => {
  const fixture = setup();
  await assert.rejects(() => fixture.saveAudienceTargets("church-a", "announcement-a", [member], () => false), /workspace changed/);
  assert.equal(fixture.calls.length, 0);
  fixture.state.afterAdd = () => { fixture.state.current = false; };
  await assert.rejects(() => fixture.saveAudienceTargets("church-a", "announcement-a", [member, family], () => fixture.state.current), /workspace changed/);
  assert.deepEqual(fixture.calls.map(call => call[0]), ["load", "add"]);
});
