function show(value) {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

const commonInstall = `npm install --save-dev @typescript/native-preview@latest`;

const bomReproduction = `import { API } from "@typescript/native-preview/unstable/sync";
import { createVirtualFileSystem } from "@typescript/native-preview/unstable/fs";

const input = "\\uFEFFexport const bomValue = 1;";
const api = new API({
  cwd: "/",
  fs: createVirtualFileSystem({
    "/tsconfig.json": JSON.stringify({ files: ["/input.ts"], compilerOptions: { noLib: true } }),
    "/input.ts": input,
  }),
});

try {
  const snapshot = api.updateSnapshot({ openProject: "/tsconfig.json" });
  const sourceFile = snapshot.getProject("/tsconfig.json").program.getSourceFile("/input.ts");
  const statement = sourceFile.statements[0];
  const start = statement.getStart(sourceFile);
  const end = statement.getEnd();

  console.log({
    inputStartsWithBom: input.charCodeAt(0) === 0xfeff,
    textStartsWithBom: sourceFile.text.charCodeAt(0) === 0xfeff,
    fullTextStartsWithBom: sourceFile.getFullText().charCodeAt(0) === 0xfeff,
    start,
    end,
    statementSlice: sourceFile.text.slice(start, end),
  });
} finally {
  api.close();
}`;

const diagnosticsReproduction = `import { API } from "@typescript/native-preview/unstable/sync";
import { createVirtualFileSystem } from "@typescript/native-preview/unstable/fs";

const api = new API({
  cwd: "/",
  fs: createVirtualFileSystem({
    "/tsconfig.json": JSON.stringify({ files: ["/input.ts"], compilerOptions: { noLib: true } }),
    "/input.ts": "export const broken = ;",
  }),
});

try {
  const snapshot = api.updateSnapshot({ openProject: "/tsconfig.json" });
  const program = snapshot.getProject("/tsconfig.json").program;
  const diagnostic = program.getSyntacticDiagnostics("/input.ts")[0];
  console.log({ code: diagnostic.code, start: diagnostic.start, length: diagnostic.length });
} finally {
  api.close();
}`;

export function renderUpstreamEvidence(nativeProjectProbe) {
  const bom = nativeProjectProbe.observations.bom;
  const diagnostic = nativeProjectProbe.observations.firstSyntaxDiagnostic;

  const bomDocument = `# BOM/source-offset evidence for microsoft/typescript-go#4521

This document is generated from the executable project-backed native probe in this repository. It adds downstream-tooling evidence to the existing upstream tracker rather than opening a duplicate issue.

## Existing tracker

- https://github.com/microsoft/typescript-go/issues/4521

## Why this matters

JavaScript tooling slices source text with TypeScript AST UTF-16 offsets. If the BOM is removed from \`SourceFile.text\` while node positions still count it, every slice after the BOM is shifted by one code unit.

## Reproduction

\`\`\`bash
${commonInstall}
\`\`\`

\`\`\`js
${bomReproduction}
\`\`\`

## Expected

| Observation | Expected |
|---|---:|
| Input starts with BOM | \`true\` |
| \`SourceFile.text\` starts with BOM | \`true\` |
| \`SourceFile.getFullText()\` starts with BOM | \`true\` |
| Statement slice | \`"export const bomValue = 1;"\` |

## Current native result

| Observation | Actual |
|---|---:|
| Input starts with BOM | \`${bom.sourceStartsWithBom}\` |
| \`SourceFile.text\` starts with BOM | \`${bom.returnedTextStartsWithBom}\` |
| \`SourceFile.getFullText()\` starts with BOM | \`${bom.fullTextStartsWithBom}\` |
| Statement start | \`${bom.statementStart}\` |
| Statement end | \`${bom.statementEnd}\` |
| Statement slice | \`${show(bom.statementSlice)}\` |

## Executable source

- Fixture: \`fixtures/bom.ts\`
- Probe: \`scripts/native-project-probe.mjs\`
- Sentinel: \`test/native-project-adapter.test.mjs\`
`;

  const diagnosticsDocument = `# Issue draft: native API syntactic diagnostics omit source locations

> Before filing, search the current \`microsoft/typescript-go\` issue tracker again to avoid a duplicate. No dedicated open or closed tracker was found by the repository search terms used when this draft was generated.

## Summary

\`Program.getSyntacticDiagnostics(fileName)\` through \`@typescript/native-preview/unstable/sync\` returns a diagnostic code, but the first syntax diagnostic does not expose numeric \`start\` and \`length\` values.

This prevents downstream parsers and linting tools from attaching syntax errors to the corresponding source range.

## Reproduction

\`\`\`bash
${commonInstall}
\`\`\`

\`\`\`js
${diagnosticsReproduction}
\`\`\`

## Expected

The returned diagnostic should include:

- a numeric \`code\`;
- a numeric UTF-16 \`start\` offset;
- a positive numeric \`length\`.

This matches the parser-facing behavior of the TypeScript 6 \`SourceFile.parseDiagnostics\` API.

## Current native result

| Property | Actual |
|---|---:|
| \`code\` | \`${show(diagnostic?.code)}\` |
| \`start\` | \`${show(diagnostic?.start)}\` |
| \`length\` | \`${show(diagnostic?.length)}\` |

## Downstream impact

A future project-less parser API intended for tools such as \`typescript-estree\` needs located syntax diagnostics. A code-only diagnostic is insufficient for ESLint parser errors, editor markers, source maps, and automated fixes.

## Executable source

- Fixture: \`fixtures/invalid.ts\`
- Probe: \`scripts/native-project-probe.mjs\`
- Sentinel: \`test/native-project-adapter.test.mjs\`
`;

  return {
    bom: bomDocument,
    diagnostics: diagnosticsDocument,
  };
}
