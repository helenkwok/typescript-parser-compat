import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import ts6 from "typescript6";
import * as nativeAst from "@typescript/native-preview/unstable/ast";

import { runNativeParserCandidateProbe } from "../scripts/native-parser-candidates.mjs";

async function readFixture(name) {
  return readFile(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
}

const [
  basicText,
  tsxText,
  bomText,
  commentsText,
  invalidText,
  javascriptText,
  jsxText,
  decoratorsText,
] = await Promise.all([
  readFixture("basic.ts"),
  readFixture("jsx.tsx"),
  readFixture("bom.ts"),
  readFixture("comments.ts"),
  readFixture("invalid.ts"),
  readFixture("plain.js"),
  readFixture("jsx.jsx"),
  readFixture("decorators.ts"),
]);

function parse(fileName, text, scriptKind) {
  return ts6.createSourceFile(
    fileName,
    text,
    ts6.ScriptTarget.Latest,
    true,
    scriptKind,
  );
}

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
  const sourceFile = parse("basic.ts", basicText, ts6.ScriptKind.TS);

  assert.equal(sourceFile.getFullText(), basicText);
  assert.equal(sourceFile.parseDiagnostics.length, 0);
  assert.ok(collectKinds(ts6, sourceFile).includes("InterfaceDeclaration"));
  assert.ok(collectKinds(ts6, sourceFile).includes("SatisfiesExpression"));
});

test("TypeScript 6 preserves TSX syntax and parent links", () => {
  const sourceFile = parse("jsx.tsx", tsxText, ts6.ScriptKind.TSX);

  assert.equal(sourceFile.parseDiagnostics.length, 0);
  const kinds = collectKinds(ts6, sourceFile);
  assert.ok(kinds.includes("JsxElement"));
  assert.ok(sourceFile.statements[1].parent === sourceFile);
});

test("TypeScript 6 preserves BOM text and UTF-16 offsets", () => {
  assert.equal(bomText.charCodeAt(0), 0xfeff);

  const sourceFile = parse("bom.ts", bomText, ts6.ScriptKind.TS);
  const statement = sourceFile.statements[0];

  assert.equal(sourceFile.text, bomText);
  assert.equal(sourceFile.getFullText(), bomText);
  assert.equal(statement.getFullStart(), 0);
  assert.equal(statement.getStart(sourceFile), 1);
  assert.equal(
    sourceFile.text.slice(statement.getStart(sourceFile), statement.getEnd()),
    "export const bomValue = 1;",
  );
});

test("TypeScript 6 preserves comments and exposes comment trivia to the scanner", () => {
  const sourceFile = parse("comments.ts", commentsText, ts6.ScriptKind.TS);
  assert.equal(sourceFile.getFullText(), commentsText);
  assert.equal(sourceFile.parseDiagnostics.length, 0);

  const scanner = ts6.createScanner(
    ts6.ScriptTarget.Latest,
    false,
    ts6.LanguageVariant.Standard,
    commentsText,
  );
  const kinds = [];
  let token;
  do {
    token = scanner.scan();
    kinds.push(token);
  } while (token !== ts6.SyntaxKind.EndOfFileToken);

  assert.equal(
    kinds.filter((kind) => kind === ts6.SyntaxKind.SingleLineCommentTrivia).length,
    2,
  );
  assert.ok(kinds.includes(ts6.SyntaxKind.MultiLineCommentTrivia));
});

test("TypeScript 6 returns located syntax diagnostics", () => {
  const sourceFile = parse("invalid.ts", invalidText, ts6.ScriptKind.TS);
  assert.ok(sourceFile.parseDiagnostics.length > 0);

  const diagnostic = sourceFile.parseDiagnostics[0];
  assert.equal(typeof diagnostic.code, "number");
  assert.equal(typeof diagnostic.start, "number");
  assert.ok(diagnostic.length > 0);
});

test("TypeScript 6 selects JavaScript syntax without a project", () => {
  const sourceFile = parse("plain.js", javascriptText, ts6.ScriptKind.JS);
  const kinds = collectKinds(ts6, sourceFile);

  assert.equal(sourceFile.scriptKind, ts6.ScriptKind.JS);
  assert.equal(sourceFile.parseDiagnostics.length, 0);
  assert.ok(kinds.includes("FunctionDeclaration"));
  assert.ok(kinds.includes("BinaryExpression"));
});

test("TypeScript 6 selects JSX syntax independently of TSX", () => {
  const sourceFile = parse("jsx.jsx", jsxText, ts6.ScriptKind.JSX);
  const kinds = collectKinds(ts6, sourceFile);

  assert.equal(sourceFile.scriptKind, ts6.ScriptKind.JSX);
  assert.equal(sourceFile.parseDiagnostics.length, 0);
  assert.ok(kinds.includes("JsxElement"));
  assert.ok(!kinds.includes("TypeAliasDeclaration"));
});

test("TypeScript 6 parses decorator syntax", () => {
  const sourceFile = parse("decorators.ts", decoratorsText, ts6.ScriptKind.TS);
  const kinds = collectKinds(ts6, sourceFile);

  assert.equal(sourceFile.parseDiagnostics.length, 0);
  assert.ok(kinds.includes("Decorator"));
  assert.ok(kinds.includes("ClassDeclaration"));
});

test("native preview exposes AST utility primitives", () => {
  assert.equal(typeof nativeAst.SyntaxKind, "object");
  assert.equal(typeof nativeAst.createScanner, "function");
  assert.equal(typeof nativeAst.visitNode, "function");
  assert.equal(typeof nativeAst.getTokenAtPosition, "function");
});

test("native isolated parser candidates are absent or contract-tested", async () => {
  const probe = await runNativeParserCandidateProbe();

  if (probe.status === "absent") {
    assert.deepEqual(probe.candidates, []);
    assert.equal(probe.capabilities["source-text-entry-point"], false);
    return;
  }

  assert.ok(probe.candidates.length > 0);
  assert.ok(
    probe.reports.length > 0,
    "Detected parser candidates must produce executable fixture reports",
  );
  assert.equal(
    probe.status,
    "ready",
    `Native isolated parser candidate(s) appeared but did not satisfy the full contract: ${JSON.stringify(probe.reports, null, 2)}`,
  );
});
