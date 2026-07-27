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

function percentage(value) {
  return value == null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function profileWorkload(files) {
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
        { structural: true, instrumentation },
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
    assert.ok(aggregate.scannerCreations <= convertedFiles);
    assert.ok(aggregate.getChildrenComputations <= aggregate.getChildrenRequests);
    assert.ok(aggregate.nodeStartComputations <= aggregate.nodeStartRequests);

    return {
      fileCount: convertedFiles,
      sourceBytes: Object.values(files).reduce(
        (total, text) => total + Buffer.byteLength(text, "utf8"),
        0,
      ),
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

function renderScenario(scenario) {
  const counters = scenario.counters;
  return [
    `### ${scenario.fileCount} file${scenario.fileCount === 1 ? "" : "s"}`,
    "",
    `- Source bytes: **${scenario.sourceBytes.toLocaleString("en-US")}**`,
    `- ESTree tokens: **${scenario.tokenCount.toLocaleString("en-US")}**`,
    `- ESTree comments: **${scenario.commentCount.toLocaleString("en-US")}**`,
    `- Scanner instances: **${counters.scannerCreations}**`,
    `- Gap scans: **${counters.gapScans}** (${scenario.derived.gapScansPerScanner?.toFixed(1) ?? "n/a"} per scanner)`,
    `- Synthetic tokens: **${counters.syntheticTokens}**`,
    "",
    "| Cache | Requests / total accesses | Computations / creates | Hits | Hit rate |",
    "|---|---:|---:|---:|---:|",
    `| Child lists | ${counters.getChildrenRequests} | ${counters.getChildrenComputations} | ${counters.getChildrenCacheHits} | ${percentage(scenario.derived.getChildrenCacheHitRate)} |`,
    `| Node proxies | ${counters.nodeProxyCreates + counters.nodeProxyCacheHits} | ${counters.nodeProxyCreates} | ${counters.nodeProxyCacheHits} | ${percentage(scenario.derived.nodeProxyCacheHitRate)} |`,
    `| Array proxies | ${counters.arrayProxyCreates + counters.arrayProxyCacheHits} | ${counters.arrayProxyCreates} | ${counters.arrayProxyCacheHits} | ${percentage(scenario.derived.arrayProxyCacheHitRate)} |`,
    `| Node starts | ${counters.nodeStartRequests} | ${counters.nodeStartComputations} | ${counters.nodeStartCacheHits} | ${percentage(scenario.derived.nodeStartCacheHitRate)} |`,
    `| First tokens | ${counters.firstTokenRequests} | ${counters.firstTokenComputations} | ${counters.firstTokenCacheHits} | ${percentage(scenario.derived.firstTokenCacheHitRate)} |`,
    `| Last tokens | ${counters.lastTokenRequests} | ${counters.lastTokenComputations} | ${counters.lastTokenCacheHits} | ${percentage(scenario.derived.lastTokenCacheHitRate)} |`,
  ].join("\n");
}

const fileCounts = parseFileCounts(process.argv.slice(2));
const templates = await loadTemplates();
const scenarios = fileCounts.map((fileCount) =>
  profileWorkload(createWorkload(templates, fileCount)),
);

const report = {
  generatedAt: new Date().toISOString(),
  fileCounts,
  scenarios,
};

const markdown = `${[
  "# Native ESTree Adapter Profile",
  "",
  "> Deterministic operation counters from strict `typescript-estree` conversion. These counters complement, but do not replace, elapsed-time benchmarks.",
  "",
  "## Interpretation",
  "",
  "- Child lists, node starts, and boundary tokens are cached per raw native node.",
  "- One TypeScript scanner is reused per adapted source file for all synthetic-token gap scans.",
  "- Proxy caches preserve object identity and avoid re-wrapping raw native nodes and NodeArrays.",
  "- Counts describe this fixture workload only; they are not API guarantees.",
  "",
  "## Results",
  "",
  scenarios.map(renderScenario).join("\n\n"),
  "",
  "The machine-readable counters and derived ratios are stored in `adapter-profile.json`.",
].join("\n")}\n`;

await Promise.all([
  writeFile(
    new URL("../../adapter-profile.json", import.meta.url),
    `${JSON.stringify(report, null, 2)}\n`,
  ),
  writeFile(new URL("../../ADAPTER-PROFILE.md", import.meta.url), markdown),
]);

console.log(JSON.stringify(report, null, 2));
