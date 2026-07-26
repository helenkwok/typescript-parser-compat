import { readFile } from "node:fs/promises";

const inventoryUrl = new URL(
  "../contract/typescript-estree-api.json",
  import.meta.url,
);

export async function loadTypescriptEstreeApiInventory() {
  return JSON.parse(await readFile(inventoryUrl, "utf8"));
}

function getPath(root, path) {
  return path.split(".").reduce((value, key) => value?.[key], root);
}

function evaluateModuleProbe(module, probe) {
  if (probe.type === "module-path") {
    const value = getPath(module, probe.path);
    return {
      status: typeof value === "undefined" ? "missing" : "available",
      path: probe.path,
      valueType: typeof value,
    };
  }

  if (probe.type === "module-members") {
    const value = getPath(module, probe.path);
    const availableMembers = probe.members.filter(
      (member) => typeof value?.[member] !== "undefined",
    );
    const missingMembers = probe.members.filter(
      (member) => typeof value?.[member] === "undefined",
    );

    return {
      status:
        missingMembers.length === 0
          ? "available"
          : availableMembers.length > 0
            ? "partial"
            : "missing",
      path: probe.path,
      availableMembers,
      missingMembers,
    };
  }

  return { status: "not-applicable" };
}

function evaluateProjectProbe(projectProbe, probe) {
  if (probe.type === "project-surface") {
    const surface = projectProbe?.apiSurface?.[probe.target] ?? {};
    const availableMembers = probe.members.filter(
      (member) => surface[member] === true,
    );
    const missingMembers = probe.members.filter(
      (member) => surface[member] !== true,
    );

    return {
      status:
        missingMembers.length === 0
          ? "verified"
          : availableMembers.length > 0
            ? "partial"
            : "missing",
      target: probe.target,
      availableMembers,
      missingMembers,
    };
  }

  if (probe.type === "project-capability") {
    const value = projectProbe?.capabilities?.[probe.capability];
    return {
      status: value === true ? "verified" : value === false ? "incompatible" : "missing",
      capability: probe.capability,
    };
  }

  return { status: "not-applicable" };
}

function classifyRequirement(requirement, roots, project) {
  if (
    requirement.probe.type === "module-path" ||
    requirement.probe.type === "module-members"
  ) {
    if (roots.typescriptNext.status === "available") {
      return "root-ready";
    }
    if (roots.typescriptNext.status === "partial") {
      return "root-partial";
    }
    if (roots.nativeAst.status === "available") {
      return "unstable-only";
    }
    if (roots.nativeAst.status === "partial") {
      return "unstable-partial";
    }
    return requirement.required ? "missing" : "optional-missing";
  }

  if (project.status === "verified") {
    return "project-only";
  }
  if (project.status === "partial") {
    return "project-partial";
  }
  if (project.status === "incompatible") {
    return "incompatible";
  }
  return "missing";
}

export function evaluateTypescriptEstreeApiInventory(
  inventory,
  { ts6, tsNext, nativeAst, nativeProjectProbe },
) {
  const requirements = inventory.requirements.map((requirement) => {
    const roots = {
      typescript6: evaluateModuleProbe(ts6, requirement.probe),
      typescriptNext: evaluateModuleProbe(tsNext, requirement.probe),
      nativeAst: evaluateModuleProbe(nativeAst, requirement.probe),
    };
    const project = evaluateProjectProbe(nativeProjectProbe, requirement.probe);

    return {
      id: requirement.id,
      layer: requirement.layer,
      required: requirement.required,
      requirement: requirement.requirement,
      evidence: requirement.evidence,
      probe: requirement.probe,
      availability: {
        typescript6: roots.typescript6,
        typescriptNextRoot: roots.typescriptNext,
        nativeAst: roots.nativeAst,
        nativeProject: project,
      },
      nativeClassification: classifyRequirement(requirement, roots, project),
    };
  });

  const classifications = requirements.reduce((counts, requirement) => {
    const status = requirement.nativeClassification;
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});

  const required = requirements.filter((requirement) => requirement.required);
  return {
    schemaVersion: inventory.schemaVersion,
    inventory: inventory.inventory,
    description: inventory.description,
    upstream: inventory.upstream,
    summary: {
      totalRequirements: requirements.length,
      requiredRequirements: required.length,
      typescript6Available: required.filter(
        (item) =>
          item.availability.typescript6.status === "available" ||
          item.availability.nativeProject.status === "verified",
      ).length,
      rootReady: required.filter(
        (item) => item.nativeClassification === "root-ready",
      ).length,
      unstableOnly: required.filter(
        (item) => item.nativeClassification === "unstable-only",
      ).length,
      projectOnly: required.filter(
        (item) => item.nativeClassification === "project-only",
      ).length,
      incomplete: required.filter((item) =>
        [
          "root-partial",
          "unstable-partial",
          "project-partial",
          "incompatible",
          "missing",
        ].includes(item.nativeClassification),
      ).length,
      classifications,
    },
    requirements,
  };
}
