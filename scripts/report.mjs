import { mkdir, writeFile } from "node:fs/promises";
import ts6 from "typescript6";
import tsNext from "typescript";
import * as nativeAst from "@typescript/native-preview/unstable/ast";

import {
  evaluateCapabilityContract,
  loadCapabilityContract,
} from "./capabilities.mjs";
import { runNativeParserCandidateProbe } from "./native-parser-candidates.mjs";
import { renderNativeParserCandidateStatus } from "./native-parser-candidate-status.mjs";
import { runNativeProjectProbe } from "./native-project-probe.mjs";
import { renderCompatibilityStatus } from "./status.mjs";
import {
  evaluateTypescriptEstreeApiInventory,
  loadTypescriptEstreeApiInventory,
} from "./typescript-estree-api.mjs";
import { renderTypescriptEstreeApiStatus } from "./typescript-estree-status.mjs";
import { renderUpstreamEvidence } from "./upstream-evidence.mjs";

const contract = await loadCapabilityContract();
const nativeParserCandidateProbe = await runNativeParserCandidateProbe();
const capabilityMatrix = evaluateCapabilityContract(
  contract,
  nativeAst,
  nativeParserCandidateProbe,
);
const nativeProjectProbe = await runNativeProjectProbe();
const typescriptEstreeContract = await loadTypescriptEstreeApiInventory();
const typescriptEstreeApi = evaluateTypescriptEstreeApiInventory(
  typescriptEstreeContract,
  {
    ts6,
    tsNext,
    nativeAst,
    nativeProjectProbe,
  },
);
const upstreamDocuments = renderUpstreamEvidence(nativeProjectProbe);

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
  nativeParserCandidateProbe,
  capabilityMatrix,
  typescriptEstreeApi,
  nativeProjectProbe,
  upstreamEvidence: {
    bomConsistency: {
      status: nativeProjectProbe.capabilities.bomConsistency
        ? "resolved"
        : "existing-tracker",
      tracker: "https://github.com/microsoft/typescript-go/issues/4521",
      document: "upstream/bom-4521.md",
    },
    diagnosticShape: {
      status:
        nativeProjectProbe.capabilities.locatedSyntaxDiagnostics &&
        nativeProjectProbe.capabilities.normalizedSyntaxDiagnostics
          ? "adapter-required"
          : "unresolved",
      tracker: "https://github.com/microsoft/typescript-go/issues/4745",
      clarification:
        "https://github.com/microsoft/typescript-go/issues/4745#issuecomment-5081879077",
      document: "upstream/diagnostic-shape-4745.md",
    },
  },
};

const jsonReport = `${JSON.stringify(report, null, 2)}\n`;
const markdownStatus = renderCompatibilityStatus(report);
const nativeParserCandidateStatus = renderNativeParserCandidateStatus(
  nativeParserCandidateProbe,
);
const typescriptEstreeStatus = renderTypescriptEstreeApiStatus(
  typescriptEstreeApi,
);

await mkdir("upstream", { recursive: true });
await Promise.all([
  writeFile("compatibility-report.json", jsonReport),
  writeFile("STATUS.md", markdownStatus),
  writeFile("NATIVE-PARSER-CANDIDATES.md", nativeParserCandidateStatus),
  writeFile("TYPESCRIPT-ESTREE-API.md", typescriptEstreeStatus),
  writeFile("upstream/bom-4521.md", upstreamDocuments.bom),
  writeFile(
    "upstream/diagnostic-shape-4745.md",
    upstreamDocuments.diagnostics,
  ),
]);

console.log(jsonReport);
