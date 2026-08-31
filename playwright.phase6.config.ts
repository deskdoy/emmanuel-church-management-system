import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

process.env.PLAYWRIGHT_BROWSERS_PATH ||= resolve(".phase6/ms-playwright");

const productionProjectRef = "jwhycucpvgejschyqwnq";
const confirmation = "PHASE6_ISOLATED_TEST_ONLY";
const supabaseUrl = process.env.PHASE6_SUPABASE_URL || "";
const expectedRef = process.env.PHASE6_EXPECTED_PROJECT_REF || "";
const anonKey = process.env.PHASE6_SUPABASE_ANON_KEY || "";
const hostname = supabaseUrl ? new URL(supabaseUrl).hostname.toLowerCase() : "";
const actualRef = hostname === "localhost" || hostname === "127.0.0.1"
  ? "local"
  : hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1] || "";

if (!supabaseUrl || !anonKey || !expectedRef) {
  throw new Error("Phase 6 E2E requires PHASE6_SUPABASE_URL, PHASE6_SUPABASE_ANON_KEY, and PHASE6_EXPECTED_PROJECT_REF.");
}
if (process.env.PHASE6_CONFIRM !== confirmation) {
  throw new Error(`Set PHASE6_CONFIRM=${confirmation} before isolated E2E testing.`);
}
if (actualRef === productionProjectRef || expectedRef === productionProjectRef) {
  throw new Error("Phase 6 E2E refuses to target the Faithful Steward production project.");
}
if (actualRef !== expectedRef && !(actualRef === "local" && expectedRef === "local")) {
  throw new Error(`Phase 6 E2E target mismatch: URL=${actualRef}, expected=${expectedRef}.`);
}

const baseURL = process.env.PHASE6_APP_URL || "http://127.0.0.1:4176";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "phase6-*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  outputDir: ".phase6/playwright-artifacts",
  reporter: [["list"], ["json", { outputFile: ".phase6/playwright-results.json" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4176",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: supabaseUrl,
      VITE_SUPABASE_ANON_KEY: anonKey,
    },
  },
});
