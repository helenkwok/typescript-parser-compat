# typescript-parser-compat

An independent executable compatibility specification for the minimum parser-facing TypeScript API needed by JavaScript tooling such as `typescript-estree`.

## Why this exists

TypeScript 7 uses the native Go implementation. Its package currently exposes version information at the root and experimental API subpaths, but JavaScript tooling still needs a way to parse one in-memory source file without loading a project.

This repository converts that requirement into tests and a machine-readable report. It is evidence for upstream API design, not a replacement TypeScript parser.

## Current contract

A usable file parser should be able to:

- accept an in-memory source string and filename;
- select TS, TSX, JS, or JSX syntax;
- return a complete `SourceFile`-like AST;
- preserve source text, offsets, comments, tokens, and parent links;
- expose syntax diagnostics and traversal primitives;
- work without a `tsconfig`, module resolution, or type checking.

## Run locally

```bash
npm install
npm test
npm run report
```

`npm run report` writes `compatibility-report.json` with package versions and detected API capabilities.

## Package roles

- `typescript6`: compatibility reference using the last JavaScript compiler line.
- `typescript@next`: moving TypeScript 7.1 development package.
- `@typescript/native-preview`: experimental native API and AST utilities.

## Scope

The first phase covers parser entry points, AST traversal, source positions, JSX, comments, BOM handling, diagnostics, and parent links. Type-aware linting and the broader `Program`/`TypeChecker` API are deliberately out of scope until the file-level contract is reliable.

## Status

The scheduled GitHub Actions workflow runs daily so changes in TypeScript nightlies become visible quickly. A new parser entry point should trigger review of the contract and an adapter implementation rather than being adopted silently.
