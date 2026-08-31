import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PRODUCTION_PROJECT_REF, RUNTIME_PATH, phase6Config, phase6Prefix, saveJson } from "./config.mjs";

const config = phase6Config({ requireServiceRole: true });
const admin = createClient(config.url, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const runId = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const prefix = phase6Prefix(runId);
const runtime = {
  version: 1,
  runId,
  prefix,
  projectRef: config.projectRef,
  productionProjectRef: PRODUCTION_PROJECT_REF,
  createdAt: new Date().toISOString(),
  users: {},
  ids: {},
};

const saveRuntime = () => saveJson(RUNTIME_PATH, runtime);
const fail = message => { throw new Error(message); };
const one = async (table, values) => {
  const { data, error } = await admin.from(table).insert(values).select().single();
  if (error) fail(`${table} fixture failed: ${error.message}`);
  return data;
};
const insert = async (table, values) => {
  const { data, error } = await admin.from(table).insert(values).select();
  if (error) fail(`${table} fixtures failed: ${error.message}`);
  return data;
};

const userClient = async fixture => {
  const client = createClient(config.url, config.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: fixture.email, password: fixture.password });
  if (error) fail(`Unable to authenticate ${fixture.email} for actor-owned fixtures: ${error.message}`);
  return client;
};

const ensureReferenceData = async () => {
  const roleNames = ["Admin", "Pastor", "Treasurer", "Secretary", "Encoder", "Viewer"];
  const { data: roles, error: rolesError } = await admin.from("roles").select("id,name");
  if (rolesError) fail(`Unable to read church roles: ${rolesError.message}`);
  const missing = roleNames.filter(name => !roles.some(role => role.name === name));
  if (missing.length) fail(`The isolated schema is missing required roles: ${missing.join(", ")}.`);
  runtime.ids.roles = Object.fromEntries(roles.map(role => [role.name, role.id]));

  const { data: churches, error: churchesError } = await admin.from("churches").select("id,name,slug,status");
  if (churchesError) fail(`Unable to read churches: ${churchesError.message}`);
  const unexpected = churches.filter(church => church.slug !== "emmanuel-church");
  if (unexpected.length) fail("The isolated target is not clean: an unexpected church already exists.");
  let emmanuel = churches.find(church => church.slug === "emmanuel-church");
  if (!emmanuel) {
    emmanuel = await one("churches", { name: "Emmanuel Church", slug: "emmanuel-church", status: "active", timezone: "Asia/Manila", currency: "PHP" });
    runtime.createdSyntheticEmmanuel = true;
  } else if (emmanuel.status !== "active") fail("Emmanuel Church must be active in the isolated test environment.");
  runtime.ids.emmanuelChurch = emmanuel.id;

  const { data: platformRole, error: platformError } = await admin.from("platform_roles").select("id").eq("code", "platform_owner").maybeSingle();
  if (platformError) fail(`Unable to read Platform Owner role: ${platformError.message}`);
  if (!platformRole) fail("The isolated schema is missing the Platform Owner role.");
  runtime.ids.platformOwnerRole = platformRole.id;
};

const createTestUser = async (key, fullName) => {
  const email = `phase6-${key}-${runId}@example.invalid`;
  const password = `Fs!${randomBytes(18).toString("base64url")}9a`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error || !data.user) fail(`Auth fixture ${key} failed: ${error?.message || "No user returned"}`);
  runtime.users[key] = { id: data.user.id, email, password, fullName };
  await saveRuntime();
  return runtime.users[key];
};

