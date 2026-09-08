import {
  buildApiTesterProductionContractV2,
  type ApiTesterProductionContractV2,
} from "./api-tester-production-contract-v2";
import {
  ApiTesterProductionUnsupportedError,
  type ApiTesterProductionUnsupportedCode,
} from "./api-tester-production-contract";
import {
  projectApiTesterOperation,
  type ApiTesterOperationProjection,
  type ApiTesterSourceOperation,
} from "./api-tester-operation-source";

type JsonRecord = Record<string, unknown>;

export type ApiTesterOperationAdmissionFindingCategory =
  | "unsupported-syntax"
  | "semantics-not-preserved"
  | "missing-public-construction-evidence"
  | "implementation-failure";

export type ApiTesterOperationAdmissionFinding = {
  code: string;
  category: ApiTesterOperationAdmissionFindingCategory;
  locator: string;
  message: string;
};

export type ApiTesterOperationFirstObservedRejection = {
  code: ApiTesterProductionUnsupportedCode;
  message: string;
  completeGapSet: false;
};

export type ApiTesterOperationAdmission = {
  operationKey: string;
  status: "accepted" | "rejected" | "unresolved";
  findings: ApiTesterOperationAdmissionFinding[];
  firstObservedRejection: ApiTesterOperationFirstObservedRejection | null;
  normalizedOperation: ApiTesterProductionContractV2["operations"][number] | null;
  projection: ApiTesterOperationProjection | null;
};

const SCALAR_TYPES = new Set(["string", "integer", "number", "boolean"]);
const SCALAR_KEYS = new Set([
  "type", "minLength", "maxLength", "minimum", "maximum", "enum", "format",
  "description", "title", "example", "default", "deprecated", "readOnly", "writeOnly",
]);
const ARRAY_KEYS = new Set([
  "type", "items", "minItems", "maxItems", "uniqueItems",
  "description", "title", "example", "default", "deprecated", "readOnly", "writeOnly",
]);
const BODY_KEYS = new Set(["type", "properties", "required", "description", "title", "example"]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pointerToken(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function operationAt(document: JsonRecord, operation: ApiTesterSourceOperation): {
  pathItem: JsonRecord;
  operation: JsonRecord;
} {
  if (!isRecord(document.paths) || !isRecord(document.paths[operation.path])) {
    throw new Error(`projected path is missing for ${operation.key}`);
  }
  const pathItem = document.paths[operation.path] as JsonRecord;
  const value = pathItem[operation.method.toLowerCase()];
  if (!isRecord(value)) throw new Error(`projected operation is missing for ${operation.key}`);
  return { pathItem, operation: value };
}

function resolvePointer(document: JsonRecord, ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;
  const tokens = ref.slice(2).split("/").map((token) => {
    if (/~(?:[^01]|$)/u.test(token)) return undefined;
    return token.replaceAll("~1", "/").replaceAll("~0", "~");
  });
  if (tokens.some((token) => token === undefined)) return undefined;
  let value: unknown = document;
  for (const token of tokens as string[]) {
    if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, token)) return undefined;
    value = value[token];
  }
  return value;
}

function findingCollector(): {
  values: ApiTesterOperationAdmissionFinding[];
  add: (
    code: string,
    category: ApiTesterOperationAdmissionFindingCategory,
    locator: string,
    message: string,
  ) => void;
} {
  const values: ApiTesterOperationAdmissionFinding[] = [];
  const locators = new Set<string>();
  return {
    values,
    add(code, category, locator, message) {
      let unique = locator;
      if (locators.has(unique)) unique = `${locator}/@${code.toLowerCase().replaceAll("_", "-")}`;
      let suffix = 2;
      while (locators.has(unique)) unique = `${locator}/@${code.toLowerCase().replaceAll("_", "-")}-${suffix++}`;
      locators.add(unique);
      values.push({ code, category, locator: unique, message });
    },
  };
}

type AddFinding = ReturnType<typeof findingCollector>["add"];

