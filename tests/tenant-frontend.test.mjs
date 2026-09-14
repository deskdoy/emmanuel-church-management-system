import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("authorization comes from active church membership, not users.role_id",()=>{
  const auth=read("src/auth/AuthContext.tsx"),tenancy=read("src/services/tenancy.ts"),page=read("app/page.tsx");
  assert.match(tenancy,/from\("church_memberships"\)/);
  assert.match(tenancy,/from\("platform_user_roles"\)/);
  assert.doesNotMatch(auth,/roles\(name\)|role_id/);
  assert.match(page,/hasChurchRole\(activeRole,financeWriterRoles\)/);
  assert.doesNotMatch(page,/profile\?*\.role|profile\.role/);
});

test("tenant finance services require explicit church scope on reads and writes",()=>{
  const service=read("src/services/cashflow.ts");
  assert.match(service,/loadCashFlow\(\s*churchId\s*:\s*string\s*\)/);
  const source = ts.createSourceFile("cashflow.ts", service, ts.ScriptTarget.Latest, true);
  const loader = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "loadCashFlow");
  assert.ok(loader?.body, "loadCashFlow must have an implementation");
  const queries = [];
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "from") {
      const table = node.arguments[0];
      assert.ok(table && ts.isStringLiteral(table), "Cash flow reads must identify their table");
      // Inspect only this fluent query chain: a later query's filter cannot satisfy it.
      const calls = [];
      let call = node;
      while (ts.isPropertyAccessExpression(call.parent) && call.parent.expression === call && ts.isCallExpression(call.parent.parent)) {
        call = call.parent.parent;
        calls.push(call);
      }
      queries.push({ table: table.text, calls });
    }
    ts.forEachChild(node, visit);
  };
  visit(loader.body);
  for(const table of ["accounts","categories","offerings","donations","expenses","payables","payable_payments","account_transfers"]){
    const tableQueries = queries.filter(query => query.table === table);
    assert.ok(tableQueries.length > 0, `${table} must be loaded`);
    for (const query of tableQueries) {
      assert.ok(query.calls.some(call => call.expression.name.text === "select"), `${table} must be read`);
      assert.ok(query.calls.some(call => {
        const [column, value] = call.arguments;
        return call.expression.name.text === "eq" && column && ts.isStringLiteral(column) && column.text === "church_id" && value && ts.isIdentifier(value) && value.text === "churchId";
      }), `${table} must filter by the requested churchId`);
    }
  }
  assert.match(service,/church_id\s*:\s*churchId/);
  assert.match(service,/updateTransaction\(\s*churchId\s*:\s*string/);
  assert.match(service,/updateAccount\(\s*churchId\s*:\s*string/);
  assert.match(service,/eq\(\s*"id"\s*,\s*transaction\.id\s*\)\s*\.eq\(\s*"church_id"\s*,\s*churchId\s*\)/);
  assert.match(service,/eq\(\s*"id"\s*,\s*accountId\s*\)\s*\.eq\(\s*"church_id"\s*,\s*churchId\s*\)/);
});

test("projects, audit, reports, backups, and system counts stay church scoped",()=>{
  const projects=read("src/services/projects.ts"),audit=read("src/services/auditLogs.ts"),operations=read("src/services/operationalManagement.ts");
  assert.match(projects,/loadProjects\(churchId:string\)/);
  assert.match(projects,/church_id\s*:\s*churchId/);
  assert.match(projects,/eq\("id",project\.id\)\.eq\("church_id",churchId\)/);
  assert.match(audit,/eq\("church_id",churchId\)/);
  assert.match(operations,/requireAdmin\(churchId:string\)/);
  assert.match(operations,/from\("church_memberships"\)/);
  assert.match(operations,/church_id\s*:\s*churchId/);
  assert.match(operations,/eq\("church_id",churchId\)/);
  assert.doesNotMatch(operations,/from\("users"\)\.select\("id,roles\(name\)"/);
});

test("local storage contains only a church preference, never role authorization",()=>{
  const context=read("src/tenancy/ActiveChurchContext.tsx");
  assert.match(context,/faithful-steward\.active-church/);
  assert.doesNotMatch(context,/localStorage\.(getItem|setItem)\([^\n]*(role|permission|admin)/i);
});

test("church switching is visible in the desktop shell and mobile drawer",()=>{
  const page=read("app/page.tsx"),switcher=read("src/components/tenancy/ChurchWorkspaceSwitcher.tsx"),css=read("src/styles/primitives.css");
  assert.match(page,/<ChurchWorkspaceSwitcher onSwitched=/);
  assert.match(page,/<ChurchWorkspaceSwitcher compact\/>/);
  assert.match(page,/<ActiveChurchIdentity\/>/);
  assert.match(switcher,/activeMemberships\.length>1/);
  assert.match(switcher,/switchChurch\(event\.target\.value\)/);
  assert.match(css,/@media\(max-width:900px\)/);
  assert.match(css,/\.sidebar>\.church-workspace-switcher/);
});

test("church users and access requests are tenant scoped",()=>{
  const users=read("src/services/users.ts"),requests=read("src/services/accessRequests.ts"),edge=read("supabase/functions/manage-access-request/index.ts"),migration=read("supabase/migrations/20260829062622_phase_5d_stage4_membership_management.sql");
  assert.match(users,/from\("church_memberships"\)/);
  assert.match(users,/eq\("church_id",churchId\)/);
  assert.match(users,/rpc\("update_church_membership_access"/);
  assert.match(requests,/resolveChurchWorkspace/);
  assert.match(requests,/church_id: input\.churchId/);
  assert.match(requests,/eq\("church_id",churchId\)/);
  assert.match(edge,/eq\("church_id",body\.churchId\)/);
  assert.doesNotMatch(edge,/profile\.roles|relationName/);
  assert.match(migration,/You cannot remove your own Church Admin role/);
  assert.match(migration,/Every church must retain at least one active Church Admin/);
});

test("Platform Administration is owner-only and separate from church finance",()=>{
  const page=read("app/page.tsx"),gate=read("src/auth/WorkspaceGate.tsx"),view=read("src/components/PlatformAdministrationView.tsx"),service=read("src/services/platformAdministration.ts"),migration=read("supabase/migrations/20260829063600_phase_5d_stage5_platform_church_drafts.sql");
  assert.match(page,/isPlatformOwner&&workspaceMode==="platform"\?<PlatformAdministrationView\/>/);
  assert.match(gate,/isPlatformOwner&&workspaceMode==="platform"\)return children/);
  assert.match(view,/Platform Owner status does not grant access to any church.*finances/);
  assert.match(view,/Create inactive draft/);
  assert.match(service,/rpc\("create_platform_church_draft"/);
  assert.doesNotMatch(service,/service_role|SUPABASE_SERVICE|from\("offerings"\)|from\("expenses"\)/);
  assert.match(migration,/private\.is_platform_owner\(\)/);
  assert.match(migration,/'inactive'/);
  assert.doesNotMatch(migration,/insert into public\.church_memberships|create policy|alter policy|drop policy/);
});
