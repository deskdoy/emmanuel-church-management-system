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
    plugins: [react(), { name: "event-fixtures", enforce: "pre",
      resolveId(id) {
        if (id === "event-ui-entry" || id.replaceAll("\\", "/").endsWith("/event-ui-entry")) return "\0event-ui-entry";
        if (id.endsWith("/services/events")) return "\0event-service";
        if (id.endsWith("/tenancy/ActiveChurchContext")) return "\0event-context";
        if (id.endsWith("/lib/supabase")) return "\0event-directory";
      },
      load(id) {
        if (id === "\0event-ui-entry") return `
          import React from "react"; import { createRoot } from "react-dom/client";
          import { EventView } from ${JSON.stringify(fileURLToPath(new URL("../../src/components/events/EventView.tsx", import.meta.url)).replaceAll("\\", "/"))};
          const root = createRoot(document.getElementById("root"));
          window.renderEvents = (role = "Admin", churchId = "church-a", viewChurchId = churchId, mode = "church") => {
            window.scope = { activeRole: role, activeChurch: { id: churchId }, workspaceMode: mode, scopeVersion: (window.scope?.scopeVersion || 0) + 1 };
            root.render(React.createElement(EventView, { churchId: viewChurchId }));
          };
        `;
        if (id === "\0event-service") return ["loadEvents", "createEvent", "updateEvent", "deleteEvent", "loadEventAttendance"].map(name => `export const ${name} = (...args) => window.eventCall("${name}", args);`).join("\n");
        if (id === "\0event-context") return "export const useActiveChurch = () => window.scope;";
        if (id === "\0event-directory") return `export const getSupabase = () => ({ from: table => {
          const query = { table }; const chain = { select: columns => { query.columns = columns; return chain; }, eq: (key, value) => { query[key] = value; return chain; },
            then: (resolve, reject) => window.eventCall("directory", [query]).then(resolve, reject) }; return chain;
        } });`;
      },
    }], build: { write: false, minify: false, lib: { entry: "event-ui-entry", name: "EventUITest", formats: ["iife"] } } });
  const output = (Array.isArray(result) ? result[0] : result).output;
  bundle = output.find(item => item.type === "chunk").code;
  css = ["../../app/globals.css", "../../src/styles/tokens.css", "../../src/styles/primitives.css"].map(path => fs.readFileSync(new URL(path, import.meta.url), "utf8")).join("\n") + output.filter(item => item.type === "asset" && item.fileName.endsWith(".css")).map(item => item.source).join("\n");
  browser = await chromium.launch({ channel: process.env.EVENT_TEST_BROWSER || "msedge", headless: true });
});
after(async () => { await browser?.close(); });

async function pageFor(role = "Admin") {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Shanghai" });
  page.setDefaultTimeout(8000);
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => route.abort());
  await page.setContent('<main id="root" style="padding:16px"></main>'); await page.addStyleTag({ content: css });
  await page.evaluate(() => {
    window.calls = [];
    window.events = [
      { id: "event-a", churchId: "church-a", title: "Sunday worship", description: "Weekly gathering", location: "Main hall", startsAt: "2026-09-20T01:00:00Z", endsAt: "2026-09-20T03:00:00Z", capacity: 100 },
      { id: "event-b", churchId: "church-b", title: "Other church event", description: "", location: "", startsAt: "2026-09-20T01:00:00Z", endsAt: null, capacity: null },
    ];
    window.attendance = [
      { id: "one", churchId: "church-a", eventId: "event-a", memberId: "member-a", attendanceDate: "2026-09-20", status: "Late", notes: "Arrived at 09:10" },
      { id: "foreign", churchId: "church-b", eventId: "event-b", memberId: "member-b", attendanceDate: "2026-09-20", status: "Absent", notes: "Foreign notes" },
      { id: "different-event", churchId: "church-a", eventId: "different-event", memberId: "member-a", attendanceDate: "2026-09-20", status: "Excused", notes: "Different event notes" },
    ];
    window.members = [{ id: "member-a", church_id: "church-a", first_name: "Ana", last_name: "Santos" }, { id: "member-b", church_id: "church-b", first_name: "Other", last_name: "Member" }];
    window.eventCall = async (name, args) => {
      window.calls.push({ name, args });
      if (window.fail === name) throw new Error("Test permission failure");
      if (name === "loadEvents") return window.events;
      if (name === "directory") return { error: null, data: window.members };
      if (name === "loadEventAttendance") {
        if (window.deferRead) return new Promise(resolve => { window.resolveRead = resolve; });
        return window.attendance;
      }
      if (name === "createEvent") {
        if (window.deferCreate) return new Promise(resolve => { window.resolveCreate = resolve; });
        const row = { id: "new-event", churchId: args[0], ...args[1] }; window.events.push(row); return row;
      }
      if (name === "updateEvent") { const row = { ...window.events.find(row => row.id === args[1] && row.churchId === args[0]), ...args[2] }; window.events = window.events.map(old => old.id === row.id ? row : old); return row; }
      if (name === "deleteEvent") { window.events = window.events.filter(row => row.churchId !== args[0] || row.id !== args[1]); return; }
      throw new Error(`Unexpected service operation ${name}`);
    };
  });
  await page.addScriptTag({ content: bundle }); await page.evaluate(role => window.renderEvents(role), role);
  await page.getByRole("heading", { name: "Sunday worship", exact: true }).waitFor();
  return { page, errors };
}
async function openProfile(page) {
  await page.getByRole("button", { name: "View event", exact: true }).click();
  await page.getByRole("region", { name: "Event profile", exact: true }).waitFor();
}
async function fillCreate(page) {
  await page.getByRole("button", { name: "New event", exact: true }).click();
  await page.getByLabel("Event title", { exact: true }).fill("Community picnic");
  await page.getByLabel("Starts at", { exact: true }).fill("2026-09-21T09:00");
  await page.getByLabel("Ends at", { exact: true }).fill("2026-09-21T11:00");
  await page.getByLabel("Location", { exact: true }).fill("Church garden");
  await page.getByLabel("Description", { exact: true }).fill("Bring a picnic");
}

