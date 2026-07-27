import assert from "node:assert/strict";
import { arch, cpus, platform } from "node:os";
import { performance } from "node:perf_hooks";
import { readFile, writeFile } from "node:fs/promises";

import {
  parseAndGenerateServices,
  version as typescriptEstreeVersion,
} from "@typescript-eslint/typescript-estree";
import { createVirtualFileSystem } from "@typescript/native-preview/unstable/fs";
import { API } from "@typescript/native-preview/unstable/sync";
import ts from "typescript";

import {
  renderPerformanceReport,
  summarizeSamples,
} from "../../scripts/performance-report.mjs";
import { createDeepAdapter } from "./native-estree-adapter.mjs";

const templateDefinitions = [
  ["basic", ".ts", ts.ScriptKind.TS],
  ["jsx", ".tsx", ts.ScriptKind.TSX],
  ["plain", ".js", ts.ScriptKind.JS],
  ["jsx", ".jsx", ts.ScriptKind.JSX],
  ["comments", ".ts", ts.ScriptKind.TS],
  ["decorators", ".ts", ts.ScriptKind.TS],
  ["generic-constructor", ".ts", ts.ScriptKind.TS],
];

function parseIntegerOption(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) {
    return fallback;
  }
  const value = Number.parseInt(args[index + 1], 10);
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }
  return value;
}

function parseFileCounts(args) {
  const index = args.indexOf("--sizes");
  if (index === -1) {
    return [1, 8, 32];
  }
  const values = args[index + 1]
    .split(",")
    .map((value) => Number.parseInt(value, 10));
  if (values.length === 0 || values.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new TypeError("--sizes must contain positive comma-separated integers");
  }
  return [...new Set(values)].sort((left, right) => left - right);
}

function elapsed(start) {
  return performance.now() - start;
}

function conversionOptions(fileName) {
  return {
    filePath: fileName,
    jsx: fileName.endsWith("x"),
    loc: true,
    range: true,
    comment: true,
    tokens: true,
    preserveNodeMaps: true,
    errorOnUnknownASTType: true,
  };
}

async function loadTemplates() {
  return Promise.all(
    templateDefinitions.map(async ([baseName, extension, scriptKind]) => ({
      baseName,
      extension,
      scriptKind,
      text: await readFile(
        new URL(`../../fixtures/${baseName}${extension}`, import.meta.url),
        "utf8",
      ),
    })),
  );
}

function createWorkload(templates, fileCount) {
  const files = [];
  for (let index = 0; index < fileCount; index += 1) {
    const template = templates[index % templates.length];
    const suffix = String(index).padStart(4, "0");
    files.push({
      fileName: `/benchmark/${template.baseName}-${suffix}${template.extension}`,
      text: template.text,
      scriptKind: template.scriptKind,
    });
  }
  return files;
}

function runTypeScript6Iteration(files) {
  let start = performance.now();
  const sourceFiles = files.map((file) => ({
    file,
    sourceFile: ts.createSourceFile(
      file.fileName,
      file.text,
      ts.ScriptTarget.Latest,
      true,
      file.scriptKind,
    ),
  }));
  const typescript6Parse = elapsed(start);

  start = performance.now();
  for (const { file, sourceFile } of sourceFiles) {
    assert.equal(sourceFile.parseDiagnostics.length, 0, `${file.fileName}: TypeScript 6 parse failed`);
    const converted = parseAndGenerateServices(
      sourceFile,
      conversionOptions(file.fileName),
    );
    assert.equal(converted.ast.type, "Program");
  }
  const typescript6EstreeConversion = elapsed(start);

  return {
    typescript6Parse,
    typescript6EstreeConversion,
    typescript6Pipeline: typescript6Parse + typescript6EstreeConversion,
  };
}

function createNativeFileSystem(files) {
  const sourceMap = Object.fromEntries(files.map((file) => [file.fileName, file.text]));
  return createVirtualFileSystem({
    "/tsconfig.json": JSON.stringify({
      compilerOptions: {
        allowJs: true,
        checkJs: false,
        experimentalDecorators: true,
        jsx: "preserve",
        noLib: true,
        skipLibCheck: true,
      },
      files: files.map((file) => file.fileName),
    }),
    ...sourceMap,
  });
}

