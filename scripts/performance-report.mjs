const metricLabels = {
  typescript6Parse: "TypeScript 6 parse",
  typescript6EstreeConversion: "TypeScript 6 ESTree conversion",
  typescript6Pipeline: "TypeScript 6 parse + ESTree",
  virtualFsConstruction: "Native virtual FS construction",
  nativeApiStartup: "Native API startup",
  nativeProjectLoad: "Native project load",
  nativeAstRetrieval: "Native AST retrieval",
  nativeDiagnostics: "Native syntactic diagnostics",
  nativeAdapter: "Native compatibility adapter",
  nativeEstreeConversion: "Native ESTree conversion",
  nativeWarmPipeline: "Native warm AST-to-ESTree pipeline",
  nativeColdPipeline: "Native cold project-to-ESTree pipeline",
};

export function percentile(sorted, probability) {
  if (!Array.isArray(sorted) || sorted.length === 0) {
    throw new TypeError("percentile requires at least one sorted sample");
  }
  if (probability < 0 || probability > 1) {
    throw new RangeError("percentile probability must be between 0 and 1");
  }

  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sorted[lower];
  }
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function summarizeSamples(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new TypeError("summarizeSamples requires at least one sample");
  }
  if (samples.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new TypeError("benchmark samples must be finite non-negative numbers");
  }

  const sorted = [...samples].sort((left, right) => left - right);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  return {
    samples: sorted.length,
    minMs: sorted[0],
    medianMs: percentile(sorted, 0.5),
    p90Ms: percentile(sorted, 0.9),
    maxMs: sorted.at(-1),
    meanMs: mean,
  };
}

export function formatMilliseconds(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  if (value < 0.01) {
    return value.toFixed(4);
  }
  if (value < 1) {
    return value.toFixed(3);
  }
  if (value < 100) {
    return value.toFixed(2);
  }
  return value.toFixed(1);
}

function metricTable(scenario) {
  const rows = Object.entries(metricLabels).map(([id, label]) => {
    const metric = scenario.metrics[id];
    if (!metric) {
      return null;
    }
    return `| ${label} | ${formatMilliseconds(metric.medianMs)} | ${formatMilliseconds(metric.p90Ms)} | ${formatMilliseconds(metric.minMs)} | ${formatMilliseconds(metric.maxMs)} |`;
  });

  return [
    `### ${scenario.fileCount} file${scenario.fileCount === 1 ? "" : "s"}`,
    "",
    `- Source bytes: **${scenario.sourceBytes.toLocaleString("en-US")}**`,
    `- Measured iterations: **${scenario.iterations}**`,
    "",
    "| Phase | Median (ms) | p90 (ms) | Min (ms) | Max (ms) |",
    "|---|---:|---:|---:|---:|",
    ...rows.filter(Boolean),
  ].join("\n");
}

export function renderPerformanceReport(report) {
  const scenarioSections = report.scenarios.map(metricTable).join("\n\n");
  return `${[
    "# Parser Pipeline Performance",
    "",
    "> Observational benchmark generated on a shared CI runner. Values are evidence for locating costs, not stable release guarantees or pass/fail thresholds.",
    "",
    "## Environment",
    "",
    `- Node.js: \`${report.environment.node}\``,
    `- Platform: \`${report.environment.platform}\` / \`${report.environment.arch}\``,
    `- CPU: ${report.environment.cpuModel}`,
    `- Warmups per scenario: **${report.configuration.warmups}**`,
    `- Measured iterations per scenario: **${report.configuration.iterations}**`,
    `- File counts: **${report.configuration.fileCounts.join(", ")}**`,
    "",
    "## Interpretation",
    "",
    "- **TypeScript 6 parse + ESTree** measures project-less JavaScript compiler parsing followed by the published converter.",
    "- **Native warm AST-to-ESTree** excludes native API startup and project loading; it measures AST retrieval, diagnostics, adapter construction, and conversion.",
    "- **Native cold project-to-ESTree** includes virtual filesystem creation, API startup, project loading, AST retrieval, diagnostics, adapters, and conversion.",
    "- The paths do not provide identical semantics: the native result is currently project-backed, while TypeScript 6 parses isolated source files.",
    "- Shared-runner timing is noisy. Compare phase shape and scaling across file counts rather than treating one run as a product benchmark.",
    "",
    "## Results",
    "",
    scenarioSections,
    "",
    "## Methodology",
    "",
    "Each measured iteration constructs fresh source-file inputs. Native cold measurements create a new virtual filesystem, synchronous API process, snapshot, and project. The benchmark retrieves every AST, requests syntactic diagnostics, creates the compatibility proxies, and runs strict `typescript-estree` conversion with tokens, comments, locations, ranges, and node maps enabled.",
    "",
    "No timing threshold is enforced by CI. The complete samples and phase summaries are stored in `performance-report.json`.",
  ].join("\n")}\n`;
}
