import { readFile } from "node:fs/promises";

import { createVirtualFileSystem } from "@typescript/native-preview/unstable/fs";
import { API } from "@typescript/native-preview/unstable/sync";
import * as nativeAst from "@typescript/native-preview/unstable/ast";

const candidateNames = new Map([
  ["createSourceFile", { mode: "single" }],
  ["parseSourceFile", { mode: "single" }],
  ["sourceFileFromText", { mode: "single" }],
  ["parseFile", { mode: "single" }],
  ["parseSourceFiles", { mode: "batch" }],
  ["createSourceFiles", { mode: "batch" }],
]);

const fixtureDefinitions = [
  ["basic.ts", "TS"],
  ["jsx.tsx", "TSX"],
  ["plain.js", "JS"],
  ["jsx.jsx", "JSX"],
  ["comments.ts", "TS"],
  ["decorators.ts", "TS"],
  ["bom.ts", "TS"],
  ["invalid.ts", "TS"],
];

function isCallable(value) {
  return typeof value === "function";
}

function callableOwnNames(value) {
  if (value == null) {
    return [];
  }
  return Object.getOwnPropertyNames(value).filter(
    (name) => name !== "constructor" && isCallable(value[name]),
  );
}

function addCandidate(candidates, seen, owner, name, callable) {
  const definition = candidateNames.get(name);
  if (!definition || !isCallable(callable)) {
    return;
  }
  const id = `${owner}.${name}`;
  if (seen.has(id)) {
    return;
  }
  seen.add(id);
  candidates.push({
    id,
    owner,
    name,
    mode: definition.mode,
    arity: callable.length,
    callable,
  });
}

export function discoverNativeParserCandidates({
  nativeAstModule = nativeAst,
  ApiClass = API,
} = {}) {
  const candidates = [];
  const seen = new Set();

  for (const name of callableOwnNames(nativeAstModule)) {
    addCandidate(candidates, seen, "native-ast", name, nativeAstModule[name]);
  }
  for (const name of callableOwnNames(ApiClass)) {
    addCandidate(candidates, seen, "sync-api-static", name, ApiClass[name]);
  }
  for (const name of callableOwnNames(ApiClass?.prototype)) {
    addCandidate(
      candidates,
      seen,
      "sync-api-instance",
      name,
      ApiClass.prototype[name],
    );
  }

  return candidates;
}

export function serializeNativeParserCandidate(candidate) {
  return {
    id: candidate.id,
    owner: candidate.owner,
    name: candidate.name,
    mode: candidate.mode,
    arity: candidate.arity,
  };
}

function isSourceFileLike(value) {
  return (
    value != null &&
    typeof value === "object" &&
    typeof value.kind === "number" &&
    typeof value.text === "string" &&
    typeof value.forEachChild === "function"
  );
}

function unwrapBatchResult(value) {
  if (Array.isArray(value)) {
    return value[0];
  }
  if (Array.isArray(value?.results)) {
    return value.results[0];
  }
  if (Array.isArray(value?.sourceFiles)) {
    return {
      sourceFile: value.sourceFiles[0],
      diagnostics: value.diagnostics?.[0] ?? value.diagnostics,
    };
  }
  return value?.result ?? value;
}

export function normalizeNativeParseResult(rawResult) {
  if (rawResult && typeof rawResult.then === "function") {
    throw new TypeError(
      "Isolated parser candidate returned a Promise; synchronous tooling requires a synchronous result",
    );
  }

  const result = unwrapBatchResult(rawResult);
  const sourceFile = isSourceFileLike(result)
    ? result
    : result?.sourceFile ?? result?.ast ?? result?.file;

  if (!isSourceFileLike(sourceFile)) {
    throw new TypeError(
      "Parser candidate did not return a SourceFile-like object or { sourceFile, diagnostics }",
    );
  }

  const diagnostics =
    result?.diagnostics ??
    sourceFile.parseDiagnostics ??
    sourceFile.diagnostics ??
    [];

  return {
    sourceFile,
    diagnostics: Array.isArray(diagnostics) ? diagnostics : [],
  };
}

function invokeSingle(callable, receiver, candidate, request) {
  if (candidate.name === "createSourceFile" && callable.length > 1) {
    return callable.call(
      receiver,
      request.fileName,
      request.text,
      request.languageVersion,
      request.setParentNodes,
      request.scriptKind,
    );
  }

  if (callable.length > 1) {
    return callable.call(
      receiver,
      request.fileName,
      request.text,
      request.scriptKind,
      request.languageVersion,
      request.setParentNodes,
    );
  }

  return callable.call(receiver, request);
}

