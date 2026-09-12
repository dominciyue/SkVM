import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import { parseDocument } from "yaml";
import { z } from "zod";
import { parseApiTaskContract, type ApiTaskContract, type ApiTaskRequirement } from "./api-task-contract";
import { parseApiTesterOperationSource, type ApiTesterSourceOperation } from "./api-tester-operation-source";

const MAX_RESOURCES = 64;
const MAX_RESOURCE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_RESOURCE_BYTES = 32 * 1024 * 1024;
const MAX_TRAVERSAL_NODES = 10000;
const MAX_REFERENCE_OCCURRENCES = 4096;
const MAX_DEPTH = 128;

const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const RelativePathSchema = z.string().min(1).refine((value) => !isAbsolute(value)
  && !/^[A-Za-z]:[\\/]/u.test(value) && !value.startsWith("\\\\") && !value.split(/[\\/]+/u).includes(".."),
"dependency path must be relative and contained");
const ShaSchema = z.string().regex(/^[0-9a-f]{64}$/u);

function documentUri(value: string): string {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(`invalid dependency URI: ${value}`); }
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) {
    throw new Error(`unsupported dependency URI: ${value}`);
  }
  return parsed.href;
}

export const ApiDependencyManifestSchema = z.object({
  schemaVersion: z.literal("skvm-api-dependency-manifest/v1"),
  rootUri: z.string().transform(documentUri),
  resources: z.array(z.object({
    uri: z.string().transform(documentUri),
    path: RelativePathSchema,
    format: z.enum(["json", "yaml"]),
    sha256: ShaSchema,
  }).strict()).max(MAX_RESOURCES),
}).strict().superRefine((value, context) => {
  if (new Set(value.resources.map(({ uri }) => uri)).size !== value.resources.length) {
    context.addIssue({ code: "custom", path: ["resources"], message: "duplicate dependency URI" });
  }
  if (new Set(value.resources.map(({ path }) => path)).size !== value.resources.length) {
    context.addIssue({ code: "custom", path: ["resources"], message: "duplicate dependency path" });
  }
  if (value.resources.some(({ uri }) => uri === value.rootUri)) {
    context.addIssue({ code: "custom", path: ["resources"], message: "root URI cannot be repeated as a dependency" });
  }
});

export type ApiDependencyManifest = z.infer<typeof ApiDependencyManifestSchema>;

export type ApiSourceClosureReference = {
  occurrenceId: string;
  originUri: string;
  originLocator: string;
  reference: string;
  role: "request" | "response" | "security";
  targetUri: string | null;
  targetPointer: string | null;
  resolution:
    | "resolved"
    | "recursive-resolved"
    | "resource-missing"
    | "pointer-missing"
    | "invalid-reference"
    | "unsupported-scheme"
    | "unsupported-fragment"
    | "sibling-semantics-unsupported"
    | "reference-cycle"
    | "resource-limit";
  acquisitionStatus: "embedded" | "pinned-local" | "not-in-manifest" | "not-attempted";
  sourceStatus: "resolved" | "unresolved";
  witnessStatus: "not-assessed-by-source-closure" | "unresolved-recursion-budget" | "blocked-by-source" | "not-required-for-task";
  severity: "none" | "advisory" | "blocking";
  dependentRequirementIds: string[];
  affectedOperations: string[];
};

type ParsedResource = {
  uri: string;
  path: string | null;
  format: "json" | "yaml";
  sha256: string;
  bytes: number;
  document: unknown;
};

function parseSource(text: string, format: "json" | "yaml", label: string): unknown {
  const parsed = parseDocument(text, { schema: "core", uniqueKeys: true });
  if (parsed.errors.length) throw new Error(`${label} syntax: ${parsed.errors.map(({ message }) => message).join("; ")}`);
  return format === "json" ? JSON.parse(text) : parsed.toJS({ maxAliasCount: 100 });
}

function decodePointerToken(value: string): string | null {
  if (/~(?:[^01]|$)/u.test(value)) return null;
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}

