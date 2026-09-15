import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test, { before, after } from "node:test";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "@playwright/test";

let browser, bundle, css;
before(async () => {
  const result = await build({ configFile: false, logLevel: "silent", define: { "process.env.NODE_ENV": JSON.stringify("production") },
    plugins: [react(), { name: "attendance-fixtures", enforce: "pre",
      resolveId(id) {
        if (id === "attendance-ui-entry" || id.replaceAll("\\", "/").endsWith("/attendance-ui-entry")) return "\0attendance-ui-entry";
        if (id.endsWith("/services/attendance")) return "\0attendance-service";
        if (id.endsWith("/services/families")) return "\0attendance-families";
        if (id.endsWith("/tenancy/ActiveChurchContext")) return "\0attendance-context";
        if (id.endsWith("/lib/supabase")) return "\0attendance-directory";
      },
      load(id) {
        if (id === "\0attendance-ui-entry") return `
          import React from "react"; import { createRoot } from "react-dom/client";
          import { AttendanceView } from ${JSON.stringify(fileURLToPath(new URL("../../src/components/attendance/AttendanceView.tsx", import.meta.url)).replaceAll("\\", "/"))};
          const root = createRoot(document.getElementById("root"));
          window.renderAttendance = (role = "Admin", churchId = "church-a", viewChurchId = churchId, mode = "church") => {
            window.scope = { activeRole: role, activeChurch: { id: churchId }, workspaceMode: mode, scopeVersion: (window.scope?.scopeVersion || 0) + 1 };
            root.render(React.createElement(AttendanceView, { churchId: viewChurchId }));
          };
        `;
        if (id === "\0attendance-service") return ["loadAttendanceRecords", "loadAttendanceByEvent", "recordAttendance", "updateAttendance", "getMemberAttendanceHistory", "getFamilyAttendanceHistory"].map(name => `export const ${name} = (...args) => window.attendanceCall("${name}", args);`).join("\n");
        if (id === "\0attendance-families") return 'export const loadFamilies = (...args) => window.attendanceCall("loadFamilies", args);';
        if (id === "\0attendance-context") return "export const useActiveChurch = () => window.scope;";
        if (id === "\0attendance-directory") return `export const getSupabase = () => ({ from: table => {
          const query = { table }; const chain = { select: columns => { query.columns = columns; return chain; }, eq: (key, value) => { query[key] = value; return chain; }, order: () => chain,
            then: (resolve, reject) => window.attendanceCall("directory", [query]).then(resolve, reject) }; return chain;
        } });`;
      },
    }], build: { write: false, minify: false, lib: { entry: "attendance-ui-entry", name: "AttendanceUITest", formats: ["iife"] } } });
  const output = (Array.isArray(result) ? result[0] : result).output;
  bundle = output.find(item => item.type === "chunk").code;
  css = ["../../app/globals.css", "../../src/styles/tokens.css", "../../src/styles/primitives.css"].map(path => fs.readFileSync(new URL(path, import.meta.url), "utf8")).join("\n") + output.filter(item => item.type === "asset" && item.fileName.endsWith(".css")).map(item => item.source).join("\n");
  browser = await chromium.launch({ channel: process.env.ATTENDANCE_TEST_BROWSER || "msedge", headless: true });
});
after(async () => { await browser?.close(); });

