import assert from "node:assert/strict";
import test from "node:test";

import { runNativeProjectProbe } from "../scripts/native-project-probe.mjs";

const result = await runNativeProjectProbe();

test("native preview can expose fixture ASTs through a virtual project", () => {
  assert.equal(result.available, true);
  assert.equal(result.mode, "project-backed");
  assert.equal(result.requiresProject, true);
  assert.equal(result.requiresTsconfig, true);
  assert.equal(result.sourceFilesLoaded.length, 8);
});

test("project-backed native AST covers core syntax fixtures", () => {
  assert.equal(result.capabilities.basicAst, true);
  assert.equal(result.capabilities.tsxAst, true);
  assert.equal(result.capabilities.javascriptAst, true);
  assert.equal(result.capabilities.jsxAst, true);
  assert.equal(result.capabilities.modernSyntax, true);
});

test("project-backed native AST preserves ordinary source text and parent links", () => {
  assert.equal(result.capabilities.sourceTextPreserved, true);
  assert.equal(result.capabilities.parentLinksAndTraversal, true);
});

test("project-backed native diagnostics expose pos and end locations", () => {
  assert.equal(result.capabilities.locatedSyntaxDiagnostics, true);
  assert.equal(typeof result.observations.firstSyntaxDiagnostic?.raw.code, "number");
  assert.equal(typeof result.observations.firstSyntaxDiagnostic?.raw.pos, "number");
  assert.equal(typeof result.observations.firstSyntaxDiagnostic?.raw.end, "number");
  assert.ok(
    result.observations.firstSyntaxDiagnostic.raw.end >=
      result.observations.firstSyntaxDiagnostic.raw.pos,
  );
});

test("native diagnostics can be normalized to TypeScript-style start and length", () => {
  assert.equal(result.capabilities.legacyDiagnosticShape, false);
  assert.equal(result.capabilities.normalizedSyntaxDiagnostics, true);

  const { raw, normalized } = result.observations.firstSyntaxDiagnostic;
  assert.equal(normalized.start, raw.pos);
  assert.equal(normalized.length, raw.end - raw.pos);
  assert.equal(normalized.fileName, raw.fileName);
  assert.equal(normalized.messageText, raw.text);
});

test("project-backed native BOM mismatch remains visible until fixed upstream", () => {
  assert.equal(
    result.capabilities.bomConsistency,
    false,
    "BOM behavior changed: update the capability evidence and remove this sentinel if the native API now preserves aligned BOM text",
  );
  assert.equal(result.observations.bom.sourceStartsWithBom, true);
});
