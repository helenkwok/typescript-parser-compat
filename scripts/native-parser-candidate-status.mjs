function yesNo(value) {
  return value ? "yes" : "no";
}

function candidateRows(probe) {
  if (probe.reports.length === 0) {
    return ["| _none_ | `absent` | No allowlisted isolated parser entry point detected. |"]; 
  }

  return probe.reports.map((report) => {
    const passed = Object.values(report.capabilities ?? {}).filter(Boolean).length;
    const total = Object.keys(report.capabilities ?? {}).length;
    const note = report.setupError
      ? `Setup failed: ${report.setupError.message}`
      : `${passed}/${total} capabilities passed`;
    return `| \`${report.candidate.id}\` | \`${report.status}\` | ${note} |`;
  });
}

export function renderNativeParserCandidateStatus(probe) {
  const capabilityRows = Object.entries(probe.capabilities)
    .map(([id, ready]) => `| \`${id}\` | ${yesNo(ready)} |`)
    .join("\n");

  const failedFixtures = probe.reports.flatMap((report) =>
    Object.entries(report.fixtures ?? {})
      .filter(([, fixture]) => fixture.success === false)
      .map(
        ([fileName, fixture]) =>
          `- \`${report.candidate.id}\` / \`${fileName}\`: ${fixture.error?.message ?? "unknown error"}`,
      ),
  );

  return `${[
    "# Native Isolated Parser Candidates",
    "",
    "> Generated from a narrow allowlist of parser-like exports and synchronous API methods. Unknown methods are never invoked.",
    "",
    "## Result",
    "",
    `- Probe status: **${probe.status}**`,
    `- Candidates detected: **${probe.candidates.length}**`,
    `- Fully ready candidate present: **${yesNo(probe.status === "ready")}**`,
    "",
    probe.status === "absent"
      ? "No isolated source-text parser is currently exposed. Project-backed parsing remains separate and does not satisfy this contract."
      : "Detected candidates were invoked without creating a project or tsconfig and evaluated against the parser capability contract.",
    "",
    "## Candidate summary",
    "",
    "| Candidate | Status | Evidence |",
    "|---|---|---|",
    ...candidateRows(probe),
    "",
    "## Capability readiness",
    "",
    "| Capability | Ready |",
    "|---|---|",
    capabilityRows,
    "",
    "## Candidate fixture failures",
    "",
    ...(failedFixtures.length > 0
      ? failedFixtures
      : ["- None. No candidate was detected, or every invoked fixture passed."]),
    "",
    "The complete candidate metadata and fixture summaries are embedded in `compatibility-report.json`.",
  ].join("\n")}\n`;
}
