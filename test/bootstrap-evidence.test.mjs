import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const snapshot = await readFile(
  new URL("../TYPESCRIPT-ESTREE-BOOTSTRAP.md", import.meta.url),
  "utf8",
);
const integration = await readFile(
  new URL("../docs/typescript-estree-bootstrap-integration.md", import.meta.url),
  "utf8",
);
const proposal = await readFile(
  new URL("../docs/isolated-source-parser-api.md", import.meta.url),
  "utf8",
);
const followUp = await readFile(
  new URL(
    "../upstream/api-discussion-455-bootstrap-followup.md",
    import.meta.url,
  ),
  "utf8",
);

const documents = [snapshot, integration, proposal, followUp];

test("source-string bootstrap evidence records the asserted result", () => {
  assert.match(snapshot, /parse\(string\).*\*\*7\/7\*\*/);
  assert.match(snapshot, /parseAndGenerateServices\(string\).*\*\*7\/7\*\*/);
  assert.match(snapshot, /expected located `TSError`: \*\*yes\*\*/);
  assert.match(snapshot, /Every temporary native project closed: \*\*yes\*\*/);
  assert.match(snapshot, /typescript\.createSourceFile/);
});

test("integration analysis identifies one downstream bootstrap boundary", () => {
  assert.match(integration, /one runtime call/i);
  assert.match(integration, /ts\.createSourceFile/);
  assert.match(integration, /15 projects created/i);
  assert.match(integration, /15.*closed/i);
  assert.match(integration, /public `parse\(string\)`/);
  assert.match(integration, /do not need redesign/i);
  assert.match(integration, /direct isolated native operation remains the blocker/i);
});

test("isolated parser proposal includes source-string evidence", () => {
  assert.match(proposal, /valid source strings through `parse`: \*\*7\/7\*\*/);
  assert.match(
    proposal,
    /valid source strings through `parseAndGenerateServices`: \*\*7\/7\*\*/,
  );
  assert.match(proposal, /temporary native projects closed without leaks: \*\*15\/15\*\*/);
  assert.match(proposal, /public `typescript-estree`.*do not need redesign/s);
  assert.match(proposal, /api\.parseSourceFile/);
});

test("Discussion 455 follow-up cites executable evidence and preserves scope", () => {
  assert.match(followUp, /parse\(sourceText, options\)/);
  assert.match(followUp, /parseAndGenerateServices\(sourceText, options\)/);
  assert.match(followUp, /7\/7/);
  assert.match(followUp, /15 temporary native projects/);
  assert.match(followUp, /all 15 were closed/);
  assert.match(followUp, /TYPESCRIPT-ESTREE-BOOTSTRAP\.md/);
  assert.match(followUp, /typescript-estree-bootstrap-integration\.md/);
  assert.match(followUp, /not proposed as the solution/i);
});

test("bootstrap evidence documents disclose AI assistance where authored", () => {
  for (const document of [integration, proposal, followUp]) {
    assert.match(document, /AI assistance was used/);
  }
});
