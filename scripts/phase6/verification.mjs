import { createClient } from "@supabase/supabase-js";
import { loadRuntime, phase6Config, phase6Tables } from "./config.mjs";

export const verifyCleanup = async () => {
  const config = phase6Config({ requireServiceRole: true });
  const runtime = await loadRuntime();
  const admin = createClient(config.url, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const failures = [];
  const checks = [];
  const check = (name, passed, detail) => {
    checks.push({ name, passed, detail });
    if (!passed) failures.push(`${name}: ${detail}`);
  };

  const { data: churches, error: churchError } = await admin.from("churches").select("id,name,slug,status");
  check("Church directory query", !churchError, churchError?.message || "ok");
  check("Only Emmanuel remains", churches?.length === 1 && churches[0].slug === "emmanuel-church", JSON.stringify(churches));

  for (const table of phase6Tables.filter(name => !["church_memberships", "audit_logs"].includes(name))) {
    const { count, error } = await admin.from(table).select("id", { count: "exact", head: true }).eq("church_id", runtime.ids.demoChurch);
    check(`${table} Demo rows`, !error && count === 0, error?.message || String(count));
  }
  const userIds = Object.values(runtime.users).map(user => user.id);
  const { count: membershipCount, error: membershipError } = await admin.from("church_memberships").select("id", { count: "exact", head: true }).in("user_id", userIds);
  check("Test memberships removed", !membershipError && membershipCount === 0, membershipError?.message || String(membershipCount));
  const { count: platformCount, error: platformError } = await admin.from("platform_user_roles").select("user_id", { count: "exact", head: true }).in("user_id", userIds);
  check("Test platform roles removed", !platformError && platformCount === 0, platformError?.message || String(platformCount));
  const { data: profiles, error: profileError } = await admin.from("users").select("id,email").in("id", userIds);
  check("Test profiles removed", !profileError && profiles.length === 0, profileError?.message || JSON.stringify(profiles));
  const { data: auditRows, error: auditError } = await admin.from("audit_logs").select("id,record_id,church_id,old_values,new_values,actor_user_id");
  const residue = (auditRows || []).filter(row => JSON.stringify(row).includes(runtime.prefix) || row.church_id === runtime.ids.demoChurch || userIds.includes(row.actor_user_id) || userIds.includes(row.record_id));
  check("Test audit residue removed", !auditError && residue.length === 0, auditError?.message || `${residue.length} rows`);

  let authResidue = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) { failures.push(`Auth user listing failed: ${error.message}`); break; }
    authResidue.push(...data.users.filter(user => userIds.includes(user.id)));
    if (data.users.length < 1000) break;
  }
  check("Test Auth users removed", authResidue.length === 0, `${authResidue.length} users`);
  return { status: failures.length ? "FAIL" : "PASS", projectRef: config.projectRef, runId: runtime.runId, completedAt: new Date().toISOString(), checks, failures };
};
