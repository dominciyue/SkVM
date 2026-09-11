import { parse as parseYaml } from "yaml";

export const CLASS_PROOF_CLASS_ID = "openapi-contract-to-offline-request-specimen" as const;

export type EligibilityResource = {
  path: string;
  text: string | null;
  format?: "json" | "yaml";
  error?: string;
};

export type EligibilityInput = {
  skillId: string;
  sourcePath?: string;
  body: string;
  resources?: EligibilityResource[];
};

export type EligibilityEvidence = {
  sourcePath: string;
  locator: string;
  kind: "input" | "output" | "coverage" | "resource";
  quote: string;
};

export type EligibilityRecord = {
  skillId: string;
  classId: typeof CLASS_PROOF_CLASS_ID;
  decision: "eligible" | "excluded" | "uncertain";
  evidence: EligibilityEvidence[];
  applicableInputs: Array<{
    inputId: string;
    sourcePath: string;
    operationCount: number;
    format: "json" | "yaml";
  }>;
  exclusionReasons: string[];
  bodyReadForScreening: boolean;
  modelCalls: number;
};

type JsonRecord = Record<string, unknown>;
type ParsedResource = { path: string; format: "json" | "yaml"; value: JsonRecord; text: string };

const METHODS = ["delete", "get", "head", "options", "patch", "post", "put", "trace"] as const;
const METHOD_SET = new Set<string>(METHODS);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function quoteAt(body: string, expression: RegExp, fallback: string): string {
  const match = expression.exec(body);
  if (!match || match.index < 0) return fallback;
  const lineStart = body.lastIndexOf("\n", match.index) + 1;
  const lineEnd = body.indexOf("\n", match.index);
  const line = body.slice(lineStart, lineEnd < 0 ? body.length : lineEnd).trim();
  return line.slice(0, 240) || fallback;
}

function evidenceForMarker(body: string, sourcePath: string, kind: EligibilityEvidence["kind"], expression: RegExp, locator: string, fallback: string): EligibilityEvidence {
  return { sourcePath, locator, kind, quote: quoteAt(body, expression, fallback) };
}

