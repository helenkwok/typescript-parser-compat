import ts from "typescript";
import * as nativeAst from "@typescript/native-preview/unstable/ast";

import { normalizeNativeDiagnostic } from "../../adapters/native-diagnostic.mjs";

export const syntheticTokenTelemetry = [];

function isNode(value) {
  return (
    value != null &&
    typeof value === "object" &&
    typeof value.kind === "number" &&
    typeof value.pos === "number" &&
    typeof value.end === "number"
  );
}

export function translateKind(kind) {
  const name = nativeAst.SyntaxKind[kind];
  const translated = typeof name === "string" ? ts.SyntaxKind[name] : undefined;
  return typeof translated === "number" ? translated : kind;
}

export function createDiagnosticOnlyAdapter(
  sourceFile,
  diagnostics,
  getSourceFile,
) {
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

export function createDeepAdapter(
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

  function wrapResult(value) {
    if (Array.isArray(value)) {
      return wrapArray(value);
    }
    return isNode(value) ? wrap(value) : value;
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
              wrapArray(
                target.map((item, index) =>
                  callback.call(thisArg, wrap(item), index, proxy),
                ),
              );
          }
          if (property === "filter") {
            return (callback, thisArg) =>
              wrapArray(
                target.filter((item, index) =>
                  callback.call(thisArg, wrap(item), index, proxy),
                ),
              );
          }
          if (property === "find") {
            return (callback, thisArg) =>
              wrap(
                target.find((item, index) =>
                  callback.call(thisArg, wrap(item), index, proxy),
                ),
              );
          }
          if (property === "findLast") {
            return (callback, thisArg) =>
              wrap(
                target.findLast((item, index) =>
                  callback.call(thisArg, wrap(item), index, proxy),
                ),
              );
          }
          if (property === "forEach") {
            return (callback, thisArg) =>
              target.forEach((item, index) =>
                callback.call(thisArg, wrap(item), index, proxy),
              );
          }
          if (property === "some" || property === "every") {
            return (callback, thisArg) =>
              target[property]((item, index) =>
                callback.call(thisArg, wrap(item), index, proxy),
              );
          }
          return (...args) =>
            wrapResult(value.apply(target, args.map(unwrap)));
        }
        return wrapResult(value);
      },
    });
    arrayCache.set(array, proxy);
    rawByProxy.set(proxy, array);
    return proxy;
  }

  function createSyntheticToken(kind, fullStart, start, end, parent) {
    const text = sourceFile.text.slice(start, end);
    syntheticTokenTelemetry.push({
      fileName: sourceFile.fileName,
      kind,
      kindName: ts.SyntaxKind[kind] ?? String(kind),
      fullStart,
      start,
      end,
      text,
      parentNativeKind: parent?.kind ?? null,
      parentNativeKindName:
        typeof parent?.kind === "number"
          ? nativeAst.SyntaxKind[parent.kind] ?? String(parent.kind)
          : null,
    });

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
      getText: () => text,
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
        createSyntheticToken(kind, fullStart, tokenStart, tokenEnd, parent),
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
          return (...args) =>
            wrapResult(result.apply(target, args.map(unwrap)));
        }
        return wrapResult(result);
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
