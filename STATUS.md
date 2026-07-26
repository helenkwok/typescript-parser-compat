# TypeScript Native Parser Compatibility Status

> This file is generated from the executable capability contract. Run `npm run report` after changing probes, fixtures, or tests.

## Current blocker

The native preview does not expose a direct project-less source-text parser. Scanner and AST utilities exist, but parser-dependent capabilities remain blocked.

## Summary

- Required capabilities: **8**
- Covered by the TypeScript 6 reference suite: **8/8**
- Native capabilities ready: **0/8**
- Native status distribution: **partial: 2, blocked: 5, missing: 1**

## Project-backed native evidence

The unstable sync API can load the same fixtures through a virtual `tsconfig` project. This is useful implementation evidence, but it does **not** satisfy the project-less parser requirement used by `typescript-estree`.

- Behaviors passing through a native project: **7** (`basicAst`, `tsxAst`, `javascriptAst`, `jsxAst`, `modernSyntax`, `sourceTextPreserved`, `parentLinksAndTraversal`)
- Behaviors currently failing through a native project: **2** (`locatedSyntaxDiagnostics`, `bomConsistency`)
- Requires a project: **yes**
- Requires a tsconfig: **yes**

## Capability matrix

| Native status | Capability | Category | Requirement | Evidence |
|---|---|---|---|---|
| `missing` | `source-text-entry-point` | entry-point | Parse an in-memory source string and filename without loading a project or tsconfig. | No direct source-text parser entry point detected. |
| `blocked` | `script-kind-selection` | syntax | Select TS, TSX, JS, and JSX grammar independently for project-less source text. | Blocked by `source-text-entry-point`. |
| `blocked` | `source-text-and-offsets` | source-fidelity | Preserve the complete source text and UTF-16 node offsets used by JavaScript tooling. | Blocked by `source-text-entry-point`. |
| `blocked` | `bom-consistency` | source-fidelity | Keep BOM-inclusive source text aligned with node positions and text slicing. | Blocked by `source-text-entry-point`. |
| `partial` | `comments-and-token-scanning` | trivia | Preserve comments and expose scanner-level token and trivia information. | Available: `createScanner`. Blocked by `source-text-entry-point`. |
| `blocked` | `located-syntax-diagnostics` | diagnostics | Return syntax diagnostics with numeric codes, UTF-16 start positions, and lengths. | Blocked by `source-text-entry-point`. |
| `partial` | `parent-links-and-traversal` | ast | Return a traversable AST with parent links and token-position navigation utilities. | Available: `visitNode`, `getTokenAtPosition`. Blocked by `source-text-entry-point`. |
| `blocked` | `modern-typescript-syntax` | syntax | Represent current TypeScript constructs, including satisfies expressions and decorators. | Blocked by `source-text-entry-point`. |

## Status meanings

- `ready`: verified against the native file-level parser contract.
- `partial`: useful native utilities exist, but the full capability is not available.
- `unverified`: a parser candidate exists and needs the contract adapter/tests.
- `blocked`: the capability cannot be tested until the source-text parser exists.
- `missing`: the required API entry point is not exposed.

Package versions and the complete machine-readable evidence are written to `compatibility-report.json` by CI.
