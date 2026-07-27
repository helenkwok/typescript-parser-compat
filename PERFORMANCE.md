# Parser Pipeline Performance

> Observational benchmark generated on a shared CI runner. Values are evidence for locating costs, not stable release guarantees or pass/fail thresholds.

## Environment

- Node.js: `v22.23.1`
- Platform: `linux` / `x64`
- CPU: AMD EPYC 7763 64-Core Processor
- Warmups per scenario: **1**
- Measured iterations per scenario: **1**
- File counts: **1, 8**

## Interpretation

- **TypeScript 6 parse + ESTree** measures project-less JavaScript compiler parsing followed by the published converter.
- **Native warm AST-to-ESTree** excludes native API startup and project loading; it measures AST retrieval, diagnostics, adapter setup, lazy adapter work, and conversion.
- **Native cold project-to-ESTree** includes virtual filesystem creation, API startup, project loading, AST retrieval, diagnostics, adapters, and conversion.
- The compatibility adapter uses lazy proxies. The adapter-setup phase measures proxy creation only; scanner-backed child/token synthesis and most wrapping work are charged to the native conversion phase when the converter requests them.
- The paths do not provide identical semantics: the native result is currently project-backed, while TypeScript 6 parses isolated source files.
- Shared-runner timing is noisy. Compare phase shape and scaling across file counts rather than treating one run as a product benchmark.

## Results

### 1 file

- Source bytes: **173**
- Measured iterations: **1**

| Phase | Median (ms) | p90 (ms) | Min (ms) | Max (ms) |
|---|---:|---:|---:|---:|
| TypeScript 6 parse | 0.839 | 0.839 | 0.839 | 0.839 |
| TypeScript 6 ESTree conversion | 0.888 | 0.888 | 0.888 | 0.888 |
| TypeScript 6 parse + ESTree | 1.73 | 1.73 | 1.73 | 1.73 |
| Native virtual FS construction | 0.032 | 0.032 | 0.032 | 0.032 |
| Native API startup | 3.08 | 3.08 | 3.08 | 3.08 |
| Native project load | 4.30 | 4.30 | 4.30 | 4.30 |
| Native AST retrieval | 0.176 | 0.176 | 0.176 | 0.176 |
| Native syntactic diagnostics | 0.183 | 0.183 | 0.183 | 0.183 |
| Native compatibility adapter setup | 0.036 | 0.036 | 0.036 | 0.036 |
| Native ESTree conversion + lazy adapter work | 31.20 | 31.20 | 31.20 | 31.20 |
| Native warm AST-to-ESTree pipeline | 31.59 | 31.59 | 31.59 | 31.59 |
| Native cold project-to-ESTree pipeline | 39.01 | 39.01 | 39.01 | 39.01 |

### 8 files

- Source bytes: **1,028**
- Measured iterations: **1**

| Phase | Median (ms) | p90 (ms) | Min (ms) | Max (ms) |
|---|---:|---:|---:|---:|
| TypeScript 6 parse | 3.56 | 3.56 | 3.56 | 3.56 |
| TypeScript 6 ESTree conversion | 3.37 | 3.37 | 3.37 | 3.37 |
| TypeScript 6 parse + ESTree | 6.93 | 6.93 | 6.93 | 6.93 |
| Native virtual FS construction | 0.059 | 0.059 | 0.059 | 0.059 |
| Native API startup | 3.54 | 3.54 | 3.54 | 3.54 |
| Native project load | 5.67 | 5.67 | 5.67 | 5.67 |
| Native AST retrieval | 0.747 | 0.747 | 0.747 | 0.747 |
| Native syntactic diagnostics | 0.405 | 0.405 | 0.405 | 0.405 |
| Native compatibility adapter setup | 0.019 | 0.019 | 0.019 | 0.019 |
| Native ESTree conversion + lazy adapter work | 188.8 | 188.8 | 188.8 | 188.8 |
| Native warm AST-to-ESTree pipeline | 189.9 | 189.9 | 189.9 | 189.9 |
| Native cold project-to-ESTree pipeline | 199.2 | 199.2 | 199.2 | 199.2 |

## Methodology

Each measured iteration constructs fresh source-file inputs. Native cold measurements create a new virtual filesystem, synchronous API process, snapshot, and project. The benchmark retrieves every AST, requests syntactic diagnostics, creates the compatibility proxies, and runs strict `typescript-estree` conversion with tokens, comments, locations, ranges, and node maps enabled.

No timing threshold is enforced by CI. The complete samples and phase summaries are stored in `performance-report.json`.
