import { z } from "zod";
import { parse as parseYaml } from "yaml";
import { SafeRelativePathSchema } from "../benchmarks/skill-ir/artifact-package";

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;
const FIELD_LOCATIONS = ["body", "path", "query", "header"] as const;
const FIELD_TYPES = ["string", "integer", "number", "boolean"] as const;
const SUPPORTED_FORMATS = ["email", "uri"] as const;

export const API_TESTER_PRODUCTION_BINDING_SCHEMA_VERSION =
  "skill-ir-api-tester-production-binding/v1" as const;
export const API_TESTER_PRODUCTION_CONTRACT_SCHEMA_VERSION =
  "skill-ir-api-tester-public-contract/v1" as const;
export const API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID =
  "api-tester-openapi-subset-v1" as const;

export type ApiTesterProductionUnsupportedCode =
  | "INVALID_OPENAPI"
  | "UNSUPPORTED_OPENAPI_FEATURE"
  | "UNSUPPORTED_REFERENCE"
  | "UNSUPPORTED_PARAMETER"
  | "UNSUPPORTED_REQUEST_BODY"
  | "UNSUPPORTED_SECURITY"
  | "UNSUPPORTED_RESPONSE"
  | "UNSUPPORTED_SCHEMA"
  | "UNCONSTRUCTIBLE_CONSTRAINT"
  | "MISSING_REQUIRED_ERROR_RESPONSE"
  | "MISSING_SECURITY_ERROR_RESPONSE";

export class ApiTesterProductionUnsupportedError extends Error {
  readonly code: ApiTesterProductionUnsupportedCode;

  constructor(code: ApiTesterProductionUnsupportedCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "ApiTesterProductionUnsupportedError";
    this.code = code;
  }
}

export const ApiTesterProductionBindingSchema = z.object({
  schemaVersion: z.literal(API_TESTER_PRODUCTION_BINDING_SCHEMA_VERSION),
  bindingId: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u),
  input: z.object({
    path: SafeRelativePathSchema,
    format: z.enum(["json", "yaml"]),
  }).strict(),
  outputs: z.object({
    plan: SafeRelativePathSchema,
    report: SafeRelativePathSchema,
  }).strict(),
}).strict().superRefine((binding, context) => {
  const paths = [binding.input.path, binding.outputs.plan, binding.outputs.report];
  if (new Set(paths).size !== paths.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["outputs"],
      message: "API Tester production input and output paths must be distinct",
    });
  }
  const extensionMatches = binding.input.format === "json"
    ? binding.input.path.toLowerCase().endsWith(".json")
    : /\.ya?ml$/iu.test(binding.input.path);
  if (!extensionMatches) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["input", "path"],
      message: "API Tester production input extension must match the declared format",
    });
  }
});

export type ApiTesterProductionBinding = z.infer<typeof ApiTesterProductionBindingSchema>;

export const ApiTesterProductionFieldSchema = z.object({
  location: z.enum(FIELD_LOCATIONS),
  name: z.string().min(1),
  type: z.enum(FIELD_TYPES),
  required: z.boolean(),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().nonnegative().optional(),
  minimum: z.number().finite().optional(),
  maximum: z.number().finite().optional(),
  enumValues: z.array(z.unknown()).min(1).optional(),
  format: z.enum(SUPPORTED_FORMATS).optional(),
}).strict();

export type ApiTesterProductionField = z.infer<typeof ApiTesterProductionFieldSchema>;

export const ApiTesterProductionOperationSchema = z.object({
  method: z.enum(["GET", "PUT", "POST", "DELETE", "OPTIONS", "HEAD", "PATCH", "TRACE"]),
  path: z.string().startsWith("/"),
  successStatuses: z.array(z.number().int().min(200).max(299)).min(1),
  errorStatuses: z.array(z.number().int().min(400).max(599)),
  securityHeaders: z.array(z.string().min(1)),
  fields: z.array(ApiTesterProductionFieldSchema),
}).strict();

export const ApiTesterProductionContractSchema = z.object({
  schemaVersion: z.literal(API_TESTER_PRODUCTION_CONTRACT_SCHEMA_VERSION),
  supportContractId: z.literal(API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID),
  operations: z.array(ApiTesterProductionOperationSchema).min(1),
}).strict();

