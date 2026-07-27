import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeParserNotification,
  nativeParserStateSignature,
  parseNativeParserCandidateStatus,
} from "../scripts/native-parser-notification.mjs";

function report({
  status = "absent",
  candidates = [],
  capabilities = {},
  intro = "Generated report.",
} = {}) {
  const ready = candidates.some((candidate) => candidate.status === "ready");
  const candidateRows =
    candidates.length === 0
      ? "| _none_ | `absent` | No candidate detected. |"
      : candidates
          .map(
            (candidate) =>
              `| \`${candidate.id}\` | \`${candidate.status}\` | evidence |`,
          )
          .join("\n");
  const capabilityRows = Object.entries(capabilities)
    .map(([id, value]) => `| \`${id}\` | ${value ? "yes" : "no"} |`)
    .join("\n");

  return `# Native Isolated Parser Candidates

> ${intro}

## Result

- Probe status: **${status}**
- Candidates detected: **${candidates.length}**
- Fully ready candidate present: **${ready ? "yes" : "no"}**

## Candidate summary

| Candidate | Status | Evidence |
|---|---|---|
${candidateRows}

## Capability readiness

| Capability | Ready |
|---|---|
${capabilityRows}

## Candidate fixture failures

- None.
`;
}

test("native parser state parser extracts candidate and capability data", () => {
  const state = parseNativeParserCandidateStatus(
    report({
      status: "partial",
      candidates: [{ id: "sync-api-instance.parseSourceFile", status: "partial" }],
      capabilities: {
        "source-text-entry-point": true,
        "script-kind-selection": false,
      },
    }),
  );

  assert.deepEqual(state, {
    status: "partial",
    candidateCount: 1,
    ready: false,
    candidates: [
      { id: "sync-api-instance.parseSourceFile", status: "partial" },
    ],
    capabilities: {
      "source-text-entry-point": true,
      "script-kind-selection": false,
    },
  });
});

test("wording-only report changes do not trigger notification", () => {
  const baseline = report({
    capabilities: { "source-text-entry-point": false },
    intro: "Old explanatory wording.",
  });
  const current = report({
    capabilities: { "source-text-entry-point": false },
    intro: "New explanatory wording.",
  });

  const notification = createNativeParserNotification({
    baselineMarkdown: baseline,
    currentMarkdown: current,
    runUrl: "https://example.test/run/1",
    commitSha: "abc123",
  });

  assert.equal(notification.changed, false);
});

test("candidate ordering does not change the state signature", () => {
  const first = parseNativeParserCandidateStatus(
    report({
      status: "partial",
      candidates: [
        { id: "native-ast.parseSourceFile", status: "partial" },
        { id: "sync-api-instance.parseSourceFile", status: "incompatible" },
      ],
    }),
  );
  const second = parseNativeParserCandidateStatus(
    report({
      status: "partial",
      candidates: [...first.candidates].reverse(),
    }),
  );

  assert.equal(
    nativeParserStateSignature(first),
    nativeParserStateSignature(second),
  );
});

test("meaningful state transition creates actionable notification", () => {
  const notification = createNativeParserNotification({
    baselineMarkdown: report({
      status: "absent",
      capabilities: {
        "source-text-entry-point": false,
        "script-kind-selection": false,
      },
    }),
    currentMarkdown: report({
      status: "partial",
      candidates: [
        { id: "sync-api-instance.parseSourceFile", status: "partial" },
      ],
      capabilities: {
        "source-text-entry-point": true,
        "script-kind-selection": false,
      },
    }),
    runUrl: "https://github.com/example/repo/actions/runs/123",
    commitSha: "deadbeef",
  });

  assert.equal(notification.changed, true);
  assert.equal(notification.title, "Native parser compatibility state changed");
  assert.match(notification.body, /Previous committed state/);
  assert.match(notification.body, /Current nightly state/);
  assert.match(notification.body, /sync-api-instance\.parseSourceFile/);
  assert.match(notification.body, /source-text-entry-point/);
  assert.match(notification.body, /actions\/runs\/123/);
  assert.match(notification.body, /deadbeef/);
});
