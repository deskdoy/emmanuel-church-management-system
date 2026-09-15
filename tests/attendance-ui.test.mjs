import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as attendanceTypes from "../src/components/attendance/types.ts";

const directory = { churchId: "church-a", members: [], families: [], events: [{ id: "event-a", churchId: "church-a", title: "Sunday worship", startsAt: "2026-09-15T09:00:00Z" }] };
const session = { eventId: "event-a", attendanceDate: "2026-09-15" };
function setup(role = "Admin", churchId = "church-a", mode = "church") {
  const modules = new Map();
  function compile(name) {
    if (modules.has(name)) return modules.get(name);
    const source = fs.readFileSync(new URL(`../src/components/attendance/${name}.tsx`, import.meta.url), "utf8");
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const exports = {}; modules.set(name, exports);
    vm.runInNewContext(code, { exports, require: id => {
      if (id === "react") return React;
      if (id === "react/jsx-runtime") return jsx;
      if (id === "./types") return attendanceTypes;
      if (id.startsWith("./Attendance")) return compile(id.slice(2));
      if (id.endsWith(".css")) return {};
      if (id.endsWith("/ActiveChurchContext")) return { useActiveChurch: () => ({ activeChurch: { id: churchId }, activeRole: role, workspaceMode: mode, scopeVersion: 1 }) };
      if (id.endsWith("/permissions")) return { hasChurchRole: (role, allowed) => !!role && allowed.includes(role) };
      if (id.endsWith("/EmptyState")) return { EmptyState: ({ title, description }) => React.createElement("div", null, React.createElement("h3", null, title), description) };
      if (id.endsWith("/LoadingSkeleton")) return { LoadingSkeleton: ({ label }) => React.createElement("div", { role: "status" }, label) };
      if (id.endsWith("/attendance") || id.endsWith("/families") || id.endsWith("/supabase")) return {};
      throw new Error(`Unexpected dependency: ${id}`);
    } });
    return exports;
  }
  return { ...compile("AttendanceView"), ...compile("AttendanceSessionForm"), ...compile("AttendanceRegister"), ...compile("AttendanceHistory") };
}
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));

test("attendance session form requires a date and offers only the current church's events", () => {
  const { AttendanceSessionForm } = setup();
  const html = render(AttendanceSessionForm, { churchId: "church-a", events: [...directory.events, { id: "foreign", churchId: "church-b", title: "Other church event", startsAt: "2026-09-15" }], initialSession: session, onOpen() {} });
  assert.match(html, /type="date"/);
  assert.match(html, /required=""/);
  assert.match(html, /value="2026-09-15"/);
  assert.match(html, /Sunday worship/);
  assert.doesNotMatch(html, /Other church event|value="foreign"/);
  assert.match(html, /General attendance \(no event\)/);
  const empty = render(AttendanceSessionForm, { churchId: "church-a", events: [], onOpen() {} });
  assert.match(empty, /No events available/);
  assert.match(empty, /Open register/);
});

test("attendance writer roles and statuses exactly match existing attendance policy", () => {
  assert.deepEqual(attendanceTypes.attendanceWriterRoles, ["Admin", "Pastor", "Secretary", "Encoder"]);
  assert.deepEqual(attendanceTypes.attendanceStatuses, ["Present", "Absent", "Late", "Excused"]);
  for (const role of ["Admin", "Pastor", "Secretary", "Encoder", "Treasurer", "Viewer"]) {
    const { AttendanceRegister } = setup(role);
    const html = render(AttendanceRegister, { churchId: "church-a", directory, session });
    assert.equal(html.includes("Read-only access"), !attendanceTypes.attendanceWriterRoles.includes(role), role);
    assert.match(html, /Loading attendance register/);
    assert.match(html, /Unrecorded members remain unrecorded/);
  }
});

test("attendance view, register, and history reject inactive and mismatched scopes", () => {
  for (const [role, churchId, mode] of [[null, "church-a", "church"], ["Admin", "church-b", "church"], ["Admin", "church-a", "platform"]]) {
    const { AttendanceView, AttendanceRegister, AttendanceHistory } = setup(role, churchId, mode);
    for (const Component of [AttendanceView, AttendanceRegister, AttendanceHistory]) {
      const html = render(Component, { churchId: "church-a", directory, session });
      assert.match(html, /Choose a church workspace/);
      assert.doesNotMatch(html, /Sunday worship/);
    }
  }
  const { AttendanceRegister, AttendanceHistory } = setup();
  for (const Component of [AttendanceRegister, AttendanceHistory]) {
    assert.match(render(Component, { churchId: "church-a", directory: { ...directory, churchId: "church-b" }, session }), /Choose a church workspace/);
  }
});

test("attendance history starts with a loading state and accessible event/member/family filters", () => {
  const { AttendanceHistory, AttendanceView } = setup();
  const html = render(AttendanceHistory, { churchId: "church-a", directory });
  for (const label of ["History for", "From date", "To date", "All attendance", "Event", "Member", "Family"]) assert.ok(html.includes(label));
  assert.match(html, /Loading attendance history/);
  assert.match(render(AttendanceView, { churchId: "church-a" }), /Loading attendance data/);
});