export type ApiTesterProductionContract = z.infer<typeof ApiTesterProductionContractSchema>;

type JsonRecord = Record<string, unknown>;

function unsupported(code: ApiTesterProductionUnsupportedCode, message: string): never {
  throw new ApiTesterProductionUnsupportedError(code, message);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function containsReference(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsReference);
  if (!isRecord(value)) return false;
  if (Object.prototype.hasOwnProperty.call(value, "$ref")) return true;
  return Object.values(value).some(containsReference);
}

function sortedNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function parseStatuses(value: unknown, operationKey: string): {
  successStatuses: number[];
  errorStatuses: number[];
} {
  if (!isRecord(value)) unsupported("UNSUPPORTED_RESPONSE", `${operationKey} responses must be an object`);
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => !/^\d{3}$/u.test(key))) {
    unsupported("UNSUPPORTED_RESPONSE", `${operationKey} requires explicit three-digit response codes`);
  }
  const codes = keys.map(Number);
  const successStatuses = sortedNumbers(codes.filter((code) => code >= 200 && code <= 299));
  if (successStatuses.length === 0) {
    unsupported("UNSUPPORTED_RESPONSE", `${operationKey} has no explicit 2xx response`);
  }
  return {
    successStatuses,
    errorStatuses: sortedNumbers(codes.filter((code) => code >= 400 && code <= 599)),
  };
}

const DESCRIPTIVE_SCHEMA_KEYS = new Set([
  "type", "minLength", "maxLength", "minimum", "maximum", "enum", "format",
  "description", "title", "example", "default", "deprecated", "readOnly", "writeOnly",
]);

function parseFiniteNumber(value: unknown, key: string, fieldKey: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    unsupported("UNSUPPORTED_SCHEMA", `${fieldKey}.${key} must be a finite number`);
  }
  return value;
}

function parseLength(value: unknown, key: string, fieldKey: string): number | undefined {
  const parsed = parseFiniteNumber(value, key, fieldKey);
  if (parsed !== undefined && (!Number.isInteger(parsed) || parsed < 0)) {
    unsupported("UNSUPPORTED_SCHEMA", `${fieldKey}.${key} must be a non-negative integer`);
  }
  return parsed;
}

function valueMatchesField(field: ApiTesterProductionField, value: unknown): boolean {
  if (field.type === "string" && typeof value !== "string") return false;
  if (field.type === "integer" && (!Number.isInteger(value) || typeof value !== "number")) return false;
  if (field.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) return false;
  if (field.type === "boolean" && typeof value !== "boolean") return false;
  if (typeof value === "string") {
    if (field.minLength !== undefined && value.length < field.minLength) return false;
    if (field.maxLength !== undefined && value.length > field.maxLength) return false;
    if (field.format === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(value)) return false;
    if (field.format === "uri") {
      try {
        new URL(value);
      } catch {
        return false;
      }
    }
  }
  if (typeof value === "number") {
    if (field.minimum !== undefined && value < field.minimum) return false;
    if (field.maximum !== undefined && value > field.maximum) return false;
  }
  return true;
}

function constructString(field: ApiTesterProductionField): string | undefined {
  const minimum = field.minLength ?? 0;
  const maximum = field.maxLength ?? Number.POSITIVE_INFINITY;
  if (minimum > maximum) return undefined;
  if (field.format === "email") {
    const suffix = "@b.co";
    const localLength = Math.max(1, minimum - suffix.length);
    const value = `${"a".repeat(localLength)}${suffix}`;
    return value.length <= maximum ? value : undefined;
  }
  if (field.format === "uri") {
    const base = "https://a.co";
    const value = base.length >= minimum ? base : `${base}/${"x".repeat(minimum - base.length - 1)}`;
    return value.length <= maximum ? value : undefined;
  }
  const length = Math.max(0, minimum, maximum === 0 ? 0 : 1);
  return length <= maximum ? "x".repeat(length) : undefined;
}

