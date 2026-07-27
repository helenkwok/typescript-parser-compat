# Parser pipeline benchmark methodology

This benchmark measures where time is spent in the current compatibility paths. It is not a product-speed claim and does not enforce pass/fail timing thresholds.

## Compared paths

### TypeScript 6 project-less path

For every file, the benchmark:

1. calls `createSourceFile` with an explicit script kind;
2. verifies that parsing produced no syntax diagnostics;
3. sends the resulting `SourceFile` through the published `typescript-estree` converter with locations, ranges, comments, tokens, strict unknown-node checks, and node maps enabled.

### Native project-backed path

For each measured cold iteration, the benchmark:

1. creates a fresh virtual filesystem and `tsconfig`;
2. starts a fresh synchronous native API instance;
3. opens a snapshot and project;
4. retrieves every native `SourceFile`;
5. requests syntactic diagnostics;
6. constructs the compatibility adapters;
7. sends every adapted AST through the same strict `typescript-estree` converter;
8. closes the native API instance.

The benchmark reports both:

- **warm AST-to-ESTree pipeline**, excluding virtual filesystem construction, API startup, and project loading;
- **cold project-to-ESTree pipeline**, including all measured native phases.

## Workloads

The source set rotates through valid TS, TSX, JS, JSX, comments, decorators, and generic-constructor fixtures. Files are duplicated under unique names to create larger project sizes without adding semantic type-checking work.

The standard scheduled benchmark measures 1, 8, and 32 files with two warmups and five measured iterations per size. Pull requests and normal pushes run a smoke configuration with 1 and 8 files and one measured iteration.

## Statistics

The JSON report retains every raw timing sample. The Markdown report shows median, p90, minimum, and maximum values. Medians and scaling shape are generally more informative than a single run.

## Limitations

- GitHub-hosted runners are shared and timing noise is expected.
- The two paths do not provide identical semantics: TypeScript 6 parses isolated files, while the current native path creates a project.
- The benchmark measures syntax-only fixture workloads and does not represent typed linting or large real-world programs.
- No regression threshold is applied. A timing change requires repeated evidence before it should influence an upstream or downstream design decision.
- Native API startup and project load are deliberately measured on fresh instances. Long-lived tools may amortize these phases differently.

## Outputs

- `PERFORMANCE.md`: human-readable methodology and phase summaries;
- `performance-report.json`: environment, configuration, raw samples, and calculated statistics;
- `parser-performance-output.txt`: complete benchmark console output from CI.
