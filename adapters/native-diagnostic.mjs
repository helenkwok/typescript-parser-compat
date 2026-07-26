export function normalizeNativeDiagnostic(diagnostic, getSourceFile) {
  if (!diagnostic || typeof diagnostic !== "object") {
    throw new TypeError("Expected a native diagnostic object");
  }
  if (typeof diagnostic.pos !== "number" || typeof diagnostic.end !== "number") {
    throw new TypeError("Native diagnostic must expose numeric pos and end fields");
  }
  if (diagnostic.end < diagnostic.pos) {
    throw new RangeError("Native diagnostic end must not precede pos");
  }

  const file = diagnostic.fileName ? getSourceFile(diagnostic.fileName) : undefined;

  return {
    code: diagnostic.code,
    category: diagnostic.category,
    start: diagnostic.pos,
    length: diagnostic.end - diagnostic.pos,
    messageText: diagnostic.text,
    file,
  };
}
