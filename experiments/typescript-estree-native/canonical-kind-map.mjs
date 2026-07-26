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

export function canonicalizeNativeSyntaxKindReverseMap() {
  const changes = [];
  const numericKinds = new Set(
    Object.values(nativeAst.SyntaxKind).filter(
      (value) => typeof value === "number",
    ),
  );

  for (const kind of numericKinds) {
    const before = nativeAst.SyntaxKind[kind];
    const after = chooseCanonicalKindName(kind);
    if (typeof after === "string" && before !== after) {
      nativeAst.SyntaxKind[kind] = after;
      changes.push({ kind, before, after, aliases: getNativeKindAliases(kind) });
    }
  }

  return changes;
}
