import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { assertLazyViewImport } from "./helpers/lazy-views.mjs";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("large feature views use stable lazy imports with their existing named exports", () => {
  const page = read("app/page.tsx");
  const modules = { BudgetView: "budgets/", EngagementDashboard: "engagement/", FamilyView: "families/", AttendanceView: "attendance/", EventView: "events/", AnnouncementView: "announcements/",
    MembersView: "", ProjectsView: "", ReportsView: "", AuditLogsView: "", BackupCenterView: "", SystemInformationView: "", UsersView: "", PlatformAdministrationView: "", SettingsView: "", FinancialApprovalView: "" };
  for (const [name, directory] of Object.entries(modules)) assertLazyViewImport(page, name, `../src/components/${directory}${name}`);
});

test("shared view fallback announces loading and keeps existing skeleton styling", () => {
  const modules = new Map();
  function compile(name) {
    if (modules.has(name)) return modules.get(name);
    const code = ts.transpileModule(read(`src/components/ui/${name}.tsx`), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const exports = {}; modules.set(name, exports);
    vm.runInNewContext(code, { exports, require: id => {
      if (id === "react/jsx-runtime") return jsx;
      if (id === "./LoadingSkeleton") return compile("LoadingSkeleton");
      throw new Error(`Unexpected dependency ${id}`);
    } });
    return exports;
  }
  const { ViewLoadingFallback } = compile("ViewLoadingFallback");
  const html = renderToStaticMarkup(React.createElement(ViewLoadingFallback, { label: "Loading Budget Planning" }));
  assert.match(html, /class="panel"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /role="status" aria-label="Loading Budget Planning"/);
  assert.match(renderToStaticMarkup(React.createElement(ViewLoadingFallback)), /Loading view/);
});
