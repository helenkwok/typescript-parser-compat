# Upstream evidence

`npm run report` generates two evidence documents from the current native project probe:

- `bom-4521.md` adds reproducible downstream evidence to the existing `microsoft/typescript-go#4521` BOM/source-offset tracker.
- `diagnostic-shape-4745.md` records the clarification on `microsoft/typescript-go#4745`: native diagnostics expose locations through `pos` and `end`, and current TypeScript-style consumers need a mechanical shape adapter.

The generated documents are included in every GitHub Actions compatibility artifact. They are intentionally derived from executable observations rather than maintained as independent hand-written reports.

When an upstream behavior or interface changes, the sentinel tests fail and the evidence must be reviewed before CI becomes green again.
