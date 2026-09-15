import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as helpers from "../src/components/events/eventHelpers.ts";

const event = { id: "event-a", churchId: "church-a", title: "Sunday worship", description: "Weekly gathering", location: "Main hall", startsAt: "2026-09-20T01:00:00Z", endsAt: null, capacity: 0, createdBy: null, createdAt: "2026-09-15T00:00:00Z", updatedAt: "2026-09-15T00:00:00Z" };
function setup(role = "Admin", churchId = "church-a", mode = "church") {
  const modules = new Map();
  function compile(name) {
    if (modules.has(name)) return modules.get(name);
    const code = ts.transpileModule(fs.readFileSync(new URL(`../src/components/events/${name}.tsx`, import.meta.url), "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const exports = {}; modules.set(name, exports);
    vm.runInNewContext(code, { exports, require: id => {
      if (id === "react") return React;
      if (id === "react/jsx-runtime") return jsx;
      if (id.endsWith(".css")) return {};
      if (id === "./eventHelpers") return helpers;
      if (id.startsWith("./Event")) return compile(id.slice(2));
      if (id.endsWith("/ActiveChurchContext")) return { useActiveChurch: () => ({ activeChurch: { id: churchId }, activeRole: role, workspaceMode: mode, scopeVersion: 1 }) };
      if (id.endsWith("/permissions")) return { hasChurchRole: (role, allowed) => !!role && allowed.includes(role) };
      if (id.endsWith("/EmptyState")) return { EmptyState: ({ title, description }) => React.createElement("div", null, React.createElement("h3", null, title), description) };
      if (id.endsWith("/LoadingSkeleton")) return { LoadingSkeleton: ({ label }) => React.createElement("div", { role: "status" }, label) };
      if (id.endsWith("/events") || id.endsWith("/supabase")) return {};
      throw new Error(`Unexpected dependency: ${id}`);
    } });
    return exports;
  }
  return { ...compile("EventView"), ...compile("EventProfile"), ...compile("EventForm"), ...compile("EventCalendar") };
}
const actions = { onSubmit: async () => {}, onCancel() {}, onBack() {}, onEventChange() {}, onDeleted() {}, onSelect() {} };
const render = (Component, props = {}) => renderToStaticMarkup(React.createElement(Component, { ...actions, churchId: "church-a", ...props }));

test("event managers exactly match Admin/Pastor/Secretary, including deletion permissions", () => {
  assert.deepEqual(helpers.eventManagerRoles, ["Admin", "Pastor", "Secretary"]);
  for (const role of ["Admin", "Pastor", "Secretary", "Treasurer", "Encoder", "Viewer"]) {
    const { EventView, EventForm, EventProfile } = setup(role);
    const allowed = ["Admin", "Pastor", "Secretary"].includes(role);
    const list = render(EventView);
    assert.equal(list.includes(">New event</button>"), allowed, role);
    assert.match(list, /Loading events/);
    const profile = render(EventProfile, { event });
    assert.equal(profile.includes(">Edit event</button>"), allowed, role);
    assert.equal(profile.includes(">Delete event</button>"), allowed, role);
    assert.match(profile, /Loading event attendance/);
    assert.equal(render(EventForm, { saving: false }) !== "", allowed, role);
    assert.doesNotMatch(profile, /Save attendance|Update attendance/);
  }
});

test("all event surfaces reject mismatched, inactive and platform workspaces", () => {
  for (const [role, churchId, mode] of [[null, "church-a", "church"], ["Admin", "church-b", "church"], ["Admin", "church-a", "platform"]]) {
    const components = setup(role, churchId, mode);
    for (const name of ["EventView", "EventCalendar", "EventProfile"]) {
      const html = render(components[name], { event, events: [event] });
      assert.match(html, /Choose a church workspace/);
      assert.doesNotMatch(html, /Sunday worship/);
    }
    assert.equal(render(components.EventForm, { event, saving: false }), "");
  }
  const { EventProfile, EventForm } = setup();
  const foreign = { ...event, churchId: "church-b" };
  assert.match(render(EventProfile, { event: foreign }), /Choose a church workspace/);
  assert.equal(render(EventForm, { event: foreign, saving: false }), "");
});

test("event form preserves details, nullable fields, local time and native validation", () => {
  const { EventForm } = setup();
  const html = render(EventForm, { event, saving: false });
  assert.match(html, /value="Sunday worship"/);
  assert.match(html, /Weekly gathering/);
  assert.match(html, /value="Main hall"/);
  assert.match(html, /name="capacity"[^>]*value="0"/);
  assert.match(html, /min="0"/);
  assert.equal((html.match(/required=""/g) || []).length, 2);
  assert.ok(html.includes(helpers.eventTimeInput(event.startsAt)));
  const busy = render(EventForm, { event, saving: true, error: "Permission denied" });
  assert.match(busy, /aria-busy="true"/);
  assert.match(busy, /role="alert">Permission denied/);
  assert.equal((busy.match(/disabled=""/g) || []).length, 8);
  assert.match(render(EventForm, { event: { ...event, capacity: null }, saving: false }), /name="capacity"[^>]*value=""/);
});

test("event profiles escape user text and show optional-field placeholders", () => {
  const { EventProfile } = setup();
  const html = render(EventProfile, { event: { ...event, title: "<script>alert(1)</script>", description: "<img src=x onerror=alert(1)>", location: "", capacity: null } });
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<script>|<img/);
  assert.match(html, /Not specified/);
  assert.match(html, /No capacity limit/);
});

test("local event inputs round-trip exact instants and reject impossible local dates", () => {
  for (const timestamp of ["2026-09-20T01:00:00.123Z", "2024-02-29T23:59:12Z", "2026-01-01T00:00:00+08:00"]) {
    assert.equal(helpers.eventTimeToISO(helpers.eventTimeInput(timestamp)), new Date(timestamp).toISOString());
  }
  for (const value of ["", "bad", "2026-02-30T09:00", "2026-09-20T24:00", "0000-01-01T00:00"]) assert.throws(() => helpers.eventTimeToISO(value), /valid local date/);
});

test("calendar filters church ownership and handles month boundaries and multi-day events", () => {
  const local = value => new Date(value).toISOString();
  const rows = Object.freeze([
    Object.freeze({ ...event, id: "overnight", startsAt: local("2026-08-31T23:00"), endsAt: local("2026-09-02T00:00") }),
    Object.freeze({ ...event, id: "one-day", startsAt: local("2026-09-15T10:00"), endsAt: null }),
    Object.freeze({ ...event, id: "foreign", churchId: "church-b", startsAt: local("2026-09-15T10:00") }),
  ]);
  const calendar = helpers.buildEventCalendar("church-a", rows, "2026-09");
  assert.equal(calendar.length, 30);
  assert.deepEqual(calendar[0].events.map(row => row.id), ["overnight"]);
  assert.equal(calendar[1].events.length, 0, "Midnight end must not occupy the next day");
  assert.deepEqual(calendar[14].events.map(row => row.id), ["one-day"]);
  assert.equal(helpers.buildEventCalendar("church-a", [], "2024-02").length, 29);
  assert.throws(() => helpers.buildEventCalendar("", rows, "2026-09"), /Church workspace/);
  assert.throws(() => helpers.buildEventCalendar("church-a", rows, "2026-13"), /valid month/);
});


test("calendar month navigation handles year boundaries and supported year limits", () => {
  assert.equal(helpers.shiftCalendarMonth("2026-12", 1), "2027-01");
  assert.equal(helpers.shiftCalendarMonth("2026-01", -1), "2025-12");
  assert.equal(helpers.shiftCalendarMonth("2024-02", 1), "2024-03");
  assert.equal(helpers.shiftCalendarMonth("0001-01", -1), null);
  assert.equal(helpers.shiftCalendarMonth("9999-12", 1), null);
  assert.equal(helpers.shiftCalendarMonth("0001-12", 1), "0002-01");
  for (const month of ["", "0000-01", "2026-00", "2026-13", "2026-1", "invalid"]) {
    assert.equal(helpers.shiftCalendarMonth(month, 1), null);
    assert.equal(helpers.shiftCalendarMonth(month, -1), null);
  }
});

test("calendar groups events chronologically per date and counts multi-day events once per month", () => {
  const { EventCalendar } = setup("Viewer");
  const month = helpers.currentMonth();
  const rows = [
    { ...event, id: "later", title: "Later gathering", startsAt: new Date(`${month}-01T14:00`).toISOString(), endsAt: null },
    { ...event, id: "multi", title: "Church retreat", startsAt: new Date(`${month}-01T09:00`).toISOString(), endsAt: new Date(`${month}-02T12:00`).toISOString() },
    { ...event, id: "foreign", churchId: "church-b", title: "Foreign event", startsAt: new Date(`${month}-01T10:00`).toISOString() },
  ];
  const days = helpers.buildEventCalendar("church-a", rows, month);
  assert.deepEqual(days[0].events.map(row => row.id), ["multi", "later"]);
  assert.deepEqual(days[1].events.map(row => row.id), ["multi"]);
  const html = render(EventCalendar, { events: rows });
  assert.match(html, /2 events this month/);
  assert.match(html, /Continues from/);
  assert.match(html, /Main hall/);
  assert.doesNotMatch(html, /Foreign event/);
  for (const label of ["Previous month", "This month", "Next month"]) assert.ok(html.includes(label));
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-current="date"/);
  const disabled = render(EventCalendar, { events: rows, disabled: true });
  assert.equal((disabled.match(/disabled=""/g) || []).length, 7, "Month picker, navigation, and all event entries are disabled together");
});
