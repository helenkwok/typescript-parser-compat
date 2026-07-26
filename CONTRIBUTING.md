# Contributing

Thank you for helping improve `typescript-parser-compat`.

This repository is an executable compatibility specification for parser-facing TypeScript behavior. It is not a replacement compiler or parser. Changes should make claims more precise, reproducible, and useful to upstream maintainers and downstream tooling authors.

## Before opening an issue

Search this repository and `microsoft/typescript-go` for an existing report before filing a new discrepancy. Prefer adding evidence to an existing upstream tracker over opening a duplicate.

A useful discrepancy report includes:

- the exact package versions involved;
- a minimal source fixture;
- the TypeScript 6 reference behavior;
- the native-preview behavior;
- the downstream impact;
- an executable test or probe.

## Development workflow

Use Node.js 22 or newer.

```bash
npm install
npm test
npm run report
```

`npm run report` regenerates:

- `compatibility-report.json`;
- `STATUS.md`;
- issue-ready evidence under `upstream/`.

Run it whenever probes, fixtures, contract definitions, or status rendering change.

## Adding or changing a capability

The declarative contract lives in `contract/parser-capabilities.json`.

Every claimed capability or discrepancy must be traceable to:

1. a focused fixture under `fixtures/`;
2. an executable test under `test/`;
3. a native probe or explicit API-export check;
4. generated evidence in the report when relevant.

Do not weaken a sentinel merely to make CI green. When a nightly changes behavior, first determine whether it is an upstream fix, a regression, or an API-shape change, then update the expectation and evidence deliberately.

Project-backed native behavior must remain clearly separated from the project-less source-text parser contract. Success through a virtual `tsconfig` project does not prove that an isolated source string can be parsed by JavaScript tooling.

## Pull requests

Keep pull requests focused. Include:

- a concise summary of the behavior being specified or measured;
- why the change matters to parser or tooling compatibility;
- the tests and generated reports used for validation;
- links to related upstream issues where applicable.

The scheduled workflow intentionally installs moving preview channels. A pull request should not add a lockfile solely to make nightly versions static. Exact versions may be recorded in evidence when reproducing a specific upstream issue.

## Generated files

`STATUS.md` and the Markdown files under `upstream/` are generated outputs but are intentionally committed so reviewers can inspect stable, human-readable evidence.

Do not edit them independently. Change the corresponding script or probe, run `npm run report`, and commit the regenerated files together.

## AI-assisted contributions

AI coding tools may be used, but the contributor must:

- read and understand every submitted change;
- verify the reproduction and test results;
- disclose material AI assistance in the pull request;
- respond to review and correct errors personally.

Do not submit bulk, unattended, or queue-generated pull requests.

## License

By contributing, you agree that your contribution is licensed under the Apache License 2.0, as described in `LICENSE`.
