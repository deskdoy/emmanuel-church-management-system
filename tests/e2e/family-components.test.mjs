import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test, { before, after } from "node:test";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "@playwright/test";

let browser, bundle, css;
before(async () => {
  const result = await build({
    configFile: false, logLevel: "silent", define: { "process.env.NODE_ENV": JSON.stringify("production") },
    plugins: [react(), {
      name: "family-fixtures", enforce: "pre",
      resolveId(id) {
        if (id === "family-ui-entry" || id.replaceAll("\\", "/").endsWith("/family-ui-entry")) return "\0family-ui-entry";
        if (id.endsWith("/services/families")) return "\0families";
        if (id.endsWith("/tenancy/ActiveChurchContext")) return "\0family-context";
        if (id.endsWith("/lib/supabase")) return "\0family-candidates";
      },
      load(id) {
        if (id === "\0family-ui-entry") return `
          import React from "react";
          import { createRoot } from "react-dom/client";
          import { FamilyView } from ${JSON.stringify(fileURLToPath(new URL("../../src/components/families/FamilyView.tsx", import.meta.url)).replaceAll("\\", "/"))};
          const root = createRoot(document.getElementById("root"));
          window.renderFamilies = (role = "Admin", churchId = "church-a", viewChurchId = churchId, mode = "church") => {
            window.scope = { activeRole: role, activeChurch: { id: churchId }, workspaceMode: mode, scopeVersion: (window.scope?.scopeVersion || 0) + 1 };
            root.render(React.createElement(FamilyView, { churchId: viewChurchId }));
          };
        `;
        if (id === "\0families") return ["loadFamilies", "createFamily", "updateFamily", "deleteFamily", "loadFamilyMembers", "assignMemberFamily"].map(name => `export const ${name} = (...args) => window.familyCall("${name}", args);`).join("\n");
        if (id === "\0family-context") return "export const useActiveChurch = () => window.scope;";
        if (id === "\0family-candidates") return `export const getSupabase = () => ({ from: table => {
          const query = { table };
          const chain = { select: columns => { query.columns = columns; return chain; }, eq: (key, value) => { query[key] = value; return chain; },
            is: (key, value) => { query[key] = value; return chain; }, order: () => chain,
            then: (resolve, reject) => window.familyCall("candidates", [query]).then(resolve, reject) };
          return chain;
        } });`;
      },
    }], build: { write: false, minify: false, lib: { entry: "family-ui-entry", name: "FamilyUITest", formats: ["iife"] } },
  });
  const output = (Array.isArray(result) ? result[0] : result).output;
  bundle = output.find(item => item.type === "chunk").code;
  css = ["../../app/globals.css", "../../src/styles/tokens.css", "../../src/styles/primitives.css"].map(path => fs.readFileSync(new URL(path, import.meta.url), "utf8")).join("\n") + output.filter(item => item.type === "asset" && item.fileName.endsWith(".css")).map(item => item.source).join("\n");
  browser = await chromium.launch({ channel: process.env.FAMILY_TEST_BROWSER || "msedge", headless: true });
});
after(async () => { await browser?.close(); });

async function pageFor(role = "Admin") {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => route.abort());
  await page.setContent('<main id="root" style="padding:16px"></main>');
  await page.addStyleTag({ content: css });
  await page.evaluate(() => {
    window.calls = []; window.families = [];
    window.members = [
      { id: "member-a", churchId: "church-a", familyId: null, firstName: "Ana", middleName: "", lastName: "Santos", memberNumber: "M-001", phone: "09170001111", membershipStatus: "Active" },
      { id: "member-b", churchId: "church-b", familyId: null, firstName: "Other", middleName: "", lastName: "Church", memberNumber: "M-002" },
    ];
    window.familyCall = async (name, args) => {
      window.calls.push({ name, args });
      if (window.fail === name) throw new Error("Test permission failure");
      if (name === "loadFamilies") {
        if (window.deferLoad) return new Promise(resolve => { window.resolveLoad = resolve; });
        return window.families.filter(row => row.churchId === args[0]);
      }
      if (name === "loadFamilyMembers") {
        if (window.deferMembers) return new Promise(resolve => { window.resolveMembers = resolve; });
        return window.members.filter(row => row.churchId === args[0] && row.familyId === args[1]);
      }
      if (name === "candidates") return { error: null, data: window.members.filter(row => row.churchId === args[0].church_id && row.familyId === args[0].family_id).map(row => ({ id: row.id, first_name: row.firstName, middle_name: row.middleName, last_name: row.lastName, member_number: row.memberNumber })) };
      if (name === "createFamily") {
        const row = { id: "family-a", churchId: args[0], ...args[1], createdBy: "user-a", createdAt: "2026-09-15T01:00:00Z", updatedAt: "2026-09-15T01:00:00Z" };
        window.families.push(row); return row;
      }
      if (name === "updateFamily") { const row = { ...window.families.find(row => row.id === args[1]), ...args[2] }; window.families = [row]; return row; }
      if (name === "deleteFamily") { window.families = window.families.filter(row => row.id !== args[1]); return; }
      if (name === "assignMemberFamily") { const row = window.members.find(row => row.id === args[1] && row.churchId === args[0]); row.familyId = args[2]; return row; }
    };
  });
  await page.addScriptTag({ content: bundle });
  page.on("dialog", dialog => dialog.accept());
  await page.evaluate(role => window.renderFamilies(role), role);
  await page.getByRole("heading", { name: "No families yet" }).waitFor();
  return { page, errors };
}
async function createFamily(page) {
  await page.getByRole("button", { name: "New family", exact: true }).click();
  await page.getByLabel("Family name", { exact: true }).fill("Santos family");
  await page.getByLabel("Notes", { exact: true }).fill("Household notes");
  await page.getByRole("button", { name: "Create family", exact: true }).click();
  await page.getByRole("heading", { name: "No family members yet" }).waitFor();
}

