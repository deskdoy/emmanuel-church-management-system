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
    plugins: [react(), { name: "announcement-fixtures", enforce: "pre",
      resolveId(id) {
        if (id === "announcement-ui-entry" || id.replaceAll("\\", "/").endsWith("/announcement-ui-entry")) return "\0announcement-ui-entry";
        if (id.endsWith("/services/announcementTargets")) return "\0announcement-target-service";
        if (id.endsWith("/services/announcements")) return "\0announcement-service";
        if (id.endsWith("/tenancy/ActiveChurchContext")) return "\0announcement-context";
        if (id.endsWith("/lib/supabase")) return "\0announcement-directory";
      },
      load(id) {
        if (id === "\0announcement-ui-entry") return `
          import React from "react"; import { createRoot } from "react-dom/client";
          import { AnnouncementView } from ${JSON.stringify(fileURLToPath(new URL("../../src/components/announcements/AnnouncementView.tsx", import.meta.url)).replaceAll("\\", "/"))};
          const root = createRoot(document.getElementById("root"));
          window.renderAnnouncements = (role = "Admin", churchId = "church-a", viewChurchId = churchId, mode = "church") => {
            window.scope = { activeRole: role, activeChurch: { id: churchId }, workspaceMode: mode, scopeVersion: (window.scope?.scopeVersion || 0) + 1 };
            root.render(React.createElement(AnnouncementView, { churchId: viewChurchId }));
          };
        `;
        if (id === "\0announcement-service") return ["loadAnnouncements", "getActiveAnnouncements", "createAnnouncement", "updateAnnouncement", "deleteAnnouncement", "publishAnnouncement"].map(name => `export const ${name} = (...args) => window.announcementCall("${name}", args);`).join("\n");
        if (id === "\0announcement-target-service") return ["loadAnnouncementTargets", "addAnnouncementTarget", "removeAnnouncementTarget", "getTargetRecipients"].map(name => `export const ${name} = (...args) => window.announcementCall("${name}", args);`).join("\n");
        if (id === "\0announcement-context") return "export const useActiveChurch = () => window.scope;";
        if (id === "\0announcement-directory") return `export const getSupabase = () => ({ from: table => {
          const query = { table }; const chain = { select: columns => { query.columns = columns; return chain; }, eq: (key, value) => { query[key] = value; return chain; }, order: () => chain, range: (from, to) => { query.from = from; query.to = to; return chain; },
            then: (resolve, reject) => window.announcementCall("directory", [query]).then(resolve, reject) }; return chain;
        } });`;
      },
    }], build: { write: false, minify: false, lib: { entry: "announcement-ui-entry", name: "AnnouncementUITest", formats: ["iife"] } } });
  const output = (Array.isArray(result) ? result[0] : result).output;
  bundle = output.find(item => item.type === "chunk").code;
  css = ["../../app/globals.css", "../../src/styles/tokens.css", "../../src/styles/primitives.css"].map(path => fs.readFileSync(new URL(path, import.meta.url), "utf8")).join("\n") + output.filter(item => item.type === "asset" && item.fileName.endsWith(".css")).map(item => item.source).join("\n");
  browser = await chromium.launch({ channel: process.env.ANNOUNCEMENT_TEST_BROWSER || "msedge", headless: true });
});
after(async () => { await browser?.close(); });