function resolveExpectedComponent(
  document: JsonRecord,
  value: unknown,
  kind: "parameters" | "requestBodies" | "schemas" | "securitySchemes",
  locator: string,
  add: AddFinding,
  stack: string[] = [],
): JsonRecord | null {
  if (!isRecord(value)) {
    add("UNSUPPORTED_COMPONENT_VALUE", "unsupported-syntax", locator, "expected an object");
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(value, "$ref")) return value;
  const refLocator = `${locator}/$ref`;
  if (Object.keys(value).length !== 1 || typeof value.$ref !== "string") {
    add("UNSUPPORTED_REFERENCE", "semantics-not-preserved", refLocator, "reference must contain only one string $ref");
    return null;
  }
  const ref = value.$ref;
  const prefix = `#/components/${kind}/`;
  if (!ref.startsWith(prefix) || stack.includes(ref)) {
    add("UNSUPPORTED_REFERENCE", "semantics-not-preserved", refLocator, `reference is outside the supported ${kind} closure or cyclic: ${ref}`);
    return null;
  }
  const resolved = resolvePointer(document, ref);
  if (!isRecord(resolved)) {
    add("UNSUPPORTED_REFERENCE", "semantics-not-preserved", refLocator, `reference target is missing or invalid: ${ref}`);
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(resolved, "$ref")) {
    return resolveExpectedComponent(document, resolved, kind, refLocator, add, [...stack, ref]);
  }
  return resolved;
}

function auditFiniteNumber(value: unknown, key: string, locator: string, add: AddFinding): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
    add(`INVALID_SCHEMA_${key.toUpperCase()}`, "unsupported-syntax", `${locator}/${key}`, `${key} must be a finite number`);
  }
}

function auditLength(value: unknown, key: string, locator: string, add: AddFinding): void {
  auditFiniteNumber(value, key, locator, add);
  if (typeof value === "number" && (!Number.isInteger(value) || value < 0)) {
    add(`INVALID_SCHEMA_${key.toUpperCase()}`, "unsupported-syntax", `${locator}/${key}`, `${key} must be a non-negative integer`);
  }
}

function auditScalarSchema(schema: JsonRecord, locator: string, add: AddFinding): void {
  for (const key of Object.keys(schema).sort(compareText)) {
    if (!SCALAR_KEYS.has(key) && !key.startsWith("x-")) {
      add(
        `UNSUPPORTED_SCHEMA_${key.replace(/([a-z])([A-Z])/gu, "$1_$2").toUpperCase()}`,
        "missing-public-construction-evidence",
        `${locator}/${pointerToken(key)}`,
        `schema keyword ${key} is outside the public construction contract`,
      );
    }
  }
  if (!SCALAR_TYPES.has(String(schema.type))) {
    add("UNSUPPORTED_SCHEMA_TYPE", "missing-public-construction-evidence", `${locator}/type`, "schema requires an explicit supported primitive type");
  }
  auditLength(schema.minLength, "minLength", locator, add);
  auditLength(schema.maxLength, "maxLength", locator, add);
  auditFiniteNumber(schema.minimum, "minimum", locator, add);
  auditFiniteNumber(schema.maximum, "maximum", locator, add);
  if (schema.type !== "string" && (schema.minLength !== undefined || schema.maxLength !== undefined)) {
    add("INAPPLICABLE_STRING_CONSTRAINT", "unsupported-syntax", locator, "string constraints require a string schema");
  }
  if (!["integer", "number"].includes(String(schema.type))
    && (schema.minimum !== undefined || schema.maximum !== undefined)) {
    add("INAPPLICABLE_NUMERIC_CONSTRAINT", "unsupported-syntax", locator, "numeric constraints require an integer or number schema");
  }
  const formats = schema.type === "string" ? ["email", "uri", "date"]
    : ["integer", "number"].includes(String(schema.type)) ? ["float", "double"] : [];
  if (schema.format !== undefined && !formats.includes(String(schema.format))) {
    add("UNSUPPORTED_SCHEMA_FORMAT", "missing-public-construction-evidence", `${locator}/format`, `unsupported format ${String(schema.format)}`);
  }
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length === 0)) {
    add("INVALID_SCHEMA_ENUM", "unsupported-syntax", `${locator}/enum`, "enum must be a non-empty array");
  }
  if (typeof schema.minLength === "number" && typeof schema.maxLength === "number"
    && schema.minLength > schema.maxLength) {
    add("UNCONSTRUCTIBLE_CONSTRAINT", "missing-public-construction-evidence", locator, "minLength exceeds maxLength");
  }
  if (typeof schema.minimum === "number" && typeof schema.maximum === "number"
    && schema.minimum > schema.maximum) {
    add("UNCONSTRUCTIBLE_CONSTRAINT", "missing-public-construction-evidence", locator, "minimum exceeds maximum");
  }
}

