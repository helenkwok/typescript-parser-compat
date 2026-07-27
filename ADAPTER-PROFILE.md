# Native ESTree Adapter Profile

> Deterministic uncached-versus-cached operation counts from strict `typescript-estree` conversion. These counters complement, but do not replace, elapsed-time benchmarks.

## Interpretation

- The uncached profile reproduces the prior structural behavior: every child-list request recomputes traversal, and every source gap creates a scanner.
- The cached profile stores child lists, node starts, and boundary tokens per raw native node.
- One TypeScript scanner is reused per adapted source file in the cached profile.
- Node and NodeArray proxy caches are enabled in both modes because they predate this optimization and preserve object identity.
- Both modes must produce the same strict ESTree tokens, comments, and Program results.

## Results

### 1 file

- Source bytes: **107**
- ESTree tokens: **21**
- ESTree comments: **1**

| Operation | Uncached | Cached | Work removed |
|---|---:|---:|---:|
| Child-list computations | 21 | 10 | 52.4% |
| Gap scans | 24 | 11 | 54.2% |
| Scanner creations | 24 | 1 | 95.8% |
| Synthetic tokens created | 23 | 10 | 56.5% |
| Node-start computations | 1 | 1 | 0.0% |

Cached child-list hit rate: **52.4%**
Cached node-proxy hit rate: **83.3%**
Cached array-proxy hit rate: **35.3%**
Cached gap scans per scanner: **11.0**

### 8 files

- Source bytes: **942**
- ESTree tokens: **201**
- ESTree comments: **6**

| Operation | Uncached | Cached | Work removed |
|---|---:|---:|---:|
| Child-list computations | 198 | 90 | 54.5% |
| Gap scans | 253 | 111 | 56.1% |
| Scanner creations | 253 | 8 | 96.8% |
| Synthetic tokens created | 283 | 117 | 58.7% |
| Node-start computations | 14 | 12 | 14.3% |

Cached child-list hit rate: **54.5%**
Cached node-proxy hit rate: **83.4%**
Cached array-proxy hit rate: **34.1%**
Cached gap scans per scanner: **13.9**

The machine-readable counters and derived reductions are stored in `adapter-profile.json`.
