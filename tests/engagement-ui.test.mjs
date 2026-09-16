import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

function setup(role = "Admin", churchId = "church-a", mode = "church") {
  const modules = new Map();
  function compile(name) {
    if (modules.has(name)) return modules.get(name);
    const code = ts.transpileModule(fs.readFileSync(new URL(`../src/components/engagement/${name}.tsx`, import.meta.url), "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const exports = {}; modules.set(name, exports);
    vm.runInNewContext(code, { exports, require: id => {
      if (id === "react") return React;
      if (id === "react/jsx-runtime") return jsx;
      if (id.endsWith(".css")) return {};
      if (id === "./EngagementMetricCard") return compile("EngagementMetricCard");
      if (id.endsWith("/ActiveChurchContext")) return { useActiveChurch: () => ({ activeChurch: churchId ? { id: churchId } : null, activeRole: role, workspaceMode: mode, scopeVersion: 1 }) };
      if (id.endsWith("/EmptyState")) return { EmptyState: ({ title, description }) => React.createElement("div", null, title, description) };
      if (id.endsWith("/LoadingSkeleton")) return { LoadingSkeleton: ({ label }) => React.createElement("div", { role: "status" }, label) };
      if (id.endsWith("/engagement")) return { loadEngagementSummary: () => { throw new Error("Unexpected SSR service request"); } };
      throw new Error(`Unexpected dependency: ${id}`);
    } });
    return exports;
  }
  return { ...compile("EngagementDashboard"), ...compile("EngagementMetricCard") };
}
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));

test("engagement preserves ministry read access for all active church roles", () => {
  for (const role of ["Admin", "Pastor", "Secretary", "Treasurer", "Encoder", "Viewer"]) {
    const html = render(setup(role).EngagementDashboard, { churchId: "church-a" });
    assert.match(html, /Loading engagement insights/);
    assert.match(html, /aria-busy="true"/);
    assert.match(html, /disabled=""[^>]*>Refresh engagement/);
    assert.doesNotMatch(html, />(?:Create|Edit|Delete|Publish)/);
  }
});

test("engagement refuses absent, mismatched and platform church scopes", () => {
  for (const [role, church, mode, prop = "church-a"] of [[null, "church-a", "church"], ["Admin", null, "church"], ["Admin", "church-b", "church"], ["Admin", "church-a", "platform"], ["Admin", "church-a", "church", " "]]) {
    const html = render(setup(role, church, mode).EngagementDashboard, { churchId: prop });
    assert.match(html, /Choose a church workspace/);
    assert.doesNotMatch(html, /Loading engagement|Refresh engagement|Engagement metrics/);
  }
});

test("metric cards have accessible headings, preserve zero and escape text", () => {
  const { EngagementMetricCard } = setup();
  const html = render(EngagementMetricCard, { label: "Members", value: 0, description: "<script>example</script>" });
  const id = /aria-labelledby="([^"]+)"/.exec(html)[1];
  assert.ok(html.includes(`id="${id}">Members</h3>`));
  assert.match(html, /<strong>0<\/strong>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(render(EngagementMetricCard, { label: "Attendance", value: "No records", description: "No attendance" }), /<strong>No records<\/strong>/);
});
