import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import * as nativeAst from "@typescript/native-preview/unstable/ast";

import {
  evaluateCapabilityContract,
  loadCapabilityContract,
} from "../scripts/capabilities.mjs";

const allowedProbeTypes = new Set([
  "parser-entry-point",
  "parser-dependent",
  "parser-plus-exports",
]);

const parserContractSource = await readFile(
  new URL("./parser-contract.test.mjs", import.meta.url),
  "utf8",
);

function repoUrl(path) {
  return new URL(`../${path}`, import.meta.url);
}

test("capability contract is unique, complete, and traceable to tests", async () => {
  const contract = await loadCapabilityContract();

  assert.equal(contract.schemaVersion, 1);
  assert.equal(contract.contract, "projectless-source-text-parser");
  assert.ok(Array.isArray(contract.capabilities));
  assert.ok(contract.capabilities.length > 0);

  const ids = contract.capabilities.map((capability) => capability.id);
  assert.equal(new Set(ids).size, ids.length, "capability IDs must be unique");

  for (const capability of contract.capabilities) {
    assert.match(capability.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(capability.category.length > 0);
    assert.ok(capability.requirement.length > 0);
    assert.equal(capability.required, true);
    assert.ok(capability.referenceTests.length > 0);
    assert.ok(capability.fixtures.length > 0);
    assert.ok(allowedProbeTypes.has(capability.nativeProbe.type));

    for (const testName of capability.referenceTests) {
      assert.ok(
        parserContractSource.includes(`test("${testName}"`),
        `${capability.id} references missing test: ${testName}`,
      );
    }

    for (const fixture of capability.fixtures) {
      await access(repoUrl(fixture));
    }

    if (capability.nativeProbe.type === "parser-plus-exports") {
      assert.ok(capability.nativeProbe.exports.length > 0);
    }
  }
});

test("capability matrix separates the parser blocker from available utilities", async () => {
  const contract = await loadCapabilityContract();
  const matrix = evaluateCapabilityContract(contract, nativeAst);

  assert.equal(matrix.summary.requiredCapabilities, contract.capabilities.length);
  assert.equal(matrix.summary.referenceCovered, contract.capabilities.length);
  assert.equal(matrix.summary.parserEntryPointDetected, false);
  assert.equal(matrix.summary.nativeReady, 0);

  const byId = new Map(matrix.capabilities.map((item) => [item.id, item]));
  assert.equal(
    byId.get("source-text-entry-point").nativePreview.status,
    "missing",
  );
  assert.equal(
    byId.get("comments-and-token-scanning").nativePreview.status,
    "partial",
  );
  assert.equal(
    byId.get("parent-links-and-traversal").nativePreview.status,
    "partial",
  );
  assert.deepEqual(
    byId.get("comments-and-token-scanning").nativePreview.evidence
      .availableExports,
    ["createScanner"],
  );
});
