const CLASSIFICATION_ORDER = [
  "root-ready",
  "unstable-only",
  "project-only",
  "adapter-required",
  "root-partial",
  "unstable-partial",
  "project-partial",
  "incompatible",
  "missing",
  "optional-missing",
];

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function compactStatus(result) {
  if (!result) {
    return "n/a";
  }
  if (result.status === "partial") {
    return `partial; missing ${result.missingMembers?.join(", ") || "members"}`;
  }
  if (result.status === "missing") {
    return result.missingMembers?.length
      ? `missing ${result.missingMembers.join(", ")}`
      : "missing";
  }
  if (result.status === "adapter-required") {
    return `adapter required; native ${result.nativeFields?.join(", ") || "shape"} → legacy ${result.legacyFields?.join(", ") || "shape"}`;
  }
  if (result.status === "incompatible") {
    return "incompatible";
  }
  return result.status;
}

function formatCounts(counts) {
  return CLASSIFICATION_ORDER.filter((name) => (counts[name] ?? 0) > 0)
    .map((name) => `${name}: ${counts[name]}`)
    .join(", ");
}

export function renderTypescriptEstreeApiStatus(inventory) {
  const rows = inventory.requirements.map((item) =>
    `| \`${escapeCell(item.nativeClassification)}\` | \`${escapeCell(item.id)}\` | ${escapeCell(item.layer)} | ${escapeCell(compactStatus(item.availability.typescript6))} | ${escapeCell(compactStatus(item.availability.typescriptNextRoot))} | ${escapeCell(compactStatus(item.availability.nativeAst))} | ${escapeCell(compactStatus(item.availability.nativeProject))} |`,
  );

  return `${[
    "# typescript-estree Parser API Inventory",
    "",
    "> Generated from `contract/typescript-estree-api.json` and runtime probes. This covers the project-less parser bootstrap and structural AST conversion surface, not the full type-aware Program/TypeChecker API.",
    "",
    "## Source snapshot",
    "",
    `- Repository: \`${inventory.upstream.repository}\``,
    `- Commit: \`${inventory.upstream.commit}\``,
    `- Source files inspected: **${inventory.upstream.sourceFiles.length}**`,
    "",
    "## Summary",
    "",
    `- Total requirements: **${inventory.summary.totalRequirements}**`,
    `- Required requirements: **${inventory.summary.requiredRequirements}**`,
    `- TypeScript 6 reference available: **${inventory.summary.typescript6Available}/${inventory.summary.requiredRequirements}**`,
    `- Available from the moving TypeScript package root: **${inventory.summary.rootReady}**`,
    `- Available only from unstable AST exports: **${inventory.summary.unstableOnly}**`,
    `- Verified only through a project-backed native API: **${inventory.summary.projectOnly}**`,
    `- Available through a mechanical compatibility adapter: **${inventory.summary.adapterRequired}**`,
    `- Required requirements still incomplete: **${inventory.summary.incomplete}**`,
    `- Classification distribution: **${formatCounts(inventory.summary.classifications)}**`,
    "",
    "## Inventory",
    "",
    "| Native classification | Requirement | Layer | TypeScript 6 | TypeScript next root | Native unstable AST | Native project |",
    "|---|---|---|---|---|---|---|",
    ...rows,
    "",
    "## Classification meanings",
    "",
    "- `root-ready`: available from the moving `typescript` package root.",
    "- `unstable-only`: available from `@typescript/native-preview/unstable/ast`, but not from the package root.",
    "- `project-only`: verified on project-backed native AST objects, which does not satisfy isolated parsing.",
    "- `adapter-required`: the native API carries the needed data under a redesigned shape that must be normalized for current `typescript-estree` code.",
    "- `*-partial`: only part of the required members are available.",
    "- `incompatible`: the API exists but current behavior fails the required contract.",
    "- `missing`: no usable required API was detected.",
    "- `optional-missing`: an optional compatibility aid was not detected.",
    "",
    "The complete evidence, requested and missing members, and source descriptions are included in `compatibility-report.json`.",
  ].join("\n")}\n`;
}
