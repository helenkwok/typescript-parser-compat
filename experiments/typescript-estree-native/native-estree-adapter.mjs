import ts from "typescript";
import * as nativeAst from "@typescript/native-preview/unstable/ast";

import { normalizeNativeDiagnostic } from "../../adapters/native-diagnostic.mjs";
import { chooseCanonicalKindName } from "./canonical-kind-map.mjs";

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
  const name = chooseCanonicalKindName(kind);
  const translated = typeof name === "string" ? ts.SyntaxKind[name] : undefined;
  return typeof translated === "number" ? translated : kind;
}

export function createAdapterInstrumentation() {
  return {
    nodeProxyCreates: 0,
    nodeProxyCacheHits: 0,
    arrayProxyCreates: 0,
    arrayProxyCacheHits: 0,
    getChildrenRequests: 0,
    getChildrenComputations: 0,
    getChildrenCacheHits: 0,
    directChildrenCalls: 0,
    gapScans: 0,
    scannerCreations: 0,
    syntheticTokens: 0,
    nodeStartRequests: 0,
    nodeStartComputations: 0,
    nodeStartCacheHits: 0,
    firstTokenRequests: 0,
    firstTokenComputations: 0,
    firstTokenCacheHits: 0,
    lastTokenRequests: 0,
    lastTokenComputations: 0,
    lastTokenCacheHits: 0,
  };
}

function increment(instrumentation, name, amount = 1) {
  if (!instrumentation) {
    return;
  }
  instrumentation[name] = (instrumentation[name] ?? 0) + amount;
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
  { structural = false, instrumentation } = {},
) {
  const nodeCache = new WeakMap();
  const arrayCache = new WeakMap();
  const rawByProxy = new WeakMap();
  const childrenCache = new WeakMap();
  const startCache = new WeakMap();
  const firstTokenCache = new WeakMap();
  const lastTokenCache = new WeakMap();
  let normalizedDiagnostics = [];
  let wrappedSourceFile;
  let scanner;

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
      increment(instrumentation, "arrayProxyCacheHits");
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
    increment(instrumentation, "arrayProxyCreates");
    return proxy;
  }

  function createSyntheticToken(kind, fullStart, start, end, parent) {
    const wrappedParent = wrap(parent);
    const token = {
      kind,
      flags: 0,
      pos: fullStart,
      end,
      parent: wrappedParent,
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
    increment(instrumentation, "syntheticTokens");
    return token;
  }

  function getScanner() {
    if (!scanner) {
      scanner = ts.createScanner(
        ts.ScriptTarget.Latest,
        true,
        sourceFile.languageVariant ?? ts.LanguageVariant.Standard,
        sourceFile.text,
      );
      increment(instrumentation, "scannerCreations");
    }
    return scanner;
  }

  function scanGap(start, end, parent) {
    if (end <= start) {
      return [];
    }
    increment(instrumentation, "gapScans");
    const gapScanner = getScanner();
    gapScanner.setTextPos(Math.max(0, start));
    const tokens = [];

    while (gapScanner.getTextPos() < end) {
      const kind = gapScanner.scan();
      if (kind === ts.SyntaxKind.EndOfFileToken) {
        break;
      }
      const fullStart = gapScanner.getTokenFullStart();
      const tokenStart = gapScanner.getTokenStart();
      const tokenEnd = gapScanner.getTextPos();
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
    increment(instrumentation, "directChildrenCalls");
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
    increment(instrumentation, "getChildrenRequests");
    if (childrenCache.has(node)) {
      increment(instrumentation, "getChildrenCacheHits");
      return childrenCache.get(node);
    }

    increment(instrumentation, "getChildrenComputations");
    const children = directChildren(node);
    const result = [];
    let cursor = node.pos;
    for (const child of children) {
      result.push(...scanGap(cursor, child.pos, node));
      result.push(wrap(child));
      cursor = Math.max(cursor, child.end);
    }
    result.push(...scanGap(cursor, node.end, node));
    childrenCache.set(node, result);
    return result;
  }

  function nodeStart(node) {
    increment(instrumentation, "nodeStartRequests");
    if (startCache.has(node)) {
      increment(instrumentation, "nodeStartCacheHits");
      return startCache.get(node);
    }
    increment(instrumentation, "nodeStartComputations");
    const start = node.getStart(sourceFile);
    startCache.set(node, start);
    return start;
  }

  function firstToken(node) {
    increment(instrumentation, "firstTokenRequests");
    if (firstTokenCache.has(node)) {
      increment(instrumentation, "firstTokenCacheHits");
      return firstTokenCache.get(node);
    }
    increment(instrumentation, "firstTokenComputations");
    const position = Math.min(nodeStart(node), Math.max(0, node.end - 1));
    const token = wrap(nativeAst.getTokenAtPosition(sourceFile, position));
    firstTokenCache.set(node, token);
    return token;
  }

  function lastToken(node) {
    increment(instrumentation, "lastTokenRequests");
    if (lastTokenCache.has(node)) {
      increment(instrumentation, "lastTokenCacheHits");
      return lastTokenCache.get(node);
    }
    increment(instrumentation, "lastTokenComputations");
    const rawToken = nativeAst.findPrecedingToken(sourceFile, node.end);
    const token = rawToken ? wrap(rawToken) : undefined;
    lastTokenCache.set(node, token);
    return token;
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
      increment(instrumentation, "nodeProxyCacheHits");
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
    increment(instrumentation, "nodeProxyCreates");
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
