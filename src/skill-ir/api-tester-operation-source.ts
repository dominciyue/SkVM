import { parseDocument } from "yaml";

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;
type HttpMethod = typeof HTTP_METHODS[number];

type JsonRecord = Record<string, unknown>;

export type ApiTesterOperationKey = `${Uppercase<HttpMethod>} ${string}`;

export type ApiTesterOperationSourceIssue = {
  code:
    | "INVALID_SOURCE_SYNTAX"
    | "DUPLICATE_SOURCE_KEY"
    | "INVALID_OPENAPI_ROOT"
    | "INVALID_PATH_ITEM"
    | "INVALID_OPERATION"
    | "UNRESOLVED_PATH_ITEM_REFERENCE"
    | "UNRESOLVED_PARAMETER_IDENTITY";
  locator: string;
  message: string;
};

export type ApiTesterOperationReference = {
  locator: string;
  ref: string;
  role: "path-parameter" | "operation-parameter" | "request" | "response" | "security";
  resolution: "resolved" | "external" | "missing" | "invalid" | "cycle" | "sibling-semantics";
  targetLocator: string | null;
  constructionObligation: boolean;
};

export type ApiTesterOperationParameter = {
  locator: string;
  origin: "path" | "operation";
  name: string | null;
  location: string | null;
  required: boolean | null;
  reference: string | null;
  overridesLocator: string | null;
};

export type ApiTesterSourceOperation = {
  key: ApiTesterOperationKey;
  method: Uppercase<HttpMethod>;
  path: string;
  locator: string;
  operationId: string | null;
  summary: string | null;
  parameters: ApiTesterOperationParameter[];
  request: {
    present: boolean;
    required: boolean | null;
    mediaTypes: string[];
  };
  responses: {
    statuses: string[];
  };
  security: {
    source: "none" | "global" | "operation";
    schemeNames: string[];
  };
  references: ApiTesterOperationReference[];
};

export type ApiTesterOperationEnumeration = {
  complete: boolean;
  operations: ApiTesterSourceOperation[];
  unresolved: ApiTesterOperationSourceIssue[];
};

export type ParsedApiTesterOperationSource = {
  document: JsonRecord | null;
  enumeration: ApiTesterOperationEnumeration;
};

export type ApiTesterOperationProjection = {
  complete: boolean;
  operationKeys: ApiTesterOperationKey[];
  document: JsonRecord;
  unresolved: ApiTesterOperationSourceIssue[];
  dependencies: {
    parameterInheritancePreserved: boolean;
    securitySemanticsPreserved: boolean;
    referenceClosurePreserved: boolean;
    requestResponsePreserved: boolean;
  };
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pointerToken(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function sourceIssue(
  code: ApiTesterOperationSourceIssue["code"],
  locator: string,
  message: string,
): ApiTesterOperationSourceIssue {
  return { code, locator, message };
}

function decodePointerToken(value: string): string | undefined {
  if (/~(?:[^01]|$)/u.test(value)) return undefined;
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}

function resolveLocalReference(
  document: JsonRecord,
  ref: string,
  stack: string[] = [],
): { resolution: ApiTesterOperationReference["resolution"]; value: unknown; targetLocator: string | null } {
  if (!ref.startsWith("#/")) return { resolution: "external", value: undefined, targetLocator: null };
  if (stack.includes(ref)) return { resolution: "cycle", value: undefined, targetLocator: ref };
  const tokens = ref.slice(2).split("/").map(decodePointerToken);
  if (tokens.some((token) => token === undefined)) {
    return { resolution: "invalid", value: undefined, targetLocator: null };
  }
  let value: unknown = document;
  for (const token of tokens as string[]) {
    if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, token)) {
      return { resolution: "missing", value: undefined, targetLocator: ref };
    }
    value = value[token];
  }
  if (isRecord(value) && Object.prototype.hasOwnProperty.call(value, "$ref")) {
    if (Object.keys(value).length !== 1 || typeof value.$ref !== "string") {
      return { resolution: "sibling-semantics", value, targetLocator: ref };
    }
    return resolveLocalReference(document, value.$ref, [...stack, ref]);
  }
  return { resolution: "resolved", value, targetLocator: ref };
}

