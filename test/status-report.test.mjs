import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as nativeAst from "@typescript/native-preview/unstable/ast";

import {
  evaluateCapabilityContract,
  loadCapabilityContract,
} from "../scripts/capabilities.mjs";
import { runNativeProjectProbe } from "../scripts/native-project-probe.mjs";
import { renderCompatibilityStatus } from "../scripts/status.mjs";

const contract = await loadCapabilityContract();
const capabilityMatrix = evaluateCapabilityContract(contract, nativeAst);
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
