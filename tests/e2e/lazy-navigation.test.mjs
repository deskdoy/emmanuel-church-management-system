import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test, { before, after } from "node:test";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "@playwright/test";

let browser, assets, featureFiles, css;
before(async () => {
  const result = await build({ configFile: false, logLevel: "silent", define: { "process.env.NODE_ENV": JSON.stringify("production") },
    plugins: [react(), { name: "lazy-navigation-fixtures", enforce: "pre",
      resolveId(id) {
        if (id === "lazy-navigation-entry" || id.replaceAll("\\", "/").endsWith("/lazy-navigation-entry")) return "\0lazy-navigation-entry";
        const feature = /\/components\/(?:[^/]+\/)?([A-Z][A-Za-z]+(?:View|Dashboard))$/.exec(id);
        if (feature) return `\0feature:${feature[1]}`;
        if (id.endsWith("/auth/AuthContext")) return "\0fixture-auth";
        if (id.endsWith("/tenancy/ActiveChurchContext")) return "\0fixture-church";
        if (id.endsWith("/services/cashflow")) return "\0fixture-cashflow";
      },
      load(id) {
        if (id === "\0lazy-navigation-entry") return `
          import React from "react"; import { createRoot } from "react-dom/client";
          import Home from ${JSON.stringify(fileURLToPath(new URL("../../app/page.tsx", import.meta.url)).replaceAll("\\", "/"))};
          window.evaluated ||= [];
          window.profile = { id: "user-a", fullName: "Maria Santos", email: "maria@example.invalid" };
          const church = { id: "church-a", name: "Test Church", currency: "PHP", timezone: "Asia/Shanghai" };
          window.scope = { activeChurch: church, activeRole: "Admin", activeMemberships: [{ id: "membership", churchId: church.id, church }], workspaceMode: "church", scopeVersion: 1, switching: false };
          const root = createRoot(document.getElementById("root"));
          window.renderHome = (role = "Admin", owner = false, mode = "church") => {
            window.scope = { ...window.scope, activeRole: role, workspaceMode: mode };
            window.owner = owner; root.render(React.createElement(Home));
          };
          window.renderHome(window.initialRole || "Admin", window.initialOwner || false, window.initialMode || "church");
        `;
        if (id.startsWith("\0feature:")) {
          const name = id.split(":")[1];
          return `import React from "react"; (window.evaluated ||= []).push("${name}"); export function ${name}(props) { return React.createElement("section", { "data-feature": "${name}", "data-church": props.churchId || "" }, "${name}"); }`;
        }
        if (id === "\0fixture-auth") return `export const useAuth = () => ({ profile: window.profile, isPlatformOwner: !!window.owner, refreshAuthorization: async () => {}, signOut: async () => { window.signedOut = true; } });`;
        if (id === "\0fixture-church") return `export const useActiveChurch = () => window.scope;`;
        if (id === "\0fixture-cashflow") return `export const extractSpecifiedDetails = () => ""; export const isOtherCategory = () => false; export const stripSpecifiedDetails = value => value; export const loadCashFlow = async () => ({ transactions: [], transfers: [], payables: [], accounts: [], categories: [] }); ${["addPayable", "addTransaction", "addTransfer", "createAccount", "recordPayablePayment", "updateAccount", "updateTransaction"].map(name => `export const ${name} = async () => {};`).join(" ")}`;
      },
    }], build: { write: false, minify: false, target: "esnext", lib: { entry: "lazy-navigation-entry", formats: ["es"] }, rollupOptions: { output: { entryFileNames: "entry.js", chunkFileNames: "[name]-[hash].js" } } } });
  const output = (Array.isArray(result) ? result[0] : result).output;
  assets = new Map(output.filter(item => item.type === "chunk").map(item => [item.fileName, item.code]));
  featureFiles = new Map();
  for (const item of output.filter(item => item.type === "chunk")) for (const module of Object.keys(item.modules)) if (module.startsWith("\0feature:")) featureFiles.set(module.split(":")[1], item.fileName);
  css = ["../../app/globals.css", "../../src/styles/tokens.css", "../../src/styles/primitives.css"].map(path => fs.readFileSync(new URL(path, import.meta.url), "utf8")).join("\n").replace(/@import[^;]+;/g, "");
  browser = await chromium.launch({ channel: process.env.LAZY_TEST_BROWSER || "msedge", headless: true });
});
after(async () => { await browser?.close(); });

