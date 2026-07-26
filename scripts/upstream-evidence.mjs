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
  const project = snapshot.getProject("/tsconfig.json");
  const diagnostic = project.program.getSyntacticDiagnostics("/input.ts")[0];
  const sourceFile = project.program.getSourceFile(diagnostic.fileName);

  const normalized = {
    code: diagnostic.code,
    start: diagnostic.pos,
    length: diagnostic.end - diagnostic.pos,
    messageText: diagnostic.text,
    file: sourceFile,
  };

  console.log({
    native: {
      code: diagnostic.code,
      pos: diagnostic.pos,
      end: diagnostic.end,
      text: diagnostic.text,
      fileName: diagnostic.fileName,
    },
    normalized: {
      code: normalized.code,
      start: normalized.start,
      length: normalized.length,
      messageText: normalized.messageText,
      fileName: normalized.file.fileName,
    },
  });
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

  const diagnosticsDocument = `# Diagnostic API shape clarification for microsoft/typescript-go#4745

The native API does expose source locations. The \`Diagnostic\` interface was intentionally redesigned to use \`pos\` and \`end\` rather than the legacy \`start\` and \`length\` fields.

## Upstream clarification

- Tracker: https://github.com/microsoft/typescript-go/issues/4745
- Maintainer comment: https://github.com/microsoft/typescript-go/issues/4745#issuecomment-5081879077

The issue should not be treated as a missing-location bug. Downstream consumers need a compatibility adapter for the redesigned field names.

## Native-to-legacy mapping

| Native field | Legacy TypeScript field |
|---|---|
| \`pos\` | \`start\` |
| \`end\` | \`start + length\` |
| \`text\` | \`messageText\` |
| \`fileName\` | resolve to \`file\` through the current program/source-file lookup |

Equivalent mapping:

\`\`\`js
const normalized = {
  code: diagnostic.code,
  category: diagnostic.category,
  start: diagnostic.pos,
  length: diagnostic.end - diagnostic.pos,
  messageText: diagnostic.text,
  file: project.program.getSourceFile(diagnostic.fileName),
};
\`\`\`

## Reproduction

\`\`\`bash
${commonInstall}
\`\`\`

\`\`\`js
${diagnosticsReproduction}
\`\`\`

## Current native result

| Property | Actual |
|---|---:|
| \`code\` | \`${show(diagnostic?.raw.code)}\` |
| \`pos\` | \`${show(diagnostic?.raw.pos)}\` |
| \`end\` | \`${show(diagnostic?.raw.end)}\` |
| \`text\` | \`${show(diagnostic?.raw.text)}\` |
| \`fileName\` | \`${show(diagnostic?.raw.fileName)}\` |
| normalized \`start\` | \`${show(diagnostic?.normalized.start)}\` |
| normalized \`length\` | \`${show(diagnostic?.normalized.length)}\` |
| normalized \`messageText\` | \`${show(diagnostic?.normalized.messageText)}\` |

## Compatibility conclusion

- Location data: available.
- Legacy object shape: not provided directly.
- Mechanical adapter: verified by \`adapters/native-diagnostic.mjs\`.
- Project-less parser blocker: unchanged; diagnostics are currently obtained through a project-backed API.

## Executable source

- Fixture: \`fixtures/invalid.ts\`
- Adapter: \`adapters/native-diagnostic.mjs\`
- Probe: \`scripts/native-project-probe.mjs\`
- Sentinel: \`test/native-project-adapter.test.mjs\`
`;

  return {
    bom: bomDocument,
    diagnostics: diagnosticsDocument,
  };
}
