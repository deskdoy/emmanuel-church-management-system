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
    plugins: [react(), { name: "engagement-fixtures", enforce: "pre",
      resolveId(id) {
        if (id === "engagement-ui-entry" || id.replaceAll("\\", "/").endsWith("/engagement-ui-entry")) return "\0engagement-ui-entry";
        if (id.endsWith("/services/engagement")) return "\0engagement-service";
        if (id.endsWith("/tenancy/ActiveChurchContext")) return "\0engagement-context";
      },
      load(id) {
        if (id === "\0engagement-ui-entry") return `
          import React from "react"; import { createRoot } from "react-dom/client";
          import { EngagementDashboard } from ${JSON.stringify(fileURLToPath(new URL("../../src/components/engagement/EngagementDashboard.tsx", import.meta.url)).replaceAll("\\", "/"))};
          const root = createRoot(document.getElementById("root"));
          window.renderEngagement = (role = "Admin", churchId = "church-a", viewChurchId = churchId, mode = "church") => {
            window.scope = { activeRole: role, activeChurch: { id: churchId }, workspaceMode: mode, scopeVersion: (window.scope?.scopeVersion || 0) + 1 };
            root.render(React.createElement(EngagementDashboard, { churchId: viewChurchId }));
          };
        `;
        if (id === "\0engagement-service") return "export const loadEngagementSummary = churchId => window.engagementCall(churchId);";
        if (id === "\0engagement-context") return "export const useActiveChurch = () => window.scope;";
      },
    }], build: { write: false, minify: false, lib: { entry: "engagement-ui-entry", name: "EngagementUITest", formats: ["iife"] } } });
  const output = (Array.isArray(result) ? result[0] : result).output;
  bundle = output.find(item => item.type === "chunk").code;
  css = ["../../app/globals.css", "../../src/styles/tokens.css", "../../src/styles/primitives.css"].map(path => fs.readFileSync(new URL(path, import.meta.url), "utf8")).join("\n") + output.filter(item => item.type === "asset" && item.fileName.endsWith(".css")).map(item => item.source).join("\n");
  browser = await chromium.launch({ channel: process.env.ENGAGEMENT_TEST_BROWSER || "msedge", headless: true });
});
after(async () => { await browser?.close(); });

async function pageFor() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(8000);
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => route.abort());
  await page.setContent('<main id="root" style="padding:16px"></main>');
  await page.addStyleTag({ content: css });
  await page.evaluate(() => {
    window.calls = [];
    window.summary = { churchId: "church-a", asOf: "2026-09-20T01:00:00Z", memberCount: 27, familyCount: 9, upcomingEventsCount: 3, activeAnnouncementsCount: 2,
      attendanceSummary: { totalRecords: 10, present: 6, late: 1, absent: 2, excused: 1, attended: 7, memberCount: 5, sessionCount: 2, attendanceRate: 70 } };
    window.engagementCall = async churchId => {
      window.calls.push(churchId);
      if (window.defer) return new Promise((resolve, reject) => { window.resolvePending = resolve; window.rejectPending = reject; });
      if (window.fail) throw new Error("Permission denied");
      return { ...window.summary, churchId: window.foreign ? "foreign" : churchId };
    };
  });
  await page.addScriptTag({ content: bundle });
  return { page, errors };
}
const metric = (page, label) => page.getByRole("article", { name: label, exact: true }).locator("strong");
async function ready(page) { await metric(page, "Members").waitFor(); }

