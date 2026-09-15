import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

const source = fs.readFileSync(new URL("../src/services/families.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const family = { id: "family-a", church_id: "church-a", name: "Santos", notes: "Family notes", created_by: "user-a", created_at: "2026-09-15T01:00:00Z", updated_at: "2026-09-15T01:00:00Z" };
const member = {
  id: "member-a", church_id: "church-a", family_id: "family-a", member_number: "M-001",
  first_name: "Ana", middle_name: "Maria", last_name: "Santos", gender: "Female",
  birth_date: "1990-03-12", baptism_date: null, joined_at: "2020-01-01",
  phone: "09123456789", email: null, address: "Main Street", emergency_contact_name: "Grace Santos",
  emergency_contact_phone: "09170001111", membership_status: "Active", ministry: "Choir", notes: "Member notes",
  created_by: null, created_at: family.created_at, updated_at: family.updated_at,
};
const input = { name: " Santos ", notes: " Family notes " };
const missing = { status: 406, body: { code: "PGRST116", message: "No matching row" } };

function setup({ failure, user = { id: "user-a" }, authError = null, empty = false, configured = true } = {}) {
  const requests = [];
  const state = { authCalls: 0 };
  const supabase = createClient("https://family-tests.invalid", "test-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      const parsed = new URL(url);
      assert.equal(parsed.origin, "https://family-tests.invalid");
      const request = { url: parsed, method: init.method, payload: init.body ? JSON.parse(init.body) : undefined };
      requests.push(request);
      const row = parsed.pathname.endsWith("/members") ? member : family;
      const single = new Headers(init.headers).get("Accept")?.includes("vnd.pgrst.object");
      const failed = typeof failure === "function" ? failure(request) : failure;
      const body = failed?.body || (single ? { ...row, ...request.payload } : empty ? [] : [row]);
      return new Response(JSON.stringify(body), { status: failed?.status || 200, headers: { "Content-Type": "application/json" } });
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
function assertScope(request, table, filters = {}) {
  assert.equal(request.url.pathname, `/rest/v1/${table}`);
  for (const [key, value] of Object.entries({ church_id: "church-a", ...filters })) {
    assert.equal(request.url.searchParams.get(key), `eq.${value}`, `${key} must scope the HTTP request`);
  }
}
const operations = (service, churchId) => [
  () => service.loadFamilies(churchId), () => service.createFamily(churchId, input),
  () => service.updateFamily(churchId, "family-a", input), () => service.deleteFamily(churchId, "family-a"),
  () => service.loadFamilyMembers(churchId, "family-a"),
  () => service.assignMemberFamily(churchId, "member-a", "family-a"),
  () => service.assignMemberFamily(churchId, "member-a", null),
];

test("all family operations reject missing church scope before HTTP or authentication", async () => {
  const { service, requests, state } = setup();
  for (const churchId of ["", "   ", null, undefined]) {
    for (const call of operations(service, churchId)) await assert.rejects(call, /Church workspace is required/);
  }
  assert.equal(requests.length, 0);
  assert.equal(state.authCalls, 0);
});

test("family and member lists map profile fields and require tenant and family filters", async () => {
  const { service, requests } = setup();
  const [result] = await service.loadFamilies("church-a");
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    id: family.id, churchId: family.church_id, name: family.name, notes: family.notes,
    createdBy: family.created_by, createdAt: family.created_at, updatedAt: family.updated_at,
  });
  assertScope(requests[0], "families");
  assert.equal(requests[0].url.searchParams.get("order"), "name.asc,id.asc");
  const [person] = await service.loadFamilyMembers("church-a", "family-a");
  // Every selected profile value must survive the snake_case to camelCase mapping.
  for (const [key, value] of Object.entries(member)) {
    const mapped = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    assert.equal(person[mapped], value, mapped);
  }
  assertScope(requests[1], "members", { family_id: "family-a" });
  assert.equal(requests[1].url.searchParams.get("order"), "last_name.asc,first_name.asc,id.asc");
  const empty = setup({ empty: true }).service;
  assert.equal((await empty.loadFamilies("church-a")).length, 0);
  assert.equal((await empty.loadFamilyMembers("church-a", "family-a")).length, 0);
});

test("family creation uses authenticated creator and explicit editable fields only", async () => {
  const { service, requests, state } = setup();
  const result = await service.createFamily("church-a", { ...input, church_id: "church-b", created_by: "forged", id: "forged", created_at: "forged" });
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].url.pathname, "/rest/v1/families");
  assert.deepEqual(requests[0].payload, { name: "Santos", notes: "Family notes", church_id: "church-a", created_by: "user-a" });
  assert.equal(result.createdBy, "user-a");
  assert.equal(state.authCalls, 1);
});

