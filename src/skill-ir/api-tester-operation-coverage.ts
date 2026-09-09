import { parseDocument } from "yaml";

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;
type HttpMethod = typeof HTTP_METHODS[number];
type OperationKey = `${Uppercase<HttpMethod>} ${string}`;
type JsonRecord = Record<string, unknown>;

export type ApiTesterIndependentOperation = {
  key: OperationKey;
  locator: string;
  operationId: string | null;
  summary: string | null;
};

export type ApiTesterIndependentUniverse = {
  complete: boolean;
  operations: ApiTesterIndependentOperation[];
  unresolved: Array<{ code: string; locator: string; message: string }>;
};

export type ApiTesterOperationCoverageError =
  | "SOURCE_ENUMERATION_INCOMPLETE"
  | "ANALYZER_OPERATION_OMITTED"
  | "ANALYZER_OPERATION_EXTRA"
  | "ANALYZER_OPERATION_DUPLICATE"
  | "ANALYZER_SOURCE_METADATA_DRIFT"
  | "ACCEPTED_OPERATION_NOT_PROJECTED"
  | "REJECTED_OPERATION_PROJECTED"
  | "ACCEPTED_OPERATION_NOT_IN_CONTRACT"
  | "REJECTED_OPERATION_IN_CONTRACT"
  | "ACCEPTED_OPERATION_NOT_IN_ARTIFACT"
  | "REJECTED_OPERATION_IN_ARTIFACT";

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pointerToken(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseIndependentSource(sourceText: string, format: "json" | "yaml"): {
  document: JsonRecord | null;
  error: { code: string; locator: string; message: string } | null;
} {
  try {
    const syntax = parseDocument(sourceText, { schema: "core", uniqueKeys: true });
    if (syntax.errors.length > 0) {
      const message = syntax.errors.map((error) => error.message).join("; ");
      return {
        document: null,
        error: {
          code: /unique|duplicate/iu.test(message) ? "DUPLICATE_SOURCE_KEY" : "INVALID_SOURCE_SYNTAX",
          locator: "#",
          message,
        },
      };
    }
    const value = format === "json" ? JSON.parse(sourceText) : syntax.toJS({ maxAliasCount: 100 });
    if (!isRecord(value)) throw new Error("source root is not an object");
    return { document: value, error: null };
  } catch (error) {
    return {
      document: null,
      error: {
        code: "INVALID_SOURCE_SYNTAX",
        locator: "#",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export function independentlyEnumerateApiTesterOperations(
  sourceText: string,
  format: "json" | "yaml",
): ApiTesterIndependentUniverse {
  const parsed = parseIndependentSource(sourceText, format);
  if (!parsed.document) {
    return { complete: false, operations: [], unresolved: [parsed.error!] };
  }
  const document = parsed.document;
  if (typeof document.openapi !== "string" || !document.openapi.startsWith("3.") || !isRecord(document.paths)) {
    return {
      complete: false,
      operations: [],
      unresolved: [{ code: "INVALID_OPENAPI_ROOT", locator: "#", message: "expected OpenAPI 3.x paths object" }],
    };
  }
  const operations: ApiTesterIndependentOperation[] = [];
  const unresolved: ApiTesterIndependentUniverse["unresolved"] = [];
  for (const path of Object.keys(document.paths).sort(compareText)) {
    const locator = `#/paths/${pointerToken(path)}`;
    const pathItem = document.paths[path];
    if (!path.startsWith("/") || !isRecord(pathItem)) {
      unresolved.push({ code: "INVALID_PATH_ITEM", locator, message: `invalid path item ${path}` });
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(pathItem, "$ref")) {
      unresolved.push({
        code: "UNRESOLVED_PATH_ITEM_REFERENCE",
        locator: `${locator}/$ref`,
        message: "path-item reference may hide operations",
      });
    }
    for (const method of HTTP_METHODS) {
      if (pathItem[method] === undefined) continue;
      const operationLocator = `${locator}/${method}`;
      if (!isRecord(pathItem[method])) {
        unresolved.push({
          code: "INVALID_OPERATION",
          locator: operationLocator,
          message: `${method.toUpperCase()} ${path} is not an object`,
        });
        continue;
      }
      const operation = pathItem[method] as JsonRecord;
      operations.push({
        key: `${method.toUpperCase()} ${path}` as OperationKey,
        locator: operationLocator,
        operationId: text(operation.operationId),
        summary: text(operation.summary),
      });
    }
  }
  operations.sort((left, right) => compareText(left.key, right.key));
  return { complete: unresolved.length === 0, operations, unresolved };
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicate.add(value);
    seen.add(value);
  }
  return [...duplicate].sort(compareText);
}

function exactSet(left: string[], right: string[]): boolean {
  return left.length === right.length
    && [...left].sort(compareText).every((value, index) => value === [...right].sort(compareText)[index]);
}

export function verifyApiTesterOperationCoverage(input: {
  sourceText: string;
  format: "json" | "yaml";
  analyzedOperations: Array<{
    key: string;
    locator: string;
    operationId: string | null;
    summary: string | null;
    status: "accepted" | "rejected" | "unresolved";
  }>;
  projectedOperationKeys: string[];
  contractOperationKeys: string[];
  artifactOperationKeys: string[];
}): {
  status: "pass" | "fail";
  sourceOperationCount: number;
  acceptedOperationCount: number;
  checks: {
    sourceEnumerationComplete: boolean;
    analyzerExactCoverage: boolean;
    sourceMetadataMatch: boolean;
    projectionExactAcceptedCoverage: boolean;
    contractExactAcceptedCoverage: boolean;
    artifactExactAcceptedCoverage: boolean;
  };
  errors: ApiTesterOperationCoverageError[];
  unresolved: ApiTesterIndependentUniverse["unresolved"];
} {
  const universe = independentlyEnumerateApiTesterOperations(input.sourceText, input.format);
  const expectedKeys: string[] = universe.operations.map((operation) => operation.key);
  const actualKeys = input.analyzedOperations.map((operation) => operation.key);
  const acceptedKeys = input.analyzedOperations
    .filter((operation) => operation.status === "accepted")
    .map((operation) => operation.key);
  const rejectedKeys = input.analyzedOperations
    .filter((operation) => operation.status !== "accepted")
    .map((operation) => operation.key);
  const errors = new Set<ApiTesterOperationCoverageError>();
  if (!universe.complete) errors.add("SOURCE_ENUMERATION_INCOMPLETE");
  if (duplicateValues(actualKeys).length > 0) errors.add("ANALYZER_OPERATION_DUPLICATE");
  if (expectedKeys.some((key) => !actualKeys.includes(key))) errors.add("ANALYZER_OPERATION_OMITTED");
  if (actualKeys.some((key) => !expectedKeys.includes(key))) errors.add("ANALYZER_OPERATION_EXTRA");
  const sourceMetadataMatch = universe.operations.every((expected) => {
    const actual = input.analyzedOperations.find((operation) => operation.key === expected.key);
    return actual?.locator === expected.locator
      && actual.operationId === expected.operationId
      && actual.summary === expected.summary;
  });
  if (!sourceMetadataMatch) errors.add("ANALYZER_SOURCE_METADATA_DRIFT");
  const compareAcceptedLayer = (
    values: string[],
    missing: ApiTesterOperationCoverageError,
    extra: ApiTesterOperationCoverageError,
  ) => {
    if (acceptedKeys.some((key) => !values.includes(key))) errors.add(missing);
    if (rejectedKeys.some((key) => values.includes(key)) || values.some((key) => !acceptedKeys.includes(key))) errors.add(extra);
  };
  compareAcceptedLayer(input.projectedOperationKeys, "ACCEPTED_OPERATION_NOT_PROJECTED", "REJECTED_OPERATION_PROJECTED");
  compareAcceptedLayer(input.contractOperationKeys, "ACCEPTED_OPERATION_NOT_IN_CONTRACT", "REJECTED_OPERATION_IN_CONTRACT");
  compareAcceptedLayer(input.artifactOperationKeys, "ACCEPTED_OPERATION_NOT_IN_ARTIFACT", "REJECTED_OPERATION_IN_ARTIFACT");
  const checks = {
    sourceEnumerationComplete: universe.complete,
    analyzerExactCoverage: exactSet(expectedKeys, actualKeys) && duplicateValues(actualKeys).length === 0,
    sourceMetadataMatch,
    projectionExactAcceptedCoverage: exactSet(acceptedKeys, input.projectedOperationKeys),
    contractExactAcceptedCoverage: exactSet(acceptedKeys, input.contractOperationKeys),
    artifactExactAcceptedCoverage: exactSet(acceptedKeys, input.artifactOperationKeys),
  };
  return {
    status: errors.size === 0 ? "pass" : "fail",
    sourceOperationCount: expectedKeys.length,
    acceptedOperationCount: acceptedKeys.length,
    checks,
    errors: [...errors].sort(compareText),
    unresolved: universe.unresolved,
  };
}

function decodeToken(value: string): string | undefined {
  if (/~(?:[^01]|$)/u.test(value)) return undefined;
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}

function resolveRef(document: JsonRecord, ref: string, stack: string[] = []): unknown {
  if (!ref.startsWith("#/") || stack.includes(ref)) return undefined;
  const tokens = ref.slice(2).split("/").map(decodeToken);
  if (tokens.some((token) => token === undefined)) return undefined;
  let value: unknown = document;
  for (const token of tokens as string[]) {
    if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, token)) return undefined;
    value = value[token];
  }
  if (isRecord(value) && typeof value.$ref === "string" && Object.keys(value).length === 1) {
    return resolveRef(document, value.$ref, [...stack, ref]);
  }
  return value;
}

function resolvedValue(document: JsonRecord, value: unknown): unknown {
  if (isRecord(value) && typeof value.$ref === "string" && Object.keys(value).length === 1) {
    return resolveRef(document, value.$ref);
  }
  return value;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort(compareText).map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function operationAt(document: JsonRecord, operationKey: string): {
  pathItem: JsonRecord;
  operation: JsonRecord;
} | null {
  const split = operationKey.indexOf(" ");
  const method = operationKey.slice(0, split).toLowerCase();
  const path = operationKey.slice(split + 1);
  if (!isRecord(document.paths) || !isRecord(document.paths[path])) return null;
  const pathItem = document.paths[path] as JsonRecord;
  return isRecord(pathItem[method]) ? { pathItem, operation: pathItem[method] as JsonRecord } : null;
}

function effectiveParameterMap(document: JsonRecord, pathItem: JsonRecord, operation: JsonRecord): Map<string, string> | null {
  const map = new Map<string, string>();
  for (const list of [pathItem.parameters, operation.parameters]) {
    if (list === undefined) continue;
    if (!Array.isArray(list)) return null;
    const scope = new Set<string>();
    for (const raw of list) {
      const value = resolvedValue(document, raw);
      if (!isRecord(value) || typeof value.name !== "string" || typeof value.in !== "string") return null;
      const key = `${value.in}:${value.name}`;
      if (scope.has(key)) return null;
      scope.add(key);
      map.set(key, canonical(value));
    }
  }
  return map;
}

type DependencyRole = "parameter" | "request" | "response" | "security";

export type ApiTesterProjectionDependencyIssue = {
  code:
    | "REFERENCE_EXTERNAL"
    | "REFERENCE_INVALID_POINTER"
    | "REFERENCE_MISSING"
    | "REFERENCE_NON_STRING"
    | "SECURITY_REQUIREMENT_INVALID"
    | "SECURITY_SCHEME_MISSING";
  role: DependencyRole;
  locator: string;
  reference: string | null;
  constructionObligation: boolean;
};

type DependencyRoot = {
  role: DependencyRole;
  locator: string;
  value: unknown;
  constructionObligation: boolean;
};

type DependencyGraph = {
  nodes: Array<{
    role: DependencyRole;
    reference: string;
    target: string;
    constructionObligation: boolean;
  }>;
  issues: ApiTesterProjectionDependencyIssue[];
};

function localReferenceTarget(document: JsonRecord, reference: string): {
  status: "resolved" | "external" | "invalid" | "missing";
  value?: unknown;
} {
  if (!reference.startsWith("#/")) return { status: "external" };
  const tokens = reference.slice(2).split("/").map(decodeToken);
  if (tokens.some((token) => token === undefined)) return { status: "invalid" };
  let value: unknown = document;
  for (const token of tokens as string[]) {
    if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, token)) return { status: "missing" };
    value = value[token];
  }
  return { status: "resolved", value };
}

function dependencyGraph(document: JsonRecord, roots: DependencyRoot[]): DependencyGraph {
  const nodes = new Map<string, DependencyGraph["nodes"][number]>();
  const issues: ApiTesterProjectionDependencyIssue[] = [];
  const visited = new Set<string>();
  const walk = (value: unknown, root: DependencyRoot, locator: string): void => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, root, `${locator}/${index}`));
      return;
    }
    if (!isRecord(value)) return;
    if (Object.prototype.hasOwnProperty.call(value, "$ref")) {
      const referenceLocator = `${locator}/$ref`;
      if (typeof value.$ref !== "string") {
        issues.push({
          code: "REFERENCE_NON_STRING",
          role: root.role,
          locator: referenceLocator,
          reference: null,
          constructionObligation: root.constructionObligation,
        });
      } else {
        const target = localReferenceTarget(document, value.$ref);
        if (target.status === "resolved") {
          const nodeKey = `${root.role}\u0000${value.$ref}`;
          nodes.set(nodeKey, {
            role: root.role,
            reference: value.$ref,
            target: canonical(target.value),
            constructionObligation: root.constructionObligation,
          });
          if (!visited.has(nodeKey)) {
            visited.add(nodeKey);
            walk(target.value, root, value.$ref);
          }
        } else {
          const code = target.status === "external"
            ? "REFERENCE_EXTERNAL"
            : target.status === "invalid" ? "REFERENCE_INVALID_POINTER" : "REFERENCE_MISSING";
          issues.push({
            code,
            role: root.role,
            locator: referenceLocator,
            reference: value.$ref,
            constructionObligation: root.constructionObligation,
          });
        }
      }
    }
    for (const [key, entry] of Object.entries(value)) {
      if (key !== "$ref") walk(entry, root, `${locator}/${pointerToken(key)}`);
    }
  };
  roots.forEach((root) => walk(root.value, root, root.locator));
  return {
    nodes: [...nodes.values()].sort((left, right) =>
      compareText(left.role, right.role) || compareText(left.reference, right.reference)),
    issues: issues.sort((left, right) =>
      compareText(left.role, right.role) || compareText(left.locator, right.locator) || compareText(left.code, right.code)),
  };
}