function auditFieldSchema(
  document: JsonRecord,
  raw: unknown,
  location: string,
  locator: string,
  add: AddFinding,
  parameter?: JsonRecord,
): "scalar" | "array" | null {
  const schema = resolveExpectedComponent(document, raw, "schemas", locator, add);
  if (!schema) return null;
  if (schema.type !== "array") {
    auditScalarSchema(schema, locator, add);
    return "scalar";
  }
  for (const key of Object.keys(schema).sort(compareText)) {
    if (!ARRAY_KEYS.has(key) && !key.startsWith("x-")) {
      add(
        `UNSUPPORTED_SCHEMA_${key.replace(/([a-z])([A-Z])/gu, "$1_$2").toUpperCase()}`,
        "missing-public-construction-evidence",
        `${locator}/${pointerToken(key)}`,
        `array keyword ${key} is outside the public construction contract`,
      );
    }
  }
  if (!["body", "query"].includes(location)) {
    add("UNSUPPORTED_ARRAY_LOCATION", "unsupported-syntax", locator, `array fields are unsupported in ${location}`);
  }
  if (!isRecord(schema.items)) {
    add("UNSUPPORTED_ARRAY_ITEMS", "missing-public-construction-evidence", `${locator}/items`, "array requires one primitive items schema");
  } else {
    const items = resolveExpectedComponent(document, schema.items, "schemas", `${locator}/items`, add);
    if (items) auditScalarSchema(items, `${locator}/items`, add);
  }
  auditLength(schema.minItems, "minItems", locator, add);
  auditLength(schema.maxItems, "maxItems", locator, add);
  if ((typeof schema.minItems === "number" && schema.minItems > 64)
    || (typeof schema.maxItems === "number" && schema.maxItems > 64)) {
    add("UNSUPPORTED_ARRAY_BOUND", "missing-public-construction-evidence", locator, "array construction is bounded to 64 items");
  }
  if (schema.uniqueItems !== undefined && typeof schema.uniqueItems !== "boolean") {
    add("INVALID_UNIQUE_ITEMS", "unsupported-syntax", `${locator}/uniqueItems`, "uniqueItems must be boolean");
  }
  if (schema.maxItems === 0) {
    add("UNCONSTRUCTIBLE_CONSTRAINT", "missing-public-construction-evidence", `${locator}/maxItems`, "maxItems zero cannot witness the item contract");
  }
  if (typeof schema.minItems === "number" && typeof schema.maxItems === "number"
    && schema.minItems > schema.maxItems) {
    add("UNCONSTRUCTIBLE_CONSTRAINT", "missing-public-construction-evidence", locator, "minItems exceeds maxItems");
  }
  if (location === "query") {
    const style = parameter?.style ?? "form";
    const explode = parameter?.explode ?? true;
    if (style !== "form" || typeof explode !== "boolean") {
      add("UNSUPPORTED_QUERY_ARRAY_ENCODING", "semantics-not-preserved", locator, "query arrays require style=form and boolean explode");
    }
  }
  return "array";
}

