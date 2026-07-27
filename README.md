# typescript-parser-compat

An independent executable compatibility specification for the minimum parser-facing TypeScript API needed by JavaScript tooling such as `typescript-estree`.

**Current capability status:** see [`STATUS.md`](STATUS.md) and [`NATIVE-PARSER-CANDIDATES.md`](NATIVE-PARSER-CANDIDATES.md).

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

## Native parser candidate harness

`scripts/native-parser-candidates.mjs` replaces the earlier hard-fail entry-point sentinel with an executable future-API harness. It scans only a narrow allowlist of isolated parser names in:

- unstable AST module exports;
- static synchronous API methods;
- synchronous `API` instance methods.

Unknown or generic methods are never invoked. A detected candidate is called without opening a project or `tsconfig`, normalized from either a `SourceFile` result or `{ sourceFile, diagnostics }`, and evaluated against the complete TS/TSX/JS/JSX, source-fidelity, BOM, diagnostics, traversal, comments, and modern-syntax contract.

The isolated `typescript-estree` experiment uses the same candidate automatically. If a candidate becomes fully ready, CI also runs strict ESTree conversion against its ASTs beside the project-backed baseline. Candidate metadata, per-fixture failures, and capability readiness are generated in [`NATIVE-PARSER-CANDIDATES.md`](NATIVE-PARSER-CANDIDATES.md) and embedded in `compatibility-report.json`.

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
- the node instance contract, including parents, positions, traversal, width, trivia, child, token, and text methods;
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

## Actual `typescript-estree` conversion experiment

`experiments/typescript-estree-native` runs the published `@typescript-eslint/typescript-estree@8.65.0` converter against real project-backed native ASTs while keeping its TypeScript 6 peer isolated from the root TypeScript 7 probes.

The strict conversion contract currently proves:

- **7/7 valid fixtures convert** into ESTree `Program` nodes;
- JS, JSX, comments, generics, `satisfies`, decorators, tokens, and node maps are covered;
- malformed TypeScript produces a located `TSError` at the expected line and column;
- the native AST is structurally compatible after mechanical adapters.

The required adapters are:

- native diagnostic normalization (`pos`/`end`/`text`/`fileName` to the legacy diagnostic shape);
- `SyntaxKind` translation by canonical enum name rather than numeric identity;
- recursive wrapping of nodes, `NodeArray` values, and array helper results;
- legacy range, width, trivia, child, and token methods expected by the converter;
- token synthesis using the TypeScript 6 scanner where native nodes do not expose token children.

This is strong evidence that the structural AST is usable. It does **not** solve the primary blocker because the native AST still requires a project and `tsconfig`. See [`TYPESCRIPT-ESTREE-CONVERSION.md`](TYPESCRIPT-ESTREE-CONVERSION.md).

## Parser pipeline performance

`experiments/typescript-estree-native/benchmark.mjs` records where time is spent in the two current syntax-to-ESTree paths:

- TypeScript 6 project-less parsing followed by strict ESTree conversion;
- native virtual filesystem creation, synchronous API startup, project loading, AST retrieval, diagnostics, compatibility adapters, and strict ESTree conversion.

The report separates the native **warm AST-to-ESTree** phases from the **cold project-to-ESTree** pipeline. Standard scheduled runs measure 1, 8, and 32 files with repeated samples; pull requests and normal pushes use a smaller smoke configuration.

This is an observational benchmark only. It has no timing thresholds, and it does not claim that the two paths provide identical semantics. See [`docs/parser-pipeline-performance.md`](docs/parser-pipeline-performance.md) and the generated [`PERFORMANCE.md`](PERFORMANCE.md).

## Isolated parser API proposal

[`docs/isolated-source-parser-api.md`](docs/isolated-source-parser-api.md) turns the converter result into a minimal upstream request for the curated TypeScript native API:

- add one synchronous `parseSourceFile`-style operation;
- accept an in-memory filename, source text, and explicit script kind;
- require no project, `tsconfig`, module resolution, library loading, or type checking;
- return the existing native `SourceFile` schema plus native `pos`/`end` diagnostics;
- optionally provide a batch form to reduce IPC overhead.

The proposal deliberately does **not** request the full TypeScript 6 compiler API, matching numeric enum values, a plugin host, transforms, emit, or typed linting without a project.

Ready-to-post summaries are maintained in:

- [`upstream/api-discussion-455.md`](upstream/api-discussion-455.md) for the canonical `microsoft/typescript-go` API discussion;
- [`upstream/typescript-eslint-10940.md`](upstream/typescript-eslint-10940.md) for the downstream adoption tracker.

