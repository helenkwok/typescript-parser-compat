import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import ts6 from "typescript6";
import * as nativeAst from "@typescript/native-preview/unstable/ast";

const basicText = await readFile(new URL("../fixtures/basic.ts", import.meta.url), "utf8");
const jsxText = await readFile(new URL("../fixtures/jsx.tsx", import.meta.url), "utf8");

function collectKinds(ts, sourceFile) {
  const kinds = [];
  const visit = (node) => {
    kinds.push(ts.SyntaxKind[node.kind] ?? String(node.kind));
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return kinds;
}

test("TypeScript 6 parses source text without a project", () => {
  const sourceFile = ts6.createSourceFile(
    "basic.ts",
    basicText,
    ts6.ScriptTarget.Latest,
    true,
    ts6.ScriptKind.TS,
  );

  assert.equal(sourceFile.getFullText(), basicText);
  assert.equal(sourceFile.parseDiagnostics.length, 0);
  assert.ok(collectKinds(ts6, sourceFile).includes("InterfaceDeclaration"));
  assert.ok(collectKinds(ts6, sourceFile).includes("SatisfiesExpression"));
});

test("TypeScript 6 preserves JSX syntax and parent links", () => {
  const sourceFile = ts6.createSourceFile(
    "jsx.tsx",
    jsxText,
    ts6.ScriptTarget.Latest,
    true,
    ts6.ScriptKind.TSX,
  );

  assert.equal(sourceFile.parseDiagnostics.length, 0);
  const kinds = collectKinds(ts6, sourceFile);
  assert.ok(kinds.includes("JsxElement"));
  assert.ok(sourceFile.statements[1].parent === sourceFile);
});

test("native preview exposes AST traversal primitives", () => {
  assert.equal(typeof nativeAst.SyntaxKind, "object");
  assert.equal(typeof nativeAst.forEachChild, "function");
});

test("native preview advertises a direct source-text parser when one exists", () => {
  const candidates = Object.keys(nativeAst).filter((name) =>
    /^(createSourceFile|parse|parseSourceFile|sourceFileFromText)$/i.test(name),
  );

  assert.ok(
    candidates.length > 0,
    "No direct source-text parser is exported from unstable/ast yet",
  );
});
