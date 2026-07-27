import { readFile } from "node:fs/promises";

const contractUrl = new URL("../contract/parser-capabilities.json", import.meta.url);
const parserPattern = /^(createSourceFile|parseSourceFile|sourceFileFromText|parseFile|parseSourceFiles|createSourceFiles)$/i;

export async function loadCapabilityContract() {
  return JSON.parse(await readFile(contractUrl, "utf8"));
}

function parserEvidence(capabilityId, parserCandidates, parserProbe) {
  const verified = parserProbe?.capabilities?.[capabilityId] === true;
  return {
    verified,
    parserCandidates,
    probeStatus: parserProbe?.status ?? "not-run",
  };
}

function detectedStatus(capabilityId, parserProbe) {
  if (parserProbe?.capabilities?.[capabilityId] === true) {
    return "ready";
  }
  if (parserProbe?.status === "partial") {
    return "partial";
  }
  if (parserProbe?.status === "incompatible") {
    return "incompatible";
  }
  return "unverified";
}

function evaluateProbe(
  capabilityId,
  probe,
  nativeAst,
  parserCandidates,
  parserProbe,
) {
  const parserDetected = parserCandidates.length > 0;
  const candidateEvidence = parserEvidence(
    capabilityId,
    parserCandidates,
    parserProbe,
  );

  switch (probe.type) {
    case "parser-entry-point":
      return parserDetected
        ? {
            status: detectedStatus(capabilityId, parserProbe),
            evidence: candidateEvidence,
          }
        : {
            status: "missing",
            evidence: { parserCandidates: [] },
          };

    case "parser-dependent":
      return parserDetected
        ? {
            status: detectedStatus(capabilityId, parserProbe),
            evidence: candidateEvidence,
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

      if (!parserDetected) {
        return {
          status: availableExports.length > 0 ? "partial" : "blocked",
          evidence: {
            blockedBy: "source-text-entry-point",
            availableExports,
            missingExports,
          },
        };
      }

      const parserReady = parserProbe?.capabilities?.[capabilityId] === true;
      return {
        status:
          parserReady && missingExports.length === 0
            ? "ready"
            : parserReady || availableExports.length > 0
              ? "partial"
              : detectedStatus(capabilityId, parserProbe),
        evidence: {
          ...candidateEvidence,
          availableExports,
          missingExports,
        },
      };
    }

    default:
      throw new Error(`Unknown native probe type: ${probe.type}`);
  }
}

export function evaluateCapabilityContract(
  contract,
  nativeAst,
  parserProbe = undefined,
) {
  const fallbackCandidates = Object.keys(nativeAst)
    .filter((name) => parserPattern.test(name))
    .map((name) => ({
      id: `native-ast.${name}`,
      owner: "native-ast",
      name,
    }));
  const parserCandidates = parserProbe?.candidates ?? fallbackCandidates;

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
      capability.id,
      capability.nativeProbe,
      nativeAst,
      parserCandidates,
      parserProbe,
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
      parserProbeStatus: parserProbe?.status ?? "not-run",
    },
    parserCandidates,
    capabilities,
  };
}
