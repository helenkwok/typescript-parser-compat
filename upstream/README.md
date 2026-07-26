# Upstream evidence

`npm run report` generates two issue-ready evidence documents from the current native project probe:

- `bom-4521.md` adds reproducible downstream evidence to the existing `microsoft/typescript-go#4521` BOM/source-offset tracker.
- `diagnostic-locations-issue.md` is a draft for the missing `start` and `length` fields on syntactic diagnostics. Search upstream again before filing it to avoid a duplicate.

The generated documents are included in every GitHub Actions compatibility artifact. They are intentionally derived from executable observations rather than maintained as independent hand-written reports.

When an upstream behavior changes, the sentinel tests fail and the evidence must be reviewed before CI becomes green again.
