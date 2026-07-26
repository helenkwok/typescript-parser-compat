import { readFile } from "node:fs/promises";
import * as nativeAst from "@typescript/native-preview/unstable/ast";

import { withNativeProject } from "../adapters/native-project.mjs";

const fixtureNames = [
  "basic.ts",
  "jsx.tsx",
  "bom.ts",
  "comments.ts",
  "invalid.ts",
  "plain.js",
  "jsx.jsx",
  "decorators.ts",
];

async function loadFixtureFiles() {
  return Object.fromEntries(
    await Promise.all(
      fixtureNames.map(async (name) => [
        `/fixtures/${name}`,
        await readFile(new URL(`../fixtures/${name}`, import.meta.url), "utf8"),
      ]),
    ),
  );
}

function collectKinds(sourceFile) {
  const kinds = [];
  const visit = (node) => {
    kinds.push(nativeAst.SyntaxKind[node.kind] ?? String(node.kind));
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return kinds;
}

function isFunction(value) {
  return typeof value === "function";
}

export async function runNativeProjectProbe() {
  const files = await loadFixtureFiles();

  return withNativeProject(files, ({ project, getSourceFile }) => {
    const basic = getSourceFile("/fixtures/basic.ts");
    const tsx = getSourceFile("/fixtures/jsx.tsx");
    const bom = getSourceFile("/fixtures/bom.ts");
    const comments = getSourceFile("/fixtures/comments.ts");
    const javascript = getSourceFile("/fixtures/plain.js");
    const jsx = getSourceFile("/fixtures/jsx.jsx");
    const decorators = getSourceFile("/fixtures/decorators.ts");

    const basicKinds = collectKinds(basic);
    const tsxKinds = collectKinds(tsx);
    const javascriptKinds = collectKinds(javascript);
    const jsxKinds = collectKinds(jsx);
    const decoratorKinds = collectKinds(decorators);

    const syntaxDiagnostics = project.program.getSyntacticDiagnostics(
      "/fixtures/invalid.ts",
    );
    const firstDiagnostic = syntaxDiagnostics[0];
    const firstStatement = basic.statements[0];
    const bomStatement = bom.statements[0];
    const bomStart = bomStatement.getStart(bom);
    const bomEnd = bomStatement.getEnd();
    const expectedBomStatement = "export const bomValue = 1;";

    return {
      available: true,
      mode: "project-backed",
      requiresProject: true,
      requiresTsconfig: true,
      sourceFilesLoaded: fixtureNames,
      capabilities: {
        basicAst:
          basicKinds.includes("InterfaceDeclaration") &&
          basicKinds.includes("SatisfiesExpression"),
        tsxAst: tsxKinds.includes("JsxElement"),
        javascriptAst: javascriptKinds.includes("FunctionDeclaration"),
        jsxAst: jsxKinds.includes("JsxElement"),
        modernSyntax:
          basicKinds.includes("SatisfiesExpression") &&
          decoratorKinds.includes("Decorator"),
        sourceTextPreserved:
          basic.text === files["/fixtures/basic.ts"] &&
          basic.getFullText() === files["/fixtures/basic.ts"] &&
          comments.getFullText() === files["/fixtures/comments.ts"],
        parentLinksAndTraversal:
          tsx.statements.length > 1 &&
          tsx.statements[1].parent?.kind === nativeAst.SyntaxKind.SourceFile,
        locatedSyntaxDiagnostics:
          syntaxDiagnostics.length > 0 &&
          typeof firstDiagnostic?.code === "number" &&
          typeof firstDiagnostic?.start === "number" &&
          typeof firstDiagnostic?.length === "number" &&
          firstDiagnostic.length > 0,
        bomConsistency:
          bom.text === files["/fixtures/bom.ts"] &&
          bom.getFullText() === files["/fixtures/bom.ts"] &&
          bom.text.slice(bomStart, bomEnd) === expectedBomStatement,
      },
      apiSurface: {
        sourceFile: {
          text: typeof basic.text === "string",
          fileName: typeof basic.fileName === "string",
          scriptKind: typeof basic.scriptKind === "number",
          statements: typeof basic.statements?.length === "number",
          parseDiagnostics: typeof basic.parseDiagnostics?.length === "number",
          getFullText: isFunction(basic.getFullText),
          getLineAndCharacterOfPosition: isFunction(
            basic.getLineAndCharacterOfPosition,
          ),
        },
        node: {
          kind: typeof firstStatement?.kind === "number",
          pos: typeof firstStatement?.pos === "number",
          end: typeof firstStatement?.end === "number",
          parent: typeof firstStatement?.parent === "object",
          forEachChild: isFunction(firstStatement?.forEachChild),
          getSourceFile: isFunction(firstStatement?.getSourceFile),
          getStart: isFunction(firstStatement?.getStart),
          getFullStart: isFunction(firstStatement?.getFullStart),
          getEnd: isFunction(firstStatement?.getEnd),
          getChildren: isFunction(firstStatement?.getChildren),
          getFirstToken: isFunction(firstStatement?.getFirstToken),
          getLastToken: isFunction(firstStatement?.getLastToken),
          getFullText: isFunction(firstStatement?.getFullText),
          getText: isFunction(firstStatement?.getText),
        },
      },
      observations: {
        bom: {
          sourceStartsWithBom: files["/fixtures/bom.ts"].charCodeAt(0) === 0xfeff,
          returnedTextStartsWithBom: bom.text.charCodeAt(0) === 0xfeff,
          fullTextStartsWithBom: bom.getFullText().charCodeAt(0) === 0xfeff,
          statementStart: bomStart,
          statementEnd: bomEnd,
          statementSlice: bom.text.slice(bomStart, bomEnd),
          expectedStatementSlice: expectedBomStatement,
        },
        firstSyntaxDiagnostic: firstDiagnostic
          ? {
              code: firstDiagnostic.code,
              start: firstDiagnostic.start,
              length: firstDiagnostic.length,
            }
          : null,
      },
    };
  });
}
