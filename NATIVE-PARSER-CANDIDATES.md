# Native Isolated Parser Candidates

> Generated from a narrow allowlist of parser-like exports and synchronous API methods. Unknown methods are never invoked.

## Result

- Probe status: **absent**
- Candidates detected: **0**
- Fully ready candidate present: **no**
- Primary package surface: **current-native**

No isolated source-text parser is currently exposed on any probed native package surface. Project-backed parsing remains separate and does not satisfy this contract.

## Package surfaces

| Surface | Package | Primary | Status | Candidates |
|---|---|---:|---|---:|
| `current-native` | `@typescript/native` | yes | `absent` | 0 |
| `native-preview` | `@typescript/native-preview` | no | `absent` | 0 |

## Candidate summary

| Package | Candidate | Status | Evidence |
|---|---|---|---|
| _none_ | _none_ | `absent` | No allowlisted isolated parser entry point detected. |

## Capability readiness

| Capability | Ready on any surface |
|---|---|
| `source-text-entry-point` | no |
| `script-kind-selection` | no |
| `source-text-and-offsets` | no |
| `bom-consistency` | no |
| `comments-and-token-scanning` | no |
| `located-syntax-diagnostics` | no |
| `parent-links-and-traversal` | no |
| `modern-typescript-syntax` | no |

## Candidate fixture failures

- None. No candidate was detected, or every invoked fixture passed.

The complete per-surface candidate metadata and fixture summaries are embedded in `compatibility-report.json`.
