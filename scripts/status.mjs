const STATUS_ORDER = ["ready", "partial", "unverified", "blocked", "missing"];

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function formatCounts(counts) {
  return STATUS_ORDER
    .filter((status) => (counts[status] ?? 0) > 0)
    .map((status) => `${status}: ${counts[status]}`)
    .join(", ");
}

function formatEvidence(capability) {
  const { status, evidence } = capability.nativePreview;

  if (status === "missing") {
    return "No direct source-text parser entry point detected.";
  }

  if (status === "blocked") {
    return `Blocked by \`${evidence.blockedBy}\`.`;
  }

  if (status === "partial") {
    const parts = [];
    if (evidence.availableExports?.length) {
      parts.push(`Available: ${evidence.availableExports.map((name) => `\`${name}\``).join(", ")}.`);
    }
    if (evidence.missingExports?.length) {
      parts.push(`Missing: ${evidence.missingExports.map((name) => `\`${name}\``).join(", ")}.`);
    }
    if (evidence.blockedBy) {
      parts.push(`Blocked by \`${evidence.blockedBy}\`.`);
    }
    return parts.join(" ");
  }

  if (status === "unverified") {
    return `Parser candidate detected: ${(evidence.parserCandidates ?? []).map((name) => `\`${name}\``).join(", ")}; contract not yet run.`;
  }

  return "Verified against the native parser contract.";
}

export function renderCompatibilityStatus(report) {
  const { capabilityMatrix } = report;
  const { summary, capabilities } = capabilityMatrix;
  const blocker = summary.parserEntryPointDetected
    ? "A native parser entry point is present, but the file-level compatibility contract has not yet been fully verified against it."
    : "The native preview does not expose a direct project-less source-text parser. Scanner and AST utilities exist, but parser-dependent capabilities remain blocked.";

  const rows = capabilities.map((capability) =>
    `| \`${escapeCell(capability.nativePreview.status)}\` | \`${escapeCell(capability.id)}\` | ${escapeCell(capability.category)} | ${escapeCell(capability.requirement)} | ${escapeCell(formatEvidence(capability))} |`,
  );

  return `${[
    "# TypeScript Native Parser Compatibility Status",
    "",
    "> This file is generated from the executable capability contract. Run `npm run report` after changing probes, fixtures, or tests.",
    "",
    "## Current blocker",
    "",
    blocker,
    "",
    "## Summary",
    "",
    `- Required capabilities: **${summary.requiredCapabilities}**`,
    `- Covered by the TypeScript 6 reference suite: **${summary.referenceCovered}/${summary.requiredCapabilities}**`,
    `- Native capabilities ready: **${summary.nativeReady}/${summary.requiredCapabilities}**`,
    `- Native status distribution: **${formatCounts(summary.nativeStatuses)}**`,
    "",
    "## Capability matrix",
    "",
    "| Native status | Capability | Category | Requirement | Evidence |",
    "|---|---|---|---|---|",
    ...rows,
    "",
    "## Status meanings",
    "",
    "- `ready`: verified against the native file-level parser contract.",
    "- `partial`: useful native utilities exist, but the full capability is not available.",
    "- `unverified`: a parser candidate exists and needs the contract adapter/tests.",
    "- `blocked`: the capability cannot be tested until the source-text parser exists.",
    "- `missing`: the required API entry point is not exposed.",
    "",
    "Package versions and the complete machine-readable evidence are written to `compatibility-report.json` by CI.",
    "",
  ].join("\n")}\n`;
}