export function constructApiTesterProductionValidValue(field: ApiTesterProductionField): unknown {
  if (field.enumValues) {
    const value = field.enumValues.find((candidate) => valueMatchesField(field, candidate));
    if (value !== undefined) return structuredClone(value);
    unsupported("UNCONSTRUCTIBLE_CONSTRAINT", `${field.location}:${field.name} enum has no supported valid value`);
  }
  let candidate: unknown;
  if (field.type === "string") candidate = constructString(field);
  else if (field.type === "integer") candidate = Math.ceil(field.minimum ?? 1);
  else if (field.type === "number") candidate = field.minimum ?? 1;
  else candidate = true;
  if (candidate === undefined || !valueMatchesField(field, candidate)) {
    unsupported("UNCONSTRUCTIBLE_CONSTRAINT", `${field.location}:${field.name} constraints cannot produce a valid value`);
  }
  return candidate;
}

function parseField(input: {
  location: ApiTesterProductionField["location"];
  name: string;
  schema: JsonRecord;
  required: boolean;
}): ApiTesterProductionField {
  const fieldKey = `${input.location}:${input.name}`;
  const unknownKeys = Object.keys(input.schema).filter((key) => !DESCRIPTIVE_SCHEMA_KEYS.has(key) && !key.startsWith("x-"));
  if (unknownKeys.length > 0) {
    unsupported("UNSUPPORTED_SCHEMA", `${fieldKey} uses unsupported schema keys: ${unknownKeys.join(", ")}`);
  }
  if (!FIELD_TYPES.includes(input.schema.type as typeof FIELD_TYPES[number])) {
    unsupported("UNSUPPORTED_SCHEMA", `${fieldKey} requires an explicit primitive type`);
  }
  const type = input.schema.type as ApiTesterProductionField["type"];
  const minLength = parseLength(input.schema.minLength, "minLength", fieldKey);
  const maxLength = parseLength(input.schema.maxLength, "maxLength", fieldKey);
  const minimum = parseFiniteNumber(input.schema.minimum, "minimum", fieldKey);
  const maximum = parseFiniteNumber(input.schema.maximum, "maximum", fieldKey);
  if (type !== "string" && (minLength !== undefined || maxLength !== undefined || input.schema.format !== undefined)) {
    unsupported("UNSUPPORTED_SCHEMA", `${fieldKey} applies string constraints to ${type}`);
  }
  if (!["integer", "number"].includes(type) && (minimum !== undefined || maximum !== undefined)) {
    unsupported("UNSUPPORTED_SCHEMA", `${fieldKey} applies numeric constraints to ${type}`);
  }
  if (input.schema.format !== undefined && !SUPPORTED_FORMATS.includes(input.schema.format as typeof SUPPORTED_FORMATS[number])) {
    unsupported("UNSUPPORTED_SCHEMA", `${fieldKey} uses unsupported format ${String(input.schema.format)}`);
  }
  if (input.schema.enum !== undefined && (!Array.isArray(input.schema.enum) || input.schema.enum.length === 0)) {
    unsupported("UNSUPPORTED_SCHEMA", `${fieldKey} enum must be a non-empty array`);
  }
  const field = ApiTesterProductionFieldSchema.parse({
    location: input.location,
    name: input.name,
    type,
    required: input.required,
    ...(minLength !== undefined ? { minLength } : {}),
    ...(maxLength !== undefined ? { maxLength } : {}),
    ...(minimum !== undefined ? { minimum } : {}),
    ...(maximum !== undefined ? { maximum } : {}),
    ...(Array.isArray(input.schema.enum) ? { enumValues: structuredClone(input.schema.enum) } : {}),
    ...(input.schema.format !== undefined ? { format: input.schema.format } : {}),
  });
  constructApiTesterProductionValidValue(field);
  return field;
}

