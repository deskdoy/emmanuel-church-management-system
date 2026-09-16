import assert from "node:assert/strict";
import ts from "typescript";

export function assertLazyViewImport(source, name, path) {
  const file = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const statics = file.statements.filter(ts.isImportDeclaration);
  assert.equal(statics.some(node => node.moduleSpecifier.text === path), false, `${name} must not be eagerly imported`);
  const declaration = file.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(file) === name);
  assert.ok(declaration, `${name} must have a stable module-scope declaration`);
  const call = declaration.initializer;
  assert.ok(call && ts.isCallExpression(call) && call.expression.getText(file) === "lazy", `${name} must use React lazy`);
  let imports = [], exports = [];
  function walk(node) {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) imports.push(node.arguments[0]?.text);
    if (ts.isPropertyAssignment(node) && node.name.getText(file) === "default") exports.push(node.initializer.getText(file));
    ts.forEachChild(node, walk);
  }
  walk(call);
  assert.deepEqual(imports, [path]);
  assert.deepEqual(exports, [`module.${name}`], `${name} must adapt its named export`);
}
