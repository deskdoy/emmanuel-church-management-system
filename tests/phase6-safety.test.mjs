import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(path, "utf8");

test("Phase 6 fixture runners hard-deny the production Supabase project", () => {
  const config = read("scripts/phase6/config.mjs");
  assert.match(config, /jwhycucpvgejschyqwnq/);
  assert.match(config, /refuses to run against the Faithful Steward production project/);
  assert.match(config, /PHASE6_ISOLATED_TEST_ONLY/);
});

test("Phase 6 fixtures are outside the migration history and use explicit tenant ownership", () => {
  const provision = read("scripts/phase6/provision.mjs");
  assert.match(provision, /church_id:/);
  assert.match(provision, /phase6-demo-/);
  assert.doesNotMatch(read("package.json"), /supabase\/migrations\/.*phase6/i);
});

test("service-role credentials remain server-only", () => {
  const example = read(".env.phase6.example");
  const browserConfig = read("playwright.phase6.config.ts");
  assert.match(example, /^PHASE6_SUPABASE_SERVICE_ROLE_KEY=/m);
  assert.doesNotMatch(example, /^VITE_.*SERVICE/m);
  assert.doesNotMatch(browserConfig, /VITE_SUPABASE_SERVICE_ROLE/);
});

test("Phase 6 covers switching, role gates, isolation, and exact cleanup", () => {
  const e2e = read("tests/e2e/phase6-multichurch.spec.ts");
  const isolation = read("scripts/phase6/run-isolation-tests.mjs");
  const cleanup = read("scripts/phase6/cleanup.mjs");
  // The E2E suite locates the workspace select directly, rather than by label.
  assert.match(e2e, /\.locator\(\s*["']section\.church-workspace-switcher select["']\s*\)/);
  for (const church of ["Emmanuel Church", "Phase 6 Demo Church"]) {
    assert.match(e2e, new RegExp(`\\.selectOption\\(\\s*\\{\\s*label:\\s*"${church}"\\s*,?\\s*\\}`));
  }
  assert.match(e2e, /mobile drawer exposes church switching/);
  assert.match(e2e, /\.toContainText\(\s*"Viewer"\s*\)/);
  assert.match(e2e, /\.toContainText\(\s*"Treasurer"\s*\)/);
  assert.match(e2e, /Platform Owner receives platform controls/);
  assert.match(isolation, /Church A and Church B reads are mutually isolated/);
  assert.match(isolation, /Composite foreign keys reject cross-church account references/);
  assert.match(cleanup, /Cleanup refused: exact Demo Church fixture was not found/);
  assert.match(cleanup, /verifyCleanup/);
});