function auditParameters(
  document: JsonRecord,
  value: unknown,
  locator: string,
  add: AddFinding,
): Array<{ location: string; name: string; required: boolean }> {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    add("UNSUPPORTED_PARAMETERS", "unsupported-syntax", locator, "parameters must be an array");
    return [];
  }
  const result: Array<{ location: string; name: string; required: boolean }> = [];
  for (const [index, raw] of value.entries()) {
    const parameterLocator = `${locator}/${index}`;
    const parameter = resolveExpectedComponent(document, raw, "parameters", parameterLocator, add);
    if (!parameter) continue;
    const name = typeof parameter.name === "string" && parameter.name.length > 0 ? parameter.name : null;
    const location = typeof parameter.in === "string" ? parameter.in : null;
    if (!name) add("UNSUPPORTED_PARAMETER_NAME", "unsupported-syntax", `${parameterLocator}/name`, "parameter requires a non-empty name");
    if (!location || !["path", "query", "header"].includes(location)) {
      add("UNSUPPORTED_PARAMETER_LOCATION", "unsupported-syntax", `${parameterLocator}/in`, `unsupported parameter location ${String(location)}`);
    }
    if (location === "path" && parameter.required !== true) {
      add("OPTIONAL_PATH_PARAMETER", "semantics-not-preserved", `${parameterLocator}/required`, "path parameters must be required");
    }
    if (parameter.required !== undefined && typeof parameter.required !== "boolean") {
      add("INVALID_PARAMETER_REQUIRED", "unsupported-syntax", `${parameterLocator}/required`, "parameter required must be boolean");
    }
    if (parameter.content !== undefined) {
      add("UNSUPPORTED_PARAMETER_CONTENT", "semantics-not-preserved", `${parameterLocator}/content`, "content-based parameters are outside the support contract");
    }
    if (parameter.allowReserved === true || parameter.allowEmptyValue === true) {
      add("UNSUPPORTED_PARAMETER_ENCODING", "semantics-not-preserved", parameterLocator, "allowReserved and allowEmptyValue request semantics are unsupported");
    }
    if (!isRecord(parameter.schema)) {
      add("UNSUPPORTED_PARAMETER_SCHEMA", "missing-public-construction-evidence", `${parameterLocator}/schema`, "parameter requires a schema object");
    } else if (location) {
      const kind = auditFieldSchema(document, parameter.schema, location, `${parameterLocator}/schema`, add, parameter);
      if (kind === "scalar") {
        const defaultStyle = location === "query" ? "form" : "simple";
        if (parameter.style !== undefined && parameter.style !== defaultStyle) {
          add("UNSUPPORTED_PARAMETER_STYLE", "semantics-not-preserved", `${parameterLocator}/style`, `scalar ${location} parameter style must be ${defaultStyle}`);
        }
      }
    }
    if (name && location) result.push({ location, name, required: parameter.required === true });
  }
  return result;
}