test("family UI creates, edits, assigns, unlinks, and deletes within the current church", async () => {
  const { page, errors } = await pageFor();
  try {
    await createFamily(page);
    await page.getByRole("button", { name: "Edit family", exact: true }).click();
    assert.equal(await page.getByLabel("Family name", { exact: true }).inputValue(), "Santos family");
    await page.getByLabel("Family name", { exact: true }).fill("Updated family");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByRole("heading", { name: "Updated family", exact: true }).waitFor();
    assert.equal(await page.getByRole("option", { name: /Other Church/ }).count(), 0);
    await page.getByLabel("Unassigned member").selectOption("member-a");
    await page.getByRole("button", { name: "Add to family", exact: true }).click();
    await page.locator("tbody").getByText("Ana Santos", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Delete family", exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.getByRole("button", { name: "Remove from family", exact: true }).click();
    await page.getByRole("heading", { name: "No family members yet" }).waitFor();
    await page.getByRole("button", { name: "Delete family", exact: true }).click();
    await page.getByRole("heading", { name: "No families yet" }).waitFor();
    const calls = await page.evaluate(() => window.calls);
    for (const call of calls) {
      if (call.name === "candidates") { assert.equal(call.args[0].church_id, "church-a"); assert.equal(call.args[0].family_id, null); assert.equal(call.args[0].table, "members"); }
      else assert.equal(call.args[0], "church-a");
    }
    assert.deepEqual(calls.filter(call => call.name === "assignMemberFamily").map(call => call.args), [["church-a", "member-a", "family-a"], ["church-a", "member-a", null]]);
    assert.equal(await page.evaluate(() => window.members.length), 2, "Unlinking and deleting families must retain member records");
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("family management and deletion respect roles; mismatched workspaces make no requests", async () => {
  const { page, errors } = await pageFor("Secretary");
  try {
    await createFamily(page);
    assert.equal(await page.getByRole("button", { name: "Delete family", exact: true }).count(), 0);
    for (const role of ["Treasurer", "Encoder", "Viewer"]) {
      await page.evaluate(role => window.renderFamilies(role), role);
      await page.getByRole("button", { name: "View family", exact: true }).click();
      await page.getByRole("heading", { name: "No family members yet" }).waitFor();
      assert.equal(await page.getByRole("button", { name: /Edit family|Delete family|Add to family|Remove from family/ }).count(), 0);
      assert.equal(await page.getByLabel("Unassigned member").count(), 0);
    }
    await page.evaluate(() => window.renderFamilies("Pastor"));
    await page.getByRole("button", { name: "View family", exact: true }).click();
    await page.getByRole("heading", { name: "No family members yet" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Edit family", exact: true }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "Delete family", exact: true }).isEnabled(), true);
    for (const args of [["Admin", "church-a", "church-b"], [null, "church-a", "church-a"], ["Admin", "church-a", "church-a", "platform"]]) {
      const count = await page.evaluate(() => window.calls.length);
      await page.evaluate(args => window.renderFamilies(...args), args);
      await page.getByRole("heading", { name: "Choose a church workspace" }).waitFor();
      assert.equal(await page.evaluate(() => window.calls.length), count);
    }
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("family errors retain forms and support retry; pending results cannot cross church boundaries", async () => {
  const { page, errors } = await pageFor();
  try {
    await page.getByRole("button", { name: "New family", exact: true }).click();
    await page.getByLabel("Family name", { exact: true }).fill("Retained family");
    await page.evaluate(() => { window.fail = "createFamily"; });
    await page.getByRole("button", { name: "Create family", exact: true }).click();
    await page.getByRole("alert").getByText("Test permission failure").waitFor();
    assert.equal(await page.getByLabel("Family name", { exact: true }).inputValue(), "Retained family");
    await page.evaluate(() => { window.fail = "loadFamilyMembers"; });
    await page.getByRole("button", { name: "Create family", exact: true }).click();
    await page.getByRole("button", { name: "Try again", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Delete family", exact: true }).isDisabled(), true);
    await page.evaluate(() => { window.fail = null; });
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.getByLabel("Unassigned member").selectOption("member-a");
    await page.evaluate(() => { window.fail = "assignMemberFamily"; });
    await page.getByRole("button", { name: "Add to family", exact: true }).click();
    await page.getByRole("alert").getByText("Test permission failure").waitFor();
    assert.equal(await page.getByLabel("Unassigned member").inputValue(), "member-a");
    await page.evaluate(() => { window.fail = null; window.deferLoad = true; window.renderFamilies("Admin"); });
    await page.getByRole("status", { name: "Loading families" }).waitFor();
    await page.evaluate(() => { window.staleResolve = window.resolveLoad; window.deferLoad = false; window.renderFamilies("Admin", "church-b"); });
    await page.getByRole("heading", { name: "No families yet" }).waitFor();
    await page.evaluate(() => window.staleResolve(window.families));
    await page.waitForTimeout(50);
    assert.equal(await page.getByText("Retained family", { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
