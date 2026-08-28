import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Users module is Admin-only and never deletes users", () => {
  const page=read("app/page.tsx"),view=read("src/components/UsersView.tsx"),service=read("src/services/users.ts");
  assert.match(page,/view === "users" && profile\?\.role === "Admin"/);
  assert.match(page,/profile\?\.role === "Admin"[^\n]+"Users"/);
  assert.match(view,/Users are never deleted/);
  assert.doesNotMatch(service,/\.delete\(/);
  assert.doesNotMatch(view,/Delete user|Remove user/);
});

test("self-demotion and self-disable are rejected in UI and service", () => {
  const view=read("src/components/UsersView.tsx"),service=read("src/services/users.ts");
  assert.match(view,/const self=user\.id===currentUserId/);
  assert.match(view,/disabled=\{self\|\|!!savingId\}/);
  assert.match(service,/update\.userId===authData\.user\.id&&roleResult\.data\.name!=="Admin"/);
  assert.match(service,/You cannot remove your own Admin role/);
  assert.match(service,/update\.userId===authData\.user\.id&&!update\.isActive/);
  assert.match(service,/You cannot disable your own account/);
});

test("user access updates rely on existing users and roles tables", () => {
  const service=read("src/services/users.ts"),security=read("supabase/migrations/20260827041433_security_policies_and_auditing.sql");
  assert.match(service,/from\("users"\)\.update\(\{role_id:update\.roleId,is_active:update\.isActive\}\)/);
  assert.match(service,/from\("roles"\)\.select/);
  assert.doesNotMatch(service,/service_role|functions\.invoke|auth\.admin/);
  assert.match(security,/create policy users_admin_update/);
  assert.match(security,/create trigger audit_users/);
});

test("Projects module is structured for future fundraising progress", () => {
  const view=read("src/components/ProjectsView.tsx"),service=read("src/services/projects.ts"),types=read("src/types.ts");
  assert.match(types,/interface ProjectFundingProgress/);
  for(const field of ["goalAmount","currentAmountRaised","progressPercentage","targetDate"])assert.match(types,new RegExp(field));
  assert.match(view,/function ProjectProgress/);
  assert.match(service,/funding:\{goalAmount:null,currentAmountRaised:null,progressPercentage:null,targetDate:null\}/);
  assert.doesNotMatch(service,/\.delete\(/);
});