function collectReferences(
  document: JsonRecord,
  value: unknown,
  locator: string,
  role: ApiTesterOperationReference["role"],
  constructionObligation: boolean,
): ApiTesterOperationReference[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      collectReferences(document, entry, `${locator}/${index}`, role, constructionObligation));
  }
  if (!isRecord(value)) return [];
  const result: ApiTesterOperationReference[] = [];
  if (Object.prototype.hasOwnProperty.call(value, "$ref")) {
    const refLocator = `${locator}/$ref`;
    if (typeof value.$ref !== "string") {
      result.push({
        locator: refLocator,
        ref: String(value.$ref),
        role,
        resolution: "invalid",
        targetLocator: null,
        constructionObligation,
      });
    } else {
      const resolved = Object.keys(value).length === 1
        ? resolveLocalReference(document, value.$ref)
        : { resolution: "sibling-semantics" as const, value, targetLocator: value.$ref.startsWith("#/") ? value.$ref : null };
      result.push({
        locator: refLocator,
        ref: value.$ref,
        role,
        resolution: resolved.resolution,
        targetLocator: resolved.targetLocator,
        constructionObligation,
      });
    }
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key === "$ref") continue;
    result.push(...collectReferences(
      document,
      entry,
      `${locator}/${pointerToken(key)}`,
      role,
      constructionObligation,
    ));
  }
  return result;
}

function parameterIdentity(
  document: JsonRecord,
  raw: unknown,
  locator: string,
): { value: JsonRecord | null; name: string | null; location: string | null; reference: string | null } {
  if (!isRecord(raw)) return { value: null, name: null, location: null, reference: null };
  if (!Object.prototype.hasOwnProperty.call(raw, "$ref")) {
    return {
      value: raw,
      name: stringOrNull(raw.name),
      location: stringOrNull(raw.in),
      reference: null,
    };
  }
  if (Object.keys(raw).length !== 1 || typeof raw.$ref !== "string") {
    return { value: null, name: null, location: null, reference: stringOrNull(raw.$ref) };
  }
  const resolved = resolveLocalReference(document, raw.$ref);
  if (resolved.resolution !== "resolved" || !isRecord(resolved.value)) {
    return { value: null, name: null, location: null, reference: raw.$ref };
  }
  return {
    value: resolved.value,
    name: stringOrNull(resolved.value.name),
    location: stringOrNull(resolved.value.in),
    reference: raw.$ref,
  };
}

type EffectiveParameter = ApiTesterOperationParameter & { raw: unknown };

function effectiveParameters(input: {
  document: JsonRecord;
  pathItem: JsonRecord;
  operation: JsonRecord;
  pathLocator: string;
  operationLocator: string;
}): { parameters: EffectiveParameter[]; unresolved: ApiTesterOperationSourceIssue[] } {
  const unresolved: ApiTesterOperationSourceIssue[] = [];
  const scopes: Array<{ origin: "path" | "operation"; values: unknown; locator: string }> = [
    { origin: "path", values: input.pathItem.parameters, locator: `${input.pathLocator}/parameters` },
    { origin: "operation", values: input.operation.parameters, locator: `${input.operationLocator}/parameters` },
  ];
  const effective = new Map<string, EffectiveParameter>();
  for (const scope of scopes) {
    if (scope.values === undefined) continue;
    if (!Array.isArray(scope.values)) {
      unresolved.push(sourceIssue(
        "UNRESOLVED_PARAMETER_IDENTITY",
        scope.locator,
        `${scope.origin} parameters must be an array before inheritance can be preserved`,
      ));
      continue;
    }
    const seenInScope = new Set<string>();
    for (const [index, raw] of scope.values.entries()) {
      const locator = `${scope.locator}/${index}`;
      const identity = parameterIdentity(input.document, raw, locator);
      if (!identity.value || !identity.name || !identity.location) {
        unresolved.push(sourceIssue(
          "UNRESOLVED_PARAMETER_IDENTITY",
          locator,
          "parameter name/location could not be resolved for inheritance and override semantics",
        ));
        continue;
      }
      const key = `${identity.location}:${identity.name}`;
      if (seenInScope.has(key)) {
        unresolved.push(sourceIssue(
          "UNRESOLVED_PARAMETER_IDENTITY",
          locator,
          `duplicate ${scope.origin} parameter identity ${key} is ambiguous`,
        ));
        continue;
      }
      seenInScope.add(key);
      const previous = effective.get(key);
      effective.set(key, {
        locator,
        origin: scope.origin,
        name: identity.name,
        location: identity.location,
        required: typeof identity.value.required === "boolean" ? identity.value.required : null,
        reference: identity.reference,
        overridesLocator: scope.origin === "operation" && previous?.origin === "path" ? previous.locator : null,
        raw: structuredClone(raw),
      });
    }
  }
  return {
    parameters: [...effective.values()].sort((left, right) =>
      compareText(left.location ?? "", right.location ?? "") || compareText(left.name ?? "", right.name ?? "")),
    unresolved,
  };
}

