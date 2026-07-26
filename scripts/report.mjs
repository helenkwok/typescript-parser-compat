import { writeFile } from "node:fs/promises";
import ts6 from "typescript6";
import tsNext from "typescript";
import * as nativeAst from "@typescript/native-preview/unstable/ast";

import {
  evaluateCapabilityContract,
  loadCapabilityContract,
} from "./capabilities.mjs";
import { runNativeProjectProbe } from "./native-project-probe.mjs";
import { renderCompatibilityStatus } from "./status.mjs";

const contract = await loadCapabilityContract();
const capabilityMatrix = evaluateCapabilityContract(contract, nativeAst);
const nativeProjectProbe = await runNativeProjectProbe();

const report = {
  generatedAt: new Date().toISOString(),
  packages: {
    typescript6: ts6.version,
    typescriptNext: tsNext.version,
  },
  detectedApis: {
    typescript6RootCreateSourceFile: typeof ts6.createSourceFile === "function",
    typescriptNextRootCreateSourceFile:
      typeof tsNext.createSourceFile === "function",
    nativeAstUtilities: {
      createScanner: typeof nativeAst.createScanner === "function",
      visitNode: typeof nativeAst.visitNode === "function",
      getTokenAtPosition: typeof nativeAst.getTokenAtPosition === "function",
    },
  },
  capabilityMatrix,
  nativeProjectProbe,
};

const jsonReport = `${JSON.stringify(report, null, 2)}\n`;
const markdownStatus = renderCompatibilityStatus(report);

await Promise.all([
  writeFile("compatibility-report.json", jsonReport),
  writeFile("STATUS.md", markdownStatus),
]);

console.log(jsonReport);
