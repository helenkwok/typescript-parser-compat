import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeParserCandidateSession,
  discoverNativeParserCandidates,
  normalizeNativeParseResult,
} from "../scripts/native-parser-candidates.mjs";

function sourceFile(text = "export const value = 1;") {
  return {
    kind: 999,
    text,
    statements: [],
    parseDiagnostics: [],
    forEachChild() {},
    getFullText() {
      return text;
    },
  };
}

test("candidate discovery uses a narrow allowlist", () => {
  const module = {
    parse() {},
    parseSourceFile() {},
    helper() {},
    parseSourceFiles() {},
  };
  class FakeApi {
    parseFile() {}
    updateSnapshot() {}
  }
  FakeApi.createSourceFiles = () => {};

  const candidates = discoverNativeParserCandidates({
    nativeAstModule: module,
    ApiClass: FakeApi,
  });

  assert.deepEqual(
    candidates.map((candidate) => candidate.id).sort(),
    [
      "native-ast.parseSourceFile",
      "native-ast.parseSourceFiles",
      "sync-api-instance.parseFile",
      "sync-api-static.createSourceFiles",
    ],
  );
});

test("object-request module candidate returns normalized source and diagnostics", () => {
  const requests = [];
  const module = {
    parseSourceFile(request) {
      requests.push(request);
      return {
        sourceFile: sourceFile(request.text),
        diagnostics: [{ code: 1000, pos: 0, end: 1 }],
      };
    },
  };
  class FakeApi {}
  const [candidate] = discoverNativeParserCandidates({
    nativeAstModule: module,
    ApiClass: FakeApi,
  });
  const session = createNativeParserCandidateSession(candidate, {
    nativeAstModule: module,
    ApiClass: FakeApi,
  });

  const result = session.parse({
    fileName: "input.ts",
    text: "const value = 1;",
    scriptKind: 3,
    languageVersion: 99,
    setParentNodes: true,
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].fileName, "input.ts");
  assert.equal(result.sourceFile.text, "const value = 1;");
  assert.equal(result.diagnostics[0].code, 1000);
});

test("legacy createSourceFile candidate receives positional arguments", () => {
  let received;
  const module = {
    createSourceFile(fileName, text, languageVersion, setParentNodes, scriptKind) {
      received = {
        fileName,
        text,
        languageVersion,
        setParentNodes,
        scriptKind,
      };
      return sourceFile(text);
    },
  };
  class FakeApi {}
  const [candidate] = discoverNativeParserCandidates({
    nativeAstModule: module,
    ApiClass: FakeApi,
  });
  const session = createNativeParserCandidateSession(candidate, {
    nativeAstModule: module,
    ApiClass: FakeApi,
  });

  session.parse({
    fileName: "legacy.ts",
    text: "let legacy = true;",
    scriptKind: 3,
    languageVersion: 99,
    setParentNodes: true,
  });

  assert.deepEqual(received, {
    fileName: "legacy.ts",
    text: "let legacy = true;",
    languageVersion: 99,
    setParentNodes: true,
    scriptKind: 3,
  });
});

test("sync API instance candidate is created without a project and closed", () => {
  let constructedOptions;
  let closed = false;
  class FakeApi {
    constructor(options) {
      constructedOptions = options;
    }
    parseSourceFile(request) {
      return sourceFile(request.text);
    }
    close() {
      closed = true;
    }
  }

  const [candidate] = discoverNativeParserCandidates({
    nativeAstModule: {},
    ApiClass: FakeApi,
  });
  const session = createNativeParserCandidateSession(candidate, {
    nativeAstModule: {},
    ApiClass: FakeApi,
    createFs(files) {
      assert.deepEqual(files, {});
      return { kind: "fake-fs" };
    },
  });

  const result = session.parse({
    fileName: "input.ts",
    text: "const input = 1;",
    setParentNodes: true,
  });
  session.close();

  assert.deepEqual(constructedOptions, {
    cwd: "/",
    fs: { kind: "fake-fs" },
  });
  assert.equal(result.sourceFile.text, "const input = 1;");
  assert.equal(closed, true);
});

test("batch candidate unwraps the first result", () => {
  const module = {
    parseSourceFiles(requests) {
      return {
        results: requests.map((request) => ({
          sourceFile: sourceFile(request.text),
          diagnostics: [],
        })),
      };
    },
  };
  class FakeApi {}
  const [candidate] = discoverNativeParserCandidates({
    nativeAstModule: module,
    ApiClass: FakeApi,
  });
  const session = createNativeParserCandidateSession(candidate, {
    nativeAstModule: module,
    ApiClass: FakeApi,
  });

  const result = session.parse({
    fileName: "batch.ts",
    text: "const batch = true;",
    setParentNodes: true,
  });

  assert.equal(result.sourceFile.text, "const batch = true;");
  assert.deepEqual(result.diagnostics, []);
});

test("asynchronous candidates are rejected", () => {
  assert.throws(
    () => normalizeNativeParseResult(Promise.resolve(sourceFile())),
    /synchronous result/,
  );
});
