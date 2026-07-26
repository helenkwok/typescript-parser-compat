import assert from "node:assert/strict";
import test from "node:test";

import * as nativeAst from "@typescript/native-preview/unstable/ast";
import tsNext from "typescript";
import ts6 from "typescript6";

import { runNativeProjectProbe } from "../scripts/native-project-probe.mjs";
import {
  evaluateTypescriptEstreeApiInventory,
  loadTypescriptEstreeApiInventory,
} from "../scripts/typescript-estree-api.mjs";

const inventory = await loadTypescriptEstreeApiInventory();
const nativeProjectProbe = await runNativeProjectProbe();
const result = evaluateTypescriptEstreeApiInventory(inventory, {
  ts6,
  tsNext,
  nativeAst,
  nativeProjectProbe,
});

function byId(id) {
  const requirement = result.requirements.find((item) => item.id === id);
  assert.ok(requirement, `Missing inventory requirement: ${id}`);
  return requirement;
}

test("typescript-estree API inventory is unique and source-pinned", () => {
  assert.equal(inventory.schemaVersion, 1);
  assert.equal(
    inventory.inventory,
    "typescript-estree-projectless-parser-api",
  );
  assert.match(inventory.upstream.commit, /^[0-9a-f]{40}$/);
  assert.ok(inventory.upstream.sourceFiles.length >= 8);

  const ids = inventory.requirements.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const requirement of inventory.requirements) {
    assert.match(requirement.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(requirement.requirement.length > 0);
    assert.ok(requirement.evidence.length > 0);
    assert.ok(
      [
        "module-path",
        "module-members",
        "project-surface",
        "project-capability",
      ].includes(requirement.probe.type),
    );
  }
});

test("TypeScript 6 satisfies the required parser inventory", () => {
  assert.equal(
    result.summary.typescript6Available,
    result.summary.requiredRequirements,
  );

  for (const requirement of result.requirements.filter((item) => item.required)) {
    assert.ok(
      ["available", "verified"].includes(
        requirement.availability.typescript6.status,
      ),
      `TypeScript 6 reference missing ${requirement.id}`,
    );
  }
});

test("inventory separates package-root, unstable, and project-backed APIs", () => {
  const sourceFile = byId("source-file-instance");
  const node = byId("node-instance");

  assert.equal(sourceFile.availability.typescriptNextRoot.status, "not-applicable");
  assert.equal(sourceFile.availability.nativeAst.status, "not-applicable");
  assert.notEqual(sourceFile.availability.nativeProject.status, "not-applicable");

  assert.equal(node.availability.typescriptNextRoot.status, "not-applicable");
  assert.equal(node.availability.nativeAst.status, "not-applicable");
  assert.notEqual(node.availability.nativeProject.status, "not-applicable");
});

test("known native diagnostic location gap remains explicit", () => {
  const diagnostics = byId("located-parse-diagnostics");
  assert.equal(diagnostics.availability.typescript6.status, "verified");
  assert.equal(diagnostics.availability.nativeProject.status, "incompatible");
  assert.equal(diagnostics.nativeClassification, "incompatible");
});

test("module-load Extension dependency is inventoried separately", () => {
  const extension = byId("extension-enum");
  assert.equal(extension.layer, "module-load");
  assert.equal(extension.required, true);
  assert.deepEqual(extension.probe.members, [
    "Cjs",
    "Cts",
    "Dcts",
    "Dmts",
    "Dts",
    "Js",
    "Json",
    "Jsx",
    "Mjs",
    "Mts",
    "Ts",
    "Tsx",
  ]);
});
