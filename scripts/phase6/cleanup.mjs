import { createClient } from "@supabase/supabase-js";
import { REPORT_PATH, loadRuntime, phase6Config, saveJson } from "./config.mjs";
import { verifyCleanup } from "./verification.mjs";

const config = phase6Config({ requireServiceRole: true });
const runtime = await loadRuntime();
const admin = createClient(config.url, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const userIds = Object.values(runtime.users).map(user => user.id);
const recordIds = Object.values(runtime.ids.records || {}).filter(value => typeof value === "string");

const remove = async (table, configure) => {
  const { error } = await configure(admin.from(table).delete());
  if (error) throw new Error(`Cleanup failed for ${table}: ${error.message}`);
};

const cleanup = async () => {
  const { data: demo, error: demoError } = await admin.from("churches").select("id,slug,name").eq("id", runtime.ids.demoChurch).maybeSingle();
  if (demoError) throw new Error(`Unable to validate Demo Church: ${demoError.message}`);
  if (!demo || demo.slug !== runtime.demoSlug || !demo.slug.startsWith("phase6-demo-")) throw new Error("Cleanup refused: exact Demo Church fixture was not found.");

  for (const table of ["payable_payments", "attendance", "account_transfers", "offerings", "donations", "expenses", "payables", "reports", "access_requests", "announcements", "events", "members", "projects", "categories", "accounts"]) {
    await remove(table, query => query.eq("church_id", runtime.ids.demoChurch));
  }
  if (runtime.ids.records?.emmanuelOffering) await remove("offerings", query => query.eq("id", runtime.ids.records.emmanuelOffering).eq("church_id", runtime.ids.emmanuelChurch));
  if (runtime.ids.records?.emmanuelCategory) await remove("categories", query => query.eq("id", runtime.ids.records.emmanuelCategory).eq("church_id", runtime.ids.emmanuelChurch));
  if (runtime.ids.records?.emmanuelAccount) await remove("accounts", query => query.eq("id", runtime.ids.records.emmanuelAccount).eq("church_id", runtime.ids.emmanuelChurch));
  await remove("church_memberships", query => query.in("user_id", userIds));
  await remove("platform_user_roles", query => query.in("user_id", userIds));

  for (const userId of userIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error && !/not found/i.test(error.message)) throw new Error(`Auth cleanup failed for ${userId}: ${error.message}`);
  }

  const { data: auditRows, error: auditReadError } = await admin.from("audit_logs").select("id,record_id,church_id,old_values,new_values,actor_user_id");
  if (auditReadError) throw new Error(`Unable to inspect audit residue: ${auditReadError.message}`);
  const auditIds = auditRows.filter(row => row.church_id === runtime.ids.demoChurch || userIds.includes(row.actor_user_id) || userIds.includes(row.record_id) || recordIds.includes(row.record_id) || JSON.stringify(row).includes(runtime.prefix)).map(row => row.id);
  for (let offset = 0; offset < auditIds.length; offset += 100) await remove("audit_logs", query => query.in("id", auditIds.slice(offset, offset + 100)));
  await remove("churches", query => query.eq("id", runtime.ids.demoChurch).eq("slug", runtime.demoSlug));

  const report = await verifyCleanup();
  await saveJson(REPORT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "PASS") process.exitCode = 1;
};

cleanup().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
