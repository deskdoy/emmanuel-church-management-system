import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Users module is Admin-only and never deletes users", () => {
  const page=read("app/page.tsx"),view=read("src/components/UsersView.tsx"),service=read("src/services/users.ts");
  assert.match(page,/view === "users" && isChurchAdmin/);
  assert.match(page,/isChurchAdmin[^\n]+"Users"/);
  assert.match(view,/Users are never deleted/);
  assert.doesNotMatch(service,/\.delete\(/);
  assert.doesNotMatch(view,/Delete user|Remove user/);
});

test("self-demotion and self-disable are rejected in UI and service", () => {
  const view=read("src/components/UsersView.tsx"),service=read("src/services/users.ts");
  assert.match(view,/const self=user\.id===currentUserId/);
  assert.match(view,/disabled=\{self\|\|!!savingId\}/);
  assert.match(service,/update\.userId===authData\.user\.id&&roleResult\.data\.name!=="Admin"/);
  assert.match(service,/You cannot remove your own Church Admin role/);
  assert.match(service,/update\.userId===authData\.user\.id&&!update\.isActive/);
  assert.match(service,/You cannot deactivate your own church membership/);
});

test("user access updates are church-membership based and server authorized", () => {
  const service=read("src/services/users.ts"),migration=read("supabase/migrations/20260829062622_phase_5d_stage4_membership_management.sql");
  assert.match(service,/from\("church_memberships"\)/);
  assert.match(service,/from\("roles"\)\.select/);
  assert.match(service,/rpc\("update_church_membership_access"/);
  assert.doesNotMatch(service,/from\("users"\)\.update|service_role|auth\.admin/);
  assert.match(migration,/private\.has_church_role\(p_church_id,array\['Admin'\]\)/);
  assert.match(migration,/Every church must retain at least one active Church Admin/);
  assert.doesNotMatch(migration,/create policy|alter policy|drop policy/);
});

test("Projects module is structured for future fundraising progress", () => {
  const view=read("src/components/ProjectsView.tsx"),service=read("src/services/projects.ts"),types=read("src/types.ts");
  assert.match(types,/interface ProjectFundingProgress/);
  for(const field of ["goalAmount","currentAmountRaised","progressPercentage","targetDate"])assert.match(types,new RegExp(field));
  assert.match(view,/function ProjectProgress/);
  assert.match(service,/funding:\{goalAmount:null,currentAmountRaised:null,progressPercentage:null,targetDate:null\}/);
  assert.doesNotMatch(service,/\.delete\(/);
});
