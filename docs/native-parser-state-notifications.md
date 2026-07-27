# Native parser state notifications

The scheduled compatibility workflow compares the generated isolated-parser state with the committed baseline in `NATIVE-PARSER-CANDIDATES.md`.

## What counts as a meaningful change

The comparison parses and normalizes only executable compatibility state:

- overall candidate status (`absent`, `partial`, `incompatible`, or `ready`);
- detected candidate identifiers and their statuses;
- whether a fully ready candidate exists;
- readiness of each parser capability.

Explanatory wording, Markdown formatting, candidate ordering, timestamps, and package-version changes do not trigger a notification.

## Workflow behavior

Notification management runs only for `schedule` and `workflow_dispatch` events on the `main` branch. Pull requests and ordinary pushes cannot create or edit issues.

When the normalized state differs from the committed baseline, the workflow:

1. renders `native-parser-notification.md` and `native-parser-notification.json`;
2. searches for the stable issue title `Native parser compatibility state changed`;
3. creates the issue if none exists;
4. otherwise reopens and updates the existing issue;
5. assigns the repository owner;
6. includes links to the workflow run and the generated evidence artifact.

Repeated scheduled runs update the same issue rather than creating duplicates.

## Review procedure

Do not close the notification merely because a parser-like method appeared. Review the candidate signature, fixture results, capability matrix, and strict `typescript-estree` conversion result first.

After the new state is understood:

1. update the candidate adapter if required;
2. update the executable contract deliberately;
3. regenerate and commit the compatibility reports;
4. verify CI is green;
5. close the notification issue after the committed baseline represents the reviewed state.

The workflow has only `contents: read` and `issues: write` permissions. It does not modify repository code, branches, pull requests, releases, or upstream repositories.
