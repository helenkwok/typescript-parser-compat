import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

import { parseAndGenerateServices } from "@typescript-eslint/typescript-estree";

import { withNativeProject } from "../../adapters/native-project.mjs";
import {
  createAdapterInstrumentation,
  createDeepAdapter,
} from "./native-estree-adapter.mjs";

const templateNames = [
  "plain.js",
  "jsx.jsx",
  "comments.ts",
  "basic.ts",
  "decorator-simple.ts",
  "generic-constructor.ts",
  "decorators.ts",
];

function parseFileCounts(args) {
  const index = args.indexOf("--sizes");
  if (index === -1) {
    return [1, 8, 32];
  }
  const values = args[index + 1]
    .split(",")
    .map((value) => Number.parseInt(value, 10));
  if (values.length === 0 || values.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new TypeError("--sizes must contain positive comma-separated integers");
  }
  return [...new Set(values)].sort((left, right) => left - right);
}

async function loadTemplates() {
  return Promise.all(
    templateNames.map(async (name) => ({
      name,
      text: await readFile(new URL(`../../fixtures/${name}`, import.meta.url), "utf8"),
    })),
  );
}

function createWorkload(templates, fileCount) {
  return Object.fromEntries(
    Array.from({ length: fileCount }, (_, index) => {
      const template = templates[index % templates.length];
      const extension = template.name.slice(template.name.lastIndexOf("."));
      const base = template.name.slice(0, -extension.length);
      return [
        `/profile/${base}-${String(index).padStart(4, "0")}${extension}`,
        template.text,
      ];
    }),
  );
}

function conversionOptions(fileName) {
  return {
    filePath: fileName,
    jsx: fileName.endsWith("x"),
    loc: true,
    range: true,
    comment: true,
    tokens: true,
    preserveNodeMaps: true,
    errorOnUnknownASTType: true,
  };
}

function mergeCounters(target, source) {
  for (const [name, value] of Object.entries(source)) {
    target[name] = (target[name] ?? 0) + value;
  }
  return target;
}