function parseParameters(value: unknown, label: string): ApiTesterProductionField[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) unsupported("UNSUPPORTED_PARAMETER", `${label} parameters must be an array`);
  const fields: ApiTesterProductionField[] = [];
  for (const [index, parameter] of value.entries()) {
    if (!isRecord(parameter) || !isRecord(parameter.schema)) {
      unsupported("UNSUPPORTED_PARAMETER", `${label} parameter ${index} must have an inline schema`);
    }
    const name = nonEmptyString(parameter.name);
    const location = parameter.in;
    if (!name || !["path", "query", "header"].includes(String(location))) {
      unsupported("UNSUPPORTED_PARAMETER", `${label} parameter ${index} has unsupported name/location`);
    }
    if (location === "path" && parameter.required !== true) {
      unsupported("UNSUPPORTED_PARAMETER", `${label} path parameter ${name} must be required`);
    }
    fields.push(parseField({
      location: location as "path" | "query" | "header",
      name,
      schema: parameter.schema,
      required: parameter.required === true,
    }));
  }
  return fields;
}

function parseRequestBody(value: unknown, label: string): ApiTesterProductionField[] {
  if (value === undefined) return [];
  if (!isRecord(value) || !isRecord(value.content)) {
    unsupported("UNSUPPORTED_REQUEST_BODY", `${label} requestBody must have inline content`);
  }
  if (Object.keys(value.content).length !== 1 || !isRecord(value.content["application/json"])) {
    unsupported("UNSUPPORTED_REQUEST_BODY", `${label} supports application/json only`);
  }
  const media = value.content["application/json"] as JsonRecord;
  if (!isRecord(media.schema) || media.schema.type !== "object" || !isRecord(media.schema.properties)) {
    unsupported("UNSUPPORTED_REQUEST_BODY", `${label} requires an inline object schema with properties`);
  }
  const bodySchemaKeys = Object.keys(media.schema).filter((key) =>
    !["type", "properties", "required", "description", "title", "example"].includes(key) && !key.startsWith("x-"));
  if (bodySchemaKeys.length > 0) {
    unsupported("UNSUPPORTED_REQUEST_BODY", `${label} body uses unsupported keys: ${bodySchemaKeys.join(", ")}`);
  }
  const requiredList = media.schema.required === undefined ? [] : media.schema.required;
  if (!Array.isArray(requiredList) || requiredList.some((entry) => typeof entry !== "string")
    || new Set(requiredList).size !== requiredList.length) {
    unsupported("UNSUPPORTED_REQUEST_BODY", `${label} body required must be a unique string array`);
  }
  const propertyNames = Object.keys(media.schema.properties);
  if (requiredList.some((name) => !propertyNames.includes(name as string))) {
    unsupported("UNSUPPORTED_REQUEST_BODY", `${label} body requires an undeclared property`);
  }
  return propertyNames.sort().map((name) => {
    const schema = (media.schema as JsonRecord).properties as JsonRecord;
    const property = schema[name];
    if (!isRecord(property)) {
      unsupported("UNSUPPORTED_REQUEST_BODY", `${label} body property ${name} must have an inline schema`);
    }
    return parseField({
      location: "body",
      name,
      schema: property,
      required: requiredList.includes(name),
    });
  });
}

function parseSecurityHeaders(
  document: JsonRecord,
  operation: JsonRecord,
  label: string,
): string[] {
  const security = operation.security ?? document.security;
  if (security === undefined || (Array.isArray(security) && security.length === 0)) return [];
  if (!Array.isArray(security) || security.length !== 1 || !isRecord(security[0])) {
    unsupported("UNSUPPORTED_SECURITY", `${label} supports one explicit security requirement`);
  }
  const components = isRecord(document.components) ? document.components : {};
  const schemes = isRecord(components.securitySchemes) ? components.securitySchemes : {};
  const headers = new Set<string>();
  for (const [schemeName, scopes] of Object.entries(security[0])) {
    if (!Array.isArray(scopes) || scopes.length !== 0) {
      unsupported("UNSUPPORTED_SECURITY", `${label} security scopes are unsupported`);
    }
    const scheme = schemes[schemeName];
    if (!isRecord(scheme)) unsupported("UNSUPPORTED_SECURITY", `${label} references unknown security scheme ${schemeName}`);
    if (scheme.type === "http" && String(scheme.scheme).toLowerCase() === "bearer") {
      headers.add("Authorization");
    } else if (scheme.type === "apiKey" && scheme.in === "header" && nonEmptyString(scheme.name)) {
      headers.add(String(scheme.name));
    } else {
      unsupported("UNSUPPORTED_SECURITY", `${label} security scheme ${schemeName} is unsupported`);
    }
  }
  if (headers.size === 0) unsupported("UNSUPPORTED_SECURITY", `${label} security requirement is empty`);
  return [...headers].sort();
}

