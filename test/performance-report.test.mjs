import assert from "node:assert/strict";
import test from "node:test";

import {
  formatMilliseconds,
  percentile,
  renderPerformanceReport,
  summarizeSamples,
} from "../scripts/performance-report.mjs";

test("benchmark statistics calculate interpolated percentiles", () => {
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(percentile([1, 2, 3, 4], 0.9), 3.7);

  const summary = summarizeSamples([4, 1, 3, 2]);
  assert.deepEqual(summary, {
    samples: 4,
    minMs: 1,
    medianMs: 2.5,
    p90Ms: 3.7,
    maxMs: 4,
    meanMs: 2.5,
  });
});

test("benchmark statistics reject invalid samples", () => {
  assert.throws(() => summarizeSamples([]), /at least one sample/);
  assert.throws(() => summarizeSamples([1, Number.NaN]), /finite non-negative/);
  assert.throws(() => summarizeSamples([-1]), /finite non-negative/);
  assert.throws(() => percentile([1], 2), /between 0 and 1/);
});

test("millisecond formatting preserves small measurements", () => {
  assert.equal(formatMilliseconds(0.00123), "0.0012");
  assert.equal(formatMilliseconds(0.1234), "0.123");
  assert.equal(formatMilliseconds(12.345), "12.35");
  assert.equal(formatMilliseconds(123.45), "123.5");
});

test("performance report explains non-equivalent benchmark paths", () => {
  const report = renderPerformanceReport({
    environment: {
      node: "v22.0.0",
      platform: "linux",
      arch: "x64",
      cpuModel: "Test CPU",
    },
    configuration: { warmups: 1, iterations: 3, fileCounts: [1] },
    scenarios: [
      {
        fileCount: 1,
        sourceBytes: 100,
        iterations: 3,
        metrics: {
          typescript6Pipeline: summarizeSamples([1, 2, 3]),
          nativeColdPipeline: summarizeSamples([4, 5, 6]),
        },
      },
    ],
  });

  assert.match(report, /Observational benchmark/);
  assert.match(report, /do not provide identical semantics/);
  assert.match(report, /No timing threshold is enforced/);
  assert.match(report, /TypeScript 6 parse \+ ESTree/);
  assert.match(report, /Native cold project-to-ESTree/);
});
