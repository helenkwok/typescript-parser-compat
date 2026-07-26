import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

import {
  parseAndGenerateServices,
  version as typescriptEstreeVersion,
} from "@typescript-eslint/typescript-estree";
import ts from "typescript";
import * as nativeAst from "@typescript/native-preview/unstable/ast";

import { withNativeProject } from "../../adapters/native-project.mjs";
import { listCanonicalKindAliasChanges } from "./canonical-kind-map.mjs";
import {
  createDeepAdapter,
  createDiagnosticOnlyAdapter,
  translateKind,
} from "./native-estree-adapter.mjs";

const validFixtureNames = [
  "plain.js",
  "jsx.jsx",
  "comments.ts",
  "basic.ts",
  "decorator-simple.ts",
  "generic-constructor.ts",
  "decorators.ts",
];
const invalidFixtureName = "invalid.ts";
const fixtureNames = [...validFixtureNames, invalidFixtureName];

const jsonReportUrl = new URL(
  "../../typescript-estree-native-conversion.json",
  import.meta.url,
);
const markdownReportUrl = new URL(
  "../../TYPESCRIPT-ESTREE-CONVERSION.md",
  import.meta.url,
);

function summarizeError(error) {
  return {
    name: error?.name ?? "Error",
    message: String(error?.message ?? error),
    lineNumber: error?.lineNumber ?? null,
    column: error?.column ?? null,
  };
}

function attemptConversion(sourceFile, fileName) {
  try {
    const result = parseAndGenerateServices(sourceFile, {
      filePath: fileName,
      jsx: fileName.endsWith("x"),
      loc: true,
      range: true,
      comment: true,
      tokens: true,
      preserveNodeMaps: true,
      errorOnUnknownASTType: true,
    });
    return {
      success: true,
      astType: result.ast?.type,
      bodyLength: result.ast?.body?.length ?? null,
      tokenCount: result.ast?.tokens?.length ?? 0,
      commentCount: result.ast?.comments?.length ?? 0,
      hasNodeMaps:
        result.services?.esTreeNodeToTSNodeMap instanceof WeakMap &&
        result.services?.tsNodeToESTreeNodeMap instanceof WeakMap,
    };
  } catch (error) {
    return { success: false, error: summarizeError(error) };
  }
}

async function loadFixtures() {
  return Object.fromEntries(
    await Promise.all(
      fixtureNames.map(async (name) => [
        `/fixtures/${name}`,
        await readFile(new URL(`../../fixtures/${name}`, import.meta.url), "utf8"),
      ]),
    ),
  );
}

const files = await loadFixtures();
const fixtures = withNativeProject(files, ({ project, getSourceFile }) => {
  return Object.fromEntries(
    Object.keys(files).map((fileName) => {
      const sourceFile = getSourceFile(fileName);
      const diagnostics = project.program.getSyntacticDiagnostics(fileName);
      const structuralSourceFile = createDeepAdapter(
        sourceFile,
        diagnostics,
        getSourceFile,
        { structural: true },
      );

      return [
        fileName,
        {
          preflight: {
            nativeSourceFileKind: sourceFile.kind,
            nativeSourceFileKindName:
              nativeAst.SyntaxKind[sourceFile.kind] ?? null,
            converterSourceFileKind: ts.SyntaxKind.SourceFile,
            translatedSourceFileKind: translateKind(sourceFile.kind),
          },
          raw: attemptConversion(sourceFile, fileName),
          diagnosticOnly: attemptConversion(
            createDiagnosticOnlyAdapter(
              sourceFile,
              diagnostics,
              getSourceFile,
            ),
            fileName,
          ),
          kindOnly: attemptConversion(
            createDeepAdapter(sourceFile, diagnostics, getSourceFile, {
              structural: false,
            }),
            fileName,
          ),
          structural: attemptConversion(structuralSourceFile, fileName),
        },
      ];
    }),
  );
});

const validPaths = validFixtureNames.map((name) => `/fixtures/${name}`);
const invalidPath = `/fixtures/${invalidFixtureName}`;
const validStructural = validPaths.filter(
  (fileName) => fixtures[fileName].structural.success,
);