async function pageFor({ role = "Admin", width = 1280, owner = false, mode = "church", hold } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.setDefaultTimeout(8000);
  const requests = [], errors = [];
  page.on("pageerror", error => errors.push(error.message));
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.addInitScript(({ role, owner, mode }) => { window.initialRole = role; window.initialOwner = owner; window.initialMode = mode; }, { role, owner, mode });
  await page.route("**/*", async route => {
    const url = new URL(route.request().url()), file = url.pathname.slice(1);
    if (url.origin !== "https://lazy-ui.invalid") return route.abort();
    if (!file) return route.fulfill({ contentType: "text/html", body: '<main id="root"></main><script type="module" src="/entry.js"></script>' });
    if (!assets.has(file)) return route.abort();
    requests.push(file);
    if (hold && file === featureFiles.get(hold)) await gate;
    await route.fulfill({ contentType: "text/javascript", body: assets.get(file) });
  });
  await page.goto("https://lazy-ui.invalid/", { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: css });
  return { page, requests, errors, release };
}
const nav = page => page.getByRole("navigation", { name: "Main navigation" });

test("feature chunks defer until navigation; pending views preserve the shell and late completion cannot replace the current view", async () => {
  const { page, requests, errors, release } = await pageFor({ hold: "BudgetView" });
  try {
    await page.locator('[data-feature="DashboardView"]').waitFor();
    for (const name of ["BudgetView", "ReportsView", "UsersView", "PlatformAdministrationView", "EngagementDashboard", "AnnouncementView"]) assert.equal(requests.includes(featureFiles.get(name)), false, `${name} loaded eagerly`);
    await nav(page).getByRole("button", { name: "Budget Planning", exact: true }).click();
    await page.getByRole("status", { name: "Loading Budget Planning" }).waitFor();
    assert.equal(await nav(page).getByRole("button", { name: "Budget Planning", exact: true }).getAttribute("aria-current"), "page");
    await page.getByRole("heading", { name: "Budget Planning", exact: true }).waitFor();
    await nav(page).getByRole("button", { name: "Families", exact: true }).click();
    await page.locator('[data-feature="FamilyView"][data-church="church-a"]').waitFor();
    release();
    await page.waitForFunction(() => window.evaluated.includes("BudgetView"));
    assert.equal(await page.locator('[data-feature="BudgetView"]').count(), 0);
    await nav(page).getByRole("button", { name: "Budget Planning", exact: true }).click();
    await page.locator('[data-feature="BudgetView"][data-church="church-a"]').waitFor();
    assert.equal(requests.filter(file => file === featureFiles.get("BudgetView")).length, 1);
    await nav(page).getByRole("button", { name: "Dashboard", exact: true }).click();
    await page.locator('[data-feature="DashboardView"]').waitFor();
    assert.deepEqual(errors, []);
  } finally { release(); await page.close(); }
});

test("mobile drawer closes on lazy navigation and role gates remain effective while a restricted module is pending", async () => {
  const { page, requests, errors, release } = await pageFor({ role: "Viewer", width: 390, hold: "UsersView" });
  try {
    await page.locator('[data-feature="DashboardView"]').waitFor();
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    for (const label of ["Users", "Members", "Financial Approvals", "Audit Logs", "Backup Center", "System Information"]) assert.equal(await nav(page).getByRole("button", { name: label, exact: true }).count(), 0);
    await nav(page).getByRole("button", { name: "Attendance", exact: true }).click();
    await page.locator('[data-feature="AttendanceView"][data-church="church-a"]').waitFor();
    assert.equal(await page.getByRole("button", { name: "Open navigation menu" }).getAttribute("aria-expanded"), "false");
    assert.equal(await page.evaluate(() => document.body.classList.contains("drawer-open")), false);
    assert.equal(await nav(page).getByRole("button", { name: "Attendance", exact: true }).getAttribute("aria-current"), "page");
    assert.equal(requests.includes(featureFiles.get("UsersView")), false);
    await page.evaluate(() => window.renderHome("Admin"));
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    await nav(page).getByRole("button", { name: "Users", exact: true }).click();
    await page.getByRole("status", { name: "Loading Users" }).waitFor();
    await page.evaluate(() => window.renderHome("Viewer"));
    release();
    await page.waitForFunction(() => window.evaluated.includes("UsersView"));
    assert.equal(await page.locator('[data-feature="UsersView"]').count(), 0);
    assert.deepEqual(errors, []);
  } finally { release(); await page.close(); }
});

test("platform code only loads for platform owners and has a loading fallback", async () => {
  const { page, requests, errors, release } = await pageFor({ owner: false, mode: "platform", hold: "PlatformAdministrationView" });
  try {
    await page.locator('[data-feature="DashboardView"]').waitFor();
    assert.equal(requests.includes(featureFiles.get("PlatformAdministrationView")), false);
    await page.evaluate(() => window.renderHome("Admin", true, "platform"));
    await page.getByRole("status", { name: "Loading platform administration" }).waitFor();
    release();
    await page.locator('[data-feature="PlatformAdministrationView"]').waitFor();
    assert.equal(await page.locator('[data-feature="DashboardView"]').count(), 0);
    assert.deepEqual(errors, []);
  } finally { release(); await page.close(); }
});
