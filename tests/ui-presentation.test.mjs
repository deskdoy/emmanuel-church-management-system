import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("church branding and professional authentication welcome are present",()=>{
  const shell=read("src/auth/AuthShell.tsx"),brand=read("src/components/ui/ChurchBrand.tsx"),login=read("src/auth/ProtectedRoute.tsx");
  assert.match(brand,/Church logo placeholder/);
  assert.match(brand,/Emmanuel Church/);
  assert.match(shell,/Faithful finances/);
  assert.match(shell,/Stewardship with clarity/);
  assert.match(login,/<AuthShell>/);
});

test("the signed-in user is represented by name, role, and initials",()=>{
  const page=read("app/page.tsx"),profile=read("src/components/ui/UserProfileIndicator.tsx");
  assert.match(profile,/initials/);
  assert.match(profile,/name\|\|email/);
  assert.match(profile,/\{role\}/);
  assert.match(page,/UserProfileIndicator/);
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
  assert.match(dashboard,/Your financial story starts here/);
  assert.match(page,/Set up your first account/);
  assert.match(users,/No approved users yet/);
});

test("print reports remain isolated from interactive UI",()=>{
  const reports=read("src/components/ReportsView.tsx"),css=read("src/styles/primitives.css");
  assert.match(reports,/report-commandbar no-print/);
  assert.match(css,/@media print/);
  assert.match(css,/\.report-output>\.report-sheet \{[^}]*box-shadow:none!important/);
});