function auditRequestBody(document: JsonRecord, value: unknown, locator: string, add: AddFinding): Array<{ required: boolean }> {
  if (value === undefined) return [];
  const body = resolveExpectedComponent(document, value, "requestBodies", locator, add);
  if (!body) return [];
  if (!isRecord(body.content)) {
    add("UNSUPPORTED_REQUEST_BODY", "unsupported-syntax", `${locator}/content`, "request body requires a content object");
    return [];
  }
  const mediaTypes = Object.keys(body.content).sort(compareText);
  for (const mediaType of mediaTypes) {
    if (mediaType !== "application/json") {
      add("UNSUPPORTED_REQUEST_MEDIA_TYPE", "semantics-not-preserved", `${locator}/content/${pointerToken(mediaType)}`, `unsupported request media type ${mediaType}`);
    }
  }
  const media = body.content["application/json"];
  if (mediaTypes.length !== 1 || !isRecord(media)) {
    if (!mediaTypes.includes("application/json")) {
      add("MISSING_JSON_REQUEST_MEDIA", "missing-public-construction-evidence", `${locator}/content`, "application/json request media is required");
    }
    return [];
  }
  if (!isRecord(media.schema)) {
    add("UNSUPPORTED_REQUEST_SCHEMA", "unsupported-syntax", `${locator}/content/application~1json/schema`, "request media requires a schema object");
    return [];
  }
  const schemaLocator = `${locator}/content/application~1json/schema`;
  const schema = resolveExpectedComponent(document, media.schema, "schemas", schemaLocator, add);
  if (!schema) return [];
  for (const key of Object.keys(schema).sort(compareText)) {
    if (!BODY_KEYS.has(key) && !key.startsWith("x-")) {
      add("UNSUPPORTED_REQUEST_SCHEMA_KEY", "missing-public-construction-evidence", `${schemaLocator}/${pointerToken(key)}`, `request object keyword ${key} is unsupported`);
    }
  }
  if (schema.type !== "object" || !isRecord(schema.properties)) {
    add("UNSUPPORTED_REQUEST_OBJECT", "missing-public-construction-evidence", schemaLocator, "request body requires an object schema with properties");
    return [];
  }
  const required = schema.required === undefined ? [] : schema.required;
  if (!Array.isArray(required) || required.some((entry) => typeof entry !== "string")
    || new Set(required).size !== required.length) {
    add("INVALID_REQUEST_REQUIRED", "unsupported-syntax", `${schemaLocator}/required`, "required must be a unique string array");
    return [];
  }
  const names = Object.keys(schema.properties);
  for (const entry of required) {
    if (!names.includes(String(entry))) {
      add("UNDECLARED_REQUIRED_PROPERTY", "unsupported-syntax", `${schemaLocator}/required`, `required property ${String(entry)} is undeclared`);
    }
  }
  const fields: Array<{ required: boolean }> = [];
  for (const name of names.sort(compareText)) {
    const propertyLocator = `${schemaLocator}/properties/${pointerToken(name)}`;
    const property = schema.properties[name];
    if (!isRecord(property)) {
      add("UNSUPPORTED_REQUEST_PROPERTY", "unsupported-syntax", propertyLocator, "request property must be a schema object");
      continue;
    }
    auditFieldSchema(document, property, "body", propertyLocator, add);
    fields.push({ required: required.includes(name) });
  }
  return fields;
}

function auditResponses(value: unknown, locator: string, add: AddFinding): {
  success: number[];
  errors: number[];
} {
  if (!isRecord(value)) {
    add("UNSUPPORTED_RESPONSES", "unsupported-syntax", locator, "responses must be an object");
    return { success: [], errors: [] };
  }
  const success: number[] = [];
  const errors: number[] = [];
  for (const key of Object.keys(value).sort(compareText)) {
    if (!/^\d{3}$/u.test(key)) {
      add("UNSUPPORTED_RESPONSE_STATUS", "unsupported-syntax", `${locator}/${pointerToken(key)}`, `response status ${key} is not an explicit three-digit code`);
      continue;
    }
    const status = Number(key);
    if (status >= 200 && status <= 299) success.push(status);
    else if (status >= 400 && status <= 599) errors.push(status);
    else add("UNSUPPORTED_RESPONSE_STATUS", "unsupported-syntax", `${locator}/${key}`, `response status ${key} is outside the supported success/error ranges`);
  }
  if (success.length === 0) {
    add("MISSING_SUCCESS_RESPONSE", "missing-public-construction-evidence", locator, "operation has no explicit 2xx response");
  }
  return { success, errors };
}

