import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as helpers from "../src/components/announcements/announcementHelpers.ts";

const announcement = { id: "announcement-a", churchId: "church-a", title: "Church news", content: "Community gathering", publishAt: "2026-09-20T01:00:00Z", expiresAt: null, isPublished: false, createdBy: "user-a", createdAt: "2026-09-15T01:00:00Z", updatedAt: "2026-09-15T01:00:00Z" };
function setup(role = "Admin", churchId = "church-a", mode = "church") {
  const modules = new Map();
  function compile(name) {
    if (modules.has(name)) return modules.get(name);
    const code = ts.transpileModule(fs.readFileSync(new URL(`../src/components/announcements/${name}.tsx`, import.meta.url), "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const exports = {}; modules.set(name, exports);
    vm.runInNewContext(code, { exports, require: id => {
      if (id === "react") return React;
      if (id === "react/jsx-runtime") return jsx;
      if (id.endsWith(".css")) return {};
      if (id === "./announcementHelpers") return helpers;
      if (id.startsWith("./Announcement")) return compile(id.slice(2));
      if (id.endsWith("/ActiveChurchContext")) return { useActiveChurch: () => ({ activeChurch: { id: churchId }, activeRole: role, workspaceMode: mode, scopeVersion: 1 }) };
      if (id.endsWith("/permissions")) return { hasChurchRole: (role, allowed) => !!role && allowed.includes(role) };
      if (id.endsWith("/EmptyState")) return { EmptyState: ({ title, description }) => React.createElement("div", null, React.createElement("h3", null, title), description) };
      if (id.endsWith("/LoadingSkeleton")) return { LoadingSkeleton: ({ label }) => React.createElement("div", { role: "status" }, label) };
      if (id.endsWith("/announcements")) return {};
      throw new Error(`Unexpected dependency: ${id}`);
    } });
    return exports;
  }
  return { ...compile("AnnouncementView"), ...compile("AnnouncementForm"), ...compile("AnnouncementProfile") };
}
const actions = { onSubmit: async () => {}, onCancel() {}, onBack() {}, onAnnouncementChange() {}, onDeleted() {} };
const render = (Component, props = {}) => renderToStaticMarkup(React.createElement(Component, { ...actions, churchId: "church-a", ...props }));

test("announcement write controls match Admin/Pastor/Secretary and other church roles retain read access", () => {
  assert.deepEqual(helpers.announcementManagerRoles, ["Admin", "Pastor", "Secretary"]);
  for (const role of ["Admin", "Pastor", "Secretary", "Treasurer", "Encoder", "Viewer"]) {
    const { AnnouncementView, AnnouncementForm, AnnouncementProfile } = setup(role);
    const manages = ["Admin", "Pastor", "Secretary"].includes(role);
    const list = render(AnnouncementView);
    assert.match(list, /Loading announcements/);
    assert.equal(list.includes(">New announcement</button>"), manages, role);
    const profile = render(AnnouncementProfile, { announcement });
    for (const label of ["Edit announcement", "Delete announcement", "Publish announcement"]) assert.equal(profile.includes(`>${label}</button>`), manages, role);
    assert.match(profile, /Community gathering/);
    assert.equal(render(AnnouncementForm, { saving: false }) !== "", manages, role);
  }
});

test("announcement wrappers reject inactive, platform and mismatched church scopes", () => {
  for (const [role, churchId, mode] of [[null, "church-a", "church"], ["Admin", "church-b", "church"], ["Admin", "church-a", "platform"]]) {
    const { AnnouncementView, AnnouncementProfile, AnnouncementForm } = setup(role, churchId, mode);
    assert.match(render(AnnouncementView), /Choose a church workspace/);
    const profile = render(AnnouncementProfile, { announcement });
    assert.match(profile, /Choose a church workspace/);
    assert.doesNotMatch(profile, /Church news|Community gathering/);
    assert.equal(render(AnnouncementForm, { announcement, saving: false }), "");
  }
  const { AnnouncementProfile, AnnouncementForm } = setup();
  const foreign = { ...announcement, churchId: "church-b" };
  assert.match(render(AnnouncementProfile, { announcement: foreign }), /Choose a church workspace/);
  assert.equal(render(AnnouncementForm, { announcement: foreign, saving: false }), "");
});

test("announcement form preserves required content and schedule, with busy and error states", () => {
  const { AnnouncementForm } = setup();
  const html = render(AnnouncementForm, { announcement, saving: false });
  assert.match(html, /value="Church news"/);
  assert.match(html, /Community gathering/);
  assert.ok(html.includes(helpers.announcementTimeInput(announcement.publishAt)));
  assert.equal((html.match(/required=""/g) || []).length, 3);
  assert.match(html, /name="expiresAt"[^>]*value=""/);
  const busy = render(AnnouncementForm, { announcement, saving: true, error: "Permission denied" });
  assert.match(busy, /aria-busy="true"/);
  assert.match(busy, /role="alert">Permission denied/);
  assert.equal((busy.match(/disabled=""/g) || []).length, 6);
  assert.match(render(AnnouncementForm, { saving: false }), /Save draft/);
});

test("announcement profiles escape content and distinguish drafts from published schedules", () => {
  const { AnnouncementProfile } = setup();
  const html = render(AnnouncementProfile, { announcement: { ...announcement, title: "<script>alert(1)</script>", content: "<img src=x onerror=alert(1)>" } });
  assert.match(html, /&lt;script&gt;/); assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<script>|<img/);
  assert.match(html, /No expiration/);
  assert.match(html, />Draft</);
  const published = render(AnnouncementProfile, { announcement: { ...announcement, isPublished: true } });
  assert.match(published, />Published</);
  assert.doesNotMatch(published, />Publish announcement<\/button>/);
  assert.match(published, /Publishing preserves this schedule/);
});

test("announcement times round-trip local inputs and reject invalid dates", () => {
  for (const value of ["2026-09-20T01:00:00.123Z", "2024-02-29T23:59:12Z", "2026-01-01T00:00:00+08:00"]) {
    const input = helpers.announcementTimeInput(value);
    assert.equal(helpers.announcementTimeToISO(input, value), new Date(value).toISOString());
  }
  for (const value of ["", "invalid", "2026-02-30T09:00", "2026-09-20T24:00", "0000-01-01T00:00"]) assert.throws(() => helpers.announcementTimeToISO(value), /valid local date/);
});