async function pageFor(role = "Admin") {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Shanghai" });
  page.setDefaultTimeout(8000);
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => route.abort());
  await page.setContent('<main id="root" style="padding:16px"></main>'); await page.addStyleTag({ content: css });
  await page.evaluate(() => {
    window.calls = []; window.directoryCalls = []; window.targets = []; window.targetSequence = 0;
    window.directories = {
      members: [{ id: "member-a", church_id: "church-a", first_name: "Maria", last_name: "Santos", middle_name: "" }, { id: "member-b", church_id: "church-a", first_name: "John", last_name: "Santos", middle_name: "" }, { id: "foreign", church_id: "church-b", first_name: "Other", last_name: "Member" }],
      families: [{ id: "family-a", church_id: "church-a", name: "Santos family" }],
      events: [{ id: "event-a", church_id: "church-a", title: "Sunday worship", starts_at: "2030-09-20T01:00:00Z" }],
      roles: [{ id: "role-a", name: "Pastor" }],
    };
    const base = { churchId: "church-a", content: "Church community update", publishAt: "2030-09-20T01:00:00Z", expiresAt: null, isPublished: false, createdBy: "user-a", createdAt: "2026-09-15T00:00:00Z", updatedAt: "2026-09-15T00:00:00Z" };
    window.announcements = [
      { ...base, id: "draft", title: "Draft notice" },
      { ...base, id: "active", title: "Active notice", isPublished: true, publishAt: "2020-01-01T00:00:00Z" },
      { ...base, id: "expired", title: "Expired notice", isPublished: true, publishAt: "2020-01-01T00:00:00Z", expiresAt: "2021-01-01T00:00:00Z" },
      { ...base, id: "foreign", churchId: "church-b", title: "Other church notice" },
    ];
    window.announcementCall = async (name, args) => {
      if (name === "directory") window.directoryCalls.push(args[0]); else window.calls.push({ name, args });
      if (window.fail === name) throw new Error("Test permission failure");
      if (window.defer === name) return new Promise(resolve => { window.resolvePending = resolve; });
      if (name === "directory") {
        const q = args[0];
        const rows = window.directories[q.table].filter(row => !q.church_id || row.church_id === q.church_id);
        return { data: rows.slice(q.from, q.to + 1), count: rows.length, error: null };
      }
      if (name === "loadAnnouncementTargets") return window.targets.filter(row => row.churchId === args[0] && row.announcementId === args[1]);
      if (name === "addAnnouncementTarget") {
        if (window.failTargetId === args[2].targetId) throw new Error("Target save failed");
        const row = { id: `target-${++window.targetSequence}`, churchId: args[0], announcementId: args[1], ...args[2], targetId: args[2].targetId ?? null };
        if (window.targets.some(old => old.churchId === row.churchId && old.announcementId === row.announcementId && old.targetType === row.targetType && old.targetId === row.targetId)) throw new Error("Duplicate target");
        window.targets.push(row); return row;
      }
      if (name === "removeAnnouncementTarget") { window.targets = window.targets.filter(row => row.churchId !== args[0] || row.id !== args[1]); return; }
      if (name === "getTargetRecipients") {
        const kind = args[1].targetType === "Role" ? "user" : "member";
        return args[1].targetId === "missing" ? [] : [{ kind, id: kind === "user" ? "user-a" : "member-a", churchId: args[0], displayName: kind === "user" ? "Pastor account" : "Maria Santos" }, { kind, id: "foreign", churchId: "foreign", displayName: "Foreign preview" }];
      }
      if (name === "loadAnnouncements") return window.announcements;
      if (name === "getActiveAnnouncements") return window.announcements.filter(row => row.isPublished && Date.parse(row.publishAt) <= Date.now() && (!row.expiresAt || Date.parse(row.expiresAt) > Date.now()));
      if (name === "createAnnouncement") { const row = { ...base, id: "new", churchId: args[0], ...args[1], isPublished: false }; window.announcements.push(row); return row; }
      if (name === "updateAnnouncement" || name === "publishAnnouncement") {
        const row = { ...window.announcements.find(row => row.churchId === args[0] && row.id === args[1]), ...(name === "publishAnnouncement" ? { isPublished: true } : args[2]) };
        window.announcements = window.announcements.map(old => old.id === row.id ? row : old); return row;
      }
      if (name === "deleteAnnouncement") { window.announcements = window.announcements.filter(row => row.churchId !== args[0] || row.id !== args[1]); return; }
      throw new Error(`Unexpected service operation ${name}`);
    };
  });
  await page.addScriptTag({ content: bundle }); await page.evaluate(role => window.renderAnnouncements(role), role);
  await page.getByRole("heading", { name: "Draft notice", exact: true }).waitFor();
  return { page, errors };
}
async function openProfile(page, title = "Draft notice") {
  await page.locator(".project-card").filter({ has: page.getByRole("heading", { name: title, exact: true }) }).getByRole("button", { name: "View announcement", exact: true }).click();
  await page.getByRole("region", { name: "Announcement profile", exact: true }).waitFor();
}
async function fillDraft(page) {
  await page.getByRole("button", { name: "New announcement", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Picnic notice");
  await page.getByLabel("Content", { exact: true }).fill("Bring lunch to the garden");
  await page.getByLabel("Publish at", { exact: true }).fill("2030-09-20T09:00");
  await page.getByLabel("Expires at", { exact: true }).fill("2030-09-21T09:00");
}

test("announcement create/edit/publish/delete keeps schedule and handles validation and service failures", async () => {
  const { page, errors } = await pageFor("Secretary");
  try {
    await fillDraft(page);
    await page.getByLabel("Expires at", { exact: true }).fill("2030-09-19T09:00");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.getByRole("alert").getByText("Expiry time must be on or after publish time.").waitFor();
    assert.equal(await page.evaluate(() => window.calls.filter(call => call.name === "createAnnouncement").length), 0);
    await page.getByLabel("Expires at", { exact: true }).fill("2030-09-21T09:00");
    await page.evaluate(() => { window.fail = "createAnnouncement"; });
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.getByRole("alert").getByText("Test permission failure").waitFor();
    assert.equal(await page.getByLabel("Content", { exact: true }).inputValue(), "Bring lunch to the garden");
    await page.evaluate(() => { window.fail = null; });
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.getByRole("heading", { name: "Picnic notice", exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.calls.find(call => call.name === "createAnnouncement").args), ["church-a", { title: "Picnic notice", content: "Bring lunch to the garden", publishAt: "2030-09-20T01:00:00.000Z", expiresAt: "2030-09-21T01:00:00.000Z" }]);
    await page.getByText("Draft", { exact: true }).waitFor();
    await page.evaluate(() => { window.fail = "publishAnnouncement"; });
    await page.getByRole("button", { name: "Publish announcement", exact: true }).click();
    await page.getByRole("alert").getByText("Test permission failure").waitFor();
    await page.evaluate(() => { window.fail = null; });
    await page.getByRole("button", { name: "Publish announcement", exact: true }).click();
    await page.getByText("Published", { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.calls.find(call => call.name === "publishAnnouncement").args), ["church-a", "new"]);
    assert.equal(await page.evaluate(() => window.announcements.find(row => row.id === "new").publishAt), "2030-09-20T01:00:00.000Z");
    await page.getByRole("button", { name: "Edit announcement", exact: true }).click();
    assert.ok((await page.getByLabel("Publish at", { exact: true }).inputValue()).startsWith("2030-09-20T09:00"));
    await page.getByLabel("Expires at", { exact: true }).fill("");
    await page.getByLabel("Content", { exact: true }).fill("<img src=x onerror=alert(1)>");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByText("Announcement updated.", { exact: true }).waitFor();
    await page.getByText("No expiration", { exact: true }).waitFor();
    assert.equal(await page.locator("img").count(), 0);
    const edit = await page.evaluate(() => window.calls.find(call => call.name === "updateAnnouncement"));
    assert.deepEqual(edit.args.slice(0, 2), ["church-a", "new"]);
    assert.equal(edit.args[2].expiresAt, null); assert.equal("isPublished" in edit.args[2], false);
    await page.getByText("Published", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    page.once("dialog", dialog => dialog.dismiss());
    await page.getByRole("button", { name: "Delete announcement", exact: true }).click();
    assert.equal(await page.evaluate(() => window.calls.filter(call => call.name === "deleteAnnouncement").length), 0);
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Delete announcement", exact: true }).click();
    await page.getByText("Announcement deleted.", { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.calls.find(call => call.name === "deleteAnnouncement").args), ["church-a", "new"]);
    assert.ok(await page.evaluate(() => window.calls.every(call => call.args[0] === "church-a")));
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("announcement role gates and workspace guards preserve read access without unauthorized writes", async () => {
  const { page, errors } = await pageFor();
  try {
    for (const role of ["Admin", "Pastor", "Secretary", "Treasurer", "Encoder", "Viewer"]) {
      await page.evaluate(role => window.renderAnnouncements(role), role);
      await page.getByRole("heading", { name: "Draft notice", exact: true }).waitFor();
      const manages = ["Admin", "Pastor", "Secretary"].includes(role);
      assert.equal(await page.getByRole("button", { name: "New announcement", exact: true }).count(), manages ? 1 : 0);
      assert.equal(await page.getByText("Other church notice", { exact: true }).count(), 0);
      await openProfile(page);
      for (const name of ["Edit announcement", "Publish announcement", "Delete announcement"]) assert.equal(await page.getByRole("button", { name, exact: true }).count(), manages ? 1 : 0);
    }
    for (const args of [[null, "church-a"], ["Admin", "church-a", "church-b"], ["Admin", "church-a", "church-a", "platform"]]) {
      const count = await page.evaluate(() => window.calls.length);
      await page.evaluate(args => window.renderAnnouncements(...args), args);
      await page.getByRole("heading", { name: "Choose a church workspace" }).waitFor();
      assert.equal(await page.evaluate(() => window.calls.length), count);
    }
    assert.ok(await page.evaluate(() => window.calls.every(call => call.name === "loadAnnouncements")));
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("active announcements use existing service and list failures retry with empty states", async () => {
  const { page, errors } = await pageFor("Viewer");
  try {
    await page.getByRole("button", { name: "Active announcements", exact: true }).click();
    await page.getByRole("heading", { name: "Active notice", exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Draft notice", exact: true }).count(), 0);
    assert.equal(await page.getByRole("heading", { name: "Expired notice", exact: true }).count(), 0);
    assert.deepEqual(await page.evaluate(() => window.calls.find(call => call.name === "getActiveAnnouncements").args), ["church-a"]);
    await page.evaluate(() => { window.fail = "getActiveAnnouncements"; });
    await page.getByRole("button", { name: "Refresh announcements", exact: true }).click();
    await page.getByRole("alert").getByText("Test permission failure").waitFor();
    await page.evaluate(() => { window.fail = null; window.announcements = []; });
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.getByRole("heading", { name: "No active announcements", exact: true }).waitFor();
    await page.getByRole("button", { name: "All announcements", exact: true }).click();
    await page.getByRole("heading", { name: "No announcements yet", exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("stale announcement reads and creates cannot repopulate another filter or church", async () => {
  const { page, errors } = await pageFor();
  try {
    await page.evaluate(() => { window.defer = "getActiveAnnouncements"; });
    await page.getByRole("button", { name: "Active announcements", exact: true }).click();
    await page.getByRole("status", { name: "Loading announcements", exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Draft notice", exact: true }).count(), 0);
    await page.waitForFunction(() => !!window.resolvePending);
    await page.evaluate(() => { window.oldRead = window.resolvePending; window.defer = null; });
    await page.getByRole("button", { name: "All announcements", exact: true }).click();
    await page.getByRole("heading", { name: "Draft notice", exact: true }).waitFor();
    await page.evaluate(() => window.oldRead([]));
    await page.getByRole("heading", { name: "Draft notice", exact: true }).waitFor();
    await fillDraft(page);
    await page.evaluate(() => { window.defer = "createAnnouncement"; window.resolvePending = null; });
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.getByRole("button", { name: "Saving...", exact: true }).waitFor();
    await page.waitForFunction(() => !!window.resolvePending);
    await page.evaluate(() => window.renderAnnouncements("Viewer", "church-b"));
    await page.getByRole("heading", { name: "Other church notice", exact: true }).waitFor();
    await page.evaluate(() => window.resolvePending({ ...window.announcements[0], id: "stale", title: "Stale draft" }));
    assert.equal(await page.getByText("Stale draft", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("region", { name: "Announcement profile", exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});


async function addAudience(page, type, id) {
  await page.getByLabel("Audience", { exact: true }).selectOption(type);
  if (type !== "All") await page.getByLabel("Target", { exact: true }).selectOption(id);
  await page.getByRole("button", { name: "Add target", exact: true }).click();
}

test("audience targets stage on a draft, preview deduplicates, and save persists every supported type", async () => {
  const { page, errors } = await pageFor("Secretary");
  try {
    await fillDraft(page);
    await addAudience(page, "All");
    assert.equal(await page.getByRole("button", { name: "Add target", exact: true }).isDisabled(), true);
    await addAudience(page, "Member", "member-a");
    assert.equal(await page.getByLabel("Target", { exact: true }).locator('option[value="foreign"]').count(), 0);
    await addAudience(page, "Family", "family-a");
    await addAudience(page, "Event", "event-a");
    await addAudience(page, "Role", "role-a");
    assert.equal(await page.evaluate(() => window.calls.filter(c => c.name === "addAnnouncementTarget").length), 0);
    await page.getByRole("button", { name: "Preview recipients" }).click();
    await page.getByRole("heading", { name: "2 visible recipients" }).waitFor();
    assert.equal(await page.getByText("Foreign preview").count(), 0);
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.getByRole("region", { name: "Announcement profile", exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.targets.map(t => t.targetType)), ["All", "Member", "Family", "Event", "Role"]);
    assert.ok(await page.evaluate(() => window.targets.every(t => t.churchId === "church-a" && t.announcementId === "new")));
    assert.ok(await page.evaluate(() => window.directoryCalls.every(q => q.table === "roles" || q.church_id === "church-a")));
    await page.getByRole("button", { name: "Edit announcement", exact: true }).click();
    await page.getByRole("button", { name: "Remove Member: Maria Santos (2)", exact: true }).waitFor();
    await page.getByRole("button", { name: "Remove Member: Maria Santos (2)", exact: true }).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await page.evaluate(() => window.targets.length), 5, "Cancel must discard staged removal");
    await page.getByRole("button", { name: "Edit announcement", exact: true }).click();
    await page.getByRole("button", { name: "Remove Member: Maria Santos (2)", exact: true }).click();
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByText("Announcement updated.", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.targets.some(t => t.targetType === "Member")), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("partial audience save retries the existing draft without duplicate drafts or targets", async () => {
  const { page, errors } = await pageFor("Pastor");
  try {
    await fillDraft(page); await addAudience(page, "Member", "member-a"); await addAudience(page, "Family", "family-a");
    await page.evaluate(() => { window.failTargetId = "family-a"; });
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.getByRole("alert").getByText(/Draft saved, but audience changes are incomplete/).waitFor();
    assert.equal(await page.evaluate(() => window.calls.filter(c => c.name === "createAnnouncement").length), 1);
    assert.equal(await page.evaluate(() => window.targets.length), 1);
    await page.getByLabel("Content", { exact: true }).fill("Updated during retry");
    await page.evaluate(() => { window.failTargetId = null; });
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.getByRole("region", { name: "Announcement profile", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.calls.filter(c => c.name === "createAnnouncement").length), 1);
    assert.equal(await page.evaluate(() => window.targets.length), 2);
    assert.equal(await page.evaluate(() => window.announcements.find(a => a.id === "new").content), "Updated during retry");
    assert.equal(await page.evaluate(() => window.calls.filter(c => c.name === "addAnnouncementTarget" && c.args[2].targetId === "member-a").length), 1);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("audience loading and preview failures retry and leave content-only save available", async () => {
  const { page, errors } = await pageFor();
  try {
    await openProfile(page);
    await page.evaluate(() => { window.fail = "loadAnnouncementTargets"; });
    await page.getByRole("button", { name: "Edit announcement", exact: true }).click();
    await page.getByRole("button", { name: "Retry audience" }).waitFor();
    await page.getByLabel("Content", { exact: true }).fill("Content survives missing targeting table");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByText("Announcement updated.", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.calls.filter(c => ["addAnnouncementTarget", "removeAnnouncementTarget"].includes(c.name)).length), 0);
    await page.getByRole("button", { name: "Edit announcement", exact: true }).click();
    await page.getByRole("button", { name: "Retry audience" }).waitFor();
    await page.evaluate(() => { window.fail = null; });
    await page.getByRole("button", { name: "Retry audience" }).click();
    await page.getByRole("button", { name: "Preview recipients" }).click();
    await page.getByRole("heading", { name: "No visible recipients" }).waitFor();
    await addAudience(page, "Member", "member-a");
    await page.evaluate(() => { window.fail = "getTargetRecipients"; });
    await page.getByRole("button", { name: "Preview recipients" }).click();
    await page.getByRole("alert").getByText("Test permission failure", { exact: true }).waitFor();
    await page.evaluate(() => { window.fail = null; });
    await page.getByRole("button", { name: "Preview recipients" }).click();
    await page.getByRole("heading", { name: "1 visible recipient" }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("stale previews and pending target saves cannot repopulate or continue after workspace changes", async () => {
  const { page, errors } = await pageFor();
  try {
    await fillDraft(page); await addAudience(page, "Member", "member-a");
    await page.evaluate(() => { window.defer = "getTargetRecipients"; window.resolvePending = null; });
    await page.getByRole("button", { name: "Preview recipients" }).click();
    await page.waitForFunction(() => !!window.resolvePending);
    await page.getByRole("button", { name: "Remove Member: Maria Santos (1)", exact: true }).click();
    await page.evaluate(() => { window.defer = null; window.resolvePending([{ kind: "member", id: "stale", churchId: "church-a", displayName: "Stale recipient" }]); });
    assert.equal(await page.getByText("Stale recipient").count(), 0);
    await addAudience(page, "Member", "member-a"); await addAudience(page, "Family", "family-a");
    await page.evaluate(() => { window.defer = "addAnnouncementTarget"; window.resolvePending = null; });
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.waitForFunction(() => !!window.resolvePending);
    await page.evaluate(() => window.renderAnnouncements("Viewer", "church-b"));
    await page.getByRole("heading", { name: "Other church notice", exact: true }).waitFor();
    await page.evaluate(() => { window.defer = null; window.resolvePending({ id: "old-target" }); });
    assert.equal(await page.evaluate(() => window.calls.filter(c => c.name === "addAnnouncementTarget").length), 1);
    assert.equal(await page.getByRole("region", { name: "Announcement audience", exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
