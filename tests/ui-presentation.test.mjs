import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("church branding and professional authentication welcome are present",()=>{
  const shell=read("src/auth/AuthShell.tsx"),brand=read("src/components/ui/ChurchBrand.tsx"),identity=read("src/branding.ts"),login=read("src/auth/ProtectedRoute.tsx");
  assert.match(brand,/Faithful Steward logo placeholder/);
  assert.match(brand,/BRAND\.productName/);
  assert.match(identity,/productName: "FAITHFUL STEWARD"/);
  assert.match(identity,/subtitle: "Church Management & Financial Stewardship Platform"/);
  assert.match(shell,/Steward faithfully/);
  assert.match(shell,/Stewardship with clarity/);
  assert.match(login,/<AuthShell>/);
});

test("the signed-in user is represented by name, role, and initials",()=>{
  const page=read("app/page.tsx"),profile=read("src/components/ui/UserProfileIndicator.tsx");
  assert.match(profile,/initials/);
  assert.match(profile,/name\|\|email/);
  assert.match(profile,/\{role\}/);
  const sidebar=read("src/components/layout/Sidebar.tsx"),topbar=read("src/components/layout/Topbar.tsx");
  assert.match(page,/<Sidebar\b/);
  assert.match(page,/<Topbar\b/);
  for(const layout of [sidebar,topbar]){
    assert.match(layout,/<UserProfileIndicator\s+name=\{profile\.fullName\}\s+email=\{profile\.email\}\s+role=\{activeRole\}/);
  }
});

test("motion includes reduced-motion protection",()=>{
  const motion=read("src/styles/motion.css"),page=read("app/page.tsx");
  assert.match(page,/PageTransition key=\{view\} pageKey=\{view\}/);
  assert.match(motion,/@keyframes page-enter/);
  assert.match(motion,/@keyframes shimmer/);
  assert.match(motion,/@media\(prefers-reduced-motion:reduce\)/);
});

test("mobile tables and forms use responsive presentation",()=>{
  const css=read("src/styles/primitives.css"),page=read("app/page.tsx"),users=read("src/components/UsersView.tsx");
  assert.match(css,/\.responsive-table td:before/);
  assert.match(css,/\.modal-backdrop \{ align-items:end/);
  assert.match(page,/data-label="Amount"/);
  assert.match(users,/responsive-table/);
});

test("first-use loading and empty states are reusable",()=>{
  const dashboard=read("src/components/DashboardView.tsx"),page=read("app/page.tsx"),users=read("src/components/UsersView.tsx");
  assert.match(dashboard,/LoadingSkeleton/);
  assert.match(dashboard,/<FinancialTrendChart\b/);
  assert.match(read("src/components/dashboard/FinancialTrendChart.tsx"),/Your financial story starts here/);
  assert.match(page,/Set up your first account/);
  assert.match(users,/No church members yet/);
});

test("print reports remain isolated from interactive UI",()=>{
  const reports=read("src/components/ReportsView.tsx"),css=read("src/styles/primitives.css");
  assert.match(reports,/report-commandbar no-print/);
  assert.match(css,/@media print/);
  assert.match(css,/\.report-output>\.report-sheet \{[^}]*box-shadow:none!important/);
});
