# Native ESTree adapter caching

The project-backed native AST does not currently expose the full convenience-method surface expected by `typescript-estree`. The compatibility adapter supplies those methods lazily through proxies.

The parser pipeline benchmark showed that most measured work in the tiny fixture workload occurs when the converter requests structural children and tokens. Inspection found two deterministic sources of repeated work:

1. `getChildren`, `getChildCount`, and `getChildAt` rebuilt the same child and synthetic-token list for the same raw node;
2. each source gap constructed a new TypeScript scanner.

## Cached values

Caches are scoped to one adapted native `SourceFile` and keyed by raw native object identity:

- structural child lists;
- node start positions;
- first-token results;
- last-token results;
- node proxies;
- NodeArray proxies.

One TypeScript scanner is also reused for all source-gap scans within that adapted source file. Scanner position is reset before each gap is scanned.

No cache is shared across source files, projects, snapshots, API instances, or workflow runs.

## Correctness contract

The optimization remains subject to the existing strict conversion contract:

- all seven valid fixtures must convert to ESTree `Program` nodes;
- malformed input must produce the expected located `TSError`;
- tokens, comments, and TS-to-ESTree node maps must remain available;
- dedicated tests verify stable child-array identity and cached start/first/last-token behavior.

## Deterministic profile

`profile-adapter.mjs` runs strict conversion in two modes:

- **uncached profile:** reproduces the prior structural behavior by disabling the new per-node structural caches and creating a scanner for every source gap;
- **cached profile:** enables the production cache behavior and one-scanner-per-file reuse.

Node and NodeArray proxy caches remain enabled in both modes because they predate this optimization and are required to preserve object identity.

Both modes must produce identical ESTree token counts, comment counts, and successful `Program` results. The generated [`ADAPTER-PROFILE.md`](../ADAPTER-PROFILE.md) reports deterministic operation reductions. The machine-readable data is stored in `adapter-profile.json`.

The uncached mode exists only for profiling and tests. Normal conversion uses cached structural behavior by default.

## Performance interpretation

The deterministic profile proves that repeated operations are removed. It does not by itself establish a stable wall-clock speedup. GitHub-hosted runners are shared, and the current adapter remains a JavaScript proxy layer over project-backed native ASTs. Timing evidence stays observational in [`PERFORMANCE.md`](../PERFORMANCE.md), with no CI threshold.
