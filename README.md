# typescript-parser-compat

An independent executable compatibility specification for the minimum parser-facing TypeScript API needed by JavaScript tooling such as `typescript-estree`.

**Current capability status:** see [`STATUS.md`](STATUS.md).

## Why this exists

TypeScript 7 uses the native Go implementation. Its package currently exposes version information at the root and experimental API subpaths, but JavaScript tooling still needs a way to parse one in-memory source file without loading a project.

This repository converts that requirement into tests and machine- and human-readable reports. It is evidence for upstream API design, not a replacement TypeScript parser.

## Current contract

A usable file parser should be able to:

- accept an in-memory source string and filename;
- select TS, TSX, JS, or JSX syntax;
- return a complete `SourceFile`-like AST;
- preserve source text, offsets, comments, tokens, and parent links;
- expose syntax diagnostics and traversal primitives;
- work without a `tsconfig`, module resolution, or type checking.

## Reference coverage

The TypeScript 6 reference suite currently exercises:

- project-less TS and TSX parsing;
- distinct JS and JSX script-kind selection;
- UTF-8 BOM preservation and UTF-16 node offsets;
- line comments, block comments, and scanner trivia;
- located syntax diagnostics for malformed input;
- decorators and modern TypeScript syntax;
- JSX nodes and parent links.

Until the native preview exposes a direct source-text parser, a sentinel test verifies that no matching entry point has appeared unnoticed. When it does appear, CI will request a native adapter and the same contract will be run against it.

## Capability matrix

`contract/parser-capabilities.json` is the declarative source of truth. Every required capability identifies:

- the behavior tooling needs;
- the TypeScript 6 tests that prove the reference behavior;
- the fixtures used by those tests;
- the native API probe used to classify current support.

CI validates that every referenced test and fixture exists. The generated report classifies native support as:

- `missing`: the core API entry point is absent;
- `blocked`: the capability cannot be tested until the parser exists;
- `partial`: useful native utilities exist, but no complete file parser is available;
- `unverified`: a candidate API exists and needs the full adapter contract;
- `ready`: the capability has passed the native compatibility contract.

This separation makes it clear that utilities such as the scanner and AST navigation are already useful without implying that the JavaScript parser blocker has been resolved.

## Run locally

```bash
npm install
npm test
npm run report
```

`npm run report` writes:

- `compatibility-report.json`, containing package versions, detected APIs, summaries, and capability-by-capability evidence;
- `STATUS.md`, a stable human-readable view that changes only when the capability state changes.

The committed `STATUS.md` is checked by the test suite, preventing it from drifting away from the executable contract. GitHub Actions also publishes it in the job summary and compatibility artifact.

## Package roles

- `typescript6`: compatibility reference using the last JavaScript compiler line.
- `typescript@next`: moving TypeScript 7.1 development package.
- `@typescript/native-preview`: experimental native API and AST utilities.

## Scope

The first phase covers parser entry points, AST traversal, source positions, JSX, comments, BOM handling, diagnostics, and parent links. Type-aware linting and the broader `Program`/`TypeChecker` API are deliberately out of scope until the file-level contract is reliable.

## Status

The scheduled GitHub Actions workflow runs daily so changes in TypeScript nightlies become visible quickly. A new parser entry point should trigger review of the contract and an adapter implementation rather than being adopted silently.