function requestSummary(document: JsonRecord, operation: JsonRecord): ApiTesterSourceOperation["request"] {
  if (operation.requestBody === undefined) return { present: false, required: null, mediaTypes: [] };
  let body: unknown = operation.requestBody;
  if (isRecord(body) && typeof body.$ref === "string" && Object.keys(body).length === 1) {
    const resolved = resolveLocalReference(document, body.$ref);
    if (resolved.resolution === "resolved") body = resolved.value;
  }
  return {
    present: true,
    required: isRecord(body) && typeof body.required === "boolean" ? body.required : null,
    mediaTypes: isRecord(body) && isRecord(body.content) ? Object.keys(body.content).sort(compareText) : [],
  };
}

function responseSummary(operation: JsonRecord): ApiTesterSourceOperation["responses"] {
  return {
    statuses: isRecord(operation.responses) ? Object.keys(operation.responses).sort(compareText) : [],
  };
}

function securitySummary(
  document: JsonRecord,
  operation: JsonRecord,
): ApiTesterSourceOperation["security"] {
  const operationOwnsSecurity = Object.prototype.hasOwnProperty.call(operation, "security");
  const raw = operationOwnsSecurity ? operation.security : document.security;
  const source = operationOwnsSecurity ? "operation" : raw === undefined ? "none" : "global";
  const schemeNames = Array.isArray(raw)
    ? [...new Set(raw.flatMap((requirement) => isRecord(requirement) ? Object.keys(requirement) : []))].sort(compareText)
    : [];
  return { source, schemeNames };
}

