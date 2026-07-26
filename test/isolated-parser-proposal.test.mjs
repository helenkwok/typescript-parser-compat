import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const proposal = await readFile(
  new URL("../docs/isolated-source-parser-api.md", import.meta.url),
  "utf8",
);
const microsoftComment = await readFile(
  new URL("../upstream/api-discussion-455.md", import.meta.url),
  "utf8",
);
const typescriptEslintComment = await readFile(
  new URL("../upstream/typescript-eslint-10940.md", import.meta.url),
  "utf8",
);

test("isolated parser proposal remains focused on the one missing operation", () => {
  assert.match(proposal, /parseSourceFile/);
  assert.match(proposal, /parseSourceFiles/);
  assert.match(proposal, /7\/7/);
  assert.match(proposal, /without loading a project or `tsconfig`/);
  assert.match(proposal, /synchronous/);
  assert.match(proposal, /pos`, `end`, `text`, and `fileName`/);
  assert.match(proposal, /does not request:/i);
  assert.match(proposal, /full TypeScript 6 compiler-API compatibility/);
  assert.match(proposal, /numeric enum compatibility/);
  assert.match(proposal, /Discussion #455/);
  assert.match(proposal, /typescript-eslint#10940/);
});

test("Microsoft API discussion comment cites executable evidence", () => {
  assert.match(microsoftComment, /7\/7 valid fixtures convert strictly/);
  assert.match(microsoftComment, /api\.parseSourceFile/);
  assert.match(microsoftComment, /api\.parseSourceFiles/);
  assert.match(microsoftComment, /no project, `tsconfig`, module resolution/);
  assert.match(microsoftComment, /issues\/2824/);
  assert.match(
    microsoftComment,
    /typescript-parser-compat\/blob\/main\/TYPESCRIPT-ESTREE-CONVERSION\.md/,
  );
  assert.match(
    microsoftComment,
    /typescript-parser-compat\/blob\/main\/docs\/isolated-source-parser-api\.md/,
  );
});

test("typescript-eslint comment separates syntax-only and typed linting", () => {
  assert.match(typescriptEslintComment, /7\/7 valid native-AST fixtures/);
  assert.match(typescriptEslintComment, /no fundamental native-AST incompatibility/);
  assert.match(typescriptEslintComment, /syntax-only parsing/);
  assert.match(typescriptEslintComment, /typed linting/);
  assert.match(typescriptEslintComment, /blocked on an isolated native parser entry point/);
  assert.match(
    typescriptEslintComment,
    /typescript-parser-compat\/tree\/main\/experiments\/typescript-estree-native/,
  );
});

test("proposal documents disclose AI assistance", () => {
  for (const document of [proposal, microsoftComment, typescriptEslintComment]) {
    assert.match(document, /AI assistance was used/);
  }
});
