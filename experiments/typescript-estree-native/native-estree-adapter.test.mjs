import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { withNativeProject } from "../../adapters/native-project.mjs";
import {
  createAdapterInstrumentation,
  createDeepAdapter,
} from "./native-estree-adapter.mjs";

const basicText = await readFile(
  new URL("../../fixtures/basic.ts", import.meta.url),
  "utf8",
);

function withAdaptedBasic(callback) {
  const fileName = "/fixtures/basic.ts";
  return withNativeProject({ [fileName]: basicText }, ({ project, getSourceFile }) => {
    const sourceFile = getSourceFile(fileName);
    const diagnostics = project.program.getSyntacticDiagnostics(fileName);
    const instrumentation = createAdapterInstrumentation();
    const adapted = createDeepAdapter(sourceFile, diagnostics, getSourceFile, {
      structural: true,
      instrumentation,
    });
    return callback({ adapted, instrumentation });
  });
}

test("structural child traversal is computed once per node", () => {
  withAdaptedBasic(({ adapted, instrumentation }) => {
    const first = adapted.getChildren();
    const computations = instrumentation.getChildrenComputations;
    const scannerCreations = instrumentation.scannerCreations;

    assert.strictEqual(adapted.getChildren(), first);
    assert.equal(adapted.getChildCount(), first.length);
    assert.ok(first.length > 0);
    assert.strictEqual(adapted.getChildAt(0), first[0]);

    assert.equal(instrumentation.getChildrenComputations, computations);
    assert.ok(instrumentation.getChildrenCacheHits >= 3);
    assert.equal(instrumentation.scannerCreations, scannerCreations);
    assert.ok(instrumentation.scannerCreations <= 1);
  });
});

test("one scanner is reused across cached and nested child traversal", () => {
  withAdaptedBasic(({ adapted, instrumentation }) => {
    const rootChildren = adapted.getChildren();
    for (const child of rootChildren) {
      if (typeof child?.getChildren === "function") {
        child.getChildren();
      }
    }

    assert.ok(instrumentation.gapScans > 1);
    assert.equal(instrumentation.scannerCreations, 1);
    assert.ok(instrumentation.syntheticTokens > 0);
  });
});

test("node starts and boundary tokens are cached", () => {
  withAdaptedBasic(({ adapted, instrumentation }) => {
    const statement = adapted.statements[0];

    const firstToken = statement.getFirstToken();
    assert.strictEqual(statement.getFirstToken(), firstToken);
    assert.ok(firstToken);

    const lastToken = statement.getLastToken();
    assert.strictEqual(statement.getLastToken(), lastToken);
    assert.ok(lastToken);

    const width = statement.getWidth();
    assert.equal(statement.getWidth(), width);
    statement.getLeadingTriviaWidth();
    statement.getLeadingTriviaWidth();

    assert.equal(instrumentation.firstTokenComputations, 1);
    assert.equal(instrumentation.firstTokenCacheHits, 1);
    assert.equal(instrumentation.lastTokenComputations, 1);
    assert.equal(instrumentation.lastTokenCacheHits, 1);
    assert.ok(instrumentation.nodeStartComputations >= 1);
    assert.ok(instrumentation.nodeStartCacheHits >= 3);
  });
});