function enumerateDocument(document: JsonRecord): ApiTesterOperationEnumeration {
  const unresolved: ApiTesterOperationSourceIssue[] = [];
  if (typeof document.openapi !== "string" || !document.openapi.startsWith("3.")
    || !isRecord(document.paths)) {
    return {
      complete: false,
      operations: [],
      unresolved: [sourceIssue("INVALID_OPENAPI_ROOT", "#", "expected OpenAPI 3.x with an object paths field")],
    };
  }
  const operations: ApiTesterSourceOperation[] = [];
  for (const path of Object.keys(document.paths).sort(compareText)) {
    const pathLocator = `#/paths/${pointerToken(path)}`;
    const pathItem = document.paths[path];
    if (!path.startsWith("/") || !isRecord(pathItem)) {
      unresolved.push(sourceIssue("INVALID_PATH_ITEM", pathLocator, `invalid path item ${path}`));
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(pathItem, "$ref")) {
      unresolved.push(sourceIssue(
        "UNRESOLVED_PATH_ITEM_REFERENCE",
        `${pathLocator}/$ref`,
        "path-item references can hide operations and are not expanded by the operation universe parser",
      ));
    }
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (operation === undefined) continue;
      const operationLocator = `${pathLocator}/${method}`;
      if (!isRecord(operation)) {
        unresolved.push(sourceIssue(
          "INVALID_OPERATION",
          operationLocator,
          `${method.toUpperCase()} ${path} must be an object`,
        ));
        continue;
      }
      const effective = effectiveParameters({ document, pathItem, operation, pathLocator, operationLocator });
      unresolved.push(...effective.unresolved);
      const references = [
        ...collectReferences(document, pathItem.parameters, `${pathLocator}/parameters`, "path-parameter", true),
        ...collectReferences(document, operation.parameters, `${operationLocator}/parameters`, "operation-parameter", true),
        ...collectReferences(document, operation.requestBody, `${operationLocator}/requestBody`, "request", true),
        ...collectReferences(document, operation.responses, `${operationLocator}/responses`, "response", false),
      ];
      const security = securitySummary(document, operation);
      const components = isRecord(document.components) && isRecord(document.components.securitySchemes)
        ? document.components.securitySchemes : {};
      for (const schemeName of security.schemeNames) {
        references.push(...collectReferences(
          document,
          components[schemeName],
          `#/components/securitySchemes/${pointerToken(schemeName)}`,
          "security",
          true,
        ));
      }
      operations.push({
        key: `${method.toUpperCase()} ${path}` as ApiTesterOperationKey,
        method: method.toUpperCase() as Uppercase<HttpMethod>,
        path,
        locator: operationLocator,
        operationId: stringOrNull(operation.operationId),
        summary: stringOrNull(operation.summary),
        parameters: effective.parameters.map(({ raw: _raw, ...parameter }) => parameter),
        request: requestSummary(document, operation),
        responses: responseSummary(operation),
        security,
        references: references.sort((left, right) => compareText(left.locator, right.locator)),
      });
    }
  }
  operations.sort((left, right) => compareText(left.path, right.path) || compareText(left.method, right.method));
  return { complete: unresolved.length === 0, operations, unresolved };
}

function syntaxFailure(message: string): ParsedApiTesterOperationSource {
  const duplicate = /unique|duplicate/iu.test(message);
  return {
    document: null,
    enumeration: {
      complete: false,
      operations: [],
      unresolved: [sourceIssue(
        duplicate ? "DUPLICATE_SOURCE_KEY" : "INVALID_SOURCE_SYNTAX",
        "#",
        message,
      )],
    },
  };
}

export function parseApiTesterOperationSource(
  text: string,
  format: "json" | "yaml",
): ParsedApiTesterOperationSource {
  try {
    const yamlDocument = parseDocument(text, { schema: "core", uniqueKeys: true });
    if (yamlDocument.errors.length > 0) {
      return syntaxFailure(yamlDocument.errors.map((error) => error.message).join("; "));
    }
    const value = format === "json" ? JSON.parse(text) : yamlDocument.toJS({ maxAliasCount: 100 });
    if (!isRecord(value)) return syntaxFailure("OpenAPI source root must be an object");
    return { document: value, enumeration: enumerateDocument(value) };
  } catch (error) {
    return syntaxFailure(error instanceof Error ? error.message : String(error));
  }
}

function operationFromKey(document: JsonRecord, key: ApiTesterOperationKey): {
  path: string;
  method: HttpMethod;
  pathItem: JsonRecord;
  operation: JsonRecord;
  source: ApiTesterSourceOperation;
} {
  const separator = key.indexOf(" ");
  const method = key.slice(0, separator).toLowerCase() as HttpMethod;
  const path = key.slice(separator + 1);
  if (!HTTP_METHODS.includes(method) || !isRecord(document.paths)
    || !isRecord(document.paths[path]) || !isRecord((document.paths[path] as JsonRecord)[method])) {
    throw new Error(`unknown API Tester operation key: ${key}`);
  }
  const enumeration = enumerateDocument(document);
  const source = enumeration.operations.find((operation) => operation.key === key);
  if (!source) throw new Error(`operation was not enumerable: ${key}`);
  return {
    path,
    method,
    pathItem: document.paths[path] as JsonRecord,
    operation: (document.paths[path] as JsonRecord)[method] as JsonRecord,
    source,
  };
}

