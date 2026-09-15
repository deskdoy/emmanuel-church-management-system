import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

const family = { id: "family-a", churchId: "church-a", name: "Santos family", notes: "Household notes", createdBy: "user-a", createdAt: "2026-09-15T01:00:00Z", updatedAt: "2026-09-15T01:00:00Z" };
function setup(role = "Admin", churchId = "church-a", mode = "church") {
  const modules = new Map();
  const compile = name => {
    if (modules.has(name)) return modules.get(name);
    const source = fs.readFileSync(new URL(`../src/components/families/${name}.tsx`, import.meta.url), "utf8");
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const exports = {};
    modules.set(name, exports);
    vm.runInNewContext(code, { exports, require: id => {
      if (id === "react") return React;
      if (id === "react/jsx-runtime") return jsx;
      if (id.endsWith(".css")) return {};
      if (id.startsWith("./Family")) return compile(id.slice(2));
      if (id.endsWith("/ActiveChurchContext")) return { useActiveChurch: () => ({ activeChurch: { id: churchId }, activeRole: role, workspaceMode: mode, scopeVersion: 1 }) };
      if (id.endsWith("/permissions")) return { projectManagerRoles: ["Admin", "Pastor", "Secretary"], hasChurchRole: (role, allowed) => allowed.includes(role) };
      if (id.endsWith("/EmptyState")) return { EmptyState: ({ title, description }) => React.createElement("div", null, React.createElement("h3", null, title), description) };
      if (id.endsWith("/LoadingSkeleton")) return { LoadingSkeleton: ({ label }) => React.createElement("div", { role: "status" }, label) };
      if (id.endsWith("/families") || id.endsWith("/supabase")) return {};
      throw new Error(`Unexpected dependency: ${id}`);
    } });
    return exports;
  };
  return { ...compile("FamilyView"), ...compile("FamilyProfile"), ...compile("FamilyForm") };
}
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const actions = { onSubmit: async () => {}, onCancel() {}, onBack() {}, onFamilyChange() {}, onDeleted() {} };

test("family form preserves editable values, native validation, and busy/error states", () => {
  const { FamilyForm } = setup();
  const html = render(FamilyForm, { ...actions, family, canManage: true, saving: false });
  assert.match(html, /value="Santos family"/);
  assert.match(html, /required=""/);
  assert.match(html, /Household notes/);
  const busy = render(FamilyForm, { ...actions, family, canManage: true, saving: true, error: "Permission denied" });
  assert.match(busy, /aria-busy="true"/);
  assert.match(busy, /role="alert">Permission denied/);
  assert.match(busy, /Saving\.\.\./);
  assert.equal((busy.match(/disabled=""/g) || []).length, 4);
  assert.equal(render(FamilyForm, { ...actions, canManage: false, saving: false }), "");
});

test("family managers match Admin/Pastor/Secretary and delete controls exclude Secretary", () => {
  for (const role of ["Admin", "Pastor", "Secretary", "Treasurer", "Encoder", "Viewer"]) {
    const { FamilyView, FamilyProfile } = setup(role);
    const manages = ["Admin", "Pastor", "Secretary"].includes(role);
    const list = render(FamilyView, { churchId: "church-a" });
    assert.equal(list.includes(">New family</button>"), manages, role);
    assert.match(list, /Loading families/);
    const profile = render(FamilyProfile, { ...actions, churchId: "church-a", family });
    assert.equal(profile.includes(">Edit family</button>"), manages, role);
    assert.equal(profile.includes(">Delete family</button>"), ["Admin", "Pastor"].includes(role), role);
    assert.match(profile, /Loading family members/);
    if (!manages) assert.match(profile, /Read-only access/);
  }
});

test("family list and profile reject inactive, platform, and mismatched church scopes", () => {
  for (const [role, churchId, mode] of [[null, "church-a", "church"], ["Admin", "church-b", "church"], ["Admin", "church-a", "platform"]]) {
    const { FamilyView, FamilyProfile } = setup(role, churchId, mode);
    assert.match(render(FamilyView, { churchId: "church-a" }), /Choose a church workspace/);
    const profile = render(FamilyProfile, { ...actions, churchId: "church-a", family });
    assert.match(profile, /Choose a church workspace/);
    assert.doesNotMatch(profile, /Santos family|Household notes/);
  }
  const { FamilyProfile } = setup();
  assert.match(render(FamilyProfile, { ...actions, churchId: "church-a", family: { ...family, churchId: "church-b" } }), /Choose a church workspace/);
});

test("family names and notes render as text rather than HTML", () => {
  const { FamilyProfile } = setup();
  const html = render(FamilyProfile, { ...actions, churchId: "church-a", family: { ...family, name: "<script>alert(1)</script>", notes: "<img src=x onerror=alert(1)>" } });
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<script>|<img/);
});