function auditSecurity(
  document: JsonRecord,
  value: unknown,
  locator: string,
  add: AddFinding,
): { protected: boolean } {
  if (value === undefined || (Array.isArray(value) && value.length === 0)) return { protected: false };
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) {
    add("UNSUPPORTED_SECURITY_REQUIREMENT", "semantics-not-preserved", locator, "exactly one security requirement is supported");
    return { protected: false };
  }
  const requirement = value[0];
  const schemes = isRecord(document.components) && isRecord(document.components.securitySchemes)
    ? document.components.securitySchemes as JsonRecord : {};
  let protectedOperation = false;
  for (const [name, scopes] of Object.entries(requirement)) {
    const schemeLocator = `${locator}/0/${pointerToken(name)}`;
    if (!Array.isArray(scopes) || scopes.length !== 0) {
      add("UNSUPPORTED_SECURITY_SCOPE", "semantics-not-preserved", schemeLocator, `security scopes are unsupported for ${name}`);
    }
    const scheme = resolveExpectedComponent(document, schemes[name], "securitySchemes", `#/components/securitySchemes/${pointerToken(name)}`, add);
    if (!scheme) continue;
    const bearer = scheme.type === "http" && String(scheme.scheme).toLowerCase() === "bearer";
    const apiKey = scheme.type === "apiKey" && scheme.in === "header"
      && typeof scheme.name === "string" && scheme.name.length > 0;
    if (!bearer && !apiKey) {
      add("UNSUPPORTED_SECURITY_SCHEME", "semantics-not-preserved", `#/components/securitySchemes/${pointerToken(name)}`, `security scheme ${name} cannot be represented as a request header`);
    } else {
      protectedOperation = true;
    }
  }
  if (Object.keys(requirement).length === 0) {
    add("EMPTY_SECURITY_REQUIREMENT", "semantics-not-preserved", locator, "empty security requirements cannot produce a security witness");
  }
  return { protected: protectedOperation };
}

function auditOperation(
  document: JsonRecord,
  source: ApiTesterSourceOperation,
  add: AddFinding,
): { hasUnresolvedDependency: boolean } {
  const located = operationAt(document, source);
  const base = source.locator;
  let hasUnresolvedDependency = false;
  if (located.operation.callbacks !== undefined) {
    add("UNSUPPORTED_CALLBACK", "semantics-not-preserved", `${base}/callbacks`, "operation callbacks are outside the support contract");
  }
  for (const reference of source.references) {
    if (reference.constructionObligation && reference.resolution !== "resolved") {
      add("UNRESOLVED_CONSTRUCTION_REFERENCE", "semantics-not-preserved", reference.locator, `${reference.role} reference is ${reference.resolution}: ${reference.ref}`);
      hasUnresolvedDependency = true;
    }
  }
  const fields = auditParameters(document, located.operation.parameters, `${base}/parameters`, add);
  const bodyFields = auditRequestBody(document, located.operation.requestBody, `${base}/requestBody`, add);
  const statuses = auditResponses(located.operation.responses, `${base}/responses`, add);
  const security = auditSecurity(document, located.operation.security, `${base}/security`, add);
  if ([...fields, ...bodyFields].some((field) => field.required) && statuses.errors.length === 0) {
    add("MISSING_REQUIRED_ERROR_RESPONSE", "missing-public-construction-evidence", `${base}/responses`, "required inputs need an explicit 4xx/5xx failure response");
  }
  if (security.protected && !statuses.errors.some((status) => status === 401 || status === 403)) {
    add("MISSING_SECURITY_ERROR_RESPONSE", "missing-public-construction-evidence", `${base}/responses`, "secured operations need an explicit 401 or 403 response");
  }
  return { hasUnresolvedDependency };
}

function categoryForV2Code(code: ApiTesterProductionUnsupportedCode): ApiTesterOperationAdmissionFindingCategory {
  if (["UNSUPPORTED_OPENAPI_FEATURE", "UNSUPPORTED_REFERENCE", "UNSUPPORTED_SECURITY", "UNSUPPORTED_REQUEST_BODY"].includes(code)) {
    return "semantics-not-preserved";
  }
  if (["UNSUPPORTED_SCHEMA", "UNCONSTRUCTIBLE_CONSTRAINT", "MISSING_REQUIRED_ERROR_RESPONSE", "MISSING_SECURITY_ERROR_RESPONSE"].includes(code)) {
    return "missing-public-construction-evidence";
  }
  return "unsupported-syntax";
}