function projectionBase(document: JsonRecord): JsonRecord {
  const result: JsonRecord = {};
  for (const [key, value] of Object.entries(document)) {
    if (key === "paths" || key === "webhooks" || key === "callbacks") continue;
    result[key] = structuredClone(value);
  }
  result.paths = {};
  return result;
}

function projectedPathMetadata(pathItem: JsonRecord): JsonRecord {
  const result: JsonRecord = {};
  for (const [key, value] of Object.entries(pathItem)) {
    if (key === "$ref" || key === "parameters" || HTTP_METHODS.includes(key as HttpMethod)) continue;
    result[key] = structuredClone(value);
  }
  return result;
}

function projectOne(document: JsonRecord, key: ApiTesterOperationKey): {
  path: string;
  method: HttpMethod;
  pathMetadata: JsonRecord;
  operation: JsonRecord;
  source: ApiTesterSourceOperation;
  unresolved: ApiTesterOperationSourceIssue[];
} {
  const located = operationFromKey(document, key);
  const pathLocator = `#/paths/${pointerToken(located.path)}`;
  const operationLocator = `${pathLocator}/${located.method}`;
  const effective = effectiveParameters({
    document,
    pathItem: located.pathItem,
    operation: located.operation,
    pathLocator,
    operationLocator,
  });
  const operation = structuredClone(located.operation);
  if (effective.parameters.length > 0) {
    operation.parameters = effective.parameters.map((parameter) => structuredClone(parameter.raw));
  } else {
    delete operation.parameters;
  }
  const ownsSecurity = Object.prototype.hasOwnProperty.call(located.operation, "security");
  const effectiveSecurity = ownsSecurity ? located.operation.security : document.security;
  if (effectiveSecurity === undefined) delete operation.security;
  else operation.security = structuredClone(effectiveSecurity);
  return {
    path: located.path,
    method: located.method,
    pathMetadata: projectedPathMetadata(located.pathItem),
    operation,
    source: located.source,
    unresolved: effective.unresolved,
  };
}

export function aggregateApiTesterOperations(
  document: unknown,
  operationKeys: ApiTesterOperationKey[],
): ApiTesterOperationProjection {
  if (!isRecord(document)) throw new Error("API Tester operation projection requires a parsed object document");
  if (operationKeys.length === 0 || new Set(operationKeys).size !== operationKeys.length) {
    throw new Error("API Tester operation projection requires unique non-empty operation keys");
  }
  const sortedKeys = [...operationKeys].sort(compareText);
  const projected = projectionBase(document);
  const projectedPaths = projected.paths as JsonRecord;
  const unresolved: ApiTesterOperationSourceIssue[] = [];
  let referenceClosurePreserved = true;
  for (const key of sortedKeys) {
    const item = projectOne(document, key);
    unresolved.push(...item.unresolved);
    const existing = isRecord(projectedPaths[item.path]) ? projectedPaths[item.path] as JsonRecord : item.pathMetadata;
    existing[item.method] = item.operation;
    projectedPaths[item.path] = existing;
    if (item.source.references.some((reference) =>
      reference.constructionObligation && reference.resolution !== "resolved")) {
      referenceClosurePreserved = false;
    }
  }
  return {
    complete: unresolved.length === 0 && referenceClosurePreserved,
    operationKeys: sortedKeys,
    document: projected,
    unresolved,
    dependencies: {
      parameterInheritancePreserved: !unresolved.some((issue) => issue.code === "UNRESOLVED_PARAMETER_IDENTITY"),
      securitySemanticsPreserved: true,
      referenceClosurePreserved,
      requestResponsePreserved: true,
    },
  };
}

export function projectApiTesterOperation(
  document: unknown,
  operationKey: ApiTesterOperationKey,
): ApiTesterOperationProjection {
  return aggregateApiTesterOperations(document, [operationKey]);
}