function issueSignature(issue: ApiTesterProjectionDependencyIssue): string {
  return canonical({
    code: issue.code,
    role: issue.role,
    reference: issue.reference,
    constructionObligation: issue.constructionObligation,
  });
}

function roleGraphPreserved(source: DependencyGraph, projected: DependencyGraph, role: DependencyRole): boolean {
  const sourceNodes = source.nodes.filter((node) => node.role === role);
  const projectedNodes = projected.nodes.filter((node) => node.role === role);
  const sourceIssues = source.issues.filter((issue) => issue.role === role).map(issueSignature).sort(compareText);
  const projectedIssues = projected.issues.filter((issue) => issue.role === role).map(issueSignature).sort(compareText);
  return canonical(sourceNodes) === canonical(projectedNodes)
    && canonical(sourceIssues) === canonical(projectedIssues);
}

function effectiveSecurity(document: JsonRecord, operation: JsonRecord): unknown {
  return Object.prototype.hasOwnProperty.call(operation, "security") ? operation.security : document.security;
}

function securityDependencies(document: JsonRecord, security: unknown): {
  schemes: Record<string, string>;
  roots: DependencyRoot[];
  issues: ApiTesterProjectionDependencyIssue[];
} {
  const schemes: Record<string, string> = {};
  const roots: DependencyRoot[] = [];
  const issues: ApiTesterProjectionDependencyIssue[] = [];
  if (security === undefined) return { schemes, roots, issues };
  if (!Array.isArray(security) || security.some((requirement) => !isRecord(requirement))) {
    issues.push({
      code: "SECURITY_REQUIREMENT_INVALID",
      role: "security",
      locator: "#/security",
      reference: null,
      constructionObligation: true,
    });
    return { schemes, roots, issues };
  }
  const names = [...new Set(security.flatMap((requirement) => Object.keys(requirement as JsonRecord)))].sort(compareText);
  const securitySchemes = isRecord(document.components) && isRecord(document.components.securitySchemes)
    ? document.components.securitySchemes as JsonRecord : null;
  for (const name of names) {
    const locator = `#/components/securitySchemes/${pointerToken(name)}`;
    if (!securitySchemes || !Object.prototype.hasOwnProperty.call(securitySchemes, name)) {
      issues.push({
        code: "SECURITY_SCHEME_MISSING",
        role: "security",
        locator,
        reference: name,
        constructionObligation: true,
      });
      continue;
    }
    schemes[name] = canonical(securitySchemes[name]);
    roots.push({ role: "security", locator, value: securitySchemes[name], constructionObligation: true });
  }
  return { schemes, roots, issues };
}

