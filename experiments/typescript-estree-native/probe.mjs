import { readFile, writeFile } from "node:fs/promises";

import {
  parseAndGenerateServices,
  version as typescriptEstreeVersion,
} from "@typescript-eslint/typescript-estree";
import ts from "typescript";
import * as nativeAst from "@typescript/native-preview/unstable/ast";

import { withNativeProject } from "../../adapters/native-project.mjs";
import {
  canonicalizeNativeSyntaxKindReverseMap,
} from "./canonical-kind-map.mjs";
import {
  createDeepAdapter,
  createDiagnosticOnlyAdapter,
  translateKind,
} from "./native-estree-adapter.mjs";

const fixtureNames = [
  "plain.js",
  "jsx.jsx",
  "comments.ts",
  "basic.ts",
  "decorator-simple.ts",
  "generic-constructor.ts",
  "decorators.ts",
  "invalid.ts",
];

const reportUrl = new URL(
  "../../typescript-estree-native-conversion.json",
  import.meta.url,
);

const kindAliasChanges = canonicalizeNativeSyntaxKindReverseMap();

function summarizeError(error) {
  return {
    name: error?.name ?? "Error",
    message: String(error?.message ?? error),
    lineNumber: error?.lineNumber ?? null,
    column: error?.column ?? null,
    stack: String(error?.stack ?? "")
      .split("\n")
      .slice(0, 8),
  };
}

function attemptConversion(sourceFile, fileName, overrides = {}) {
  try {
    const result = parseAndGenerateServices(sourceFile, {
      filePath: fileName,
      jsx: fileName.endsWith("x"),
      loc: true,
      range: true,
      comment: true,
      tokens: true,
      preserveNodeMaps: true,
      ...overrides,
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

function describeKind(node) {
  if (!node || typeof node.kind !== "number") {
    return null;
  }
  const translatedKind = translateKind(node.kind);
  return {
    nativeKind: node.kind,
    nativeKindName: nativeAst.SyntaxKind[node.kind] ?? String(node.kind),
    translatedKind,
    translatedKindName: ts.SyntaxKind[translatedKind] ?? String(translatedKind),
    text: node.text ?? null,
  };
}

function describeNodeList(nodes) {
  return nodes ? Array.from(nodes, describeKind) : null;
}

function describeNode(node) {
  const children = [];
  node.forEachChild(
    (child) => {
      children.push(describeKind(child));
      return undefined;
    },
    (list) => {
      for (const child of list) {
        children.push(describeKind(child));
      }
      return undefined;
    },
  );

  let legacyDecorators;
  let legacyModifiers;
  try {
    legacyDecorators = ts.canHaveDecorators(node)
      ? describeNodeList(ts.getDecorators(node))
      : null;
  } catch (error) {
    legacyDecorators = { error: String(error?.message ?? error) };
  }
  try {
    legacyModifiers = ts.canHaveModifiers(node)
      ? describeNodeList(ts.getModifiers(node))
      : null;
  } catch (error) {
    legacyModifiers = { error: String(error?.message ?? error) };
  }

  return {
    ...describeKind(node),
    keys: Object.keys(node).sort(),
    name: describeKind(node.name),
    expression: describeKind(node.expression),
    rawModifiers: describeNodeList(node.modifiers),
    rawDecorators: describeNodeList(node.decorators),
    legacyDecorators,
    legacyModifiers,
    children,
  };
}

function inspectDecoratorSurface(sourceFile) {
  const interesting = [];
  const visit = (node) => {
    const name = nativeAst.SyntaxKind[node.kind];
    if (
      ["Decorator", "ClassDeclaration", "PropertyDeclaration"].includes(name)
    ) {
      interesting.push(describeNode(node));
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return interesting;
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
const results = withNativeProject(files, ({ project, getSourceFile }) => {
  const fixtureResults = {};

  for (const fileName of Object.keys(files)) {
    const sourceFile = getSourceFile(fileName);
    const diagnostics = project.program.getSyntacticDiagnostics(fileName);
    const structural = () =>
      createDeepAdapter(sourceFile, diagnostics, getSourceFile, {
        structural: true,
      });

    fixtureResults[fileName] = {
      preflight: {
        nativeKind: sourceFile.kind,
        nativeKindName: nativeAst.SyntaxKind[sourceFile.kind] ?? null,
        converterSourceFileKind: ts.SyntaxKind.SourceFile,
        kindMatchesConverter: sourceFile.kind === ts.SyntaxKind.SourceFile,
        translatedKind: translateKind(sourceFile.kind),
        decoratorSurface:
          fileName.includes("decorator")
            ? inspectDecoratorSurface(sourceFile)
            : undefined,
      },
      raw: attemptConversion(sourceFile, fileName),
      diagnosticAdapter: attemptConversion(
        createDiagnosticOnlyAdapter(sourceFile, diagnostics, getSourceFile),
        fileName,
      ),
      kindAdapter: attemptConversion(
        createDeepAdapter(sourceFile, diagnostics, getSourceFile, {
          structural: false,
        }),
        fileName,
      ),
      structuralAdapter: attemptConversion(structural(), fileName),
      structuralStrict: attemptConversion(structural(), fileName, {
        errorOnUnknownASTType: true,
      }),
      structuralAllowInvalid: attemptConversion(structural(), fileName, {
        allowInvalidAST: true,
      }),
    };
  }

  return fixtureResults;
});

const report = {
  generatedAt: new Date().toISOString(),
  packages: {
    typescriptEstree: typescriptEstreeVersion,
    converterTypeScript: ts.version,
  },
  nativeApiMode: "project-backed",
  kindAliasChanges,
  nativeDecoratorUtilities: {
    canHaveDecorators: typeof nativeAst.canHaveDecorators,
    getDecorators: typeof nativeAst.getDecorators,
    canHaveModifiers: typeof nativeAst.canHaveModifiers,
    getModifiers: typeof nativeAst.getModifiers,
  },
  stages: {
    raw: "Unmodified native SourceFile",
    diagnosticAdapter: "Adds legacy parseDiagnostics shape only",
    kindAdapter:
      "Adds diagnostic normalization and maps canonical native SyntaxKind names to TypeScript 6 values",
    structuralAdapter:
      "Also adds recursive child wrapping, standard node range/child methods, and scanner-backed token methods",
    structuralStrict:
      "Uses the structural adapter and asks typescript-estree to reject unknown AST node kinds",
    structuralAllowInvalid:
      "Uses the structural adapter while disabling typescript-estree's additional AST validity checks",
  },
  fixtures: results,
};

await writeFile(reportUrl, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
