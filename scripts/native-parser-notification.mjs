import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const issueTitle = "Native parser compatibility state changed";

function matchValue(markdown, pattern, fallback = null) {
  return markdown.match(pattern)?.[1]?.trim() ?? fallback;
}

export function parseNativeParserCandidateStatus(markdown) {
  const status = matchValue(markdown, /- Probe status: \*\*([^*]+)\*\*/);
  const candidateCountText = matchValue(
    markdown,
    /- Candidates detected: \*\*([^*]+)\*\*/,
    "0",
  );
  const readyText = matchValue(
    markdown,
    /- Fully ready candidate present: \*\*([^*]+)\*\*/,
    "no",
  );

  const candidates = [];
  const candidateSection = markdown
    .split("## Candidate summary")[1]
    ?.split("## Capability readiness")[0];
  for (const line of candidateSection?.split("\n") ?? []) {
    const match = line.match(/^\| `([^`]+)` \| `([^`]+)` \|/);
    if (match) {
      candidates.push({ id: match[1], status: match[2] });
    }
  }

  const capabilities = {};
  const capabilitySection = markdown
    .split("## Capability readiness")[1]
    ?.split("## Candidate fixture failures")[0];
  for (const line of capabilitySection?.split("\n") ?? []) {
    const match = line.match(/^\| `([^`]+)` \| (yes|no) \|$/);
    if (match) {
      capabilities[match[1]] = match[2] === "yes";
    }
  }

  if (!status) {
    throw new Error("Could not parse native parser candidate status");
  }

  return {
    status,
    candidateCount: Number.parseInt(candidateCountText, 10) || 0,
    ready: readyText.toLowerCase() === "yes",
    candidates,
    capabilities,
  };
}

export function nativeParserStateSignature(state) {
  return JSON.stringify({
    status: state.status,
    candidateCount: state.candidateCount,
    ready: state.ready,
    candidates: [...state.candidates].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    capabilities: Object.fromEntries(
      Object.entries(state.capabilities).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  });
}

function renderState(state) {
  const candidates =
    state.candidates.length === 0
      ? "_none_"
      : state.candidates
          .map((candidate) => `\`${candidate.id}\` (${candidate.status})`)
          .join(", ");
  const readyCapabilities = Object.entries(state.capabilities)
    .filter(([, ready]) => ready)
    .map(([id]) => `\`${id}\``);

  return [
    `- Status: **${state.status}**`,
    `- Candidates: ${candidates}`,
    `- Fully ready candidate: **${state.ready ? "yes" : "no"}**`,
    `- Ready capabilities: ${readyCapabilities.length > 0 ? readyCapabilities.join(", ") : "_none_"}`,
  ].join("\n");
}

export function createNativeParserNotification({
  baselineMarkdown,
  currentMarkdown,
  runUrl,
  commitSha,
}) {
  const baseline = parseNativeParserCandidateStatus(baselineMarkdown);
  const current = parseNativeParserCandidateStatus(currentMarkdown);
  const changed =
    nativeParserStateSignature(baseline) !== nativeParserStateSignature(current);

  const body = `${[
    "<!-- native-parser-compat-state-watch -->",
    "The scheduled compatibility workflow detected a meaningful change in the isolated native parser state.",
    "",
    "## Previous committed state",
    "",
    renderState(baseline),
    "",
    "## Current nightly state",
    "",
    renderState(current),
    "",
    "## Evidence",
    "",
    `- Workflow run: ${runUrl || "not provided"}`,
    `- Commit: \`${commitSha || "unknown"}\``,
    "- Generated report: `NATIVE-PARSER-CANDIDATES.md` in the workflow artifact",
    "- Full compatibility report: `compatibility-report.json` in the workflow artifact",
    "",
    "## Required review",
    "",
    "1. Inspect the candidate signature and per-fixture results.",
    "2. Confirm whether the new state is an intended upstream API change.",
    "3. Update the adapter, contract, and committed generated reports deliberately.",
    "4. Close this issue only after the committed baseline reflects the reviewed state.",
    "",
    "This issue is managed by the scheduled compatibility workflow. Repeated runs update the same issue instead of opening duplicates.",
  ].join("\n")}\n`;

  return {
    changed,
    title: issueTitle,
    baseline,
    current,
    body,
  };
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, "");
    const value = argv[index + 1];
    if (!key || typeof value === "undefined") {
      throw new Error(`Invalid argument sequence near ${argv[index] ?? "end"}`);
    }
    values[key] = value;
  }
  return values;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.baseline || !args.current || !args.output || !args.summary) {
    throw new Error(
      "Usage: node scripts/native-parser-notification.mjs --baseline <file> --current <file> --output <body.md> --summary <summary.json>",
    );
  }

  const [baselineMarkdown, currentMarkdown] = await Promise.all([
    readFile(args.baseline, "utf8"),
    readFile(args.current, "utf8"),
  ]);
  const notification = createNativeParserNotification({
    baselineMarkdown,
    currentMarkdown,
    runUrl: process.env.GITHUB_RUN_URL,
    commitSha: process.env.GITHUB_SHA,
  });

  await Promise.all([
    writeFile(args.output, notification.body),
    writeFile(
      args.summary,
      `${JSON.stringify(
        {
          changed: notification.changed,
          title: notification.title,
          baseline: notification.baseline,
          current: notification.current,
        },
        null,
        2,
      )}\n`,
    ),
  ]);

  if (process.env.GITHUB_OUTPUT) {
    await writeFile(
      process.env.GITHUB_OUTPUT,
      `changed=${notification.changed}\ntitle=${notification.title}\n`,
      { flag: "a" },
    );
  }

  console.log(
    JSON.stringify(
      {
        changed: notification.changed,
        title: notification.title,
        baseline: notification.baseline,
        current: notification.current,
      },
      null,
      2,
    ),
  );
}