function resolvePointer(document: unknown, pointer: string): { found: boolean; value?: unknown } {
  if (pointer === "#" || pointer === "") return { found: true, value: document };
  if (!pointer.startsWith("#/")) return { found: false };
  let value = document;
  for (const raw of pointer.slice(2).split("/")) {
    const token = decodePointerToken(raw);
    if (token === null || !record(value) && !Array.isArray(value)) return { found: false };
    if (Array.isArray(value)) {
      if (!/^\d+$/u.test(token) || Number(token) >= value.length) return { found: false };
      value = value[Number(token)];
    } else {
      if (!Object.prototype.hasOwnProperty.call(value, token)) return { found: false };
      value = value[token];
    }
  }
  return { found: true, value };
}

function parseReference(reference: unknown, originUri: string): {
  ok: true; targetUri: string; targetPointer: string;
} | { ok: false; resolution: "invalid-reference" | "unsupported-scheme" | "unsupported-fragment"; targetUri: null; targetPointer: null } {
  if (typeof reference !== "string" || reference.length === 0) return { ok: false, resolution: "invalid-reference", targetUri: null, targetPointer: null };
  let parsed: URL;
  try { parsed = new URL(reference, originUri); } catch { return { ok: false, resolution: "invalid-reference", targetUri: null, targetPointer: null }; }
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    return { ok: false, resolution: "unsupported-scheme", targetUri: null, targetPointer: null };
  }
  const hash = parsed.hash;
  parsed.hash = "";
  let decoded = "";
  try { decoded = hash ? decodeURIComponent(hash.slice(1)) : ""; } catch { return { ok: false, resolution: "invalid-reference", targetUri: null, targetPointer: null }; }
  if (decoded && !decoded.startsWith("/")) return { ok: false, resolution: "unsupported-fragment", targetUri: null, targetPointer: null };
  return { ok: true, targetUri: parsed.href, targetPointer: decoded ? `#${decoded}` : "#" };
}

function dependencyRequirementIds(task: ApiTaskContract, role: ApiSourceClosureReference["role"]): string[] {
  return task.requirements
    .filter((requirement) => role === "response" ? requirement.kind === "response-conformance" : requirement.kind !== "response-conformance")
    .map(({ id }) => id)
    .sort();
}

function operationRaw(root: unknown, operation: ApiTesterSourceOperation): { pathItem: Record<string, unknown>; operation: Record<string, unknown> } | null {
  if (!record(root) || !record(root.paths) || !record(root.paths[operation.path])) return null;
  const pathItem = root.paths[operation.path] as Record<string, unknown>;
  const value = pathItem[operation.method.toLowerCase()];
  return record(value) ? { pathItem, operation: value } : null;
}

