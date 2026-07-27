import { createRequire } from "node:module";

import ts from "typescript";

import { createNativeProject } from "../../adapters/native-project.mjs";
import { createDeepAdapter } from "./native-estree-adapter.mjs";

const require = createRequire(import.meta.url);
const Module = require("node:module");

function normalizeFileName(fileName) {
  return fileName.startsWith("/") ? fileName : `/${fileName}`;
}

export function createBootstrapFacadeInstrumentation() {
  return {
    createSourceFileCalls: 0,
    nativeProjectsCreated: 0,
    nativeProjectsClosed: 0,
    parserLoadsIntercepted: 0,
    activeProjects: 0,
  };
}

/**
 * Loads the published CommonJS typescript-estree package while substituting a
 * TypeScript-compatible facade only for its `require("typescript")` calls.
 *
 * This is an experiment, not a production module loader. The hook is restored
 * immediately after the package has loaded, and the returned parser keeps the
 * facade through its normal CommonJS module closure.
 */
export function loadTypescriptEstreeWithNativeFacade({
  instrumentation = createBootstrapFacadeInstrumentation(),
} = {}) {
  const activeProjects = new Set();

  function closeActiveProjects() {
    for (const context of activeProjects) {
      context.close();
      instrumentation.nativeProjectsClosed += 1;
    }
    activeProjects.clear();
    instrumentation.activeProjects = 0;
  }

  function createSourceFile(fileName, text, _languageVersionOrOptions, _setParentNodes, _scriptKind) {
    instrumentation.createSourceFileCalls += 1;

    const normalizedFileName = normalizeFileName(fileName);
    const context = createNativeProject({ [normalizedFileName]: text });
    instrumentation.nativeProjectsCreated += 1;
    activeProjects.add(context);
    instrumentation.activeProjects = activeProjects.size;

    const sourceFile = context.getSourceFile(normalizedFileName);
    const diagnostics = context.project.program.getSyntacticDiagnostics(
      normalizedFileName,
    );

    return createDeepAdapter(
      sourceFile,
      diagnostics,
      context.getSourceFile,
      { structural: true },
    );
  }

  const facade = new Proxy(ts, {
    get(target, property, receiver) {
      if (property === "createSourceFile") {
        return createSourceFile;
      }
      return Reflect.get(target, property, receiver);
    },
  });

  const originalLoad = Module._load;
  Module._load = function loadWithTypescriptFacade(request, parent, isMain) {
    if (request === "typescript") {
      instrumentation.parserLoadsIntercepted += 1;
      return facade;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  let parser;
  try {
    parser = require("@typescript-eslint/typescript-estree");
  } finally {
    Module._load = originalLoad;
  }

  return {
    parser,
    instrumentation,
    run(callback) {
      try {
        return callback(parser);
      } finally {
        closeActiveProjects();
      }
    },
    close: closeActiveProjects,
  };
}
