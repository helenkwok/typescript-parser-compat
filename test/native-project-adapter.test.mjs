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

test("project-backed native diagnostic locations remain missing until fixed upstream", () => {
  assert.equal(
    result.capabilities.locatedSyntaxDiagnostics,
    false,
    "Diagnostic behavior changed: update the capability evidence if native syntactic diagnostics now expose start and length",
  );
  assert.equal(typeof result.observations.firstSyntaxDiagnostic?.code, "number");
  assert.equal(result.observations.firstSyntaxDiagnostic?.start, undefined);
  assert.equal(result.observations.firstSyntaxDiagnostic?.length, undefined);
});

test("project-backed native BOM mismatch remains visible until fixed upstream", () => {
  assert.equal(
    result.capabilities.bomConsistency,
    false,
    "BOM behavior changed: update the capability evidence and remove this sentinel if the native API now preserves aligned BOM text",
  );
  assert.equal(result.observations.bom.sourceStartsWithBom, true);
});
