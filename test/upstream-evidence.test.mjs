import assert from "node:assert/strict";
import test from "node:test";

import { runNativeProjectProbe } from "../scripts/native-project-probe.mjs";
import { renderUpstreamEvidence } from "../scripts/upstream-evidence.mjs";

const probe = await runNativeProjectProbe();
const evidence = renderUpstreamEvidence(probe);

test("BOM evidence maps to the existing upstream tracker", () => {
  assert.equal(probe.capabilities.bomConsistency, false);
  assert.match(
    evidence.bom,
    /https:\/\/github\.com\/microsoft\/typescript-go\/issues\/4521/,
  );
  assert.match(evidence.bom, /SourceFile\.text` starts with BOM \| `false`/);
  assert.match(evidence.bom, /SourceFile\.getFullText\(\)` starts with BOM \| `false`/);
  assert.match(evidence.bom, /Statement start \| `0`/);
  assert.match(evidence.bom, /Statement end \| `27`/);
});

test("diagnostic evidence is ready to use as an upstream issue draft", () => {
  assert.equal(probe.capabilities.locatedSyntaxDiagnostics, false);
  assert.match(evidence.diagnostics, /Before filing, search the current/);
  assert.match(evidence.diagnostics, /Program\.getSyntacticDiagnostics/);
  assert.match(evidence.diagnostics, /`code` \| `1110`/);
  assert.match(evidence.diagnostics, /`start` \| `undefined`/);
  assert.match(evidence.diagnostics, /`length` \| `undefined`/);
  assert.match(evidence.diagnostics, /Downstream impact/);
});

test("both upstream documents contain self-contained reproductions", () => {
  for (const document of [evidence.bom, evidence.diagnostics]) {
    assert.match(document, /@typescript\/native-preview@latest/);
    assert.match(document, /createVirtualFileSystem/);
    assert.match(document, /api\.updateSnapshot/);
    assert.match(document, /api\.close\(\)/);
  }
});
