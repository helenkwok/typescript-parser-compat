# Ready-to-post comment for microsoft/typescript-go Discussion #455

I tested the current project-backed native AST against the published `@typescript-eslint/typescript-estree@8.65.0` converter.

After mechanical compatibility adapters, **7/7 valid fixtures convert strictly to ESTree**, including JS, JSX, comments, generics, `satisfies`, decorators, tokens, and TS↔ESTree node maps. Malformed input produces the expected located parser error.

This narrows the syntax-only tooling request considerably. We do **not** appear to need the full legacy compiler API or matching numeric enum values. The remaining blocker is one isolated parsing operation:

```ts
api.parseSourceFile({
  fileName,
  text,
  scriptKind,
  languageVersion,
  setParentNodes: true,
})
// -> { sourceFile, diagnostics }
```

The operation would:

- parse in-memory text that may not exist on disk;
- require no project, `tsconfig`, module resolution, library loading, or type checking;
- return the same native AST schema used by project-backed `SourceFile` objects;
- return native diagnostics using `pos`, `end`, `text`, and `fileName`;
- remain synchronous for Node.js tooling.

An optional batch form could reduce IPC overhead:

```ts
api.parseSourceFiles(requests)
```

The project-backed model in https://github.com/microsoft/typescript-go/issues/2824 is appropriate for typed linting and semantic tools. It does not replace the syntax-only `typescript-estree` path, which intentionally creates a standalone `SourceFile` and no `Program`.

Executable evidence and the detailed minimal proposal are here:

- https://github.com/helenkwok/typescript-parser-compat/blob/main/TYPESCRIPT-ESTREE-CONVERSION.md
- https://github.com/helenkwok/typescript-parser-compat/blob/main/docs/isolated-source-parser-api.md
- https://github.com/helenkwok/typescript-parser-compat/tree/main/experiments/typescript-estree-native

Would an isolated `parseSourceFile`/`parseSourceFiles` operation fit the curated 7.1 API direction?

AI assistance was used to help structure this summary. The compatibility claims are generated and asserted by the linked test suite.
