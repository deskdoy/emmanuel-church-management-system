import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

type FixtureUser = { email: string; password: string };
type Runtime = {
  prefix: string;
  productionProjectRef: string;
  users: Record<string, FixtureUser>;
};

const runtime = JSON.parse(readFileSync(".phase6/runtime.json", "utf8")) as Runtime;
if (runtime.productionProjectRef !== "jwhycucpvgejschyqwnq") throw new Error("Unexpected Phase 6 production guard in runtime manifest.");

async function signIn(page: Page, userKey: string) {
  const user = runtime.users[userKey];
  if (!user) throw new Error(`Missing Phase 6 fixture user ${userKey}.`);
  await page.goto("/");
  await page.getByLabel("Email address").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Preparing your workspace…")).toHaveCount(0);
}

async function openNavigation(page: Page) {
  const button = page.getByRole("button", { name: "Open navigation menu" });
  if (await button.isVisible()) await button.click();
}

async function navigate(page: Page, label: string) {
  await openNavigation(page);
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: label, exact: true }).click();
}

test.describe("Phase 6 tenant switching", () => {
  test("multi-church user changes role and visible ledger with the workspace", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.startsWith("mobile"), "Desktop switching is covered here; the mobile drawer has its own test.");
    await signIn(page, "multi-church");
    const workspace = page
  .locator("section.church-workspace-switcher select")
  .filter({ has: page.locator("option", { hasText: "Emmanuel Church" }) })
  .first();
    await expect(workspace).toBeVisible();

    await workspace.selectOption({ label: "Emmanuel Church" });
    await expect(page.locator(".active-church-identity")).toContainText("Emmanuel Church");
    await expect(page.locator(".active-church-identity")).toContainText("Viewer");
    await expect(page.getByRole("button", { name: "New Transaction" }).first()).toBeDisabled();
    await navigate(page, "Transactions");
    await expect(page.getByText(`${runtime.prefix}_offering`)).toHaveCount(0);

    await page
  .locator("section.church-workspace-switcher select")
  .filter({ has: page.locator("option", { hasText: "Phase 6 Demo Church" }) })
  .first()
  .selectOption({ label: "Phase 6 Demo Church" });
    await expect(page.locator(".active-church-identity")).toContainText("Phase 6 Demo Church");
    await expect(page.locator(".active-church-identity")).toContainText("Treasurer");
    await expect(page.getByRole("button", { name: "New Transaction" }).first()).toBeEnabled();
    await expect(page.getByText(`${runtime.prefix}_offering`)).toBeVisible();
    await expect(page.getByText(`${runtime.prefix}_emmanuel_offering`)).toHaveCount(0);
  });

  test("mobile drawer exposes church switching", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("mobile"), "Mobile-only drawer assertion");
    await signIn(page, "multi-church");
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    const drawer = page.locator("#main-sidebar");
    await expect(drawer).toHaveClass(/open/);
    await drawer.locator("select").selectOption({
    label: "Phase 6 Demo Church"
});
    await expect(drawer).not.toHaveClass(/open/);
    await expect(page.locator(".active-church-identity")).toContainText("Phase 6 Demo Church");
  });
});

test.describe("Phase 6 role presentation", () => {
  test("Church Admin sees tenant administration modules", async ({ page }) => {
    await signIn(page, "demo-admin");
    await openNavigation(page);
    for (const label of ["Users", "Audit Logs", "Backup Center", "System Information"]) {
      await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: label, exact: true })).toBeVisible();
    }
  });

  test("Encoder can record transactions but cannot manage accounts", async ({ page }) => {
    await signIn(page, "demo-encoder");
    await expect(page.getByRole("button", { name: "New Transaction" }).first()).toBeEnabled();
    await navigate(page, "Accounts");
    await expect(page.getByRole("button", { name: "New Account" }).first()).toBeDisabled();
  });

  test("Viewer is read-only and cannot see church administration", async ({ page }) => {
    await signIn(page, "demo-viewer");
    await expect(page.getByRole("button", { name: "New Transaction" }).first()).toBeDisabled();
    await openNavigation(page);
    for (const label of ["Users", "Audit Logs", "Backup Center", "System Information"]) {
      await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: label, exact: true })).toHaveCount(0);
    }
  });

  for (const [userKey, role] of [["demo-pastor", "Pastor"], ["demo-secretary", "Secretary"]] as const) {
    test(`${role} can manage projects but not finance`, async ({ page }) => {
      await signIn(page, userKey);
      await expect(page.getByRole("button", { name: "New Transaction" }).first()).toBeDisabled();
      await navigate(page, "Projects");
      await expect(page.getByRole("button", { name: /Add Project/ })).toBeVisible();
    });
  }

  test("Platform Owner receives platform controls and no church finance", async ({ page }) => {
    await signIn(page, "platform-owner");
    await expect(page.getByRole("heading", { name: "Platform Administration" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "New Transaction" })).toHaveCount(0);
  });

  test("zero-membership user is stopped at WorkspaceGate", async ({ page }) => {
    await signIn(page, "no-membership");
    await expect(page.getByRole("heading", { name: "No active church access." })).toBeVisible();
    await expect(page.getByRole("button", { name: "New Transaction" })).toHaveCount(0);
  });
});
