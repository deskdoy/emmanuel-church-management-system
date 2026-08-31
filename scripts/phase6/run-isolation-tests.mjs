import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { loadRuntime, phase6Config, saveJson } from "./config.mjs";

const config = phase6Config();
const runtime = await loadRuntime();
const results = [];

const clientFor = async key => {
  const fixture = runtime.users[key];
  const client = createClient(config.url, config.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: fixture.email, password: fixture.password });
  assert.equal(error, null, `${key} could not sign in: ${error?.message}`);
  return client;
};
const pass = name => results.push({ name, status: "PASS" });
const rows = async (client, table, apply = query => query) => {
  const { data, error } = await apply(client.from(table).select("*"));
  assert.equal(error, null, `${table} query failed: ${error?.message}`);
  return data;
};
const visibleById = async (client, table, id) => (await rows(client, table, query => query.eq("id", id))).length;
const expectDenied = async (name, operation) => {
  const { error, data, count } = await operation();
  assert.ok(error || count === 0 || (Array.isArray(data) && data.length === 0), `${name} unexpectedly succeeded`);
  pass(name);
};
const relatedRoleName = value => Array.isArray(value) ? value[0]?.name : value?.name;

const emmanuelAdmin = await clientFor("emmanuel-admin");
const demoAdmin = await clientFor("demo-admin");
const multiChurch = await clientFor("multi-church");
const demoEncoder = await clientFor("demo-encoder");
const demoPastor = await clientFor("demo-pastor");
const demoSecretary = await clientFor("demo-secretary");
const demoViewer = await clientFor("demo-viewer");
const platformOwner = await clientFor("platform-owner");
const noMembership = await clientFor("no-membership");

const ids = runtime.ids.records;

assert.equal(await visibleById(emmanuelAdmin, "accounts", ids.emmanuelAccount), 1);
assert.equal(await visibleById(emmanuelAdmin, "accounts", ids.cash), 0);
assert.equal(await visibleById(demoAdmin, "accounts", ids.cash), 1);
assert.equal(await visibleById(demoAdmin, "accounts", ids.emmanuelAccount), 0);
pass("Church A and Church B reads are mutually isolated");

await expectDenied("Church A Admin cannot insert into Church B", () => emmanuelAdmin.from("accounts").insert({ name: `${runtime.prefix}_forbidden_cross_insert`, account_type: "Cash", church_id: runtime.ids.demoChurch }).select());
const { data: crossUpdate, error: crossUpdateError } = await emmanuelAdmin.from("accounts").update({ is_active: false }).eq("id", ids.cash).eq("church_id", runtime.ids.demoChurch).select();
assert.equal(crossUpdateError, null);
assert.equal(crossUpdate.length, 0);
pass("Cross-church update is filtered to zero rows");
await expectDenied("Composite foreign keys reject cross-church account references", () => demoAdmin.from("offerings").insert({ offering_date: new Date().toISOString().slice(0, 10), description: `${runtime.prefix}_cross_fk`, amount: 1, account_id: ids.emmanuelAccount, category_id: ids.incomeCategory, recorded_by: runtime.users["demo-admin"].id, church_id: runtime.ids.demoChurch }).select());
await expectDenied("Two active churches require an explicit church_id", () => demoAdmin.from("accounts").insert({ name: `${runtime.prefix}_missing_church`, account_type: "Cash" }).select());

const { data: memberships, error: membershipsError } = await multiChurch.from("church_memberships").select("church_id,roles(name)").eq("user_id", runtime.users["multi-church"].id);
assert.equal(membershipsError, null);
assert.equal(memberships.length, 2);
assert.equal(relatedRoleName(memberships.find(item => item.church_id === runtime.ids.emmanuelChurch)?.roles), "Viewer");
assert.equal(relatedRoleName(memberships.find(item => item.church_id === runtime.ids.demoChurch)?.roles), "Treasurer");
pass("Multi-church identity receives different church roles");

const { error: treasurerAccountError } = await multiChurch.from("accounts").insert({ name: `${runtime.prefix}_treasurer_account`, account_type: "Other", church_id: runtime.ids.demoChurch });
assert.equal(treasurerAccountError, null);
pass("Demo Treasurer can manage Demo accounts");
await expectDenied("Emmanuel Viewer role cannot manage Emmanuel accounts", () => multiChurch.from("accounts").insert({ name: `${runtime.prefix}_viewer_emmanuel_account`, account_type: "Other", church_id: runtime.ids.emmanuelChurch }).select());

