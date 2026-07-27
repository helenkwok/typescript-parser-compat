# Upstream evidence

`npm run report` generates two evidence documents from the current native project probe:

- `bom-4521.md` adds reproducible downstream evidence to the existing `microsoft/typescript-go#4521` BOM/source-offset tracker.
- `diagnostic-shape-4745.md` records the clarification on `microsoft/typescript-go#4745`: native diagnostics expose locations through `pos` and `end`, and current TypeScript-style consumers need a mechanical shape adapter.

The repository also maintains review-ready comments derived from asserted `typescript-estree` contracts:

- `api-discussion-455.md` proposes a minimal synchronous isolated source-text parser operation for the canonical `microsoft/typescript-go` API discussion.
- `api-discussion-455-bootstrap-followup.md` reports that the unchanged public `parse(string)` and `parseAndGenerateServices(string)` APIs pass 7/7 fixtures when only their `typescript.createSourceFile` dependency is replaced by the native-backed facade.
- `typescript-eslint-10940.md` reports that the published converter accepts project-backed native ASTs after mechanical adapters and separates syntax-only parsing from typed linting. The upstream issue is locked to collaborators, so this document remains repository evidence rather than a posted comment.

The detailed API proposal is in [`docs/isolated-source-parser-api.md`](../docs/isolated-source-parser-api.md). The exact downstream source-string integration boundary is documented in [`docs/typescript-estree-bootstrap-integration.md`](../docs/typescript-estree-bootstrap-integration.md).

Generated evidence documents are included in every GitHub Actions compatibility artifact. The proposal comments are deliberately maintained alongside executable evidence and checked by the test suite.

When an upstream behavior or interface changes, the sentinel tests fail and the evidence must be reviewed before CI becomes green again.