function ratio(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function reduction(before, after) {
  return before === 0 ? null : (before - after) / before;
}

function percentage(value) {
  return value == null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function runProfile(files, { cacheStructural, reuseScanner }) {
  return withNativeProject(files, ({ project, getSourceFile }) => {
    const aggregate = createAdapterInstrumentation();
    let convertedFiles = 0;
    let tokenCount = 0;
    let commentCount = 0;

    for (const fileName of Object.keys(files)) {
      const diagnostics = project.program.getSyntacticDiagnostics(fileName);
      assert.equal(diagnostics.length, 0, `${fileName}: native syntax diagnostics`);

      const instrumentation = createAdapterInstrumentation();
      const adapted = createDeepAdapter(
        getSourceFile(fileName),
        diagnostics,
        getSourceFile,
        {
          structural: true,
          instrumentation,
          cacheStructural,
          reuseScanner,
        },
      );
      const converted = parseAndGenerateServices(
        adapted,
        conversionOptions(fileName),
      );
      assert.equal(converted.ast.type, "Program");
      convertedFiles += 1;
      tokenCount += converted.ast.tokens?.length ?? 0;
      commentCount += converted.ast.comments?.length ?? 0;
      mergeCounters(aggregate, instrumentation);
    }

    assert.equal(convertedFiles, Object.keys(files).length);

    return {
      fileCount: convertedFiles,
      tokenCount,
      commentCount,
      counters: aggregate,
      derived: {
        getChildrenCacheHitRate: ratio(
          aggregate.getChildrenCacheHits,
          aggregate.getChildrenRequests,
        ),
        nodeProxyCacheHitRate: ratio(
          aggregate.nodeProxyCacheHits,
          aggregate.nodeProxyCreates + aggregate.nodeProxyCacheHits,
        ),
        arrayProxyCacheHitRate: ratio(
          aggregate.arrayProxyCacheHits,
          aggregate.arrayProxyCreates + aggregate.arrayProxyCacheHits,
        ),
        nodeStartCacheHitRate: ratio(
          aggregate.nodeStartCacheHits,
          aggregate.nodeStartRequests,
        ),
        firstTokenCacheHitRate: ratio(
          aggregate.firstTokenCacheHits,
          aggregate.firstTokenRequests,
        ),
        lastTokenCacheHitRate: ratio(
          aggregate.lastTokenCacheHits,
          aggregate.lastTokenRequests,
        ),
        gapScansPerScanner: ratio(
          aggregate.gapScans,
          aggregate.scannerCreations,
        ),
      },
    };
  });
}

function profileScenario(files) {
  const uncached = runProfile(files, {
    cacheStructural: false,
    reuseScanner: false,
  });
  const cached = runProfile(files, {
    cacheStructural: true,
    reuseScanner: true,
  });

  assert.equal(uncached.tokenCount, cached.tokenCount);
  assert.equal(uncached.commentCount, cached.commentCount);
  assert.equal(uncached.counters.getChildrenCacheHits, 0);
  assert.equal(uncached.counters.nodeStartCacheHits, 0);
  assert.equal(uncached.counters.firstTokenCacheHits, 0);
  assert.equal(uncached.counters.lastTokenCacheHits, 0);
  assert.equal(uncached.counters.scannerCreations, uncached.counters.gapScans);
  assert.ok(cached.counters.scannerCreations <= cached.fileCount);
  assert.ok(
    cached.counters.getChildrenComputations <=
      uncached.counters.getChildrenComputations,
  );
  assert.ok(cached.counters.gapScans <= uncached.counters.gapScans);
  assert.ok(cached.counters.syntheticTokens <= uncached.counters.syntheticTokens);

  return {
    fileCount: cached.fileCount,
    sourceBytes: Object.values(files).reduce(
      (total, text) => total + Buffer.byteLength(text, "utf8"),
      0,
    ),
    tokenCount: cached.tokenCount,
    commentCount: cached.commentCount,
    uncached,
    cached,
    reductions: {
      childComputations: reduction(
        uncached.counters.getChildrenComputations,
        cached.counters.getChildrenComputations,
      ),
      gapScans: reduction(
        uncached.counters.gapScans,
        cached.counters.gapScans,
      ),
      scannerCreations: reduction(
        uncached.counters.scannerCreations,
        cached.counters.scannerCreations,
      ),
      syntheticTokens: reduction(
        uncached.counters.syntheticTokens,
        cached.counters.syntheticTokens,
      ),
      nodeStartComputations: reduction(
        uncached.counters.nodeStartComputations,
        cached.counters.nodeStartComputations,
      ),
    },
  };
}

function comparisonRow(label, before, after, removed) {
  return `| ${label} | ${before} | ${after} | ${percentage(removed)} |`;
}

function renderScenario(scenario) {
  const before = scenario.uncached.counters;
  const after = scenario.cached.counters;
  return [
    `### ${scenario.fileCount} file${scenario.fileCount === 1 ? "" : "s"}`,
    "",
    `- Source bytes: **${scenario.sourceBytes.toLocaleString("en-US")}**`,
    `- ESTree tokens: **${scenario.tokenCount.toLocaleString("en-US")}**`,
    `- ESTree comments: **${scenario.commentCount.toLocaleString("en-US")}**`,
    "",
    "| Operation | Uncached | Cached | Work removed |",
    "|---|---:|---:|---:|",
    comparisonRow(
      "Child-list computations",
      before.getChildrenComputations,
      after.getChildrenComputations,
      scenario.reductions.childComputations,
    ),
    comparisonRow(
      "Gap scans",
      before.gapScans,
      after.gapScans,
      scenario.reductions.gapScans,
    ),
    comparisonRow(
      "Scanner creations",
      before.scannerCreations,
      after.scannerCreations,
      scenario.reductions.scannerCreations,
    ),
    comparisonRow(
      "Synthetic tokens created",
      before.syntheticTokens,
      after.syntheticTokens,
      scenario.reductions.syntheticTokens,
    ),
    comparisonRow(
      "Node-start computations",
      before.nodeStartComputations,
      after.nodeStartComputations,
      scenario.reductions.nodeStartComputations,
    ),
    "",
    `Cached child-list hit rate: **${percentage(scenario.cached.derived.getChildrenCacheHitRate)}**`,
    `Cached node-proxy hit rate: **${percentage(scenario.cached.derived.nodeProxyCacheHitRate)}**`,
    `Cached array-proxy hit rate: **${percentage(scenario.cached.derived.arrayProxyCacheHitRate)}**`,
    `Cached gap scans per scanner: **${scenario.cached.derived.gapScansPerScanner?.toFixed(1) ?? "n/a"}**`,
  ].join("\n");
}

const fileCounts = parseFileCounts(process.argv.slice(2));
const templates = await loadTemplates();
const scenarios = fileCounts.map((fileCount) =>
  profileScenario(createWorkload(templates, fileCount)),
);

const report = {
  generatedAt: new Date().toISOString(),
  fileCounts,
  scenarios,
};

const markdown = `${[
  "# Native ESTree Adapter Profile",
  "",
  "> Deterministic uncached-versus-cached operation counts from strict `typescript-estree` conversion. These counters complement, but do not replace, elapsed-time benchmarks.",
  "",
  "## Interpretation",
  "",
  "- The uncached profile reproduces the prior structural behavior: every child-list request recomputes traversal, and every source gap creates a scanner.",
  "- The cached profile stores child lists, node starts, and boundary tokens per raw native node.",
  "- One TypeScript scanner is reused per adapted source file in the cached profile.",
  "- Node and NodeArray proxy caches are enabled in both modes because they predate this optimization and preserve object identity.",
  "- Both modes must produce the same strict ESTree tokens, comments, and Program results.",
  "",
  "## Results",
  "",
  scenarios.map(renderScenario).join("\n\n"),
  "",
  "The machine-readable counters and derived reductions are stored in `adapter-profile.json`.",
].join("\n")}\n`;

await Promise.all([
  writeFile(
    new URL("../../adapter-profile.json", import.meta.url),
    `${JSON.stringify(report, null, 2)}\n`,
  ),
  writeFile(new URL("../../ADAPTER-PROFILE.md", import.meta.url), markdown),
]);

console.log(JSON.stringify(report, null, 2));