export function createNativeParserCandidateSession(
  candidate,
  {
    nativeAstModule = nativeAst,
    ApiClass = API,
    createFs = createVirtualFileSystem,
  } = {},
) {
  let receiver;
  let close = () => {};

  if (candidate.owner === "native-ast") {
    receiver = nativeAstModule;
  } else if (candidate.owner === "sync-api-static") {
    receiver = ApiClass;
  } else if (candidate.owner === "sync-api-instance") {
    receiver = new ApiClass({ cwd: "/", fs: createFs({}) });
    close = () => receiver.close?.();
  } else {
    throw new Error(`Unknown parser candidate owner: ${candidate.owner}`);
  }

  const callable =
    candidate.owner === "sync-api-instance"
      ? receiver[candidate.name]
      : candidate.callable ?? receiver[candidate.name];

  if (!isCallable(callable)) {
    close();
    throw new TypeError(`${candidate.id} is no longer callable`);
  }

  return {
    parse(request) {
      const rawResult =
        candidate.mode === "batch"
          ? callable.call(receiver, [request])
          : invokeSingle(callable, receiver, candidate, request);
      return normalizeNativeParseResult(rawResult);
    },
    close,
  };
}

function collectKindNames(sourceFile, nativeAstModule) {
  const names = [];
  const visit = (node) => {
    names.push(nativeAstModule.SyntaxKind?.[node.kind] ?? String(node.kind));
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return names;
}

function locatedDiagnostic(diagnostic) {
  return (
    typeof diagnostic?.code === "number" &&
    ((typeof diagnostic?.pos === "number" &&
      typeof diagnostic?.end === "number" &&
      diagnostic.end >= diagnostic.pos) ||
      (typeof diagnostic?.start === "number" &&
        typeof diagnostic?.length === "number" &&
        diagnostic.length >= 0))
  );
}

function sourceFileSummary(parsed, nativeAstModule) {
  const { sourceFile, diagnostics } = parsed;
  return {
    textLength: sourceFile.text.length,
    startsWithBom: sourceFile.text.charCodeAt(0) === 0xfeff,
    scriptKind: sourceFile.scriptKind ?? null,
    statementCount: sourceFile.statements?.length ?? null,
    diagnosticCount: diagnostics.length,
    kindNames: collectKindNames(sourceFile, nativeAstModule),
  };
}

async function loadFixtures() {
  return Object.fromEntries(
    await Promise.all(
      fixtureDefinitions.map(async ([name, scriptKindName]) => [
        name,
        {
          scriptKindName,
          text: await readFile(new URL(`../fixtures/${name}`, import.meta.url), "utf8"),
        },
      ]),
    ),
  );
}

function requestFor(fileName, fixture, nativeAstModule) {
  const scriptKind = nativeAstModule.ScriptKind?.[fixture.scriptKindName];
  const languageVersion = nativeAstModule.ScriptTarget?.Latest;
  const request = {
    fileName,
    text: fixture.text,
    setParentNodes: true,
  };
  if (typeof scriptKind !== "undefined") {
    request.scriptKind = scriptKind;
  }
  if (typeof languageVersion !== "undefined") {
    request.languageVersion = languageVersion;
  }
  return request;
}

function candidateCapabilities(parsed, fixtures, nativeAstModule) {
  const basic = parsed["basic.ts"]?.result;
  const tsx = parsed["jsx.tsx"]?.result;
  const javascript = parsed["plain.js"]?.result;
  const jsx = parsed["jsx.jsx"]?.result;
  const comments = parsed["comments.ts"]?.result;
  const decorators = parsed["decorators.ts"]?.result;
  const bom = parsed["bom.ts"]?.result;
  const invalid = parsed["invalid.ts"]?.result;

  const kinds = (entry) =>
    entry ? collectKindNames(entry.sourceFile, nativeAstModule) : [];

  const bomStatement = bom?.sourceFile?.statements?.[0];
  const bomStart = bomStatement?.getStart?.(bom.sourceFile);
  const bomEnd = bomStatement?.getEnd?.() ?? bomStatement?.end;

  return {
    "source-text-entry-point": Boolean(basic),
    "script-kind-selection":
      kinds(tsx).includes("JsxElement") &&
      kinds(javascript).includes("FunctionDeclaration") &&
      kinds(jsx).includes("JsxElement") &&
      !kinds(jsx).includes("TypeAliasDeclaration"),
    "source-text-and-offsets":
      basic?.sourceFile.text === fixtures["basic.ts"].text &&
      typeof basic?.sourceFile.statements?.[0]?.pos === "number" &&
      typeof basic?.sourceFile.statements?.[0]?.end === "number",
    "bom-consistency":
      bom?.sourceFile.text === fixtures["bom.ts"].text &&
      bom?.sourceFile.getFullText?.() === fixtures["bom.ts"].text &&
      typeof bomStart === "number" &&
      typeof bomEnd === "number" &&
      bom.sourceFile.text.slice(bomStart, bomEnd) ===
        "export const bomValue = 1;",
    "comments-and-token-scanning":
      comments?.sourceFile.text === fixtures["comments.ts"].text &&
      typeof nativeAstModule.createScanner === "function",
    "located-syntax-diagnostics":
      invalid?.diagnostics?.length > 0 &&
      locatedDiagnostic(invalid.diagnostics[0]),
    "parent-links-and-traversal":
      typeof tsx?.sourceFile.forEachChild === "function" &&
      tsx?.sourceFile.statements?.[1]?.parent === tsx.sourceFile &&
      typeof nativeAstModule.getTokenAtPosition === "function",
    "modern-typescript-syntax":
      kinds(basic).includes("SatisfiesExpression") &&
      kinds(decorators).includes("Decorator"),
  };
}

function candidateStatus(capabilities) {
  const values = Object.values(capabilities);
  if (values.length > 0 && values.every(Boolean)) {
    return "ready";
  }
  if (values.some(Boolean)) {
    return "partial";
  }
  return "incompatible";
}

export async function runNativeParserCandidateProbe({
  nativeAstModule = nativeAst,
  ApiClass = API,
  createFs = createVirtualFileSystem,
} = {}) {
  const fixtures = await loadFixtures();
  const candidates = discoverNativeParserCandidates({ nativeAstModule, ApiClass });
  const reports = [];

  for (const candidate of candidates) {
    const parsed = {};
    let session;
    try {
      session = createNativeParserCandidateSession(candidate, {
        nativeAstModule,
        ApiClass,
        createFs,
      });
      for (const [fileName, fixture] of Object.entries(fixtures)) {
        try {
          const result = session.parse(
            requestFor(fileName, fixture, nativeAstModule),
          );
          parsed[fileName] = {
            success: true,
            result,
            summary: sourceFileSummary(result, nativeAstModule),
          };
        } catch (error) {
          parsed[fileName] = {
            success: false,
            error: {
              name: error?.name ?? "Error",
              message: String(error?.message ?? error),
            },
          };
        }
      }
    } catch (error) {
      reports.push({
        candidate: serializeNativeParserCandidate(candidate),
        status: "incompatible",
        setupError: {
          name: error?.name ?? "Error",
          message: String(error?.message ?? error),
        },
        capabilities: {},
        fixtures: {},
      });
      continue;
    } finally {
      session?.close();
    }

    const capabilities = candidateCapabilities(parsed, fixtures, nativeAstModule);
    reports.push({
      candidate: serializeNativeParserCandidate(candidate),
      status: candidateStatus(capabilities),
      capabilities,
      fixtures: Object.fromEntries(
        Object.entries(parsed).map(([fileName, entry]) => [
          fileName,
          entry.success
            ? { success: true, summary: entry.summary }
            : { success: false, error: entry.error },
        ]),
      ),
    });
  }

  const capabilityIds = [
    "source-text-entry-point",
    "script-kind-selection",
    "source-text-and-offsets",
    "bom-consistency",
    "comments-and-token-scanning",
    "located-syntax-diagnostics",
    "parent-links-and-traversal",
    "modern-typescript-syntax",
  ];
  const capabilities = Object.fromEntries(
    capabilityIds.map((id) => [
      id,
      reports.some((report) => report.capabilities?.[id] === true),
    ]),
  );

  return {
    status:
      candidates.length === 0
        ? "absent"
        : reports.some((report) => report.status === "ready")
          ? "ready"
          : reports.some((report) => report.status === "partial")
            ? "partial"
            : "incompatible",
    candidates: candidates.map(serializeNativeParserCandidate),
    capabilities,
    reports,
  };
}
