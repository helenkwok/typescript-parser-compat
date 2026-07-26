import { readFile, writeFile } from "node:fs/promises";

import {
  parseAndGenerateServices,
  version as typescriptEstreeVersion,
} from "@typescript-eslint/typescript-estree";
import ts from "typescript";
import * as nativeAst from "@typescript/native-preview/unstable/ast";

import { normalizeNativeDiagnostic } from "../../adapters/native-diagnostic.mjs";
import { withNativeProject } from "../../adapters/native-project.mjs";

const fixtureNames = [
  "plain.js",
  "jsx.jsx",
  "comments.ts",
  "basic.ts",
  "decorators.ts",
  "invalid.ts",
];

const reportUrl = new URL(
  "../../typescript-estree-native-conversion.json",
  import.meta.url,
);

function isNode(value) {
  return (
    value != null &&
    typeof value === "object" &&
    typeof value.kind === "number" &&
    typeof value.pos === "number" &&
    typeof value.end === "number"
  );
}

function translateKind(kind) {
  const name = nativeAst.SyntaxKind[kind];
  const translated = typeof name === "string" ? ts.SyntaxKind[name] : undefined;
  return typeof translated === "number" ? translated : kind;
}

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

function summarizeConversion(result) {
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
}

function attemptConversion(sourceFile, fileName, overrides = {}) {
  try {
    return summarizeConversion(
      parseAndGenerateServices(sourceFile, {
        filePath: fileName,
        jsx: fileName.endsWith("x"),
        loc: true,
        range: true,
        comment: true,
        tokens: true,
        preserveNodeMaps: true,
        ...overrides,
      }),
    );
  } catch (error) {
    return {
      success: false,
      error: summarizeError(error),
    };
  }
}

