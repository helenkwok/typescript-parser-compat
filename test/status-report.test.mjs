import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { primaryNativeSurface } from "../scripts/native-package-surfaces.mjs";

import {
  evaluateCapabilityContract,
  loadCapabilityContract,
} from "../scripts/capabilities.mjs";
import { runNativeParserCandidateProbes } from "../scripts/native-parser-candidates.mjs";
import { runNativeProjectProbe } from "../scripts/native-project-probe.mjs";
import { renderCompatibilityStatus } from "../scripts/status.mjs";

const contract = await loadCapabilityContract();
const nativeParserCandidateProbe = await runNativeParserCandidateProbes();
const capabilityMatrix = evaluateCapabilityContract(
  contract,
  primaryNativeSurface.nativeAstModule,
  nativeParserCandidateProbe,
);
const nativeProjectProbe = await runNativeProjectProbe();
const renderedStatus = renderCompatibilityStatus({
  capabilityMatrix,
  nativeProjectProbe,
});
const committedStatus = await readFile(
  new URL("../STATUS.md", import.meta.url),
  "utf8",
);

test("committed compatibility status matches the executable contract", () => {
  assert.equal(committedStatus, renderedStatus);
});

test("human-readable status lists every capability", () => {
  for (const capability of capabilityMatrix.capabilities) {
    assert.ok(
      renderedStatus.includes(`| \`${capability.id}\` |`),
      `STATUS.md is missing capability ${capability.id}`,
    );
  }
});
