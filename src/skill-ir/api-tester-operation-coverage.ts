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

function collectRefTargets(value: unknown, result = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) collectRefTargets(entry, result);
  } else if (isRecord(value)) {
    if (typeof value.$ref === "string") result.add(value.$ref);
    for (const [key, entry] of Object.entries(value)) if (key !== "$ref") collectRefTargets(entry, result);
  }
  return result;
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
  };
  errors: Array<
    | "OPERATION_LOST"
    | "PARAMETER_DEPENDENCY_LOST"
    | "REFERENCE_DEPENDENCY_LOST"
    | "SECURITY_DEPENDENCY_LOST"
    | "REQUEST_DEPENDENCY_LOST"
    | "RESPONSE_DEPENDENCY_LOST"
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
      },
      errors: ["OPERATION_LOST", "PARAMETER_DEPENDENCY_LOST", "REFERENCE_DEPENDENCY_LOST", "SECURITY_DEPENDENCY_LOST", "REQUEST_DEPENDENCY_LOST", "RESPONSE_DEPENDENCY_LOST"],
    };
  }
  const source = operationAt(input.sourceDocument, input.operationKey);
  const projected = operationAt(input.projectedDocument, input.operationKey);
  const operationPresent = source !== null && projected !== null;
  const sourceParameters = source && effectiveParameterMap(input.sourceDocument, source.pathItem, source.operation);
  const projectedParameters = projected && effectiveParameterMap(input.projectedDocument, projected.pathItem, projected.operation);
  const parametersPreserved = operationPresent && sourceParameters !== null && projectedParameters !== null
    && canonical(Object.fromEntries(sourceParameters)) === canonical(Object.fromEntries(projectedParameters));
  const sourceSecurity = source
    ? (Object.prototype.hasOwnProperty.call(source.operation, "security") ? source.operation.security : input.sourceDocument.security)
    : undefined;
  const projectedSecurity = projected
    ? (Object.prototype.hasOwnProperty.call(projected.operation, "security") ? projected.operation.security : input.projectedDocument.security)
    : undefined;
  const securityPreserved = operationPresent && canonical(sourceSecurity) === canonical(projectedSecurity);
  const requestPreserved = operationPresent
    && canonical(source?.operation.requestBody) === canonical(projected?.operation.requestBody);
  const responsesPreserved = operationPresent
    && canonical(source?.operation.responses) === canonical(projected?.operation.responses);
  const relevantRefs = source ? collectRefTargets([source.pathItem.parameters, source.operation.parameters, source.operation.requestBody]) : new Set<string>();
  if (sourceSecurity !== undefined) {
    const schemes = isRecord(input.sourceDocument.components) && isRecord(input.sourceDocument.components.securitySchemes)
      ? input.sourceDocument.components.securitySchemes as JsonRecord : {};
    const names = Array.isArray(sourceSecurity)
      ? sourceSecurity.flatMap((entry) => isRecord(entry) ? Object.keys(entry) : []) : [];
    for (const name of names) collectRefTargets(schemes[name], relevantRefs);
  }
  const referencesPreserved = [...relevantRefs].every((ref) => {
    const before = resolveRef(input.sourceDocument as JsonRecord, ref);
    const after = resolveRef(input.projectedDocument as JsonRecord, ref);
    return before !== undefined && after !== undefined && canonical(before) === canonical(after);
  });
  const checks = {
    operationPresent,
    parametersPreserved,
    referencesPreserved,
    securityPreserved,
    requestPreserved,
    responsesPreserved,
  };
  const errors: Array<
    | "OPERATION_LOST"
    | "PARAMETER_DEPENDENCY_LOST"
    | "REFERENCE_DEPENDENCY_LOST"
    | "SECURITY_DEPENDENCY_LOST"
    | "REQUEST_DEPENDENCY_LOST"
    | "RESPONSE_DEPENDENCY_LOST"
  > = [];
  if (!operationPresent) errors.push("OPERATION_LOST");
  if (!parametersPreserved) errors.push("PARAMETER_DEPENDENCY_LOST");
  if (!referencesPreserved) errors.push("REFERENCE_DEPENDENCY_LOST");
  if (!securityPreserved) errors.push("SECURITY_DEPENDENCY_LOST");
  if (!requestPreserved) errors.push("REQUEST_DEPENDENCY_LOST");
  if (!responsesPreserved) errors.push("RESPONSE_DEPENDENCY_LOST");
  return { status: errors.length === 0 ? "pass" : "fail", checks, errors };
}