const report = {
  generatedAt: new Date().toISOString(),
  packages: {
    typescriptEstree: typescriptEstreeVersion,
    converterTypeScript: ts.version,
  },
  nativeApiMode: "project-backed",
  summary: {
    validFixtures: validPaths.length,
    validStructuralConversions: validStructural.length,
    invalidFixtureProducesLocatedError:
      fixtures[invalidPath].structural.success === false &&
      fixtures[invalidPath].structural.error?.name === "TSError" &&
      typeof fixtures[invalidPath].structural.error?.lineNumber === "number" &&
      typeof fixtures[invalidPath].structural.error?.column === "number",
    projectLessParserAvailable: false,
  },
  adapterRequirements: [
    "Normalize native diagnostics from pos/end/text/fileName to the legacy TypeScript diagnostic shape.",
    "Translate native SyntaxKind values by canonical enum name rather than numeric identity.",
    "Recursively wrap SourceFile, nodes, NodeArrays, and array helper results.",
    "Provide legacy node range, child, and token methods expected by typescript-estree.",
    "Synthesize token children with the TypeScript 6 scanner where native nodes do not expose them.",
  ],
  kindAliasChanges: listCanonicalKindAliasChanges(),
  fixtures,
};

function outcome(result) {
  if (result.success) {
    return `pass (${result.tokenCount} tokens, ${result.commentCount} comments)`;
  }
  return `fail: ${result.error?.message ?? "unknown error"}`;
}

const rows = Object.entries(fixtures).map(
  ([fileName, result]) =>
    `| \`${fileName.replace("/fixtures/", "")}\` | ${outcome(result.raw)} | ${outcome(result.diagnosticOnly)} | ${outcome(result.kindOnly)} | ${outcome(result.structural)} |`,
);

const markdown = `${[
  "# Native AST to typescript-estree Conversion",
  "",
  "> Generated by the isolated conversion experiment. The experiment uses the published `@typescript-eslint/typescript-estree` converter with its TypeScript 6 peer and a project-backed TypeScript native AST.",
  "",
  "## Result",
  "",
  `- Valid fixtures converted strictly: **${validStructural.length}/${validPaths.length}**`,
  `- Malformed source returned a located parser error: **${report.summary.invalidFixtureProducesLocatedError ? "yes" : "no"}**`,
  "- Direct project-less native parser available: **no**",
  "",
  "The actual ESTree converter accepts the native AST after mechanical compatibility adapters. This demonstrates structural compatibility; it does not remove the requirement for a direct isolated source-text parser.",
  "",
  "## Staged evidence",
  "",
  "| Fixture | Raw native | Diagnostic only | Kind translation | Full structural adapter |",
  "|---|---|---|---|---|",
  ...rows,
  "",
  "## Required adapters",
  "",
  ...report.adapterRequirements.map((item) => `- ${item}`),
  "",
  "The complete machine-readable stage results are in `typescript-estree-native-conversion.json`.",
].join("\n")}\n`;

await Promise.all([
  writeFile(jsonReportUrl, `${JSON.stringify(report, null, 2)}\n`),
  writeFile(markdownReportUrl, markdown),
]);

for (const fileName of validPaths) {
  const fixture = fixtures[fileName];
  assert.notEqual(
    fixture.preflight.nativeSourceFileKind,
    fixture.preflight.converterSourceFileKind,
    `${fileName}: native and TypeScript 6 SourceFile numeric kinds unexpectedly match`,
  );
  assert.equal(
    fixture.preflight.translatedSourceFileKind,
    fixture.preflight.converterSourceFileKind,
    `${fileName}: SourceFile kind translation failed`,
  );
  assert.equal(fixture.raw.success, false, `${fileName}: raw stage changed`);
  assert.equal(
    fixture.diagnosticOnly.success,
    false,
    `${fileName}: diagnostic-only stage changed`,
  );
  assert.equal(fixture.kindOnly.success, false, `${fileName}: kind-only stage changed`);
  assert.match(
    fixture.kindOnly.error?.message ?? "",
    /getChildren is not a function/,
    `${fileName}: kind-only failure moved to a different boundary`,
  );
  assert.equal(
    fixture.structural.success,
    true,
    `${fileName}: structural conversion failed`,
  );
  assert.equal(fixture.structural.astType, "Program");
  assert.equal(fixture.structural.hasNodeMaps, true);
}

const invalid = fixtures[invalidPath].structural;
assert.equal(invalid.success, false);
assert.equal(invalid.error?.name, "TSError");
assert.equal(invalid.error?.message, "Type expected.");
assert.equal(invalid.error?.lineNumber, 1);
assert.equal(invalid.error?.column, 21);

console.log(JSON.stringify(report, null, 2));
