# Isolated source-text parser API proposal

## Summary

The TypeScript native API already exposes enough project-backed AST structure for the published `@typescript-eslint/typescript-estree@8.65.0` converter. With mechanical compatibility adapters, all seven valid fixtures in this repository convert strictly to ESTree, including JS, JSX, comments, generics, `satisfies`, decorators, tokens, and node maps. Malformed input produces a located parser error.

A second experiment invokes the unchanged public `typescript-estree` source-string APIs and replaces only their `typescript.createSourceFile` dependency. Both `parse(string)` and `parseAndGenerateServices(string)` pass all seven valid fixtures, preserve tokens/comments/node maps, and return the expected located malformed-source error. This proves the downstream public parser contract does not need redesign.

The remaining syntax-only tooling blocker is narrower than full compiler-API compatibility:

> Provide a synchronous API operation that parses one in-memory source string into a native `SourceFile` without loading a project or `tsconfig` and without module resolution or type checking.

This request is intended for the curated IPC API discussed in `microsoft/typescript-go` Discussion #455. It does not require exposing every legacy TypeScript API.

## Why a project-backed API is insufficient

The non-type-aware `typescript-estree` path deliberately creates a standalone `SourceFile` and no `Program`. This path is used when ESLint only needs syntax and ESTree conversion.

A project-backed replacement changes that contract by requiring:

- an API process and project lifetime;
- a virtual or real `tsconfig`;
- project association for each file;
- module-resolution and project-system setup that syntax-only parsing does not request;
- additional state management for unsaved or synthetic source text.

The current source-string facade proves compatibility by constructing a temporary one-file native project per parser call. Its lifecycle instrumentation created 15 projects, closed all 15, and leaked none. That is useful integration evidence, but it also demonstrates why the facade is not the desired production path.

The existing project-backed native API remains appropriate for typed linting and semantic tools. It should not be required for syntax-only parsing.

## Proposed minimal operation

The exact names are illustrative. `parseSourceFile` is preferred over `createSourceFile` to avoid implying complete legacy API compatibility.

```ts
export interface ParseSourceFileRequest {
  /** Logical filename used for syntax selection and diagnostics. */
  readonly fileName: string;

  /** Complete in-memory source text, including any BOM. */
  readonly text: string;

  /** Explicit TS, TSX, JS, JSX, or JSON syntax mode. */
  readonly scriptKind: ScriptKind;

  /** Defaults to the latest supported grammar. */
  readonly languageVersion?: ScriptTarget;

  /** Tooling consumers require parent links. Defaults to true. */
  readonly setParentNodes?: boolean;

  /** Optional JSDoc parsing policy when supported by the native parser. */
  readonly jsDocParsingMode?: JSDocParsingMode;
}

export interface ParseSourceFileResult {
  readonly sourceFile: SourceFile;

  /** Native diagnostics using pos/end/text/fileName. */
  readonly diagnostics: readonly Diagnostic[];
}

export interface API {
  parseSourceFile(request: ParseSourceFileRequest): ParseSourceFileResult;
}
```

A batch form would be useful for IPC throughput but is not required for correctness:

```ts
parseSourceFiles(
  requests: readonly ParseSourceFileRequest[],
): readonly ParseSourceFileResult[];
```

## Downstream integration shape

The published syntax-only `typescript-estree` bootstrap currently reaches one runtime dependency:

```ts
ts.createSourceFile(
  fileName,
  sourceText,
  parseOptions,
  true,
  scriptKind,
);
```

The source-string experiment replaces only that operation. The exported parser APIs, parse-settings construction, ESTree converter, token/comment generation, parser services, and node-map construction remain unchanged.

A production integration can therefore map that bootstrap call to `api.parseSourceFile(...)`, normalize the result through the already-tested adapter, and continue through the existing downstream pipeline. See [`typescript-estree-bootstrap-integration.md`](typescript-estree-bootstrap-integration.md).

## Required behavior

The operation should:

1. accept source text that does not exist on disk;
2. require no project, `tsconfig`, module resolution, library loading, or type checking;
3. select TS, TSX, JS, JSX, and JSON syntax explicitly;
4. preserve source text and UTF-16 positions consistently, including BOM handling;
5. return parent-linked native AST nodes;
6. expose syntax diagnostics with native `pos`, `end`, `text`, and `fileName` fields;
7. be available synchronously to Node.js tooling;
8. use the same native AST schema and API versioning as project-backed `SourceFile` objects.

## What Microsoft does not need to preserve

The experiments show downstream tooling can adapt these differences mechanically:

- Native `SyntaxKind` values do not need to share TypeScript 6 numeric identities. Consumers can translate by canonical enum name.
- Native diagnostics do not need legacy `start`, `length`, `messageText`, and `file` fields. These map from `pos`, `end`, `text`, and `fileName`.
- Native nodes do not need to reproduce every TypeScript 6 convenience method if equivalent AST traversal and scanner primitives remain available.
- The parser operation does not need to provide a `Program`, `TypeChecker`, emit, transforms, module resolution, or watch APIs.
- The public `typescript-estree` `parse(string)` and syntax-only `parseAndGenerateServices(string)` APIs do not need redesign.

## Executable evidence

The repository provides:

- [`TYPESCRIPT-ESTREE-CONVERSION.md`](../TYPESCRIPT-ESTREE-CONVERSION.md): staged prebuilt-`SourceFile` conversion results;
- [`TYPESCRIPT-ESTREE-BOOTSTRAP.md`](../TYPESCRIPT-ESTREE-BOOTSTRAP.md): unchanged public source-string parser results;
- [`typescript-estree-bootstrap-integration.md`](typescript-estree-bootstrap-integration.md): exact downstream bootstrap-boundary analysis;
- [`typescript-estree-native-conversion.json`](../typescript-estree-native-conversion.json): machine-readable converter evidence generated in CI;
- [`experiments/typescript-estree-native/`](../experiments/typescript-estree-native/): isolated published-parser and converter experiments;
- [`contract/typescript-estree-api.json`](../contract/typescript-estree-api.json): source-pinned runtime API inventory;
- [`STATUS.md`](../STATUS.md): current project-less parser capability status.

Current result:

- valid native-AST fixtures converted strictly: **7/7**;
- valid source strings through `parse`: **7/7**;
- valid source strings through `parseAndGenerateServices`: **7/7**;
- malformed source returned a located parser error: **yes**;
- temporary native projects closed without leaks: **15/15**;
- direct project-less native parser available: **no**.

## Relationship to upstream discussions

- `microsoft/typescript-go` Discussion #455 is the canonical general API-design discussion and asks critical use cases to inform the curated API.
- `microsoft/typescript-go#2824` demonstrates the project-backed API model for complex editor extensions and virtual files.
- `typescript-eslint#10940` tracks adoption of the native API and is labelled as blocked by the external API.

The proposal complements the project-backed API rather than replacing it:

- isolated parsing for syntax-only linting and source transformation pipelines;
- project snapshots for semantic analysis and typed linting.

## Non-goals

This proposal does not request:

- an in-process Go embedding API;
- a plugin host;
- full TypeScript 6 compiler-API compatibility;
- numeric enum compatibility;
- typed linting without a project;
- transformation or emit APIs.

AI assistance was used to help structure this proposal. The API requirements and compatibility claims are backed by the repository's executable tests and CI artifacts.