function fieldKey(field: ApiTesterProductionField): string {
  return `${field.location}:${field.name}`;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function parseApiTesterProductionBinding(value: unknown): ApiTesterProductionBinding {
  return ApiTesterProductionBindingSchema.parse(value);
}

export function parseApiTesterProductionDocument(
  text: string,
  format: ApiTesterProductionBinding["input"]["format"],
): unknown {
  try {
    return format === "json" ? JSON.parse(text) : parseYaml(text);
  } catch (error) {
    unsupported("INVALID_OPENAPI", error instanceof Error ? error.message : String(error));
  }
}

export function buildApiTesterProductionContract(value: unknown): ApiTesterProductionContract {
  if (containsReference(value)) unsupported("UNSUPPORTED_REFERENCE", "$ref is outside the production subset");
  if (!isRecord(value) || !nonEmptyString(value.openapi) || !String(value.openapi).startsWith("3.")
    || !isRecord(value.paths) || Object.keys(value.paths).length === 0) {
    unsupported("INVALID_OPENAPI", "expected OpenAPI 3.x with non-empty paths");
  }
  if (value.webhooks !== undefined || value.callbacks !== undefined) {
    unsupported("UNSUPPORTED_OPENAPI_FEATURE", "top-level webhooks/callbacks are unsupported");
  }
  const operations: ApiTesterProductionContract["operations"] = [];
  for (const pathName of Object.keys(value.paths).sort(compareText)) {
    const pathItem = value.paths[pathName];
    if (!pathName.startsWith("/") || !isRecord(pathItem)) {
      unsupported("INVALID_OPENAPI", `invalid path item ${pathName}`);
    }
    const sharedFields = parseParameters(pathItem.parameters, pathName);
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (operation === undefined) continue;
      if (!isRecord(operation)) unsupported("INVALID_OPENAPI", `${method.toUpperCase()} ${pathName} must be an object`);
      const operationKey = `${method.toUpperCase()} ${pathName}`;
      if (operation.callbacks !== undefined) {
        unsupported("UNSUPPORTED_OPENAPI_FEATURE", `${operationKey} callbacks are unsupported`);
      }
      const statuses = parseStatuses(operation.responses, operationKey);
      const fields = [
        ...sharedFields,
        ...parseParameters(operation.parameters, operationKey),
        ...parseRequestBody(operation.requestBody, operationKey),
      ];
      const keys = fields.map(fieldKey);
      if (new Set(keys).size !== keys.length) {
        unsupported("UNSUPPORTED_PARAMETER", `${operationKey} contains ambiguous duplicate fields`);
      }
      const securityHeaders = parseSecurityHeaders(value, operation, operationKey);
      if (fields.some((field) => field.required) && statuses.errorStatuses.length === 0) {
        unsupported("MISSING_REQUIRED_ERROR_RESPONSE", `${operationKey} cannot witness a required-field failure`);
      }
      if (securityHeaders.length > 0
        && !statuses.errorStatuses.some((status) => status === 401 || status === 403)) {
        unsupported("MISSING_SECURITY_ERROR_RESPONSE", `${operationKey} has security but no 401/403 response`);
      }
      operations.push(ApiTesterProductionOperationSchema.parse({
        method: method.toUpperCase(),
        path: pathName,
        ...statuses,
        securityHeaders,
        fields: fields.sort((left, right) => compareText(fieldKey(left), fieldKey(right))),
      }));
    }
  }
  if (operations.length === 0) unsupported("INVALID_OPENAPI", "no supported operations were found");
  operations.sort((left, right) =>
    compareText(left.path, right.path) || compareText(left.method, right.method));
  return ApiTesterProductionContractSchema.parse({
    schemaVersion: API_TESTER_PRODUCTION_CONTRACT_SCHEMA_VERSION,
    supportContractId: API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID,
    operations,
  });
}