function createDiagnosticOnlyAdapter(sourceFile, diagnostics, getSourceFile) {
  const normalized = diagnostics.map((diagnostic) =>
    normalizeNativeDiagnostic(diagnostic, getSourceFile),
  );

  return new Proxy(sourceFile, {
    get(target, property) {
      if (property === "parseDiagnostics") {
        return normalized;
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function createDeepAdapter(
  sourceFile,
  diagnostics,
  getSourceFile,
  { structural },
) {
  const nodeCache = new WeakMap();
  const arrayCache = new WeakMap();
  const rawByProxy = new WeakMap();
  let normalizedDiagnostics = [];
  let wrappedSourceFile;

  function unwrap(value) {
    return rawByProxy.get(value) ?? value;
  }

  function wrapArray(array) {
    if (!array || typeof array !== "object") {
      return array;
    }
    const cached = arrayCache.get(array);
    if (cached) {
      return cached;
    }

    const proxy = new Proxy(array, {
      get(target, property) {
        const value = Reflect.get(target, property, target);
        if (typeof property === "string" && /^\d+$/.test(property)) {
          return wrap(value);
        }
        if (property === Symbol.iterator) {
          return function* iterator() {
            for (const item of target) {
              yield wrap(item);
            }
          };
        }
        if (typeof value === "function") {
          if (property === "map") {
            return (callback, thisArg) =>
              target.map((item, index) =>
                callback.call(thisArg, wrap(item), index, proxy),
              );
          }
          return (...args) => value.apply(target, args.map(unwrap));
        }
        return isNode(value) ? wrap(value) : value;
      },
    });
    arrayCache.set(array, proxy);
    rawByProxy.set(proxy, array);
    return proxy;
  }

  function createSyntheticToken(kind, fullStart, start, end, parent) {
    const token = {
      kind,
      flags: 0,
      pos: fullStart,
      end,
      parent,
      getSourceFile: () => wrappedSourceFile,
      getFullStart: () => fullStart,
      getStart: () => start,
      getEnd: () => end,
      getWidth: () => end - start,
      getFullWidth: () => end - fullStart,
      getLeadingTriviaWidth: () => start - fullStart,
      getFullText: () => sourceFile.text.slice(fullStart, end),
      getText: () => sourceFile.text.slice(start, end),
      getChildren: () => [],
      getChildCount: () => 0,
      getChildAt: () => undefined,
      getFirstToken: () => token,
      getLastToken: () => token,
      forEachChild: () => undefined,
    };
    return token;
  }

  function scanGap(start, end, parent) {
    if (end <= start) {
      return [];
    }
    const scanner = ts.createScanner(
      ts.ScriptTarget.Latest,
      true,
      sourceFile.languageVariant ?? ts.LanguageVariant.Standard,
      sourceFile.text,
    );
    scanner.setTextPos(Math.max(0, start));
    const tokens = [];

    while (scanner.getTextPos() < end) {
      const kind = scanner.scan();
      if (kind === ts.SyntaxKind.EndOfFileToken) {
        break;
      }
      const fullStart = scanner.getTokenFullStart();
      const tokenStart = scanner.getTokenStart();
      const tokenEnd = scanner.getTextPos();
      if (tokenEnd <= start) {
        continue;
      }
      if (fullStart >= end || tokenEnd > end) {
        break;
      }
      tokens.push(
        createSyntheticToken(kind, fullStart, tokenStart, tokenEnd, wrap(parent)),
      );
    }
    return tokens;
  }

  function directChildren(node) {
    const children = [];
    node.forEachChild(
      (child) => {
        children.push(child);
        return undefined;
      },
      (nodes) => {
        for (const child of nodes) {
          children.push(child);
        }
        return undefined;
      },
    );
    children.sort((left, right) => left.pos - right.pos || left.end - right.end);
    return children;
  }

  function getChildren(node) {
    const children = directChildren(node);
    const result = [];
    let cursor = node.pos;
    for (const child of children) {
      result.push(...scanGap(cursor, child.pos, node));
      result.push(wrap(child));
      cursor = Math.max(cursor, child.end);
    }
    result.push(...scanGap(cursor, node.end, node));
    return result;
  }

  function nodeStart(node) {
    return node.getStart(sourceFile);
  }

  function firstToken(node) {
    const position = Math.min(nodeStart(node), Math.max(0, node.end - 1));
    return wrap(nativeAst.getTokenAtPosition(sourceFile, position));
  }

  function lastToken(node) {
    const token = nativeAst.findPrecedingToken(sourceFile, node.end);
    return token ? wrap(token) : undefined;
  }

  function wrap(value) {
    if (Array.isArray(value)) {
      return wrapArray(value);
    }
    if (!isNode(value)) {
      return value;
    }
    const cached = nodeCache.get(value);
    if (cached) {
      return cached;
    }

    const proxy = new Proxy(value, {
      get(target, property) {
        if (property === "kind") {
          return translateKind(target.kind);
        }
        if (target === sourceFile && property === "parseDiagnostics") {
          return normalizedDiagnostics;
        }
        if (property === "getSourceFile") {
          return () => wrappedSourceFile;
        }
        if (property === "forEachChild") {
          return (nodeCallback, nodesCallback) =>
            target.forEachChild(
              nodeCallback
                ? (child) => nodeCallback(wrap(child))
                : undefined,
              nodesCallback
                ? (children) => nodesCallback(wrapArray(children))
                : undefined,
            );
        }
        if (structural && property === "getChildren") {
          return () => getChildren(target);
        }
        if (structural && property === "getChildCount") {
          return () => getChildren(target).length;
        }
        if (structural && property === "getChildAt") {
          return (index) => getChildren(target)[index];
        }
        if (structural && property === "getFirstToken") {
          return () => firstToken(target);
        }
        if (structural && property === "getLastToken") {
          return () => lastToken(target);
        }
        if (structural && property === "getWidth") {
          return () => target.getEnd() - nodeStart(target);
        }
        if (structural && property === "getFullWidth") {
          return () => target.end - target.pos;
        }
        if (structural && property === "getLeadingTriviaWidth") {
          return () => nodeStart(target) - target.pos;
        }

        const result = Reflect.get(target, property, target);
        if (typeof result === "function") {
          return (...args) => {
            const returned = result.apply(target, args.map(unwrap));
            return Array.isArray(returned) || isNode(returned)
              ? wrap(returned)
              : returned;
          };
        }
        if (Array.isArray(result) || isNode(result)) {
          return wrap(result);
        }
        return result;
      },
    });

    nodeCache.set(value, proxy);
    rawByProxy.set(proxy, value);
    if (value === sourceFile) {
      wrappedSourceFile = proxy;
    }
    return proxy;
  }

  wrappedSourceFile = wrap(sourceFile);
  normalizedDiagnostics = diagnostics.map((diagnostic) =>
    normalizeNativeDiagnostic(diagnostic, (fileName) => wrap(getSourceFile(fileName))),
  );
  return wrappedSourceFile;
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
    const structuralSourceFile = createDeepAdapter(
      sourceFile,
      diagnostics,
      getSourceFile,
      { structural: true },
    );

    fixtureResults[fileName] = {
      preflight: {
        nativeKind: sourceFile.kind,
        nativeKindName: nativeAst.SyntaxKind[sourceFile.kind] ?? null,
        converterSourceFileKind: ts.SyntaxKind.SourceFile,
        kindMatchesConverter: sourceFile.kind === ts.SyntaxKind.SourceFile,
        translatedKind: translateKind(sourceFile.kind),
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
      structuralAdapter: attemptConversion(structuralSourceFile, fileName),
      structuralAllowInvalid: attemptConversion(structuralSourceFile, fileName, {
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
  stages: {
    raw: "Unmodified native SourceFile",
    diagnosticAdapter: "Adds legacy parseDiagnostics shape only",
    kindAdapter:
      "Adds diagnostic normalization and maps native SyntaxKind values to TypeScript 6 values",
    structuralAdapter:
      "Also adds recursive child wrapping, standard node range/child methods, and scanner-backed token methods",
    structuralAllowInvalid:
      "Uses the same structural adapter while disabling typescript-estree's additional AST validity checks",
  },
  fixtures: results,
};

await writeFile(reportUrl, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