async function pageFor(role = "Admin") {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(8000);
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => route.abort());
  await page.setContent('<main id="root" style="padding:16px"></main>'); await page.addStyleTag({ content: css });
  await page.evaluate(() => {
    window.calls = []; window.records = [];
    window.members = [
      { id: "member-a", church_id: "church-a", first_name: "Ana", last_name: "Santos", member_number: "M-001", family_id: "family-a" },
      { id: "member-c", church_id: "church-a", first_name: "Juan", last_name: "Reyes", member_number: "M-002", family_id: null },
      { id: "member-b", church_id: "church-b", first_name: "Other", last_name: "Church", family_id: "family-b" },
    ];
    window.events = [{ id: "event-a", church_id: "church-a", title: "Sunday worship", starts_at: "2026-09-15T09:00:00Z" }, { id: "event-b", church_id: "church-b", title: "Other event", starts_at: "2026-09-15T09:00:00Z" }];
    window.families = [{ id: "family-a", churchId: "church-a", name: "Santos family" }, { id: "family-b", churchId: "church-b", name: "Other family" }];
    window.attendanceCall = async (name, args) => {
      window.calls.push({ name, args });
      if (window.fail === name) throw new Error("Test permission failure");
      if (name === "directory") return { error: null, data: window[args[0].table].filter(row => row.church_id === args[0].church_id) };
      if (name === "loadFamilies") return window.families.filter(row => row.churchId === args[0]);
      if (name === "recordAttendance") {
        const row = { id: `attendance-${window.records.length}`, churchId: args[0], ...args[1], recordedBy: "user-a", createdAt: "2026-09-15T01:00:00Z", updatedAt: "2026-09-15T01:00:00Z" };
        window.records.push(row); return row;
      }
      if (name === "updateAttendance") { const row = { ...window.records.find(row => row.id === args[1]), ...args[2] }; window.records = window.records.map(old => old.id === row.id ? row : old); return row; }
      if (window.deferRead) return new Promise(resolve => { window.resolveRead = resolve; });
      return window.records.filter(row => row.churchId === args[0]
        && (name !== "loadAttendanceByEvent" || row.eventId === args[1])
        && (name !== "getMemberAttendanceHistory" || row.memberId === args[1])
        && (name !== "getFamilyAttendanceHistory" || window.members.some(member => member.id === row.memberId && member.church_id === args[0] && member.family_id === args[1])));
    };
  });
  await page.addScriptTag({ content: bundle }); await page.evaluate(role => window.renderAttendance(role), role);
  await page.getByRole("heading", { name: "Open attendance register" }).waitFor();
  return { page, errors };
}
async function openRegister(page, eventId = "event-a", date = "2026-09-15") {
  await page.getByLabel("Attendance date", { exact: true }).fill(date);
  await page.getByLabel("Event", { exact: true }).selectOption(eventId);
  await page.getByRole("button", { name: "Open register", exact: true }).click();
  await page.getByRole("heading", { name: "Ana Santos", exact: true }).waitFor();
}
const rowForm = page => page.getByRole("form", { name: "Ana Santos attendance", exact: true });

