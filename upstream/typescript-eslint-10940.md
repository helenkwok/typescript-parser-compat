# Ready-to-post comment for typescript-eslint#10940

I ran the published `@typescript-eslint/typescript-estree@8.65.0` converter against project-backed ASTs from the current TypeScript native preview.

The result is encouraging for the JS-land AST part of this issue:

- **7/7 valid native-AST fixtures convert strictly to ESTree**;
- JS, JSX, comments, generics, `satisfies`, decorators, tokens, and node maps work;
- malformed input produces the expected located `TSError`;
- no fundamental native-AST incompatibility was found in the exercised syntax surface.

The compatibility layer is mechanical:

1. map native diagnostics from `pos/end/text/fileName` to the legacy diagnostic shape;
2. translate `SyntaxKind` by canonical enum name rather than numeric identity;
3. recursively wrap nodes and `NodeArray` helper results;
4. provide legacy range/width/child/token convenience methods;
5. synthesize missing token children with the TypeScript scanner.

This does **not** mean TypeScript 7 support is unblocked. The current AST is only available through a project-backed API. The non-type-aware `typescript-estree` path still needs a synchronous operation that parses one in-memory source string without a project or `tsconfig`.

I have written a minimal API proposal that deliberately does not request full TypeScript 6 compiler-API compatibility:

- https://github.com/helenkwok/typescript-parser-compat/blob/main/docs/isolated-source-parser-api.md
- https://github.com/helenkwok/typescript-parser-compat/blob/main/TYPESCRIPT-ESTREE-CONVERSION.md
- https://github.com/helenkwok/typescript-parser-compat/tree/main/experiments/typescript-estree-native

So the findings split the work into two tracks:

- **syntax-only parsing:** structurally viable; blocked on an isolated native parser entry point;
- **typed linting:** still depends on the project/type APIs and broader integration design tracked here.

AI assistance was used to help structure this summary. The compatibility claims are generated and asserted by the linked test suite.
