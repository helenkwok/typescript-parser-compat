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
const packageRoot = new URL(
  "./node_modules/@typescript-eslint/typescript-estree/dist/",
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
  const nativeKindName = nativeAst.SyntaxKind[node.kind] ?? String(node.kind);
  const mappedByName = ts.SyntaxKind[nativeKindName];
  const translatedKind = translateKind(node.kind);
  return {
    nativeKind: node.kind,
    nativeKindName,
    mappedByName: typeof mappedByName === "number" ? mappedByName : null,
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

function inspectKindTranslations(sourceFile) {
  const byNativeKind = new Map();
  const visit = (node) => {
    if (!byNativeKind.has(node.kind)) {
      byNativeKind.set(node.kind, describeKind(node));
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  const all = [...byNativeKind.values()].sort(
    (left, right) => left.nativeKind - right.nativeKind,
  );
  return {
    all,
    unsupported: all.filter((item) => item.mappedByName == null),
    collisions: all.filter(
      (item) =>
        item.mappedByName == null &&
        typeof ts.SyntaxKind[item.translatedKind] === "string",
    ),
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

async function readSnippet(fileName, start, end) {
  const text = await readFile(new URL(fileName, packageRoot), "utf8");
  const lines = text.split("\n");
  return lines.slice(start - 1, end).map((line, index) => ({
    line: start + index,
    text: line,
  }));
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
        kindTranslations: inspectKindTranslations(sourceFile),
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

const converterSnippets = {
  checkSyntaxError222: await readSnippet("check-syntax-errors.js", 216, 226),
  convert798: await readSnippet("convert.js", 792, 804),
  convert2012: await readSnippet("convert.js", 2006, 2018),
  convert2239: await readSnippet("convert.js", 2233, 2245),
  convert2269: await readSnippet("convert.js", 2263, 2275),
  convert2329: await readSnippet("convert.js", 2323, 2335),
};

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
  converterSnippets,
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