test("engagement renders service metrics, attendance details and a responsive read-only view for every role", async () => {
  const { page, errors } = await pageFor();
  try {
    for (const role of ["Admin", "Pastor", "Secretary", "Treasurer", "Encoder", "Viewer"]) {
      await page.evaluate(role => window.renderEngagement(role), role); await ready(page);
      for (const [label, value] of [["Members", "27"], ["Families", "9"], ["Attendance", "70%"], ["Events", "3"], ["Announcements", "2"]]) assert.equal(await metric(page, label).innerText(), value);
      assert.equal(await page.getByRole("button").count(), 1);
      assert.equal(await page.getByRole("region", { name: "Attendance summary", exact: true }).locator("dd").allTextContents().then(values => values.join(",")), "6,1,2,1,5,2");
    }
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    }
    assert.deepEqual(await page.evaluate(() => window.calls), Array(6).fill("church-a"));
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("engagement loading, retry, refresh and empty data never show fabricated totals", async () => {
  const { page, errors } = await pageFor();
  try {
    await page.evaluate(() => { window.defer = true; window.renderEngagement(); });
    await page.getByRole("status", { name: "Loading engagement insights" }).waitFor();
    assert.equal(await page.getByRole("article").count(), 0);
    assert.equal(await page.getByRole("button", { name: "Refresh engagement" }).isDisabled(), true);
    await page.evaluate(() => { window.defer = false; window.rejectPending(new Error("Permission denied")); });
    await page.getByRole("alert").getByText("Permission denied").waitFor();
    assert.equal(await page.getByRole("article").count(), 0);
    await page.getByRole("button", { name: "Try again" }).click(); await ready(page);
    await page.evaluate(() => { window.defer = true; });
    await page.getByRole("button", { name: "Refresh engagement" }).click();
    await page.getByRole("status", { name: "Loading engagement insights" }).waitFor();
    assert.equal(await page.getByRole("article").count(), 0);
    await page.evaluate(() => {
      window.defer = false;
      window.summary.memberCount = window.summary.familyCount = window.summary.upcomingEventsCount = window.summary.activeAnnouncementsCount = 0;
      for (const key of Object.keys(window.summary.attendanceSummary)) window.summary.attendanceSummary[key] = key === "attendanceRate" ? null : 0;
      window.resolvePending(window.summary);
    });
    await page.getByRole("heading", { name: "No engagement activity yet" }).waitFor();
    assert.equal(await metric(page, "Attendance").innerText(), "No records");
    assert.equal(await metric(page, "Members").innerText(), "0");
    await page.evaluate(() => { window.summary.attendanceSummary.totalRecords = 1; window.summary.attendanceSummary.absent = 1; window.summary.attendanceSummary.attendanceRate = 0; });
    await page.getByRole("button", { name: "Refresh engagement" }).click(); await ready(page);
    assert.equal(await metric(page, "Attendance").innerText(), "0%");
    assert.equal(await page.getByRole("heading", { name: "No engagement activity yet" }).count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("engagement guards prevent requests in invalid workspaces and reject foreign results", async () => {
  const { page, errors } = await pageFor();
  try {
    for (const args of [[null, "church-a"], ["Admin", "church-a", "church-b"], ["Admin", "church-a", "church-a", "platform"], ["Admin", "", ""]]) {
      await page.evaluate(args => window.renderEngagement(...args), args);
      await page.getByRole("heading", { name: "Choose a church workspace" }).waitFor();
      assert.equal(await page.evaluate(() => window.calls.length), 0);
    }
    await page.evaluate(() => { window.foreign = true; window.renderEngagement(); });
    await page.getByRole("alert").getByText("Engagement results do not belong to the active church.").waitFor();
    assert.equal(await page.getByRole("article").count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("late results cannot cross church, role or scope changes", async () => {
  const { page, errors } = await pageFor();
  try {
    await page.evaluate(() => { window.defer = true; window.renderEngagement(); });
    await page.getByRole("status", { name: "Loading engagement insights" }).waitFor();
    await page.evaluate(() => { window.oldResolve = window.resolvePending; window.defer = false; window.summary.memberCount = 51; window.renderEngagement("Viewer", "church-b"); });
    await ready(page);
    await page.evaluate(() => { window.oldResolve({ ...window.summary, churchId: "church-a", memberCount: 999 }); });
    assert.equal(await metric(page, "Members").innerText(), "51");
    await page.evaluate(() => { window.defer = true; window.renderEngagement("Admin", "church-b"); });
    await page.getByRole("status", { name: "Loading engagement insights" }).waitFor();
    assert.equal(await page.getByRole("article").count(), 0);
    await page.evaluate(() => { window.oldReject = window.rejectPending; window.defer = false; window.summary.memberCount = 52; window.renderEngagement("Admin", "church-b"); });
    await ready(page);
    await page.evaluate(() => window.oldReject(new Error("Stale error")));
    assert.equal(await metric(page, "Members").innerText(), "52");
    assert.equal(await page.getByRole("alert").count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
