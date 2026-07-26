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

test("diagnostic evidence records the redesigned pos and end shape", () => {
  assert.equal(probe.capabilities.locatedSyntaxDiagnostics, true);
  assert.equal(probe.capabilities.legacyDiagnosticShape, false);
  assert.equal(probe.capabilities.normalizedSyntaxDiagnostics, true);
  assert.match(
    evidence.diagnostics,
    /issues\/4745#issuecomment-5081879077/,
  );
  assert.match(evidence.diagnostics, /Diagnostic interface was intentionally redesigned/);
  assert.match(evidence.diagnostics, /`pos` \| `start`/);
  assert.match(evidence.diagnostics, /`end` \| `start \+ length`/);
  assert.match(evidence.diagnostics, /adapters\/native-diagnostic\.mjs/);
  assert.match(evidence.diagnostics, /Location data: available/);
});

test("both upstream documents contain self-contained reproductions", () => {
  for (const document of [evidence.bom, evidence.diagnostics]) {
    assert.match(document, /@typescript\/native-preview@latest/);
    assert.match(document, /createVirtualFileSystem/);
    assert.match(document, /api\.updateSnapshot/);
    assert.match(document, /api\.close\(\)/);
  }
});