function runNativeIteration(files) {
  let start = performance.now();
  const fs = createNativeFileSystem(files);
  const virtualFsConstruction = elapsed(start);

  start = performance.now();
  const api = new API({ cwd: "/", fs });
  const nativeApiStartup = elapsed(start);

  try {
    start = performance.now();
    const snapshot = api.updateSnapshot({ openProject: "/tsconfig.json" });
    const project = snapshot.getProject("/tsconfig.json");
    assert.ok(project, "native project was not created");
    const nativeProjectLoad = elapsed(start);

    start = performance.now();
    const sourceFiles = new Map(
      files.map((file) => {
        const sourceFile = project.program.getSourceFile(file.fileName);
        assert.ok(sourceFile, `${file.fileName}: native SourceFile missing`);
        return [file.fileName, sourceFile];
      }),
    );
    const nativeAstRetrieval = elapsed(start);

    start = performance.now();
    const diagnostics = new Map(
      files.map((file) => [
        file.fileName,
        project.program.getSyntacticDiagnostics(file.fileName),
      ]),
    );
    const nativeDiagnostics = elapsed(start);

    const getSourceFile = (fileName) =>
      sourceFiles.get(fileName) ?? project.program.getSourceFile(fileName);

    start = performance.now();
    const adapted = files.map((file) => ({
      file,
      sourceFile: createDeepAdapter(
        sourceFiles.get(file.fileName),
        diagnostics.get(file.fileName),
        getSourceFile,
        { structural: true },
      ),
    }));
    const nativeAdapter = elapsed(start);

    start = performance.now();
    for (const { file, sourceFile } of adapted) {
      const converted = parseAndGenerateServices(
        sourceFile,
        conversionOptions(file.fileName),
      );
      assert.equal(converted.ast.type, "Program");
    }
    const nativeEstreeConversion = elapsed(start);

    const nativeWarmPipeline =
      nativeAstRetrieval + nativeDiagnostics + nativeAdapter + nativeEstreeConversion;
    const nativeColdPipeline =
      virtualFsConstruction +
      nativeApiStartup +
      nativeProjectLoad +
      nativeWarmPipeline;

    return {
      virtualFsConstruction,
      nativeApiStartup,
      nativeProjectLoad,
      nativeAstRetrieval,
      nativeDiagnostics,
      nativeAdapter,
      nativeEstreeConversion,
      nativeWarmPipeline,
      nativeColdPipeline,
    };
  } finally {
    api.close();
  }
}

function createSampleStore() {
  return {
    typescript6Parse: [],
    typescript6EstreeConversion: [],
    typescript6Pipeline: [],
    virtualFsConstruction: [],
    nativeApiStartup: [],
    nativeProjectLoad: [],
    nativeAstRetrieval: [],
    nativeDiagnostics: [],
    nativeAdapter: [],
    nativeEstreeConversion: [],
    nativeWarmPipeline: [],
    nativeColdPipeline: [],
  };
}

function recordSamples(store, measurements) {
  for (const [name, value] of Object.entries(measurements)) {
    store[name].push(value);
  }
}

const args = process.argv.slice(2);
const warmups = parseIntegerOption(args, "--warmups", 2);
const iterations = parseIntegerOption(args, "--iterations", 5);
const fileCounts = parseFileCounts(args);
if (iterations < 1) {
  throw new TypeError("--iterations must be at least 1");
}

const templates = await loadTemplates();
const scenarios = [];

for (const fileCount of fileCounts) {
  const files = createWorkload(templates, fileCount);

  for (let index = 0; index < warmups; index += 1) {
    runTypeScript6Iteration(files);
    runNativeIteration(files);
  }

  const rawSamples = createSampleStore();
  for (let index = 0; index < iterations; index += 1) {
    recordSamples(rawSamples, runTypeScript6Iteration(files));
    recordSamples(rawSamples, runNativeIteration(files));
  }

  scenarios.push({
    fileCount,
    sourceBytes: files.reduce(
      (total, file) => total + Buffer.byteLength(file.text, "utf8"),
      0,
    ),
    iterations,
    rawSamples,
    metrics: Object.fromEntries(
      Object.entries(rawSamples).map(([name, samples]) => [
        name,
        summarizeSamples(samples),
      ]),
    ),
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: platform(),
    arch: arch(),
    cpuModel: cpus()[0]?.model ?? "unknown",
  },
  packages: {
    typescript: ts.version,
    typescriptEstree: typescriptEstreeVersion,
    nativePreview: "resolved from root latest dependency",
  },
  configuration: { warmups, iterations, fileCounts },
  scenarios,
};

const json = `${JSON.stringify(report, null, 2)}\n`;
const markdown = renderPerformanceReport(report);
await Promise.all([
  writeFile(new URL("../../performance-report.json", import.meta.url), json),
  writeFile(new URL("../../PERFORMANCE.md", import.meta.url), markdown),
]);

console.log(json);
