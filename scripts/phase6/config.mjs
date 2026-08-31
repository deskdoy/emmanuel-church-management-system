import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const PRODUCTION_PROJECT_REF = "jwhycucpvgejschyqwnq";
export const CONFIRMATION = "PHASE6_ISOLATED_TEST_ONLY";
export const RUNTIME_PATH = resolve(".phase6/runtime.json");
export const REPORT_PATH = resolve(".phase6/verification-report.json");

const required = name => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
};

export const projectRefFromUrl = value => {
  const host = new URL(value).hostname.toLowerCase();
  if (host === "127.0.0.1" || host === "localhost") return "local";
  const match = host.match(/^([a-z0-9]+)\.supabase\.co$/);
  if (!match) throw new Error(`Unrecognized Supabase URL: ${host}`);
  return match[1];
};

export const phase6Config = ({ requireServiceRole = false } = {}) => {
  const url = required("PHASE6_SUPABASE_URL");
  const anonKey = required("PHASE6_SUPABASE_ANON_KEY");
  const expectedRef = required("PHASE6_EXPECTED_PROJECT_REF");
  const actualRef = projectRefFromUrl(url);
  if (process.env.PHASE6_CONFIRM !== CONFIRMATION) {
    throw new Error(`Set PHASE6_CONFIRM=${CONFIRMATION} to acknowledge isolated testing.`);
  }
  if (actualRef === PRODUCTION_PROJECT_REF || expectedRef === PRODUCTION_PROJECT_REF) {
    throw new Error("Phase 6 refuses to run against the Faithful Steward production project.");
  }
  if (actualRef !== expectedRef && !(actualRef === "local" && expectedRef === "local")) {
    throw new Error(`Target mismatch: URL resolves to ${actualRef}, expected ${expectedRef}.`);
  }
  const serviceRoleKey = requireServiceRole ? required("PHASE6_SUPABASE_SERVICE_ROLE_KEY") : process.env.PHASE6_SUPABASE_SERVICE_ROLE_KEY?.trim();
  return { url, anonKey, serviceRoleKey, projectRef: actualRef };
};

export const saveJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

export const loadJson = async path => JSON.parse(await readFile(path, "utf8"));

export const loadRuntime = async () => {
  const runtime = await loadJson(RUNTIME_PATH);
  const config = phase6Config({ requireServiceRole: false });
  if (runtime.projectRef !== config.projectRef || runtime.productionProjectRef !== PRODUCTION_PROJECT_REF) {
    throw new Error("Runtime manifest does not match the guarded Phase 6 environment.");
  }
  return runtime;
};

export const phase6Prefix = runId => `__phase6_${runId}`;

export const phase6Tables = [
  "payable_payments", "attendance", "account_transfers", "offerings", "donations",
  "expenses", "payables", "reports", "access_requests", "announcements", "events",
  "members", "projects", "categories", "accounts", "church_memberships", "audit_logs",
];