const { error: encoderWriteError } = await demoEncoder.from("offerings").insert({ offering_date: new Date().toISOString().slice(0, 10), description: `${runtime.prefix}_encoder_income`, amount: 10, account_id: ids.cash, category_id: ids.incomeCategory, recorded_by: runtime.users["demo-encoder"].id, church_id: runtime.ids.demoChurch });
assert.equal(encoderWriteError, null);
pass("Encoder can record a transaction");
await expectDenied("Encoder cannot manage accounts", () => demoEncoder.from("accounts").insert({ name: `${runtime.prefix}_encoder_account`, account_type: "Cash", church_id: runtime.ids.demoChurch }).select());

for (const [key, client] of [["Pastor", demoPastor], ["Secretary", demoSecretary]]) {
  const { error } = await client.from("projects").insert({ name: `${runtime.prefix}_${key.toLowerCase()}_project`, status: "Active", created_by: runtime.users[`demo-${key.toLowerCase()}`].id, church_id: runtime.ids.demoChurch });
  assert.equal(error, null);
  pass(`${key} can manage projects`);
  await expectDenied(`${key} cannot record financial transactions`, () => client.from("offerings").insert({ offering_date: new Date().toISOString().slice(0, 10), description: `${runtime.prefix}_${key.toLowerCase()}_income`, amount: 1, account_id: ids.cash, category_id: ids.incomeCategory, recorded_by: runtime.users[`demo-${key.toLowerCase()}`].id, church_id: runtime.ids.demoChurch }).select());
}
await expectDenied("Viewer cannot record financial transactions", () => demoViewer.from("offerings").insert({ offering_date: new Date().toISOString().slice(0, 10), description: `${runtime.prefix}_viewer_income`, amount: 1, account_id: ids.cash, category_id: ids.incomeCategory, recorded_by: runtime.users["demo-viewer"].id, church_id: runtime.ids.demoChurch }).select());
await expectDenied("Viewer cannot manage projects", () => demoViewer.from("projects").insert({ name: `${runtime.prefix}_viewer_project`, status: "Active", created_by: runtime.users["demo-viewer"].id, church_id: runtime.ids.demoChurch }).select());

assert.equal((await rows(platformOwner, "churches")).length, 2);
assert.equal((await rows(platformOwner, "accounts")).length, 0);
assert.equal((await rows(noMembership, "churches")).length, 0);
assert.equal((await rows(noMembership, "accounts")).length, 0);
pass("Platform Owner and no-membership users receive no automatic financial access");

assert.equal((await rows(demoAdmin, "access_requests", query => query.eq("id", ids.request))).length, 1);
assert.equal((await rows(emmanuelAdmin, "access_requests", query => query.eq("id", ids.request))).length, 0);
assert.ok((await rows(demoAdmin, "audit_logs", query => query.eq("church_id", runtime.ids.demoChurch))).length > 0);
assert.equal((await rows(emmanuelAdmin, "audit_logs", query => query.eq("church_id", runtime.ids.demoChurch))).length, 0);
pass("Access requests and audit history remain tenant isolated");

const offerings = await rows(demoAdmin, "offerings", query => query.eq("church_id", runtime.ids.demoChurch));
const donations = await rows(demoAdmin, "donations", query => query.eq("church_id", runtime.ids.demoChurch));
const expenses = await rows(demoAdmin, "expenses", query => query.eq("church_id", runtime.ids.demoChurch));
const transfers = await rows(demoAdmin, "account_transfers", query => query.eq("church_id", runtime.ids.demoChurch));
const accounts = await rows(demoAdmin, "accounts", query => query.eq("church_id", runtime.ids.demoChurch));
const fixtureIncome = offerings.filter(item => item.description === `${runtime.prefix}_offering`).reduce((sum, item) => sum + Number(item.amount), 0)
  + donations.filter(item => item.description === `${runtime.prefix}_donation`).reduce((sum, item) => sum + Number(item.amount), 0);
const fixtureExpenses = expenses.filter(item => item.description === `${runtime.prefix}_expense`).reduce((sum, item) => sum + Number(item.amount), 0);
assert.equal(fixtureIncome, runtime.expected.income);
assert.equal(fixtureExpenses, runtime.expected.expenses);
assert.equal(transfers.filter(item => item.reference === `${runtime.prefix}_transfer`).reduce((sum, item) => sum + Number(item.amount), 0), 200);
const fixtureAccounts = accounts.filter(item => [ids.cash, ids.bank].includes(item.id));
assert.equal(fixtureAccounts.reduce((sum, item) => sum + Number(item.opening_balance), 0) + fixtureIncome - fixtureExpenses, runtime.expected.organizationBalance);
pass("Financial controls preserve transfer exclusion and tenant totals");

runtime.isolationResults = { completedAt: new Date().toISOString(), passed: results.length, results };
await saveJson(".phase6/isolation-results.json", runtime.isolationResults);
console.log(JSON.stringify(runtime.isolationResults, null, 2));
