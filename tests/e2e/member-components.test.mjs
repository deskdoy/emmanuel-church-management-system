import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test, { before, after } from "node:test";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "@playwright/test";

// Actual React components + Supabase request builder; all requests stay in this
// fixture. No application login, database connection, or migration execution.
let browser;
let bundle;
before(async () => {
  const result = await build({
    configFile: false, logLevel: "silent", define: { "process.env.NODE_ENV": JSON.stringify("production") },
    plugins: [react(), {
      name: "member-component-fixtures", enforce: "pre",
      resolveId(id) {
        if (id === "member-ui-entry" || id.replaceAll("\\", "/").endsWith("/member-ui-entry")) return "\0member-ui-entry";
        if (id.endsWith("/lib/supabase")) return "\0member-client";
        if (id.endsWith("/services/memberAccessStatus")) return "\0member-access";
        if (id.endsWith("/InviteMemberModal")) return "\0member-invite";
      },
      load(id) {
        if (id === "\0member-ui-entry") return `
          import React from "react";
          import { createRoot } from "react-dom/client";
          import { MembersView } from ${JSON.stringify(fileURLToPath(new URL("../../src/components/MembersView.tsx", import.meta.url)).replaceAll("\\", "/"))};
          createRoot(document.getElementById("root")).render(React.createElement(MembersView, { churchId: "church-a", userId: "user-a" }));
        `;
        if (id === "\0member-client") return `
          import { createClient } from "@supabase/supabase-js";
          export const supabase = createClient("https://member-tests.invalid", "test-anon-key", {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
            global: { fetch: (...args) => window.memberFetch(...args) }
          });
        `;
        if (id === "\0member-access") return 'export const loadMemberAccessStatus = async () => ({ status: "none" });';
        if (id === "\0member-invite") return 'export const InviteMemberModal = () => null;';
      },
    }],
    build: { write: false, minify: false, lib: { entry: "member-ui-entry", name: "MemberUITest", formats: ["iife"] } },
  });
  bundle = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === "chunk").code;
  browser = await chromium.launch({ channel: process.env.MEMBER_TEST_BROWSER || "msedge", headless: true });
});
after(async () => { await browser?.close(); });

