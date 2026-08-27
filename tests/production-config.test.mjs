import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("production build uses Vite and Supabase", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.match(pkg.scripts.build, /vite build/);
  assert.equal(pkg.dependencies["@supabase/supabase-js"], "2.112.4");
  assert.equal(pkg.dependencies.express, undefined);
});

test("deployment inputs are committed", () => {
  assert.match(read(".env.example"), /VITE_SUPABASE_URL=/);
  assert.match(read(".env.example"), /VITE_SUPABASE_ANON_KEY=/);
  assert.equal(fs.existsSync(new URL("../vercel.json", import.meta.url)), true);
  const migrations = fs.readdirSync(new URL("../supabase/migrations", import.meta.url));
  assert.ok(migrations.length >= 3);
  const schema = migrations.map(name => read(`supabase/migrations/${name}`)).join("\n");
  for (const table of ["users","roles","members","attendance","offerings","donations","expenses","projects","announcements","events","reports","audit_logs","payable_payments","access_requests"]) {
    assert.match(schema, new RegExp(`create table public\\.${table}\\b`, "i"));
    assert.match(schema, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
});

test("legacy local persistence and Express entry point are absent", () => {
  assert.equal(fs.existsSync(new URL("../server.ts", import.meta.url)), false);
  const app = read("app/page.tsx");
  assert.doesNotMatch(app, /localStorage|sessionStorage|\/api\/cashflow/);
});

test("privileged invitation keys stay outside the Vite application", () => {
  const frontend = ["app/page.tsx", ...fs.readdirSync(new URL("../src", import.meta.url), { recursive:true })
    .filter(name => /\.(ts|tsx)$/.test(String(name))).map(name => `src/${String(name).replaceAll("\\", "/")}`)]
    .map(read).join("\n");
  assert.doesNotMatch(frontend, /SERVICE_ROLE|SECRET_KEY|serviceRoleKey/);
  const edgeFunction = read("supabase/functions/manage-access-request/index.ts");
  assert.match(edgeFunction, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edgeFunction, /auth\.admin\.inviteUserByEmail/);
});
