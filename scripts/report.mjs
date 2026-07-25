import { writeFile } from "node:fs/promises";
import ts6 from "typescript6";
import tsNext from "typescript";
import * as nativeAst from "@typescript/native-preview/unstable/ast";

const parserPattern = /^(createSourceFile|parse|parseSourceFile|sourceFileFromText)$/i;
const report = {
  generatedAt: new Date().toISOString(),
  packages: {
    typescript6: ts6.version,
    typescriptNext: tsNext.version,
  },
  capabilities: {
    typescript6RootCreateSourceFile: typeof ts6.createSourceFile === "function",
    typescriptNextRootCreateSourceFile: typeof tsNext.createSourceFile === "function",
    nativeAstTraversal: typeof nativeAst.forEachChild === "function",
    nativeAstParserCandidates: Object.keys(nativeAst).filter((name) => parserPattern.test(name)),
  },
};

await writeFile("compatibility-report.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