test("attendance register records explicit statuses, edits existing records, and separates event/date sessions", async () => {
  const { page, errors } = await pageFor();
  try {
    await openRegister(page);
    assert.equal(await rowForm(page).getByLabel("Status", { exact: true }).inputValue(), "");
    assert.equal(await rowForm(page).getByRole("button", { name: "Save attendance" }).isDisabled(), true);
    await rowForm(page).getByLabel("Status", { exact: true }).selectOption("Present");
    await rowForm(page).getByLabel("Notes", { exact: true }).fill("Morning service");
    await rowForm(page).getByRole("button", { name: "Save attendance" }).click();
    await rowForm(page).getByRole("button", { name: "Update attendance" }).waitFor();
    await rowForm(page).getByLabel("Status", { exact: true }).selectOption("Late");
    await rowForm(page).getByRole("button", { name: "Update attendance" }).click();
    await page.waitForFunction(() => window.records[0].status === "Late");
    assert.equal(await page.evaluate(() => window.records.length), 1);
    await page.getByLabel("Family filter", { exact: true }).selectOption("family-a");
    assert.equal(await page.getByRole("heading", { name: "Juan Reyes" }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.getByRole("button", { name: "Change session", exact: true }).click();
    await openRegister(page, "", "2026-09-15");
    assert.equal(await rowForm(page).getByLabel("Status", { exact: true }).inputValue(), "", "General attendance must not reuse event records");
    await page.getByRole("button", { name: "Change session", exact: true }).click();
    await openRegister(page, "event-a", "2026-09-16");
    assert.equal(await rowForm(page).getByLabel("Status", { exact: true }).inputValue(), "", "A different date needs its own attendance");
    const calls = await page.evaluate(() => window.calls);
    for (const call of calls) assert.equal(call.name === "directory" ? call.args[0].church_id : call.args[0], "church-a");
    assert.deepEqual(calls.find(call => call.name === "updateAttendance").args, ["church-a", "attendance-0", { status: "Late", notes: "Morning service" }]);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("attendance history filters through event, member, and family services with date and empty states", async () => {
  const { page, errors } = await pageFor();
  try {
    await page.evaluate(() => { window.records = [
      { id: "one", churchId: "church-a", memberId: "member-a", eventId: "event-a", attendanceDate: "2026-09-15", status: "Excused", notes: "Family trip" },
      { id: "two", churchId: "church-a", memberId: "member-c", eventId: null, attendanceDate: "2026-09-14", status: "Absent", notes: "Notified" },
    ]; });
    await page.getByRole("button", { name: "Attendance history", exact: true }).click();
    await page.locator("tbody").getByText("Excused", { exact: true }).waitFor();
    for (const [scope, label, id, method] of [["event", "Event", "event-a", "loadAttendanceByEvent"], ["member", "Member", "member-a", "getMemberAttendanceHistory"], ["family", "Family", "family-a", "getFamilyAttendanceHistory"]]) {
      await page.getByLabel("History for", { exact: true }).selectOption(scope);
      await page.getByLabel(label, { exact: true }).selectOption(id);
      await page.locator("tbody").getByText("Ana Santos", { exact: true }).waitFor();
      assert.equal(await page.locator("tbody").getByText("Juan Reyes", { exact: true }).count(), 0);
      assert.ok(await page.evaluate(method => window.calls.some(call => call.name === method && call.args[0] === "church-a"), method));
    }
    await page.getByLabel("From date", { exact: true }).fill("2026-09-16");
    await page.getByRole("heading", { name: "No attendance records", exact: true }).waitFor();
    await page.getByLabel("To date", { exact: true }).fill("2026-09-15");
    await page.getByRole("alert").getByText("From date must be on or before To date.").waitFor();
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("attendance write controls match Admin/Pastor/Secretary/Encoder and inactive scopes make no requests", async () => {
  const { page, errors } = await pageFor();
  try {
    for (const role of ["Admin", "Pastor", "Secretary", "Encoder", "Treasurer", "Viewer"]) {
      await page.evaluate(role => window.renderAttendance(role), role); await openRegister(page);
      const writes = ["Admin", "Pastor", "Secretary", "Encoder"].includes(role);
      assert.equal(await rowForm(page).count(), writes ? 1 : 0, role);
      if (!writes) await page.getByText(/Read-only access/).waitFor();
    }
    for (const args of [[null, "church-a"], ["Admin", "church-a", "church-b"], ["Admin", "church-a", "church-a", "platform"]]) {
      const count = await page.evaluate(() => window.calls.length);
      await page.evaluate(args => window.renderAttendance(...args), args);
      await page.getByRole("heading", { name: "Choose a church workspace" }).waitFor();
      assert.equal(await page.evaluate(() => window.calls.length), count);
    }
    assert.equal(await page.evaluate(() => window.calls.filter(call => ["recordAttendance", "updateAttendance"].includes(call.name)).length), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("failed attendance saves retain input, loading retries recover, and stale history cannot cross churches", async () => {
  const { page, errors } = await pageFor();
  try {
    await openRegister(page);
    await rowForm(page).getByLabel("Status", { exact: true }).selectOption("Absent");
    await rowForm(page).getByLabel("Notes", { exact: true }).fill("Keep this note");
    await page.evaluate(() => { window.fail = "recordAttendance"; });
    await rowForm(page).getByRole("button", { name: "Save attendance" }).click();
    await page.getByRole("alert").getByText("Test permission failure").waitFor();
    assert.equal(await rowForm(page).getByLabel("Notes", { exact: true }).inputValue(), "Keep this note");
    assert.equal(await page.evaluate(() => window.records.length), 0);
    await page.evaluate(() => { window.fail = null; });
    await rowForm(page).getByRole("button", { name: "Save attendance" }).click();
    await rowForm(page).getByRole("button", { name: "Update attendance" }).waitFor();
    await page.evaluate(() => { window.fail = "loadAttendanceRecords"; });
    await page.getByRole("button", { name: "Attendance history", exact: true }).click();
    await page.getByRole("button", { name: "Try again", exact: true }).waitFor();
    await page.evaluate(() => { window.fail = null; window.deferRead = true; });
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.getByRole("status", { name: "Loading attendance history" }).waitFor();
    await page.evaluate(() => { window.staleResolve = window.resolveRead; window.deferRead = false; window.renderAttendance("Admin", "church-b"); });
    await page.getByRole("heading", { name: "Open attendance register" }).waitFor();
    await page.getByRole("button", { name: "Attendance history", exact: true }).click();
    await page.getByRole("heading", { name: "No attendance records", exact: true }).waitFor();
    await page.evaluate(() => window.staleResolve(window.records)); await page.waitForTimeout(50);
    assert.equal(await page.getByText("Keep this note", { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});


test("attendance directory failures retry and empty church data supports a general session", async () => {
  const { page, errors } = await pageFor();
  try {
    await page.evaluate(() => { window.fail = "directory"; window.renderAttendance("Admin"); });
    await page.getByRole("alert").getByText("Test permission failure").waitFor();
    await page.evaluate(() => { window.fail = null; window.members = []; window.events = []; window.families = []; });
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.getByText(/No events available/).waitFor();
    await page.getByLabel("Attendance date", { exact: true }).fill("2026-09-15");
    await page.getByRole("button", { name: "Open register", exact: true }).click();
    await page.getByRole("heading", { name: "No members available" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Save attendance" }).count(), 0);
    await page.getByRole("button", { name: "Attendance history", exact: true }).click();
    await page.getByRole("heading", { name: "No attendance records" }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});


test("attendance reports display scoped rates, member history, family summaries and trends without writes", async () => {
  const { page, errors } = await pageFor("Viewer");
  try {
    await page.evaluate(() => { window.records = [
      { id: "one", churchId: "church-a", memberId: "member-a", eventId: "event-a", attendanceDate: "2026-09-15", status: "Present" },
      { id: "two", churchId: "church-a", memberId: "member-a", eventId: null, attendanceDate: "2026-09-16", status: "Late" },
      { id: "three", churchId: "church-a", memberId: "member-c", eventId: "event-a", attendanceDate: "2026-09-15", status: "Absent" },
      { id: "four", churchId: "church-a", memberId: "member-c", eventId: "event-a", attendanceDate: "2026-09-16", status: "Excused" },
      { id: "foreign", churchId: "church-b", memberId: "member-b", eventId: "event-b", attendanceDate: "2026-09-15", status: "Present" },
    ]; });
    await page.getByRole("button", { name: "Attendance reports", exact: true }).click();
    const overall = page.getByRole("region", { name: "Overall attendance summary", exact: true });
    await overall.getByText("50%", { exact: true }).waitFor();
    await page.getByLabel("Member", { exact: true }).selectOption("member-a");
    const history = page.getByRole("region", { name: "Member attendance report", exact: true });
    await history.getByText("100%", { exact: true }).waitFor();
    assert.deepEqual(await history.locator("tbody tr td:first-child").allTextContents(), ["2026-09-16", "2026-09-15"]);
    const families = page.getByRole("region", { name: "Family attendance summary", exact: true });
    await families.getByText("Santos family", { exact: true }).waitFor();
    await families.getByText("100%", { exact: true }).waitFor();
    assert.equal(await page.getByText("Other family", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("option", { name: "Other Church", exact: true }).count(), 0);
    assert.equal(await page.getByRole("progressbar").count(), 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.getByLabel("From date", { exact: true }).fill("2026-09-16");
    assert.equal(await history.locator("tbody tr").count(), 1);
    await page.getByLabel("To date", { exact: true }).fill("2026-09-15");
    await page.getByRole("alert").getByText("From date must be on or before To date.").waitFor();
    await page.getByLabel("To date", { exact: true }).fill("2026-09-17");
    await page.getByLabel("From date", { exact: true }).fill("2026-09-17");
    await page.getByRole("heading", { name: "No attendance records", exact: true }).waitFor();
    const calls = await page.evaluate(() => window.calls);
    assert.ok(calls.some(call => call.name === "loadAttendanceRecords" && call.args[0] === "church-a"));
    assert.ok(calls.every(call => call.name === "directory" ? call.args[0].church_id === "church-a" : call.args[0] === "church-a"));
    assert.ok(calls.every(call => !["recordAttendance", "updateAttendance"].includes(call.name)));
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("attendance reports handle loading, failed reads, retry and church changes", async () => {
  const { page, errors } = await pageFor();
  try {
    await page.evaluate(() => { window.fail = "loadAttendanceRecords"; });
    await page.getByRole("button", { name: "Attendance reports", exact: true }).click();
    await page.getByRole("alert").getByText("Test permission failure").waitFor();
    await page.evaluate(() => { window.fail = null; window.deferRead = true; });
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.getByRole("status", { name: "Loading attendance reports", exact: true }).waitFor();
    await page.waitForFunction(() => !!window.resolveRead);
    await page.evaluate(() => {
      window.oldRead = window.resolveRead;
      window.deferRead = false;
      window.renderAttendance("Viewer", "church-b");
    });
    await page.getByRole("heading", { name: "Open attendance register" }).waitFor();
    await page.getByRole("button", { name: "Attendance reports", exact: true }).click();
    await page.getByRole("heading", { name: "No attendance records", exact: true }).waitFor();
    await page.evaluate(() => window.oldRead([{ id: "old", churchId: "church-a", memberId: "member-a", eventId: null, attendanceDate: "2026-09-15", status: "Present" }]));
    await page.getByRole("button", { name: "Refresh reports", exact: true }).click();
    await page.getByRole("heading", { name: "No attendance records", exact: true }).waitFor();
    assert.equal(await page.getByRole("region", { name: "Overall attendance summary", exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