## Upstream tracking

The main blocker remains the absence of a direct project-less source-text parser in the TypeScript 7 native API.

- [`microsoft/typescript-go` Discussion #455](https://github.com/microsoft/typescript-go/discussions/455) is the canonical general discussion for the curated IPC API and critical use cases.
- [`microsoft/typescript-go#2824`](https://github.com/microsoft/typescript-go/issues/2824) develops project-backed API patterns for complex editor extensions and virtual files.
- [`microsoft/typescript-go#516`](https://github.com/microsoft/typescript-go/issues/516) tracks the broader compiler/API and extensibility requirement and points API discussion to #455.
- [`typescript-eslint#10940`](https://github.com/typescript-eslint/typescript-eslint/issues/10940) tracks adoption of the native TypeScript API and is currently blocked by the external API.
- [`MarkusNeusinger/kurrentschrift#228`](https://github.com/MarkusNeusinger/kurrentschrift/issues/228) records the downstream TypeScript 7 upgrade blocker that motivated this compatibility harness.
- [`microsoft/typescript-go#4521`](https://github.com/microsoft/typescript-go/issues/4521) tracks BOM/source-text and node-offset misalignment.
- [`microsoft/typescript-go#4745`](https://github.com/microsoft/typescript-go/issues/4745) records a corrected report: native diagnostics use `pos` and `end` rather than legacy `start` and `length`. The maintainer clarification is [issue comment 5081879077](https://github.com/microsoft/typescript-go/issues/4745#issuecomment-5081879077).

Before opening another upstream issue, search for an existing tracker and prefer adding reproducible evidence to it.

## Upstream evidence

`npm run report` converts native observations into reviewable Markdown documents:

- `upstream/bom-4521.md` maps the BOM/source-offset mismatch to `microsoft/typescript-go#4521`;
- `upstream/diagnostic-shape-4745.md` records the intentional `pos`/`end` diagnostic interface and the verified compatibility adapter.

The repository also maintains the isolated parser proposal and two review-ready comments alongside the executable evidence. See [`upstream/README.md`](upstream/README.md).

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
- `partial`: useful native utilities or part of a detected parser contract are available;
- `incompatible`: a detected candidate cannot satisfy the required behavior;
- `unverified`: a candidate exists but its shape has not yet produced executable evidence;
- `ready`: the capability has passed the native compatibility contract.

This separation makes it clear that utilities such as the scanner and AST navigation are already useful without implying that the JavaScript parser blocker has been resolved.

## Run locally

Run the root compatibility suite:

```bash
npm install
npm test
npm run report
```

Install and run the isolated conversion experiment:

```bash
npm install --prefix experiments/typescript-estree-native
npm --prefix experiments/typescript-estree-native run probe
```

Run the full parser pipeline benchmark:

```bash
npm --prefix experiments/typescript-estree-native run benchmark
```

Run the quick smoke benchmark used by pull requests:

```bash
npm --prefix experiments/typescript-estree-native run benchmark:smoke
```

The reports are:

- `compatibility-report.json`, containing package versions, detected APIs, candidate-parser evidence, summaries, capability-by-capability evidence, the `typescript-estree` API inventory, project-backed native observations, and upstream evidence metadata;
- `STATUS.md`, a stable human-readable view of the parser capability contract;
- `NATIVE-PARSER-CANDIDATES.md`, the isolated parser candidate detector and capability report;
- `TYPESCRIPT-ESTREE-API.md`, a human-readable module and AST-instance API inventory;
- `TYPESCRIPT-ESTREE-CONVERSION.md`, the asserted real-converter experiment summary, including an isolated-candidate column when available;
- `typescript-estree-native-conversion.json`, the machine-readable staged converter evidence;
- `PERFORMANCE.md`, the human-readable parser pipeline benchmark;
- `performance-report.json`, the benchmark environment, configuration, raw samples, and summary statistics;
- `upstream/bom-4521.md` and `upstream/diagnostic-shape-4745.md`, generated upstream evidence documents.

The committed `STATUS.md` is checked by the test suite, preventing it from drifting away from the executable contract. GitHub Actions publishes all compatibility and performance Markdown reports in the job summary and compatibility artifact.

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

The scheduled GitHub Actions workflow runs daily so changes in TypeScript nightlies become visible quickly. A new isolated parser entry point is invoked only when it matches the narrow allowlist, then must pass both the parser contract and real `typescript-estree` conversion contract before being classified as ready.
