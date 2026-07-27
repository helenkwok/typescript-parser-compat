import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

import {
  createBootstrapFacadeInstrumentation,
  loadTypescriptEstreeWithNativeFacade,
} from "./bootstrap-facade.mjs";

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

function options(filePath) {
  return {
    filePath,
    jsx: filePath.endsWith("x"),
    sourceType: "module",
    loc: true,
    range: true,
    comment: true,
    tokens: true,
    preserveNodeMaps: true,
    errorOnUnknownASTType: true,
  };
}

function summarizeAst(ast) {
  return {
    type: ast?.type ?? null,
    bodyLength: ast?.body?.length ?? null,
    tokenCount: ast?.tokens?.length ?? 0,
    commentCount: ast?.comments?.length ?? 0,
    hasRange: Array.isArray(ast?.range),
    hasLocation: ast?.loc != null,
  };
}

function summarizeError(error) {
  return {
    name: error?.name ?? "Error",
    message: String(error?.message ?? error),
    lineNumber: error?.lineNumber ?? null,
    column: error?.column ?? null,
  };
}

const fixtures = Object.fromEntries(
  await Promise.all(
    fixtureNames.map(async (name) => [
      name,
      await readFile(new URL(`../../fixtures/${name}`, import.meta.url), "utf8"),
    ]),
  ),
);

const instrumentation = createBootstrapFacadeInstrumentation();
const facade = loadTypescriptEstreeWithNativeFacade({ instrumentation });
const results = {};

for (const fileName of validFixtureNames) {
  const filePath = `/fixtures/${fileName}`;
  const code = fixtures[fileName];

  const parsed = facade.run((parser) => parser.parse(code, options(filePath)));
  assert.equal(instrumentation.activeProjects, 0, `${fileName}: parse leaked a project`);

  const generated = facade.run((parser) =>
    parser.parseAndGenerateServices(code, options(filePath)),
  );
  assert.equal(
    instrumentation.activeProjects,
    0,
    `${fileName}: parseAndGenerateServices leaked a project`,
  );

  const parseSummary = summarizeAst(parsed);
  const serviceSummary = summarizeAst(generated.ast);

  assert.equal(parseSummary.type, "Program", `${fileName}: parse did not return Program`);
  assert.equal(
    serviceSummary.type,
    "Program",
    `${fileName}: parseAndGenerateServices did not return Program`,
  );
  assert.equal(
    serviceSummary.tokenCount,
    parseSummary.tokenCount,
    `${fileName}: parser APIs returned different token counts`,
  );
  assert.equal(
    serviceSummary.commentCount,
    parseSummary.commentCount,
    `${fileName}: parser APIs returned different comment counts`,
  );
  assert.equal(
    generated.services.program,
    null,
    `${fileName}: syntax-only facade unexpectedly returned a Program`,
  );
  assert.ok(
    generated.services.esTreeNodeToTSNodeMap instanceof WeakMap,
    `${fileName}: missing ESTree-to-TS node map`,
  );
  assert.ok(
    generated.services.tsNodeToESTreeNodeMap instanceof WeakMap,
    `${fileName}: missing TS-to-ESTree node map`,
  );

  results[fileName] = {
    parse: parseSummary,
    parseAndGenerateServices: serviceSummary,
    services: {
      program: generated.services.program,
      hasNodeMaps: true,
    },
  };
}

let invalidError;
try {
  facade.run((parser) =>
    parser.parse(
      fixtures[invalidFixtureName],
      options(`/fixtures/${invalidFixtureName}`),
    ),
  );
  assert.fail("invalid fixture unexpectedly parsed");
} catch (error) {
  invalidError = summarizeError(error);
}

assert.equal(instrumentation.activeProjects, 0, "invalid parse leaked a project");
assert.equal(invalidError.name, "TSError");
assert.equal(invalidError.message, "Type expected.");
assert.equal(invalidError.lineNumber, 1);
assert.equal(invalidError.column, 21);

const expectedParserCalls = validFixtureNames.length * 2 + 1;
assert.equal(instrumentation.createSourceFileCalls, expectedParserCalls);
assert.equal(instrumentation.nativeProjectsCreated, expectedParserCalls);
assert.equal(instrumentation.nativeProjectsClosed, expectedParserCalls);
assert.ok(instrumentation.parserLoadsIntercepted > 0);

const report = {
  generatedAt: new Date().toISOString(),
  package: "@typescript-eslint/typescript-estree@8.65.0",
  mode: "published-source-string-bootstrap-with-native-createSourceFile-facade",
  summary: {
    validFixtures: validFixtureNames.length,
    parseSuccesses: validFixtureNames.length,
    parseAndGenerateServicesSuccesses: validFixtureNames.length,
    invalidFixtureProducesLocatedError:
      invalidError.name === "TSError" &&
      typeof invalidError.lineNumber === "number" &&
      typeof invalidError.column === "number",
    allNativeProjectsClosed:
      instrumentation.nativeProjectsCreated ===
        instrumentation.nativeProjectsClosed &&
      instrumentation.activeProjects === 0,
  },
  instrumentation,
  invalidFixture: invalidError,
  fixtures: results,
};

const markdown = `${[
  "# typescript-estree Source-String Bootstrap Facade",
  "",
  "> Generated by loading the published CommonJS parser with a narrowly injected TypeScript facade. Only `createSourceFile` is replaced; the exported parser APIs and their internal bootstrap remain unchanged.",
  "",
  "## Result",
  "",
  `- Valid fixtures through \`parse(string)\`: **${report.summary.parseSuccesses}/${report.summary.validFixtures}**`,
  `- Valid fixtures through \`parseAndGenerateServices(string)\`: **${report.summary.parseAndGenerateServicesSuccesses}/${report.summary.validFixtures}**`,
  `- Malformed source returned the expected located \`TSError\`: **${report.summary.invalidFixtureProducesLocatedError ? "yes" : "no"}**`,
  `- Every temporary native project closed: **${report.summary.allNativeProjectsClosed ? "yes" : "no"}**`,
  "",
  "## What this proves",
  "",
  "The published syntax-only parser bootstrap reaches one replaceable dependency boundary: `typescript.createSourceFile`. Supplying a compatible native-backed implementation at that boundary allows the unchanged public source-string APIs to complete strict ESTree conversion, token/comment generation, and node-map creation.",
  "",
  "## What this does not prove",
  "",
  "This facade creates a temporary one-file project and `tsconfig` for each parser call. It is therefore evidence about integration shape, not a replacement for the requested direct isolated native parser operation. The CommonJS module-loader hook is restricted to this experiment and is not proposed as production integration.",
  "",
  "## Fixture summary",
  "",
  "| Fixture | parse | parseAndGenerateServices | Tokens | Comments |",
  "|---|---|---|---:|---:|",
  ...Object.entries(results).map(
    ([fileName, result]) =>
      `| \`${fileName}\` | ${result.parse.type} | ${result.parseAndGenerateServices.type} | ${result.parse.tokenCount} | ${result.parse.commentCount} |`,
  ),
  "",
  "The complete machine-readable results are in `typescript-estree-bootstrap-facade.json`.",
].join("\n")}\n`;

await Promise.all([
  writeFile(
    new URL("../../typescript-estree-bootstrap-facade.json", import.meta.url),
    `${JSON.stringify(report, null, 2)}\n`,
  ),
  writeFile(
    new URL("../../TYPESCRIPT-ESTREE-BOOTSTRAP.md", import.meta.url),
    markdown,
  ),
]);

facade.close();
console.log(JSON.stringify(report, null, 2));
