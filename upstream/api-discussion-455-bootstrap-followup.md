I have a stronger downstream integration result to add to the earlier isolated-parser proposal.

The previous experiment proved that the project-backed native `SourceFile` can be adapted into the published `typescript-estree` converter. The new experiment moves one boundary outward and invokes the unchanged public source-string APIs:

```ts
parse(sourceText, options);
parseAndGenerateServices(sourceText, options);
```

I loaded `@typescript-eslint/typescript-estree@8.65.0` with a narrowly scoped TypeScript facade that replaced only `typescript.createSourceFile`. That replacement used the current native project API plus the already-tested structural adapter. All other TypeScript exports and all `typescript-estree` parser/converter code remained unchanged.

Results:

- `parse(string)`: 7/7 valid JS, JSX, and TypeScript fixtures passed;
- `parseAndGenerateServices(string)`: 7/7 passed;
- tokens, comments, ranges, locations, and both node maps were produced;
- malformed source returned the expected located `TSError`;
- 15 temporary native projects were created and all 15 were closed, including the error path.

Evidence:

- bootstrap result: https://github.com/helenkwok/typescript-parser-compat/blob/main/TYPESCRIPT-ESTREE-BOOTSTRAP.md
- integration analysis: https://github.com/helenkwok/typescript-parser-compat/blob/main/docs/typescript-estree-bootstrap-integration.md
- executable experiment: https://github.com/helenkwok/typescript-parser-compat/tree/main/experiments/typescript-estree-native

This narrows the required integration surface further: the syntax-only public parser APIs do not need redesign. They currently reach one replaceable runtime dependency, `ts.createSourceFile(...)`. A synchronous isolated native operation with equivalent inputs and the existing native `SourceFile`/diagnostic schema should be sufficient; the converter-side shape differences are already handled mechanically.

The temporary-project facade is not proposed as the solution—it still creates an API process, project, and `tsconfig` per call. It is evidence that a direct `parseSourceFile`/batch operation can slot into the existing downstream bootstrap without requiring full TypeScript 6 compiler-API compatibility.

AI assistance was used to help structure this follow-up. The claims above are backed by the linked executable tests and CI evidence.