export function verifyApiTesterProjectionDependencies(input: {
  sourceDocument: unknown;
  operationKey: string;
  projectedDocument: unknown;
}): {
  status: "pass" | "fail";
  checks: {
    operationPresent: boolean;
    parametersPreserved: boolean;
    referencesPreserved: boolean;
    securityPreserved: boolean;
    requestPreserved: boolean;
    responsesPreserved: boolean;
    projectionPreservation: boolean;
    constructionObligations: boolean;
    sourceValidity: boolean;
  };
  dimensions: {
    projectionPreservation: "pass" | "fail";
    constructionObligations: "pass" | "fail";
    sourceValidity: "pass" | "fail";
  };
  sourceIssues: ApiTesterProjectionDependencyIssue[];
  projectedIssues: ApiTesterProjectionDependencyIssue[];
  errors: Array<
    | "OPERATION_LOST"
    | "PARAMETER_DEPENDENCY_LOST"
    | "REFERENCE_DEPENDENCY_LOST"
    | "SECURITY_DEPENDENCY_LOST"
    | "REQUEST_DEPENDENCY_LOST"
    | "RESPONSE_DEPENDENCY_LOST"
    | "SOURCE_DEPENDENCY_INVALID"
  >;
} {
  if (!isRecord(input.sourceDocument) || !isRecord(input.projectedDocument)) {
    return {
      status: "fail",
      checks: {
        operationPresent: false,
        parametersPreserved: false,
        referencesPreserved: false,
        securityPreserved: false,
        requestPreserved: false,
        responsesPreserved: false,
        projectionPreservation: false,
        constructionObligations: false,
        sourceValidity: false,
      },
      dimensions: { projectionPreservation: "fail", constructionObligations: "fail", sourceValidity: "fail" },
      sourceIssues: [],
      projectedIssues: [],
      errors: ["OPERATION_LOST", "PARAMETER_DEPENDENCY_LOST", "REFERENCE_DEPENDENCY_LOST", "SECURITY_DEPENDENCY_LOST", "REQUEST_DEPENDENCY_LOST", "RESPONSE_DEPENDENCY_LOST", "SOURCE_DEPENDENCY_INVALID"],
    };
  }
  const source = operationAt(input.sourceDocument, input.operationKey);
  const projected = operationAt(input.projectedDocument, input.operationKey);
  const operationPresent = source !== null && projected !== null;
  const sourceParameters = source && effectiveParameterMap(input.sourceDocument, source.pathItem, source.operation);
  const projectedParameters = projected && effectiveParameterMap(input.projectedDocument, projected.pathItem, projected.operation);
  const parametersPreserved = operationPresent && sourceParameters !== null && projectedParameters !== null
    && canonical(Object.fromEntries(sourceParameters)) === canonical(Object.fromEntries(projectedParameters));
  const sourceSecurity = source ? effectiveSecurity(input.sourceDocument, source.operation) : undefined;
  const projectedSecurity = projected ? effectiveSecurity(input.projectedDocument, projected.operation) : undefined;
  const sourceSecurityDependencies = securityDependencies(input.sourceDocument, sourceSecurity);
  const projectedSecurityDependencies = securityDependencies(input.projectedDocument, projectedSecurity);
  const sourceRoots: DependencyRoot[] = source ? [
    { role: "parameter", locator: `${input.operationKey}/parameters`, value: [source.pathItem.parameters, source.operation.parameters], constructionObligation: true },
    { role: "request", locator: `${input.operationKey}/requestBody`, value: source.operation.requestBody, constructionObligation: true },
    { role: "response", locator: `${input.operationKey}/responses`, value: source.operation.responses, constructionObligation: false },
    ...sourceSecurityDependencies.roots,
  ] : [];
  const projectedRoots: DependencyRoot[] = projected ? [
    { role: "parameter", locator: `${input.operationKey}/parameters`, value: [projected.pathItem.parameters, projected.operation.parameters], constructionObligation: true },
    { role: "request", locator: `${input.operationKey}/requestBody`, value: projected.operation.requestBody, constructionObligation: true },
    { role: "response", locator: `${input.operationKey}/responses`, value: projected.operation.responses, constructionObligation: false },
    ...projectedSecurityDependencies.roots,
  ] : [];
  const sourceGraph = dependencyGraph(input.sourceDocument, sourceRoots);
  const projectedGraph = dependencyGraph(input.projectedDocument, projectedRoots);
  sourceGraph.issues.push(...sourceSecurityDependencies.issues);
  projectedGraph.issues.push(...projectedSecurityDependencies.issues);
  const parameterGraphPreserved = roleGraphPreserved(sourceGraph, projectedGraph, "parameter");
  const requestGraphPreserved = roleGraphPreserved(sourceGraph, projectedGraph, "request");
  const responseGraphPreserved = roleGraphPreserved(sourceGraph, projectedGraph, "response");
  const securityGraphPreserved = roleGraphPreserved(sourceGraph, projectedGraph, "security");
  const parametersWithGraphPreserved = parametersPreserved && parameterGraphPreserved;
  const securityPreserved = operationPresent
    && canonical(sourceSecurity) === canonical(projectedSecurity)
    && canonical(sourceSecurityDependencies.schemes) === canonical(projectedSecurityDependencies.schemes)
    && securityGraphPreserved;
  const requestPreserved = operationPresent
    && canonical(source?.operation.requestBody) === canonical(projected?.operation.requestBody)
    && requestGraphPreserved;
  const responsesPreserved = operationPresent
    && canonical(source?.operation.responses) === canonical(projected?.operation.responses)
    && responseGraphPreserved;
  const referencesPreserved = parameterGraphPreserved && requestGraphPreserved
    && responseGraphPreserved && securityGraphPreserved;
  const sourceIssues = sourceGraph.issues.sort((left, right) => compareText(left.locator, right.locator));
  const projectedIssues = projectedGraph.issues.sort((left, right) => compareText(left.locator, right.locator));
  const sourceValidity = sourceIssues.length === 0;
  const constructionObligations = operationPresent && parametersWithGraphPreserved && requestPreserved && securityPreserved
    && ![...sourceIssues, ...projectedIssues].some((issue) => issue.constructionObligation);
  const projectionPreservation = operationPresent && parametersWithGraphPreserved && referencesPreserved
    && securityPreserved && requestPreserved && responsesPreserved;
  const checks = {
    operationPresent,
    parametersPreserved: parametersWithGraphPreserved,
    referencesPreserved,
    securityPreserved,
    requestPreserved,
    responsesPreserved,
    projectionPreservation,
    constructionObligations,
    sourceValidity,
  };
  const errors: Array<
    | "OPERATION_LOST"
    | "PARAMETER_DEPENDENCY_LOST"
    | "REFERENCE_DEPENDENCY_LOST"
    | "SECURITY_DEPENDENCY_LOST"
    | "REQUEST_DEPENDENCY_LOST"
    | "RESPONSE_DEPENDENCY_LOST"
    | "SOURCE_DEPENDENCY_INVALID"
  > = [];
  if (!operationPresent) errors.push("OPERATION_LOST");
  if (!parametersWithGraphPreserved) errors.push("PARAMETER_DEPENDENCY_LOST");
  if (!referencesPreserved) errors.push("REFERENCE_DEPENDENCY_LOST");
  if (!securityPreserved) errors.push("SECURITY_DEPENDENCY_LOST");
  if (!requestPreserved) errors.push("REQUEST_DEPENDENCY_LOST");
  if (!responsesPreserved) errors.push("RESPONSE_DEPENDENCY_LOST");
  if (sourceIssues.some((issue) => issue.constructionObligation)) errors.push("SOURCE_DEPENDENCY_INVALID");
  return {
    status: projectionPreservation && constructionObligations ? "pass" : "fail",
    checks,
    dimensions: {
      projectionPreservation: projectionPreservation ? "pass" : "fail",
      constructionObligations: constructionObligations ? "pass" : "fail",
      sourceValidity: sourceValidity ? "pass" : "fail",
    },
    sourceIssues,
    projectedIssues,
    errors,
  };
}
