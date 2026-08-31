import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildBackupCsv, createExportId, scopeLabel } from "../src/operations/backupExport.ts";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("backup CSV contains traceable metadata and safely escapes data", () => {
  const dataset = { type: "transactions", title: "All Transactions", headers: ["Description", "Amount"], rows: [["Offering, Sunday", 1000], ['Gift "A"', 500]] };
  const metadata = { exportId: "EXP-20260828-ABC12345", organization: "FAITHFUL STEWARD | Church Management & Financial Stewardship Platform", generatedAt: "2026-08-28T10:00:00.000Z", generatedBy: "Admin User", scopeLabel: "2026-08-01 to 2026-08-28" };
  const csv = buildBackupCsv(dataset, metadata);
  assert.match(csv, /FAITHFUL STEWARD/);
  assert.match(csv, /EXP-20260828-ABC12345/);
  assert.match(csv, /2026-08-01 to 2026-08-28/);
  assert.match(csv, /"Offering, Sunday"/);
  assert.match(csv, /"Gift ""A"""/);
  assert.equal(scopeLabel({ allRecords: true, dateFrom: "", dateTo: "" }), "All available records");
  assert.match(createExportId(new Date("2026-08-28T00:00:00Z"), "abcd-1234"), /^EXP-20260828-ABCD1234$/);
});

test("operational tools use existing RLS-visible tables and Admin verification", () => {
  const service = read("src/services/operationalManagement.ts");
  assert.match(service, /auth\.getUser\(\)/);
  assert.match(service, /named\(data\.roles\) !== "Admin"/);
  assert.match(service, /from\("reports"\)\.insert/);
  assert.match(service, /report_type: "backup_export"/);
  assert.match(service, /generated_data: \{ record_count:/);
  assert.match(service, /allRows\(churchId,"audit_logs"/);
  assert.doesNotMatch(service, /service_role|SUPABASE_SERVICE|\.storage\.|\.delete\(/);
  assert.doesNotMatch(service, /generated_data:\s*dataset\.rows/);
});

test("Backup Center and System Information are Admin-only navigation modules", () => {
  const page = read("app/page.tsx");
  const backup = read("src/components/BackupCenterView.tsx");
  const system = read("src/components/SystemInformationView.tsx");
  assert.match(page, /isChurchAdmin[^\n]+"Backup Center"/);
  assert.match(page, /view === "backup" && isChurchAdmin/);
  assert.match(page, /view === "system" && isChurchAdmin/);
  assert.match(backup, /profile\.role !== "Admin"/);
  assert.match(backup, /Export history/);
  assert.match(backup, /Download CSV/);
  assert.match(backup, /Print summary/);
  assert.match(system, /profile\.role !== "Admin"/);
  assert.match(system, /No secrets displayed/);
  assert.doesNotMatch(system, /VITE_SUPABASE|anon.key|service.role/i);
});

test("cleanup guidance defaults to rollback and protects reference records", () => {
  const guide = read("public/ADMIN_TEST_DATA_CLEANUP.md");
  assert.match(guide, /Generate and download relevant backups/i);
  assert.match(guide, /explicit IDs/i);
  assert.match(guide, /rollback;/i);
  assert.match(guide, /Never delete roles, the Admin account, categories, accounts, or audit logs/i);
  assert.doesNotMatch(guide, /delete\s+from\s+public\.(roles|users|categories|accounts|audit_logs)/i);
});
