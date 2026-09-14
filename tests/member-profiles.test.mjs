import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient } from "@supabase/supabase-js";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compile = name => ts.transpileModule(read(`src/components/${name}.tsx`), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const formCode = compile("MemberForm");
const profileCode = compile("MemberProfile");
const details = {
  member_number: "M-001", gender: "Female", emergency_contact_name: "Grace Santos",
  emergency_contact_phone: "+63 912 345 6789", baptism_date: "2020-02-15",
};
const member = {
  id: "member-a", church_id: "church-a", created_by: "original-user",
  first_name: "Ana", middle_name: "Maria", last_name: "Santos", birth_date: "1990-03-12",
  joined_at: "2019-01-01", phone: "09123456789", email: "ana@example.test", address: "Main Street",
  membership_status: "Active", ministry: "Choir", notes: "Member notes", ...details,
};

function setup({ existing, failure } = {}) {
  const requests = [];
  const state = { saved: 0, cancelled: 0, updates: [] };
  const supabase = createClient("https://member-tests.invalid", "test-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      const parsed = new URL(url);
      assert.equal(parsed.origin, "https://member-tests.invalid");
      requests.push({ url: parsed, method: init.method, payload: JSON.parse(init.body) });
      return failure
        ? new Response(JSON.stringify(failure), { status: 403 })
        : new Response(null, { status: 204 });
    } },
  });
  const exports = {};
  // Exercise the actual form handler and Supabase request builder without a DOM.
  // Browser tests separately cover hook rerenders and native form interaction.
  vm.runInNewContext(formCode, {
    exports,
    require: id => {
      if (id === "react") return { ...React, useState: initial => [initial, value => state.updates.push(value)] };
      if (id === "react/jsx-runtime") return jsx;
      if (id === "../lib/supabase") return { supabase };
      throw new Error(`Unexpected dependency: ${id}`);
    },
    FormData: class { constructor(data) { return data; } },
  });
  const tree = exports.MemberForm({ churchId: "church-a", userId: "current-user", member: existing,
    onSaved: () => { state.saved++; }, onCancel: () => { state.cancelled++; } });
  return { tree, requests, state, save: values => tree.props.onSubmit({
    preventDefault() {}, currentTarget: new Map(Object.entries(values)),
  }) };
}

test("member creation saves enhanced fields and binds church and creator to props", async () => {
  const { save, requests, state } = setup();
  await save({ ...member, member_number: " M-001 ", church_id: "forged-church", created_by: "forged-user" });
  assert.equal(state.saved, 1);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].url.pathname, "/rest/v1/members");
  const { id, joined_at, ...expected } = member;
  assert.deepEqual(requests[0].payload, { ...expected, created_by: "current-user" });
});

test("member edit saves all fields with church/id filters and preserves original creator", async () => {
  const { save, requests, state } = setup({ existing: member });
  await save({ ...member, member_number: "M-002", baptism_date: "2021-04-18" });
  assert.equal(state.saved, 1);
  assert.equal(requests[0].method, "PATCH");
  assert.equal(requests[0].url.searchParams.get("church_id"), "eq.church-a");
  assert.equal(requests[0].url.searchParams.get("id"), "eq.member-a");
  const { id, joined_at, ...expected } = member;
  assert.deepEqual(requests[0].payload, { ...expected, member_number: "M-002", baptism_date: "2021-04-18" });
});

test("optional member details can be cleared without empty date or member-number values", async () => {
  const { save, requests } = setup({ existing: member });
  await save({ first_name: "Ana", last_name: "Santos", member_number: "   " });
  assert.equal(requests[0].payload.member_number, null);
  assert.equal(requests[0].payload.baptism_date, null);
  for (const field of ["gender", "emergency_contact_name", "emergency_contact_phone"]) {
    assert.equal(requests[0].payload[field], "");
  }
  assert.equal(requests[0].payload.membership_status, "Active");
});

test("permission and duplicate-number errors never report a successful save", async () => {
  for (const message of ["new row violates row-level security policy", "duplicate key violates unique constraint"]) {
    const { save, state } = setup({ existing: member, failure: { message } });
    await save(member);
    assert.equal(state.saved, 0);
    assert.ok(state.updates.includes(message));
    assert.equal(state.updates.at(-1), false, "Saving must be released so the user can correct or retry");
  }
});

test("edit form prefills enhanced details and preserves optional/native input behavior", () => {
  const { tree } = setup({ existing: member });
  const inputs = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (node.type === "input") inputs.push(node.props);
    visit(node.props?.children);
  }
  visit(tree);
  for (const [name, value] of Object.entries(details)) {
    const input = inputs.find(input => input.name === name);
    assert.equal(input?.defaultValue, value);
    assert.ok(!input.required);
  }
  assert.equal(inputs.find(input => input.name === "baptism_date").type, "date");
  assert.equal(inputs.find(input => input.name === "emergency_contact_phone").type, "tel");
  assert.equal(inputs.find(input => input.name === "first_name").required, true);
  assert.equal(inputs.find(input => input.name === "last_name").required, true);
});

test("member profile displays enhanced details, escaped values, and empty placeholders", () => {
  const exports = {};
  vm.runInNewContext(profileCode, { exports, require: id => {
    if (id === "react") return React;
    if (id === "react/jsx-runtime") return jsx;
    if (id === "./MemberForm") return { MemberForm: () => null };
    if (id === "./InviteMemberModal") return { InviteMemberModal: () => null };
    if (id === "../services/memberAccessStatus") return { loadMemberAccessStatus: async () => ({ status: "none" }) };
    throw new Error(`Unexpected dependency: ${id}`);
  } });
  const render = value => renderToStaticMarkup(React.createElement(exports.MemberProfile, {
    member: value, onClose() {}, onEdit() {},
  }));
  const html = render(member);
  const labels = ["Member Number", "Gender", "Emergency Contact Name", "Emergency Contact Phone", "Baptism Date"];
  for (const [index, value] of Object.values(details).entries()) {
    assert.ok(html.includes(`<span>${labels[index]}</span><b>${value}</b>`));
  }
  const empty = render({ ...member, ...Object.fromEntries(Object.keys(details).map(key => [key, null])) });
  for (const label of labels) assert.ok(empty.includes(`<span>${label}</span><b>-</b>`));
  assert.ok(render({ ...member, emergency_contact_name: "<script>alert(1)</script>" }).includes("&lt;script&gt;"));
  assert.ok(html.includes("Ana Maria Santos"));
  assert.ok(html.includes("Member notes"));
});

test("member directory retains Admin-only application access and current church props", () => {
  const page = read("app/page.tsx");
  assert.match(page, /view\s*===\s*"members"\s*&&\s*isChurchAdmin\s*&&\s*profile\s*&&\s*activeChurch\s*&&\s*<MembersView\s+churchId=\{activeChurch\.id\}\s+userId=\{profile\.id\}/);
});
