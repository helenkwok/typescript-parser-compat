import { readFile } from "node:fs/promises";

const contractUrl = new URL("../contract/parser-capabilities.json", import.meta.url);
const parserPattern = /^(createSourceFile|parse|parseSourceFile|sourceFileFromText)$/i;

export async function loadCapabilityContract() {
  return JSON.parse(await readFile(contractUrl, "utf8"));
}

function evaluateProbe(probe, nativeAst, parserCandidates) {
  switch (probe.type) {
    case "parser-entry-point":
      return parserCandidates.length > 0
        ? {
            status: "unverified",
            evidence: { parserCandidates },
          }
        : {
            status: "missing",
            evidence: { parserCandidates: [] },
          };

    case "parser-dependent":
      return parserCandidates.length > 0
        ? {
            status: "unverified",
            evidence: { parserCandidates },
          }
        : {
            status: "blocked",
            evidence: { blockedBy: "source-text-entry-point" },
          };

    case "parser-plus-exports": {
      const requestedExports = probe.exports ?? [];
      const availableExports = requestedExports.filter(
        (name) => typeof nativeAst[name] !== "undefined",
      );
      const missingExports = requestedExports.filter(
        (name) => typeof nativeAst[name] === "undefined",
      );

      if (parserCandidates.length === 0) {
        return {
          status: availableExports.length > 0 ? "partial" : "blocked",
          evidence: {
            blockedBy: "source-text-entry-point",
            availableExports,
            missingExports,
          },
        };
      }

      return {
        status: missingExports.length === 0 ? "unverified" : "partial",
        evidence: {
          parserCandidates,
          availableExports,
          missingExports,
        },
      };
    }

    default:
      throw new Error(`Unknown native probe type: ${probe.type}`);
  }
}

export function evaluateCapabilityContract(contract, nativeAst) {
  const parserCandidates = Object.keys(nativeAst).filter((name) =>
    parserPattern.test(name),
  );

  const capabilities = contract.capabilities.map((capability) => ({
    id: capability.id,
    category: capability.category,
    requirement: capability.requirement,
    required: capability.required,
    reference: {
      status: capability.referenceTests.length > 0 ? "covered" : "missing",
      tests: capability.referenceTests,
      fixtures: capability.fixtures,
    },
    nativePreview: evaluateProbe(
      capability.nativeProbe,
      nativeAst,
      parserCandidates,
    ),
  }));

  const nativeStatuses = capabilities.reduce((counts, capability) => {
    const status = capability.nativePreview.status;
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});

  return {
    schemaVersion: contract.schemaVersion,
    contract: contract.contract,
    description: contract.description,
    summary: {
      requiredCapabilities: capabilities.filter((item) => item.required).length,
      referenceCovered: capabilities.filter(
        (item) => item.reference.status === "covered",
      ).length,
      nativeReady: capabilities.filter(
        (item) => item.nativePreview.status === "ready",
      ).length,
      nativeStatuses,
      parserEntryPointDetected: parserCandidates.length > 0,
    },
    parserCandidates,
    capabilities,
  };
}
