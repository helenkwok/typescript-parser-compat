import ts from "typescript";
import * as nativeAst from "@typescript/native-preview/unstable/ast";

const markerName = /^(First|Last)|Count$/;

export function getNativeKindAliases(kind) {
  return Object.entries(nativeAst.SyntaxKind)
    .filter(([, value]) => typeof value === "number" && value === kind)
    .map(([name]) => name);
}

export function chooseCanonicalKindName(kind) {
  const aliases = getNativeKindAliases(kind);
  return (
    aliases.find(
      (name) =>
        !markerName.test(name) && typeof ts.SyntaxKind[name] === "number",
    ) ??
    aliases.find((name) => typeof ts.SyntaxKind[name] === "number") ??
    nativeAst.SyntaxKind[kind]
  );
}

export function listCanonicalKindAliasChanges() {
  const numericKinds = new Set(
    Object.values(nativeAst.SyntaxKind).filter(
      (value) => typeof value === "number",
    ),
  );

  return [...numericKinds]
    .map((kind) => {
      const before = nativeAst.SyntaxKind[kind];
      const after = chooseCanonicalKindName(kind);
      return { kind, before, after, aliases: getNativeKindAliases(kind) };
    })
    .filter(
      ({ before, after }) => typeof after === "string" && before !== after,
    );
}