export function analyzeApiTesterOperation(input: {
  document: unknown;
  operation: ApiTesterSourceOperation;
}): ApiTesterOperationAdmission {
  const collected = findingCollector();
  let projection: ApiTesterOperationProjection | null = null;
  let firstObservedRejection: ApiTesterOperationFirstObservedRejection | null = null;
  let normalizedOperation: ApiTesterProductionContractV2["operations"][number] | null = null;
  let unresolved = false;
  try {
    if (!isRecord(input.document)) throw new Error("operation admission requires a parsed object document");
    if (isRecord(input.document.components)) Object.keys(input.document.components);
    projection = projectApiTesterOperation(input.document, input.operation.key);
    unresolved = !projection.complete;
    const original = operationAt(input.document, input.operation);
    if (Object.prototype.hasOwnProperty.call(original.pathItem, "$ref")) {
      collected.add(
        "UNRESOLVED_PATH_ITEM_REFERENCE",
        "semantics-not-preserved",
        `${input.operation.locator.slice(0, input.operation.locator.lastIndexOf("/"))}/$ref`,
        "path-item reference may hide inherited operations or semantics",
      );
      unresolved = true;
    }
    const audit = auditOperation(projection.document, input.operation, collected.add);
    unresolved ||= audit.hasUnresolvedDependency;
    try {
      const contract = buildApiTesterProductionContractV2(projection.document);
      const expectedKey = input.operation.key;
      normalizedOperation = contract.operations.find((operation) => `${operation.method} ${operation.path}` === expectedKey) ?? null;
      if (!normalizedOperation || contract.operations.length !== 1) {
        collected.add("IMPLEMENTATION_FAILURE", "implementation-failure", input.operation.locator, "v2 contract did not return exactly the projected operation");
        unresolved = true;
      }
    } catch (error) {
      if (error instanceof ApiTesterProductionUnsupportedError) {
        firstObservedRejection = { code: error.code, message: error.message, completeGapSet: false };
      } else {
        throw error;
      }
    }
    if (firstObservedRejection && collected.values.length === 0) {
      collected.add(
        `V2_${firstObservedRejection.code}`,
        categoryForV2Code(firstObservedRejection.code),
        input.operation.locator,
        firstObservedRejection.message,
      );
    }
    if (!projection.complete) {
      for (const issue of projection.unresolved) {
        collected.add(issue.code, "semantics-not-preserved", issue.locator, issue.message);
      }
    }
  } catch (error) {
    collected.add(
      "IMPLEMENTATION_FAILURE",
      "implementation-failure",
      input.operation.locator,
      error instanceof Error ? error.message : String(error),
    );
    unresolved = true;
  }
  if (collected.values.length > 0) normalizedOperation = null;
  collected.values.sort((left, right) => compareText(left.locator, right.locator) || compareText(left.code, right.code));
  return {
    operationKey: input.operation.key,
    status: unresolved ? "unresolved" : collected.values.length > 0 || firstObservedRejection ? "rejected" : "accepted",
    findings: collected.values,
    firstObservedRejection,
    normalizedOperation,
    projection,
  };
}

export function verifyApiTesterOperationAdmissionConsistency(rows: Array<Pick<
  ApiTesterOperationAdmission,
  "operationKey" | "status" | "findings" | "firstObservedRejection" | "normalizedOperation"
>>): { status: "pass" | "fail"; errors: string[] } {
  const errors = new Set<string>();
  const keys = rows.map((row) => row.operationKey);
  if (new Set(keys).size !== keys.length) errors.add("DUPLICATE_OPERATION_KEY");
  for (const row of rows) {
    if (row.status === "accepted"
      && (row.findings.length > 0 || row.firstObservedRejection !== null || row.normalizedOperation === null)) {
      errors.add("FALSE_ACCEPTANCE");
    }
    if (row.status !== "accepted" && row.findings.length === 0) errors.add("UNEXPLAINED_REJECTION");
    if (row.status !== "accepted" && row.normalizedOperation !== null) errors.add("REJECTED_OPERATION_HAS_NORMALIZED_CONTRACT");
  }
  return { status: errors.size === 0 ? "pass" : "fail", errors: [...errors].sort(compareText) };
}