test("family updates preserve ownership and deletion never cascades through the service", async () => {
  const { service, requests } = setup();
  await service.updateFamily("church-a", "family-a", { name: " Updated ", church_id: "church-b", created_by: "forged", created_at: "forged" });
  assert.equal(requests[0].method, "PATCH");
  assert.deepEqual(requests[0].payload, { name: "Updated", notes: "" });
  assertScope(requests[0], "families", { id: "family-a" });
  await service.deleteFamily("church-a", "family-a");
  assert.equal(requests[1].method, "DELETE");
  assertScope(requests[1], "families", { id: "family-a" });
  assert.equal(requests.length, 2, "Deleting a family must not delete or unlink members automatically");
});

test("assignment checks the church's family then writes only family_id; null explicitly unlinks", async () => {
  const { service, requests } = setup();
  const linked = await service.assignMemberFamily("church-a", "member-a", "family-a");
  assertScope(requests[0], "families", { id: "family-a" });
  assert.equal(requests[0].method, "GET");
  assertScope(requests[1], "members", { id: "member-a" });
  assert.equal(requests[1].method, "PATCH");
  assert.deepEqual(requests[1].payload, { family_id: "family-a" });
  assert.equal(linked.familyId, "family-a");
  const unlinked = await service.assignMemberFamily("church-a", "member-a", null);
  assertScope(requests[2], "members", { id: "member-a" });
  assert.deepEqual(requests[2].payload, { family_id: null });
  assert.equal(unlinked.familyId, null);
  assert.equal(unlinked.churchId, "church-a");
  assert.equal(unlinked.memberNumber, "M-001");
  assert.equal(requests.length, 3);
});

test("an unavailable or foreign-church family stops assignment before any member update", async () => {
  const { service, requests } = setup({ failure: request => request.url.searchParams.get("id") === "eq.foreign-family" ? missing : null });
  await assert.rejects(() => service.assignMemberFamily("church-a", "member-a", "foreign-family"), /Unable to find family in this church/);
  assert.equal(requests.length, 1);
  assertScope(requests[0], "families", { id: "foreign-family" });
  assert.equal(requests[0].method, "GET");
});

test("invalid identifiers, blank family names, and expired sessions stop writes", async () => {
  const { service, requests, state } = setup();
  for (const invalid of ["", "   ", undefined, null]) {
    await assert.rejects(() => service.updateFamily("church-a", invalid, input), /Family is required/);
    await assert.rejects(() => service.deleteFamily("church-a", invalid), /Family is required/);
    await assert.rejects(() => service.loadFamilyMembers("church-a", invalid), /Family is required/);
    await assert.rejects(() => service.assignMemberFamily("church-a", invalid, null), /Member is required/);
    if (invalid !== null) await assert.rejects(() => service.assignMemberFamily("church-a", "member-a", invalid), /Family is required/);
    await assert.rejects(() => service.createFamily("church-a", { name: invalid }), /Family name is required/);
    await assert.rejects(() => service.updateFamily("church-a", "family-a", { name: invalid }), /Family name is required/);
  }
  assert.equal(requests.length, 0);
  assert.equal(state.authCalls, 0);
  for (const options of [{ user: null }, { authError: { message: "Invalid session" } }]) {
    const expired = setup(options);
    await assert.rejects(() => expired.service.createFamily("church-a", input), /session/i);
    assert.equal(expired.requests.length, 0);
  }
  const unconfigured = setup({ configured: false });
  for (const call of operations(unconfigured.service, "church-a")) await assert.rejects(call, /Supabase is not configured/);
});

test("RLS denial, missing records and FK errors propagate without retries or fallback writes", async () => {
  for (const failure of [
    { status: 403, body: { code: "42501", message: "Permission denied" } }, missing,
    { status: 409, body: { code: "23503", message: "Family foreign key violation" } },
  ]) {
    const { service, requests } = setup({ failure });
    const calls = operations(service, "church-a");
    for (const call of calls) await assert.rejects(call, new RegExp(failure.body.message));
    assert.equal(requests.length, calls.length);
    // A successful family check must not hide a failed member write either.
    const assignment = setup({ failure: request => request.method === "PATCH" ? failure : null });
    await assert.rejects(() => assignment.service.assignMemberFamily("church-a", "member-a", "family-a"), new RegExp(failure.body.message));
    assert.equal(assignment.requests.length, 2);
    assertScope(assignment.requests[1], "members", { id: "member-a" });
  }
});