function resourceFormat(resource: EligibilityResource): "json" | "yaml" {
  if (resource.format) return resource.format;
  return /\.json$/iu.test(resource.path) || /^\s*[{[]/u.test(resource.text ?? "") ? "json" : "yaml";
}

function parseResource(resource: EligibilityResource): ParsedResource {
  if (typeof resource.path !== "string" || !resource.path.trim()) throw new Error("resource-path-missing");
  if (typeof resource.text !== "string") throw new Error(`resource-unreadable:${resource.error ?? "no-bytes"}`);
  const format = resourceFormat(resource);
  let value: unknown;
  try {
    value = format === "json" ? JSON.parse(resource.text) : parseYaml(resource.text);
  } catch (error) {
    throw new Error(`resource-parse-failed:${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(value)) throw new Error("resource-root-not-object");
  return { path: resource.path, format, value, text: resource.text };
}

function collectRefs(value: unknown, refs: string[] = []): string[] {
  const addExternalRef = (candidate: string, allowBare = false) => {
    const path = candidate.split("#", 1)[0] ?? "";
    if (path && (path.startsWith("./") || path.startsWith("../") || (allowBare && !path.startsWith("/")))) refs.push(path);
  };
  if (typeof value === "string") {
    addExternalRef(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, refs);
  } else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (key === "$ref" && typeof item === "string") addExternalRef(item, true);
      else collectRefs(item, refs);
    }
  }
  return refs;
}

function operationCandidates(resource: ParsedResource, body: string, sourcePath: string) {
  const paths = resource.value.paths;
  if (!isRecord(paths)) return { inputs: [], operationCount: 0, issues: ["paths-missing-or-not-object"] };
  const inputs: EligibilityRecord["applicableInputs"] = [];
  const pathNames = Object.keys(paths).filter((path) => path.startsWith("/")).sort();
  let operationCount = 0;
  const minimalFull = /\b(?:minimal|full|complete)\b/iu.test(body)
    && /\b(?:request|payload|case|scenario|coverage)\b/iu.test(body);
  for (const path of pathNames) {
    const pathItem = paths[path];
    if (!isRecord(pathItem)) continue;
    for (const method of METHODS) {
      if (!Object.prototype.hasOwnProperty.call(pathItem, method)) continue;
      const operation = pathItem[method];
      if (!isRecord(operation)) continue;
      operationCount += 1;
      const key = `${method.toUpperCase()} ${path}`;
      const hasRequestBasis = Array.isArray(operation.parameters) || isRecord(operation.requestBody)
        || isRecord(pathItem.parameters);
      const baseId = `${sourcePath}#${method.toUpperCase()} ${path}`;
      inputs.push({ inputId: baseId, sourcePath: resource.path, operationCount: 1, format: resource.format });
      if (minimalFull && hasRequestBasis) {
        inputs.push({ inputId: `${baseId}:minimal`, sourcePath: resource.path, operationCount: 1, format: resource.format });
        inputs.push({ inputId: `${baseId}:full`, sourcePath: resource.path, operationCount: 1, format: resource.format });
        inputs.splice(inputs.findIndex((input) => input.inputId === baseId), 1);
      }
      void key;
    }
  }
  return { inputs, operationCount, issues: [] as string[] };
}

function sortInputs(inputs: EligibilityRecord["applicableInputs"]): EligibilityRecord["applicableInputs"] {
  return [...inputs].sort((a, b) => a.inputId < b.inputId ? -1 : a.inputId > b.inputId ? 1 : 0);
}

/**
 * Deterministic, side-effect-free membership preflight. It only consumes a
 * skill body and explicitly supplied direct resources; it never calls a
 * network, model, constructor, or checker.
 */
export function preflightSkillEligibility(input: unknown): EligibilityRecord {
  if (!isRecord(input)) throw new Error("eligibility input must be an object");
  const skillId = typeof input.skillId === "string" ? input.skillId : "";
  const sourcePath = typeof input.sourcePath === "string" && input.sourcePath ? input.sourcePath : "SKILL.md";
  const body = typeof input.body === "string" ? input.body : "";
  const resources = Array.isArray(input.resources) ? input.resources as EligibilityResource[] : [];
  const evidence: EligibilityEvidence[] = [];
  const reasons: string[] = [];
  const addReason = (reason: string) => { if (!reasons.includes(reason)) reasons.push(reason); };

  if (!skillId) addReason("skill-id-missing");
  if (!body.trim()) addReason("body-missing");

  const contractMarker = /\b(?:openapi|swagger|json\s*api|api\s+contract|API\s+contract)\b/iu;
  const outputMarker = /\b(?:offline|local|contract[- ]derived)\b[\s\S]{0,100}\b(?:request|test|fixture|specimen|case|artifact)\b|\b(?:postman\s+collection|test\s+scripts?|api\s+test\s+scripts?|request\s+items?|contract\s+tests?)\b|(?:脚本|测试报告|测试用例|接口自动化测试|离线产物)/iu;
  const generatedOutputMarker = /\b(?:generate|emit|produce|create|convert|write|build|design|plan|validate)\b[\s\S]{0,100}\b(?:request\s+(?:examples?|specimens?)|api\s+tests?|test\s+cases?|test\s+suites?|fixtures?|postman\s+collection|test\s+scripts?|request\s+items?|contract\s+tests?)\b|(?:生成|产出|输出)[^。\n]{0,40}(?:脚本|测试报告|测试用例|测试产物)/iu;
  const coverageMarker = /\b(?:cover(?:age)?|each\s+(?:endpoint|operation|request)|every\s+(?:endpoint|operation|request)|all\s+(?:endpoints|operations|requests)|one\s+(?:request\s+item|test)\s+per\s+(?:operation|endpoint)|per\s+(?:endpoint|operation)|minimal\s+and\s+full|valid\s+and\s+invalid)\b|(?:逐接口|每个接口|每接口|每个端点|所有接口|所有端点|各接口|覆盖每)/iu;
  const liveMarker = /\b(?:live\s+(?:api|service|endpoint)|execute\s+requests?|real\s+credentials?|authentication\s+token|auth(?:enticate|entication))\b/iu;

  if (contractMarker.test(body)) evidence.push(evidenceForMarker(body, sourcePath, "input", contractMarker, "body:contract-marker", "public API contract input"));
  else addReason("public-contract-marker-missing");
  const hasOutputDuty = outputMarker.test(body) || generatedOutputMarker.test(body);
  if (hasOutputDuty) {
    const marker = outputMarker.test(body) ? outputMarker : generatedOutputMarker;
    evidence.push(evidenceForMarker(body, sourcePath, "output", marker, "body:offline-output-duty", "offline request/test output duty"));
  }
  else addReason("offline-output-duty-missing");
  if (coverageMarker.test(body)) evidence.push(evidenceForMarker(body, sourcePath, "coverage", coverageMarker, "body:coverage-duty", "coverage requirement"));
  else addReason("coverage-duty-missing");
  if (liveMarker.test(body) && !hasOutputDuty) addReason("offline-determinacy-missing");

  const parsed: ParsedResource[] = [];
  const resourcePaths = new Set<string>();
  for (const resource of resources) {
    if (!resource || typeof resource !== "object") { addReason("resource-unreadable:invalid-entry"); continue; }
    try {
      const parsedResource = parseResource(resource);
      parsed.push(parsedResource);
      resourcePaths.add(parsedResource.path.replace(/\\/gu, "/"));
      const version = parsedResource.value.openapi;
      if (typeof version !== "string" || !/^3\.0(?:\.\d+)?$/u.test(version)) {
        addReason(typeof version === "string" && /^2\./u.test(version) ? "unsupported-openapi-version" : "openapi-version-missing");
      } else {
        evidence.push({ sourcePath: parsedResource.path, locator: "/openapi", kind: "resource", quote: version });
      }
    } catch (error) {
      addReason(String(error instanceof Error ? error.message : error));
    }
  }
  if (!resources.length && contractMarker.test(body)) addReason("resource-unreadable:direct-contract-missing");
  if (resources.some((resource) => !resource || typeof resource.text !== "string")) addReason("resource-unreadable");

  const allInputs: EligibilityRecord["applicableInputs"] = [];
  let operationCount = 0;
  for (const resource of parsed.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) {
    const result = operationCandidates(resource, body, sourcePath);
    operationCount += result.operationCount;
    allInputs.push(...result.inputs);
    for (const issue of result.issues) addReason(`resource-structure:${issue}`);
    const refs = unique(collectRefs(resource.value));
    for (const ref of refs) {
      const normalized = ref.replace(/\\/gu, "/");
      const base = resource.path.includes("/") ? resource.path.slice(0, resource.path.lastIndexOf("/") + 1) : "";
      const resolved = normalized.startsWith("/") ? normalized.slice(1) : `${base}${normalized}`;
      if (!resourcePaths.has(resolved) && !resourcePaths.has(normalized)) addReason(`resource-closure-unresolved:${ref}`);
    }
  }
  if (parsed.some((resource) => {
    const version = resource.value.openapi;
    return typeof version !== "string" || !/^3\.0(?:\.\d+)?$/u.test(version);
  })) addReason("unsupported-or-missing-openapi-version");
  if (!parsed.length && contractMarker.test(body)) addReason("resource-unreadable");

  const applicableInputs = sortInputs(allInputs);
  if (applicableInputs.length < 2) addReason("minimum-inputs-not-met");
  if (!operationCount && parsed.length) addReason("operation-inventory-empty");

  const hasHardExclusion = reasons.some((reason) => [
    "skill-id-missing", "body-missing", "public-contract-marker-missing", "offline-output-duty-missing",
    "coverage-duty-missing", "offline-determinacy-missing", "unsupported-openapi-version", "openapi-version-missing",
    "unsupported-or-missing-openapi-version", "minimum-inputs-not-met", "operation-inventory-empty",
  ].includes(reason));
  const hasUncertainty = reasons.some((reason) => reason.startsWith("resource-unreadable")
    || reason.startsWith("resource-parse-failed") || reason.startsWith("resource-closure-unresolved")
    || reason.startsWith("resource-structure"));
  const decision: EligibilityRecord["decision"] = hasUncertainty && !reasons.includes("public-contract-marker-missing")
    ? "uncertain"
    : hasHardExclusion ? "excluded" : "eligible";

  return {
    skillId,
    classId: CLASS_PROOF_CLASS_ID,
    decision,
    evidence,
    applicableInputs,
    exclusionReasons: reasons,
    bodyReadForScreening: true,
    modelCalls: 0,
  };
}