const provision = async () => {
  await saveRuntime();
  await ensureReferenceData();
  const demo = await one("churches", {
    name: "Phase 6 Demo Church",
    slug: `phase6-demo-${runId}`,
    address: "Isolated test environment only",
    status: "active",
    timezone: "Asia/Manila",
    currency: "PHP",
  });
  runtime.ids.demoChurch = demo.id;
  runtime.demoSlug = demo.slug;
  await saveRuntime();

  const users = {
    emmanuelAdmin: await createTestUser("emmanuel-admin", "Phase 6 Emmanuel Admin"),
    demoAdmin: await createTestUser("demo-admin", "Phase 6 Demo Admin"),
    multiChurch: await createTestUser("multi-church", "Phase 6 Multi Church User"),
    demoEncoder: await createTestUser("demo-encoder", "Phase 6 Demo Encoder"),
    demoPastor: await createTestUser("demo-pastor", "Phase 6 Demo Pastor"),
    demoSecretary: await createTestUser("demo-secretary", "Phase 6 Demo Secretary"),
    demoViewer: await createTestUser("demo-viewer", "Phase 6 Demo Viewer"),
    platformOwner: await createTestUser("platform-owner", "Phase 6 Platform Owner"),
    noMembership: await createTestUser("no-membership", "Phase 6 No Membership"),
  };
  const memberships = [
    [runtime.ids.emmanuelChurch, users.emmanuelAdmin.id, "Admin"],
    [runtime.ids.emmanuelChurch, users.multiChurch.id, "Viewer"],
    [demo.id, users.demoAdmin.id, "Admin"],
    [demo.id, users.multiChurch.id, "Treasurer"],
    [demo.id, users.demoEncoder.id, "Encoder"],
    [demo.id, users.demoPastor.id, "Pastor"],
    [demo.id, users.demoSecretary.id, "Secretary"],
    [demo.id, users.demoViewer.id, "Viewer"],
  ].map(([church_id, user_id, role]) => ({ church_id, user_id, role_id: runtime.ids.roles[role], status: "active", joined_at: new Date().toISOString() }));
  await insert("church_memberships", memberships);
  await one("platform_user_roles", { user_id: users.platformOwner.id, platform_role_id: runtime.ids.platformOwnerRole, is_active: true });

  const emmanuelAccount = await one("accounts", { name: `${prefix}_emmanuel_cash`, account_type: "Cash", opening_balance: 100, church_id: runtime.ids.emmanuelChurch });
  const emmanuelCategory = await one("categories", { name: `${prefix}_emmanuel_income`, transaction_type: "Income", category_group: "Income", church_id: runtime.ids.emmanuelChurch });
  const cash = await one("accounts", { name: `${prefix}_demo_cash`, account_type: "Cash", opening_balance: 10000, church_id: demo.id });
  const bank = await one("accounts", { name: `${prefix}_demo_bank`, account_type: "Bank", opening_balance: 5000, church_id: demo.id });
  const incomeCategory = await one("categories", { name: `${prefix}_demo_income`, transaction_type: "Income", category_group: "Income", church_id: demo.id });
  const expenseCategory = await one("categories", { name: `${prefix}_demo_expense`, transaction_type: "Expense", category_group: "Expenses", church_id: demo.id });
  const project = await one("projects", { name: `${prefix}_project`, description: "Phase 6 isolated fixture", status: "Active", created_by: users.demoAdmin.id, church_id: demo.id });
  const member = await one("members", { first_name: "Phase 6", last_name: "Member", created_by: users.demoAdmin.id, church_id: demo.id });
  const event = await one("events", { title: `${prefix}_event`, starts_at: new Date().toISOString(), created_by: users.demoAdmin.id, church_id: demo.id });
  await one("attendance", { member_id: member.id, event_id: event.id, attendance_date: new Date().toISOString().slice(0, 10), status: "Present", recorded_by: users.demoAdmin.id, church_id: demo.id });
  await one("announcements", { title: `${prefix}_announcement`, content: "Phase 6 isolated fixture", is_published: true, created_by: users.demoAdmin.id, church_id: demo.id });

  const today = new Date().toISOString().slice(0, 10);
  const offering = await one("offerings", { offering_date: today, description: `${prefix}_offering`, amount: 1000, account_id: cash.id, category_id: incomeCategory.id, recorded_by: users.demoAdmin.id, church_id: demo.id });
  const donation = await one("donations", { donation_date: today, donor_member_id: member.id, donor_name: "Phase 6 Donor", description: `${prefix}_donation`, amount: 500, account_id: cash.id, category_id: incomeCategory.id, project_id: project.id, recorded_by: users.demoAdmin.id, church_id: demo.id });
  const expense = await one("expenses", { expense_date: today, vendor: "Phase 6 Vendor", description: `${prefix}_expense`, amount: 300, account_id: cash.id, category_id: expenseCategory.id, project_id: project.id, recorded_by: users.demoAdmin.id, church_id: demo.id });
  const transfer = await one("account_transfers", { transfer_date: today, from_account_id: cash.id, to_account_id: bank.id, amount: 200, reference: `${prefix}_transfer`, notes: "Phase 6 isolated fixture", recorded_by: users.demoAdmin.id, church_id: demo.id });
  const payable = await one("payables", { vendor: "Phase 6 Payable", notes: `${prefix}_payable`, due_date: today, category_id: expenseCategory.id, amount: 400, recorded_by: users.demoAdmin.id, church_id: demo.id });
  const demoAdminClient = await userClient(users.demoAdmin);
  const { data: payment, error: paymentError } = await demoAdminClient.from("payable_payments").insert({ payable_id: payable.id, payment_date: today, amount: 100, payment_method: "Cash", reference: `${prefix}_payment`, recorded_by: users.demoAdmin.id, church_id: demo.id }).select().single();
  if (paymentError) fail(`payable_payments actor fixture failed: ${paymentError.message}`);
  const report = await one("reports", { title: `${prefix}_report`, report_type: "cash_flow", parameters: {}, generated_data: {}, generated_by: users.demoAdmin.id, church_id: demo.id });
  const request = await one("access_requests", { full_name: "Phase 6 Request", email: `phase6-request-${runId}@example.invalid`, requested_role: "Viewer", reason: "Phase 6 isolated fixture", church_id: demo.id });
  const emmanuelOffering = await one("offerings", { offering_date: today, description: `${prefix}_emmanuel_offering`, amount: 111, account_id: emmanuelAccount.id, category_id: emmanuelCategory.id, recorded_by: users.emmanuelAdmin.id, church_id: runtime.ids.emmanuelChurch });

  runtime.ids.records = {
    emmanuelAccount: emmanuelAccount.id, emmanuelCategory: emmanuelCategory.id, emmanuelOffering: emmanuelOffering.id,
    cash: cash.id, bank: bank.id, incomeCategory: incomeCategory.id, expenseCategory: expenseCategory.id,
    project: project.id, member: member.id, event: event.id, offering: offering.id, donation: donation.id,
    expense: expense.id, transfer: transfer.id, payable: payable.id, payment: payment.id, report: report.id, request: request.id,
  };
  runtime.expected = { income: 1500, expenses: 300, net: 1200, organizationBalance: 16200, cashBalance: 11000, bankBalance: 5200, payableBalance: 300 };
  runtime.readyAt = new Date().toISOString();
  await saveRuntime();
  console.log(JSON.stringify({ status: "READY", projectRef: config.projectRef, runId, demoChurch: demo.slug, testUsers: Object.keys(runtime.users) }, null, 2));
};

provision().catch(async error => {
  runtime.provisionError = error instanceof Error ? error.message : String(error);
  await saveRuntime().catch(() => undefined);
  console.error(runtime.provisionError);
  process.exitCode = 1;
});
