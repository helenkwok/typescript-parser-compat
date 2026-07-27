# `typescript-estree` source-string bootstrap integration

## Purpose

This document records the integration boundary proved by the executable source-string bootstrap experiment in `experiments/typescript-estree-native/bootstrap-probe.mjs`.

The experiment uses the published `@typescript-eslint/typescript-estree@8.65.0` package. It does not call the converter with a prebuilt `SourceFile`. Instead, it invokes the public APIs exactly as syntax-only consumers do:

```ts
parse(sourceText, options);
parseAndGenerateServices(sourceText, options);
```

## Upstream call boundary

At the pinned `typescript-eslint/typescript-eslint` source revision used for this analysis, the non-project parser path creates its TypeScript AST through one runtime call:

```ts
ts.createSourceFile(
  parseSettings.filePath,
  parseSettings.codeFullText,
  {
    jsDocParsingMode: parseSettings.jsDocParsingMode,
    languageVersion: ts.ScriptTarget.Latest,
    setExternalModuleIndicator: parseSettings.setExternalModuleIndicator,
  },
  true,
  getScriptKind(parseSettings.filePath, parseSettings.jsx),
);
```

After that call returns, the normal `typescript-estree` converter, token/comment logic, parser-service construction, and node-map construction continue unchanged.

Source references:

- `packages/typescript-estree/src/create-program/createSourceFile.ts`;
- `packages/typescript-estree/src/parser.ts`.

## Experiment design

The experiment loads the published CommonJS package with a narrowly scoped TypeScript facade:

- every TypeScript 6 export remains available;
- only `createSourceFile` is replaced;
- the replacement creates a temporary one-file native project;
- the returned native `SourceFile` is passed through the tested structural adapter;
- the native project remains alive until the exported parser call finishes;
- all projects close in a `finally` path, including malformed-source failures.

The CommonJS loader hook is experimental scaffolding only. It demonstrates dependency substitution; it is not proposed as a downstream production mechanism.

## Verified result

The unchanged public APIs successfully processed all seven valid fixtures:

- JS;
- JSX;
- comments and trivia;
- TypeScript generics and `satisfies`;
- decorators;
- token and comment generation;
- ESTree↔TypeScript node maps.

The malformed fixture returned the expected located error:

```text
TSError: Type expected.
line 1, column 21
```

Lifecycle instrumentation recorded:

- `createSourceFile` facade calls: **15**;
- temporary native projects created: **15**;
- temporary native projects closed: **15**;
- active projects after the experiment: **0**.

See [`../TYPESCRIPT-ESTREE-BOOTSTRAP.md`](../TYPESCRIPT-ESTREE-BOOTSTRAP.md) for the generated fixture summary.

## Integration implication

The evidence narrows downstream adoption for syntax-only parsing:

1. Microsoft exposes a synchronous isolated source-text operation returning the existing native `SourceFile` schema and native diagnostics.
2. `typescript-estree` maps its existing `createSourceFile` bootstrap call to that operation.
3. The already-proven structural adapter handles enum, diagnostic, traversal, token, and convenience-method differences.
4. The public `parse(string)` and `parseAndGenerateServices(string)` contracts do not need redesign.

The current temporary-project facade proves the shape but not the desired implementation. It still starts a native API instance and constructs a project and `tsconfig` for each parser call. A direct isolated native operation remains the blocker.

## Non-goals

This evidence does not establish:

- typed linting without a project;
- semantic `Program` or `TypeChecker` compatibility;
- a production CommonJS loader hook;
- a reason to preserve TypeScript 6 numeric enum values;
- a need to recreate the full legacy compiler API.

AI assistance was used to structure this document. All compatibility and lifecycle claims are backed by the repository's executable experiment and CI artifact.