export function analyzeApiTaskSourceClosure(input: {
  task: unknown;
  sourceText: string;
  rootUri: string;
  dependencyManifest?: unknown;
  dependencyPayloads?: Record<string, string | Uint8Array>;
}) {
  const task = parseApiTaskContract(input.task);
  const rootUri = documentUri(input.rootUri);
  const manifest = input.dependencyManifest === undefined ? null : ApiDependencyManifestSchema.parse(input.dependencyManifest);
  if (manifest && manifest.rootUri !== rootUri) throw new Error("dependency manifest root URI mismatch");
  if (task.dependencyManifest !== null && !manifest) throw new Error("task requires a dependency manifest");
  const payloads = input.dependencyPayloads ?? {};
  const resources = new Map<string, ParsedResource>();
  let totalBytes = 0;
  if (manifest) {
    for (const row of manifest.resources) {
      const payload = payloads[row.path];
      if (payload === undefined) throw new Error(`dependency payload missing: ${row.path}`);
      const bytes = typeof payload === "string" ? Buffer.from(payload) : Buffer.from(payload);
      if (bytes.byteLength > MAX_RESOURCE_BYTES) throw new Error(`dependency resource limit: ${row.path}`);
      totalBytes += bytes.byteLength;
      if (totalBytes > MAX_TOTAL_RESOURCE_BYTES) throw new Error("dependency total byte limit");
      if (digest(bytes) !== row.sha256) throw new Error(`dependency digest mismatch: ${row.path}`);
      const text = bytes.toString("utf8");
      resources.set(row.uri, { uri: row.uri, path: row.path, format: row.format, sha256: row.sha256,
        bytes: bytes.byteLength, document: parseSource(text, row.format, row.path) });
    }
  }
  const rootDocument = parseSource(input.sourceText, task.input.format, "root source");
  resources.set(rootUri, { uri: rootUri, path: null, format: task.input.format, sha256: digest(input.sourceText),
    bytes: Buffer.byteLength(input.sourceText), document: rootDocument });
  const parsed = parseApiTesterOperationSource(input.sourceText, task.input.format);
  const profileStatus = record(rootDocument) && /^3\.0(?:\.|$)/u.test(String(rootDocument.openapi))
    ? "supported" as const : "unsupported-dialect" as const;
  const requirementsOnProfileFailure = task.requirements.map(({ id, kind, required }) => ({
    requirementId: id, kind, required, status: "blocked-source" as const, affectedOperations: [] as string[], blockingReferenceOccurrences: [] as string[], witnessReferenceOccurrences: [] as string[],
  }));
  const emptySummary = { referenceOccurrences: 0, uniqueReferenceTargets: 0, externalResourcesDeclared: manifest?.resources.length ?? 0,
    externalResourcesLoaded: manifest?.resources.length ?? 0, blocking: 0, advisories: 0, recursiveWitnessUnresolved: 0 };
  if (profileStatus === "unsupported-dialect") return {
    schemaVersion: "skvm-api-task-source-closure/v1" as const,
    taskId: task.taskId,
    profileStatus,
    status: "blocked" as const,
    source: { uri: rootUri, sha256: digest(input.sourceText), format: task.input.format, enumerationComplete: parsed.enumeration.complete, enumerationIssues: parsed.enumeration.unresolved },
    manifest: manifest ? { rootUri: manifest.rootUri, resources: manifest.resources } : null,
    references: [] as ApiSourceClosureReference[],
    operationRequirements: [] as Array<{ operationKey: string; requirementId: string; kind: ApiTaskRequirement["kind"]; required: boolean; status: "blocked-source"; blockingReferenceOccurrences: string[]; witnessReferenceOccurrences: string[] }>,
    requirements: requirementsOnProfileFailure,
    issues: ["unsupported OpenAPI dialect for oas30-offline-test/v1"],
    summary: emptySummary,
    limits: { maxResources: MAX_RESOURCES, maxResourceBytes: MAX_RESOURCE_BYTES, maxTotalResourceBytes: MAX_TOTAL_RESOURCE_BYTES,
      maxTraversalNodes: MAX_TRAVERSAL_NODES, maxReferenceOccurrences: MAX_REFERENCE_OCCURRENCES, maxDepth: MAX_DEPTH },
  };
  if (!parsed.document || !parsed.enumeration.complete) return {
    schemaVersion: "skvm-api-task-source-closure/v1" as const,
    taskId: task.taskId,
    profileStatus,
    status: "blocked" as const,
    source: { uri: rootUri, sha256: digest(input.sourceText), format: task.input.format, enumerationComplete: parsed.enumeration.complete, enumerationIssues: parsed.enumeration.unresolved },
    manifest: manifest ? { rootUri: manifest.rootUri, resources: manifest.resources } : null,
    references: [] as ApiSourceClosureReference[],
    operationRequirements: [] as Array<{ operationKey: string; requirementId: string; kind: ApiTaskRequirement["kind"]; required: boolean; status: "blocked-source"; blockingReferenceOccurrences: string[]; witnessReferenceOccurrences: string[] }>,
    requirements: requirementsOnProfileFailure,
    issues: ["source operation enumeration incomplete"],
    summary: emptySummary,
    limits: { maxResources: MAX_RESOURCES, maxResourceBytes: MAX_RESOURCE_BYTES, maxTotalResourceBytes: MAX_TOTAL_RESOURCE_BYTES,
      maxTraversalNodes: MAX_TRAVERSAL_NODES, maxReferenceOccurrences: MAX_REFERENCE_OCCURRENCES, maxDepth: MAX_DEPTH },
  };
  const operationByKey = new Map(parsed.enumeration.operations.map((operation) => [operation.key, operation]));
  const selectedKeys = (task.operationKeys === "all" ? parsed.enumeration.operations.map(({ key }) => key) : task.operationKeys).slice().sort();
  const unknownKeys = selectedKeys.filter((key) => !operationByKey.has(key as any));
  if (unknownKeys.length) throw new Error(`task operation is not in source: ${unknownKeys.join(", ")}`);

  const references: ApiSourceClosureReference[] = [];
  const issues: string[] = [];
  let traversalNodes = 0;
  const addLimit = (context: { uri: string; locator: string; role: ApiSourceClosureReference["role"]; operationKey: string }) => {
    const dependentRequirementIds = dependencyRequirementIds(task, context.role);
    references.push({
      occurrenceId: `${context.operationKey}:${context.uri}:${context.locator}:resource-limit`, originUri: context.uri,
      originLocator: context.locator, reference: "<resource-limit>", role: context.role, targetUri: null, targetPointer: null,
      resolution: "resource-limit", acquisitionStatus: "not-attempted", sourceStatus: "unresolved", witnessStatus: "blocked-by-source",
      severity: dependentRequirementIds.length ? "blocking" : "advisory", dependentRequirementIds, affectedOperations: [context.operationKey],
    });
  };

  const walk = (
    value: unknown,
    context: { uri: string; locator: string; role: ApiSourceClosureReference["role"]; operationKey: string },
    stack: string[],
    structuralSeen: boolean,
    depth: number,
  ): void => {
    traversalNodes++;
    if (traversalNodes > MAX_TRAVERSAL_NODES || references.length >= MAX_REFERENCE_OCCURRENCES || depth > MAX_DEPTH) {
      if (!issues.includes("source closure traversal limit reached")) {
        issues.push("source closure traversal limit reached");
        addLimit(context);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, { ...context, locator: `${context.locator}/${index}` }, stack, structuralSeen, depth + 1));
      return;
    }
    if (!record(value)) return;
    if (Object.prototype.hasOwnProperty.call(value, "$ref")) {
      const dependentRequirementIds = dependencyRequirementIds(task, context.role);
      const siblings = Object.keys(value).filter((key) => key !== "$ref");
      const parsedReference = parseReference(value.$ref, context.uri);
      const base = {
        occurrenceId: `${context.operationKey}:${context.uri}:${context.locator}/$ref:${references.length}`,
        originUri: context.uri,
        originLocator: `${context.locator}/$ref`,
        reference: typeof value.$ref === "string" ? value.$ref : String(value.$ref),
        role: context.role,
        dependentRequirementIds,
        affectedOperations: [context.operationKey],
      };
      if (siblings.length) {
        references.push({ ...base, targetUri: parsedReference.ok ? parsedReference.targetUri : null,
          targetPointer: parsedReference.ok ? parsedReference.targetPointer : null,
          resolution: "sibling-semantics-unsupported", acquisitionStatus: "not-attempted", sourceStatus: "unresolved",
          witnessStatus: dependentRequirementIds.length ? "blocked-by-source" : "not-required-for-task",
          severity: dependentRequirementIds.length ? "blocking" : "advisory" });
        return;
      }
      if (!parsedReference.ok) {
        references.push({ ...base, targetUri: null, targetPointer: null, resolution: parsedReference.resolution,
          acquisitionStatus: "not-attempted", sourceStatus: "unresolved",
          witnessStatus: dependentRequirementIds.length ? "blocked-by-source" : "not-required-for-task",
          severity: dependentRequirementIds.length ? "blocking" : "advisory" });
        return;
      }
      const targetResource = resources.get(parsedReference.targetUri);
      const acquisitionStatus = parsedReference.targetUri === context.uri ? "embedded" as const
        : targetResource ? "pinned-local" as const : "not-in-manifest" as const;
      if (!targetResource) {
        references.push({ ...base, targetUri: parsedReference.targetUri, targetPointer: parsedReference.targetPointer,
          resolution: "resource-missing", acquisitionStatus, sourceStatus: "unresolved",
          witnessStatus: dependentRequirementIds.length ? "blocked-by-source" : "not-required-for-task",
          severity: dependentRequirementIds.length ? "blocking" : "advisory" });
        return;
      }
      const pointed = resolvePointer(targetResource.document, parsedReference.targetPointer);
      if (!pointed.found) {
        references.push({ ...base, targetUri: parsedReference.targetUri, targetPointer: parsedReference.targetPointer,
          resolution: "pointer-missing", acquisitionStatus, sourceStatus: "unresolved",
          witnessStatus: dependentRequirementIds.length ? "blocked-by-source" : "not-required-for-task",
          severity: dependentRequirementIds.length ? "blocking" : "advisory" });
        return;
      }
      const canonicalTarget = `${parsedReference.targetUri}${parsedReference.targetPointer}`;
      if (stack.includes(canonicalTarget)) {
        const recursive = structuralSeen;
        references.push({ ...base, targetUri: parsedReference.targetUri, targetPointer: parsedReference.targetPointer,
          resolution: recursive ? "recursive-resolved" : "reference-cycle", acquisitionStatus,
          sourceStatus: recursive ? "resolved" : "unresolved",
          witnessStatus: recursive ? "unresolved-recursion-budget" : dependentRequirementIds.length ? "blocked-by-source" : "not-required-for-task",
          severity: dependentRequirementIds.length ? "blocking" : "advisory" });
        return;
      }
      references.push({ ...base, targetUri: parsedReference.targetUri, targetPointer: parsedReference.targetPointer,
        resolution: "resolved", acquisitionStatus, sourceStatus: "resolved",
        witnessStatus: "not-assessed-by-source-closure", severity: "none" });
      const structuralTarget = Array.isArray(pointed.value)
        || record(pointed.value) && Object.keys(pointed.value).some((key) => key !== "$ref");
      walk(pointed.value, { ...context, uri: parsedReference.targetUri, locator: parsedReference.targetPointer },
        [...stack, canonicalTarget], structuralSeen || structuralTarget, depth + 1);
      return;
    }
    for (const [key, entry] of Object.entries(value)) {
      const token = key.replaceAll("~", "~0").replaceAll("/", "~1");
      walk(entry, { ...context, locator: `${context.locator}/${token}` }, stack, structuralSeen, depth + 1);
    }
  };

  for (const key of selectedKeys) {
    const operation = operationByKey.get(key as any)!;
    const raw = operationRaw(rootDocument, operation);
    if (!raw) throw new Error(`operation source disappeared: ${key}`);
    const pathLocator = operation.locator.slice(0, operation.locator.lastIndexOf("/"));
    const roots: Array<{ value: unknown; locator: string; role: ApiSourceClosureReference["role"] }> = [
      { value: raw.pathItem.parameters, locator: `${pathLocator}/parameters`, role: "request" },
      { value: raw.operation.parameters, locator: `${operation.locator}/parameters`, role: "request" },
      { value: raw.operation.requestBody, locator: `${operation.locator}/requestBody`, role: "request" },
      { value: raw.operation.responses, locator: `${operation.locator}/responses`, role: "response" },
      { value: raw.operation.security ?? (record(rootDocument) ? rootDocument.security : undefined), locator: `${operation.locator}/security`, role: "security" },
    ];
    for (const root of roots) if (root.value !== undefined) walk(root.value, { uri: rootUri, locator: root.locator, role: root.role, operationKey: key }, [], false, 0);
  }

  const operationRequirementRows = selectedKeys.flatMap((operationKey) => task.requirements.map((requirement: ApiTaskRequirement) => {
    const relevant = references.filter((row) => row.dependentRequirementIds.includes(requirement.id)
      && row.affectedOperations.includes(operationKey));
    const sourceBlocked = relevant.filter((row) => row.sourceStatus === "unresolved" && row.severity === "blocking");
    const witness = relevant.filter((row) => row.witnessStatus === "unresolved-recursion-budget");
    return {
      operationKey,
      requirementId: requirement.id,
      kind: requirement.kind,
      required: requirement.required,
      status: sourceBlocked.length ? "blocked-source" as const : witness.length ? "unresolved-witness" as const : "source-ready" as const,
      blockingReferenceOccurrences: sourceBlocked.map(({ occurrenceId }) => occurrenceId),
      witnessReferenceOccurrences: witness.map(({ occurrenceId }) => occurrenceId),
    };
  }));
  const requirementRows = task.requirements.map((requirement: ApiTaskRequirement) => {
    const relevant = references.filter((row) => row.dependentRequirementIds.includes(requirement.id));
    const sourceBlocked = relevant.filter((row) => row.sourceStatus === "unresolved" && row.severity === "blocking");
    const witness = relevant.filter((row) => row.witnessStatus === "unresolved-recursion-budget");
    return {
      requirementId: requirement.id,
      kind: requirement.kind,
      required: requirement.required,
      status: sourceBlocked.length ? "blocked-source" as const : witness.length ? "unresolved-witness" as const : "source-ready" as const,
      affectedOperations: [...new Set(relevant.flatMap((row) => row.affectedOperations))].sort(),
      blockingReferenceOccurrences: sourceBlocked.map(({ occurrenceId }) => occurrenceId),
      witnessReferenceOccurrences: witness.map(({ occurrenceId }) => occurrenceId),
    };
  });
  const sourceBlocking = references.filter((row) => row.sourceStatus === "unresolved" && row.severity === "blocking");
  const recursiveWitness = references.filter((row) => row.witnessStatus === "unresolved-recursion-budget" && row.dependentRequirementIds.length);
  const advisories = references.filter((row) => row.severity === "advisory" && row.sourceStatus === "unresolved");
  const status = sourceBlocking.length ? "blocked" as const : recursiveWitness.length ? "partial" as const
    : advisories.length ? "passed-with-advisory" as const : "passed" as const;
  return {
    schemaVersion: "skvm-api-task-source-closure/v1" as const,
    taskId: task.taskId,
    profileStatus,
    status,
    source: { uri: rootUri, sha256: digest(input.sourceText), format: task.input.format, enumerationComplete: parsed.enumeration.complete, enumerationIssues: parsed.enumeration.unresolved },
    manifest: manifest ? { rootUri: manifest.rootUri, resources: manifest.resources.map((row) => ({ ...row,
      bytes: resources.get(row.uri)!.bytes, verification: "digest-verified" as const })) } : null,
    references,
    operationRequirements: operationRequirementRows,
    requirements: requirementRows,
    issues,
    summary: {
      referenceOccurrences: references.length,
      uniqueReferenceTargets: new Set(references.filter(({ targetUri }) => targetUri !== null)
        .map(({ targetUri, targetPointer }) => `${targetUri}${targetPointer}`)).size,
      externalResourcesDeclared: manifest?.resources.length ?? 0,
      externalResourcesLoaded: manifest?.resources.length ?? 0,
      blocking: references.filter(({ severity }) => severity === "blocking").length,
      advisories: references.filter(({ severity }) => severity === "advisory").length,
      recursiveWitnessUnresolved: recursiveWitness.length,
    },
    limits: { maxResources: MAX_RESOURCES, maxResourceBytes: MAX_RESOURCE_BYTES, maxTotalResourceBytes: MAX_TOTAL_RESOURCE_BYTES,
      maxTraversalNodes: MAX_TRAVERSAL_NODES, maxReferenceOccurrences: MAX_REFERENCE_OCCURRENCES, maxDepth: MAX_DEPTH },
  };
}
