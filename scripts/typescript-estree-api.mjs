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

function isFunction(value) {
  return typeof value === "function";
}

function createTypeScript6ReferenceProbe(ts6) {
  const sourceFile = ts6.createSourceFile(
    "inventory.ts",
    "export const value = 1;",
    ts6.ScriptTarget.Latest,
    true,
    ts6.ScriptKind.TS,
  );
  const invalid = ts6.createSourceFile(
    "invalid.ts",
    "export const broken = ;",
    ts6.ScriptTarget.Latest,
    true,
    ts6.ScriptKind.TS,
  );
  const node = sourceFile.statements[0];
  const diagnostic = invalid.parseDiagnostics[0];

  return {
    apiSurface: {
      sourceFile: {
        text: typeof sourceFile.text === "string",
        fileName: typeof sourceFile.fileName === "string",
        scriptKind: typeof sourceFile.scriptKind === "number",
        statements: typeof sourceFile.statements?.length === "number",
        parseDiagnostics:
          typeof sourceFile.parseDiagnostics?.length === "number",
        getFullText: isFunction(sourceFile.getFullText),
        getLineAndCharacterOfPosition: isFunction(
          sourceFile.getLineAndCharacterOfPosition,
        ),
      },
      node: {
        kind: typeof node?.kind === "number",
        pos: typeof node?.pos === "number",
        end: typeof node?.end === "number",
        parent: typeof node?.parent === "object",
        forEachChild: isFunction(node?.forEachChild),
        getSourceFile: isFunction(node?.getSourceFile),
        getStart: isFunction(node?.getStart),
        getFullStart: isFunction(node?.getFullStart),
        getEnd: isFunction(node?.getEnd),
        getWidth: isFunction(node?.getWidth),
        getFullWidth: isFunction(node?.getFullWidth),
        getLeadingTriviaWidth: isFunction(node?.getLeadingTriviaWidth),
        getChildren: isFunction(node?.getChildren),
        getChildCount: isFunction(node?.getChildCount),
        getChildAt: isFunction(node?.getChildAt),
        getFirstToken: isFunction(node?.getFirstToken),
        getLastToken: isFunction(node?.getLastToken),
        getFullText: isFunction(node?.getFullText),
        getText: isFunction(node?.getText),
      },
    },
    capabilities: {
      locatedSyntaxDiagnostics:
        typeof diagnostic?.code === "number" &&
        typeof diagnostic?.start === "number" &&
        typeof diagnostic?.length === "number" &&
        diagnostic.length > 0,
      legacyDiagnosticShape:
        typeof diagnostic?.start === "number" &&
        typeof diagnostic?.length === "number" &&
        typeof diagnostic?.messageText !== "undefined" &&
        typeof diagnostic?.file === "object",
      normalizedSyntaxDiagnostics: true,
    },
  };
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
      status:
        value === true ? "verified" : value === false ? "incompatible" : "missing",
      capability: probe.capability,
    };
  }

  if (probe.type === "project-diagnostic-shape") {
    const located =
      projectProbe?.capabilities?.[probe.locatedCapability] === true;
    const legacy = projectProbe?.capabilities?.[probe.legacyCapability] === true;
    const normalized =
      projectProbe?.capabilities?.[probe.normalizedCapability] === true;

    return {
      status: legacy
        ? "verified"
        : located && normalized
          ? "adapter-required"
          : located
            ? "partial"
            : "incompatible",
      located,
      legacy,
      normalized,
      nativeFields: probe.nativeFields,
      legacyFields: probe.legacyFields,
    };
  }

  return { status: "not-applicable" };
}

function evaluateReference(ts6, referenceProbe, probe) {
  if (probe.type === "module-path" || probe.type === "module-members") {
    return evaluateModuleProbe(ts6, probe);
  }
  return evaluateProjectProbe(referenceProbe, probe);
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
  if (project.status === "adapter-required") {
    return "adapter-required";
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
  const referenceProbe = createTypeScript6ReferenceProbe(ts6);
  const requirements = inventory.requirements.map((requirement) => {
    const roots = {
      typescriptNext: evaluateModuleProbe(tsNext, requirement.probe),
      nativeAst: evaluateModuleProbe(nativeAst, requirement.probe),
    };
    const project = evaluateProjectProbe(nativeProjectProbe, requirement.probe);
    const reference = evaluateReference(ts6, referenceProbe, requirement.probe);

    return {
      id: requirement.id,
      layer: requirement.layer,
      required: requirement.required,
      requirement: requirement.requirement,
      evidence: requirement.evidence,
      probe: requirement.probe,
      availability: {
        typescript6: reference,
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
      typescript6Available: required.filter((item) =>
        ["available", "verified"].includes(
          item.availability.typescript6.status,
        ),
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
      adapterRequired: required.filter(
        (item) => item.nativeClassification === "adapter-required",
      ).length,
      incomplete: required.filter((item) =>
        [
          "root-partial",
          "unstable-partial",
          "project-partial",
          "adapter-required",
          "incompatible",
          "missing",
        ].includes(item.nativeClassification),
      ).length,
      classifications,
    },
    requirements,
  };
}