async function pageFor() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => route.abort());
  await page.setContent('<main id="root"></main>');
  await page.evaluate(() => {
    window.requests = [];
    window.families = [
      { id: "family-a", church_id: "church-a", name: "Santos family" },
      { id: "family-a2", church_id: "church-a", name: "Reyes family" },
      { id: "family-b", church_id: "church-b", name: "Other church family" },
    ];
    window.rows = [{ id: "other-member", church_id: "church-b", first_name: "Other church", last_name: "Member" }];
    window.memberFetch = async (url, init) => {
      const parsed = new URL(url);
      if (parsed.origin !== "https://member-tests.invalid" || !["/rest/v1/members", "/rest/v1/families"].includes(parsed.pathname)) throw new Error("Unexpected request");
      const payload = init.body ? JSON.parse(init.body) : null;
      window.requests.push({ table: parsed.pathname.split("/").at(-1), method: init.method, query: Object.fromEntries(parsed.searchParams), payload });
      if (parsed.pathname === "/rest/v1/families") {
        if (window.familyReadError) return new Response(JSON.stringify({ message: "Family lookup failed" }), { status: 403 });
        return new Response(JSON.stringify(window.families.filter(row => parsed.searchParams.get("church_id") === `eq.${row.church_id}`)), { status: 200 });
      }
      if (init.method !== "GET" && window.writeError) return new Response(JSON.stringify({ message: window.writeError }), { status: 403 });
      if (init.method === "POST") window.rows.push({ id: "member-a", joined_at: "2026-09-14", ...payload });
      if (init.method === "PATCH") window.rows = window.rows.map(row =>
        parsed.searchParams.get("church_id") === `eq.${row.church_id}` && parsed.searchParams.get("id") === `eq.${row.id}` ? { ...row, ...payload } : row);
      if (init.method !== "GET") return new Response(null, { status: 204 });
      const fields = parsed.searchParams.get("select").split(",");
      const rows = window.rows.filter(row => parsed.searchParams.get("church_id") === `eq.${row.church_id}`)
        .map(row => Object.fromEntries(fields.map(field => [field, row[field] ?? null])));
      return new Response(JSON.stringify(rows), { status: 200 });
    };
  });
  await page.addScriptTag({ content: bundle });
  await page.getByRole("heading", { name: "No members found" }).waitFor();
  return { page, errors };
}
const fields = {
  "Member Number": "M-001", Gender: "Female", "Baptism Date": "2020-02-15",
  "Emergency Contact Name": "Grace Santos", "Emergency Contact Phone": "+63 912 345 6789",
};
async function addMember(page, familyId) {
  await page.getByRole("button", { name: "Add Member", exact: true }).click();
  await page.getByLabel("First Name", { exact: true }).fill("Ana");
  await page.getByLabel("Last Name", { exact: true }).fill("Santos");
  for (const [label, value] of Object.entries(fields)) await page.getByLabel(label, { exact: true }).fill(value);
  if (familyId) await page.getByLabel("Family", { exact: true }).selectOption(familyId);
  await page.getByRole("button", { name: "Save Member", exact: true }).click();
  await page.getByRole("button", { name: "View", exact: true }).click();
}
async function assertDetails(page, values) {
  for (const [label, value] of Object.entries(values)) {
    await page.locator(".detail-grid > div").filter({ has: page.locator("span", { hasText: new RegExp(`^${label}$`) }) })
      .locator("b").filter({ hasText: new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).waitFor();
  }
}

test("member create/edit refreshes every enhanced profile field within the current church", async () => {
  const { page, errors } = await pageFor();
  try {
    await addMember(page);
    await assertDetails(page, fields);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const edited = { "Member Number": "M-002", Gender: "Woman", "Baptism Date": "2021-04-18", "Emergency Contact Name": "Juan Santos", "Emergency Contact Phone": "09170001111" };
    for (const [label, value] of Object.entries(edited)) {
      assert.equal(await page.getByLabel(label, { exact: true }).inputValue(), fields[label]);
      await page.getByLabel(label, { exact: true }).fill(value);
    }
    await page.getByRole("button", { name: "Save Member", exact: true }).click();
    await assertDetails(page, edited);
    const requests = await page.evaluate(() => window.requests);
    for (const request of requests) {
      if (request.method === "POST") assert.equal(request.payload.church_id, "church-a");
      else assert.equal(request.query.church_id, "eq.church-a");
      if (request.method === "GET" && request.table === "members") for (const name of ["family_id", "member_number", "gender", "baptism_date", "emergency_contact_name", "emergency_contact_phone"]) assert.ok(request.query.select.split(",").includes(name));
    }
    assert.equal(requests.find(request => request.method === "PATCH").query.id, "eq.member-a");
    assert.equal(await page.getByText("Other church Member", { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("member edit supports cancellation, failed-save retry, and clearing optional details", async () => {
  const { page, errors } = await pageFor();
  try {
    await addMember(page);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Member Number", { exact: true }).fill("Cancelled change");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await assertDetails(page, fields);
    assert.equal(await page.evaluate(() => window.requests.filter(request => request.method === "PATCH").length), 0);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    for (const label of Object.keys(fields)) await page.getByLabel(label, { exact: true }).fill("");
    await page.evaluate(() => { window.writeError = "Permission denied"; });
    await page.getByRole("button", { name: "Save Member", exact: true }).click();
    await page.getByText("Permission denied", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Member Number", { exact: true }).inputValue(), "");
    assert.equal(await page.evaluate(() => window.rows.find(row => row.id === "member-a").member_number), "M-001");
    await page.evaluate(() => { window.writeError = null; });
    await page.getByRole("button", { name: "Save Member", exact: true }).click();
    await assertDetails(page, Object.fromEntries(Object.keys(fields).map(label => [label, "-"])));
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});


test("member family selection saves, prefills, displays, changes, and unlinks within the church", async () => {
  const { page, errors } = await pageFor();
  try {
    await addMember(page, "family-a");
    await assertDetails(page, { Family: "Santos family", ...fields });
    for (const [id, name] of [["family-a2", "Reyes family"], ["", "No family"]]) {
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await page.getByRole("option", { name: "Santos family", exact: true }).waitFor({ state: "attached" });
      assert.equal(await page.getByLabel("Family", { exact: true }).inputValue(), id ? "family-a" : "family-a2");
      assert.equal(await page.getByRole("option", { name: "Other church family", exact: true }).count(), 0);
      await page.getByLabel("Family", { exact: true }).selectOption(id);
      await page.getByRole("button", { name: "Save Member", exact: true }).click();
      await assertDetails(page, { Family: name, ...fields });
    }
    const requests = await page.evaluate(() => window.requests);
    for (const request of requests.filter(request => request.method === "GET" || request.method === "PATCH")) assert.equal(request.query.church_id, "eq.church-a");
    const writes = requests.filter(request => request.method === "POST" || request.method === "PATCH");
    assert.deepEqual(writes.map(request => request.payload.family_id), ["family-a", "family-a2", null]);
    assert.equal(writes.length, 3, "Member and family changes must save atomically");
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("failed family loading preserves assignment during member edits and supports retry", async () => {
  const { page, errors } = await pageFor();
  try {
    await addMember(page, "family-a");
    await assertDetails(page, { Family: "Santos family" });
    await page.evaluate(() => { window.familyReadError = true; });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("button", { name: "Retry families", exact: true }).waitFor();
    assert.equal(await page.getByLabel("Family", { exact: true }).isDisabled(), true);
    await page.getByLabel("Notes", { exact: true }).fill("Saved with family lookup unavailable");
    await page.getByRole("button", { name: "Save Member", exact: true }).click();
    await page.getByRole("button", { name: "Retry family", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.rows.find(row => row.id === "member-a").family_id), "family-a");
    await page.evaluate(() => { window.familyReadError = false; });
    await page.getByRole("button", { name: "Retry family", exact: true }).click();
    await assertDetails(page, { Family: "Santos family", Notes: "Saved with family lookup unavailable" });
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
