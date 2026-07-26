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

## Project-backed native evidence

`adapters/native-project.mjs` uses the experimental sync API and a virtual filesystem to load the same fixtures through a temporary `tsconfig` project. This lets the repository measure native AST behavior before a direct parser entry point is available.

The project-backed adapter is deliberately reported separately because it:

- requires starting the native API process;
- requires a project and `tsconfig`;
- cannot accept an isolated source string in the way `typescript-estree` requires;
- therefore does not resolve the project-less parser blocker.

The probe currently covers TS, TSX, JS, JSX, decorators, source text, parent links, syntax diagnostics, BOM alignment, and the methods and properties exposed on native `SourceFile` and node objects. Known discrepancies remain visible as sentinel tests so upstream fixes trigger a deliberate contract update.

## `typescript-estree` API inventory

`contract/typescript-estree-api.json` records the runtime API used by the project-less parser bootstrap and structural AST conversion path. The source evidence is pinned to a specific `typescript-eslint` commit and covers:

- root symbols such as `createSourceFile`, `ScriptTarget`, `ScriptKind`, `Extension`, `LanguageVariant`, `SyntaxKind`, and `NodeFlags`;
- token helpers such as `tokenToString`, `isToken`, and the scanner;
- the `SourceFile` instance contract, including `parseDiagnostics` and location helpers;
- the node instance contract, including parents, positions, traversal, child-token methods, and text methods;
- located syntax diagnostics and the mapping between native and legacy diagnostic shapes.

The evaluator classifies each requirement as:

- `root-ready`: available from the moving `typescript` package root;
- `unstable-only`: available only from native unstable AST exports;
- `project-only`: verified only on project-backed native AST objects;
- `adapter-required`: the native API carries the required data under a redesigned shape that current `typescript-estree` code must normalize;
- `*-partial`: only part of the required surface is present;
- `incompatible`: the API exists but fails the required behavior;
- `missing`: no usable required API was detected.

This inventory deliberately excludes the much larger type-aware `Program` and `TypeChecker` surface. `npm run report` generates `TYPESCRIPT-ESTREE-API.md` and embeds the complete inventory in `compatibility-report.json`.

## Upstream tracking

The main blocker remains the absence of a direct project-less source-text parser in the TypeScript 7 native API.

- [`microsoft/typescript-go#516`](https://github.com/microsoft/typescript-go/issues/516) tracks the broader compiler/API and extensibility requirement.
- [`typescript-eslint#10940`](https://github.com/typescript-eslint/typescript-eslint/issues/10940) tracks adoption of the native TypeScript API and is currently blocked by the external API.
- [`MarkusNeusinger/kurrentschrift#228`](https://github.com/MarkusNeusinger/kurrentschrift/issues/228) records the downstream TypeScript 7 upgrade blocker that motivated this compatibility harness.
- [`microsoft/typescript-go#4521`](https://github.com/microsoft/typescript-go/issues/4521) tracks BOM/source-text and node-offset misalignment.
- [`microsoft/typescript-go#4745`](https://github.com/microsoft/typescript-go/issues/4745) records a corrected report: native diagnostics use `pos` and `end` rather than legacy `start` and `length`. The maintainer clarification is [issue comment 5081879077](https://github.com/microsoft/typescript-go/issues/4745#issuecomment-5081879077).

Before opening another upstream issue, search for an existing tracker and prefer adding reproducible evidence to it.

## Upstream evidence

`npm run report` converts native observations into reviewable Markdown documents:

- `upstream/bom-4521.md` maps the BOM/source-offset mismatch to `microsoft/typescript-go#4521`;
- `upstream/diagnostic-shape-4745.md` records the intentional `pos`/`end` diagnostic interface and the verified compatibility adapter.

The generated documents include installation commands, minimal reproductions, expected/actual results, downstream impact, and links back to the executable fixture and sentinel. They are included in every compatibility artifact.

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

- `compatibility-report.json`, containing package versions, detected APIs, summaries, capability-by-capability evidence, the `typescript-estree` API inventory, project-backed native observations, and upstream evidence metadata;
- `STATUS.md`, a stable human-readable view of the parser capability contract;
- `TYPESCRIPT-ESTREE-API.md`, a human-readable module and AST-instance API inventory;
- `upstream/bom-4521.md` and `upstream/diagnostic-shape-4745.md`, generated upstream evidence documents.

The committed `STATUS.md` is checked by the test suite, preventing it from drifting away from the executable contract. GitHub Actions publishes both status reports in the job summary and compatibility artifact.

## Package roles

- `typescript6`: compatibility reference using the last JavaScript compiler line.
- `typescript@next`: moving TypeScript 7.1 development package.
- `@typescript/native-preview`: experimental native API and AST utilities.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Every compatibility claim should be backed by a focused fixture, an executable test, and reproducible evidence. Generated status files must be updated through `npm run report`, not edited independently.

## Scope

The first phase covers parser entry points, AST traversal, source positions, JSX, comments, BOM handling, diagnostics, parent links, and the structural API required by `typescript-estree`. Type-aware linting and the broader `Program`/`TypeChecker` API remain out of scope until the file-level contract is reliable.

## License

Copyright 2026 Helen Kwok.

Licensed under the [Apache License 2.0](LICENSE).

## Status

The scheduled GitHub Actions workflow runs daily so changes in TypeScript nightlies become visible quickly. A new parser entry point should trigger review of the contract and an adapter implementation rather than being adopted silently.