test("event create/edit/delete preserves local time, optional fields and failed-save input", async () => {
  const { page, errors } = await pageFor("Secretary");
  try {
    await fillCreate(page);
    await page.getByLabel("Ends at", { exact: true }).fill("2026-09-20T08:00");
    await page.getByRole("button", { name: "Create event", exact: true }).click();
    await page.getByRole("alert").getByText("End time must be on or after start time.").waitFor();
    assert.equal(await page.evaluate(() => window.calls.filter(call => call.name === "createEvent").length), 0);
    await page.getByLabel("Ends at", { exact: true }).fill("2026-09-21T11:00");
    await page.evaluate(() => { window.fail = "createEvent"; });
    await page.getByRole("button", { name: "Create event", exact: true }).click();
    await page.getByRole("alert").getByText("Test permission failure").waitFor();
    assert.equal(await page.getByLabel("Event title", { exact: true }).inputValue(), "Community picnic");
    await page.evaluate(() => { window.fail = null; });
    await page.getByRole("button", { name: "Create event", exact: true }).click();
    await page.getByRole("heading", { name: "Community picnic", exact: true }).waitFor();
    const create = await page.evaluate(() => window.calls.find(call => call.name === "createEvent"));
    assert.deepEqual(create.args, ["church-a", { title: "Community picnic", startsAt: "2026-09-21T01:00:00.000Z", endsAt: "2026-09-21T03:00:00.000Z", capacity: null, description: "Bring a picnic", location: "Church garden" }]);
    await page.getByRole("button", { name: "Edit event", exact: true }).click();
    assert.ok((await page.getByLabel("Starts at", { exact: true }).inputValue()).startsWith("2026-09-21T09:00"));
    await page.getByLabel("Event title", { exact: true }).fill("Updated picnic");
    await page.getByLabel("Ends at", { exact: true }).fill("");
    await page.locator('input[name="capacity"]').fill("0");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByText("Event updated.", { exact: true }).waitFor();
    const update = await page.evaluate(() => window.calls.find(call => call.name === "updateEvent"));
    assert.equal(update.args[0], "church-a"); assert.equal(update.args[1], "new-event");
    assert.equal(update.args[2].endsAt, null); assert.equal(update.args[2].capacity, 0);
    assert.equal(update.args[2].startsAt, "2026-09-21T01:00:00.000Z");
    page.once("dialog", dialog => { assert.match(dialog.message(), /all its attendance records/); void dialog.dismiss(); });
    await page.getByRole("button", { name: "Delete event", exact: true }).click();
    assert.equal(await page.evaluate(() => window.calls.filter(call => call.name === "deleteEvent").length), 0);
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Delete event", exact: true }).click();
    await page.getByText("Event deleted.", { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.calls.find(call => call.name === "deleteEvent").args), ["church-a", "new-event"]);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("event UI role gates and invalid workspace guards prevent unauthorized actions and requests", async () => {
  const { page, errors } = await pageFor();
  try {
    for (const role of ["Admin", "Pastor", "Secretary", "Treasurer", "Encoder", "Viewer"]) {
      await page.evaluate(role => window.renderEvents(role), role);
      await page.getByRole("heading", { name: "Sunday worship", exact: true }).waitFor();
      const manages = ["Admin", "Pastor", "Secretary"].includes(role);
      assert.equal(await page.getByRole("button", { name: "New event", exact: true }).count(), manages ? 1 : 0);
      await openProfile(page);
      assert.equal(await page.getByRole("button", { name: "Edit event", exact: true }).count(), manages ? 1 : 0);
      assert.equal(await page.getByRole("button", { name: "Delete event", exact: true }).count(), manages ? 1 : 0);
      await page.getByText("Ana Santos", { exact: true }).waitFor();
    }
    for (const args of [[null, "church-a"], ["Admin", "church-a", "church-b"], ["Admin", "church-a", "church-a", "platform"]]) {
      const count = await page.evaluate(() => window.calls.length);
      await page.evaluate(args => window.renderEvents(...args), args);
      await page.getByRole("heading", { name: "Choose a church workspace" }).waitFor();
      assert.equal(await page.evaluate(() => window.calls.length), count);
    }
    assert.equal(await page.evaluate(() => window.calls.filter(call => ["createEvent", "updateEvent", "deleteEvent"].includes(call.name)).length), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("calendar opens scoped event profiles and is usable on mobile and desktop", async () => {
  const { page, errors } = await pageFor("Viewer");
  try {
    assert.equal(await page.getByText("Other church event", { exact: true }).count(), 0);
    await page.getByRole("button", { name: "Calendar", exact: true }).click();
    await page.getByLabel("Calendar month", { exact: true }).fill("2026-09");
    await page.getByRole("button", { name: /Sunday worship/ }).waitFor();
    assert.equal(await page.getByRole("button", { name: /Other church event/ }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.setViewportSize({ width: 1366, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.getByLabel("Calendar month", { exact: true }).fill("2026-10");
    await page.getByRole("heading", { name: "No events this month", exact: true }).waitFor();
    await page.getByLabel("Calendar month", { exact: true }).fill("");
    await page.getByRole("heading", { name: "Choose a month", exact: true }).waitFor();
    await page.getByLabel("Calendar month", { exact: true }).fill("2026-09");
    await page.getByRole("button", { name: /Sunday worship/ }).click();
    await page.getByText("Ana Santos", { exact: true }).waitFor();
    const region = page.getByRole("region", { name: "Event attendance", exact: true });
    await region.getByText("Late", { exact: true }).waitFor();
    assert.equal(await region.getByText("Foreign notes", { exact: true }).count(), 0);
    assert.equal(await region.getByText("Different event notes", { exact: true }).count(), 0);
    const calls = await page.evaluate(() => window.calls);
    assert.deepEqual(calls.find(call => call.name === "loadEventAttendance").args, ["church-a", "event-a"]);
    assert.ok(calls.every(call => call.name === "directory" ? call.args[0].church_id === "church-a" : call.args[0] === "church-a"));
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("event and attendance loading failures retry and empty data has clear states", async () => {
  const { page, errors } = await pageFor();
  try {
    await page.evaluate(() => { window.fail = "loadEvents"; });
    await page.getByRole("button", { name: "Refresh events", exact: true }).click();
    await page.getByRole("alert").getByText("Test permission failure").waitFor();
    await page.evaluate(() => { window.fail = null; window.events = window.events.filter(row => row.churchId === "church-b"); });
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.getByRole("heading", { name: "No events yet", exact: true }).waitFor();
    await page.evaluate(() => window.renderEvents("Viewer", "church-b"));
    await page.getByRole("heading", { name: "Other church event", exact: true }).waitFor();
    await page.evaluate(() => { window.fail = "loadEventAttendance"; });
    await openProfile(page);
    await page.getByRole("alert").getByText("Test permission failure").waitFor();
    await page.evaluate(() => { window.fail = null; window.attendance = []; });
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.getByRole("heading", { name: "No attendance recorded", exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("pending attendance and create responses cannot repopulate a switched church workspace", async () => {
  const { page, errors } = await pageFor();
  try {
    await page.evaluate(() => { window.deferRead = true; });
    await openProfile(page);
    await page.getByRole("status", { name: "Loading event attendance", exact: true }).waitFor();
    await page.waitForFunction(() => !!window.resolveRead);
    await page.evaluate(() => { window.oldRead = window.resolveRead; window.deferRead = false; window.renderEvents("Admin", "church-b"); });
    await page.getByRole("heading", { name: "Other church event", exact: true }).waitFor();
    await openProfile(page);
    await page.getByText("Other Member", { exact: true }).waitFor();
    await page.evaluate(() => window.oldRead(window.attendance));
    assert.equal(await page.getByText("Ana Santos", { exact: true }).count(), 0);
    await page.evaluate(() => window.renderEvents("Admin", "church-a"));
    await page.getByRole("heading", { name: "Sunday worship", exact: true }).waitFor();
    await fillCreate(page);
    await page.evaluate(() => { window.deferCreate = true; });
    await page.getByRole("button", { name: "Create event", exact: true }).click();
    await page.getByRole("button", { name: "Saving...", exact: true }).waitFor();
    await page.waitForFunction(() => !!window.resolveCreate);
    await page.evaluate(() => window.renderEvents("Viewer", "church-b"));
    await page.getByRole("heading", { name: "Other church event", exact: true }).waitFor();
    await page.evaluate(() => window.resolveCreate({ ...window.events[0], id: "new", title: "Stale create" }));
    assert.equal(await page.getByText("Stale create", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("region", { name: "Event profile", exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});


test("monthly calendar navigation groups events, preserves profile attendance selection, and fits narrow screens", async () => {
  const { page, errors } = await pageFor("Viewer");
  try {
    await page.evaluate(() => {
      window.events.push(
        { ...window.events[0], id: "retreat", title: "Church retreat", startsAt: "2026-09-19T01:00:00Z", endsAt: "2026-09-20T04:00:00Z", location: "Retreat center" },
        { ...window.events[0], id: "later", title: "Evening prayer", startsAt: "2026-09-20T10:00:00Z", endsAt: null },
      );
    });
    await page.getByRole("button", { name: "Refresh events", exact: true }).click();
    await page.getByRole("heading", { name: "Church retreat", exact: true }).waitFor();
    await page.getByRole("button", { name: "Calendar", exact: true }).click();
    const month = page.getByLabel("Calendar month", { exact: true });
    await month.fill("2026-09");
    await page.getByRole("heading", { name: "September 2026", exact: true }).waitFor();
    await page.getByText("3 events this month", { exact: true }).waitFor();
    const day = page.getByRole("article", { name: "2026-09-20", exact: true });
    await day.getByText("3 events", { exact: true }).waitFor();
    assert.deepEqual(await day.locator("button strong").allTextContents(), ["Church retreat", "Sunday worship", "Evening prayer"]);
    assert.match(await day.getByRole("button", { name: /Church retreat/ }).innerText(), /Continues from/);
    assert.equal(await page.getByRole("button", { name: /Other church event/ }).count(), 0);
    await page.setViewportSize({ width: 320, height: 740 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    const dayBox = await day.boundingBox();
    assert.ok(dayBox.width > 200, "Mobile presents a readable agenda grouped by date");
    await page.getByRole("button", { name: "Next month", exact: true }).click();
    assert.equal(await month.inputValue(), "2026-10");
    await page.getByRole("heading", { name: "No events this month", exact: true }).waitFor();
    await page.getByRole("button", { name: "Previous month", exact: true }).click();
    assert.equal(await month.inputValue(), "2026-09");
    await month.fill("2026-12");
    await page.getByRole("button", { name: "Next month", exact: true }).click();
    assert.equal(await month.inputValue(), "2027-01");
    await page.getByRole("button", { name: "Previous month", exact: true }).click();
    assert.equal(await month.inputValue(), "2026-12");
    await month.fill("0001-01");
    assert.equal(await page.getByRole("button", { name: "Previous month", exact: true }).isDisabled(), true);
    await month.fill("9999-12");
    assert.equal(await page.getByRole("button", { name: "Next month", exact: true }).isDisabled(), true);
    await month.fill("");
    assert.equal(await page.getByRole("button", { name: "Next month", exact: true }).isDisabled(), true);
    await page.getByRole("button", { name: "This month", exact: true }).click();
    const current = await page.evaluate(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; });
    assert.equal(await month.inputValue(), current);
    await month.fill("2026-09");
    await day.getByRole("button", { name: /Sunday worship/ }).click();
    await page.getByRole("region", { name: "Event profile", exact: true }).waitFor();
    await page.getByText("Weekly gathering", { exact: true }).waitFor();
    await page.getByText("Ana Santos", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Edit event", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Delete event", exact: true }).count(), 0);
    assert.deepEqual(await page.evaluate(() => window.calls.find(call => call.name === "loadEventAttendance").args), ["church-a", "event-a"]);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
