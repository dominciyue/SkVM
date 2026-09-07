import { z } from "zod";
import { parse as parseYaml } from "yaml";
import { SafeRelativePathSchema } from "../benchmarks/skill-ir/artifact-package";
import {
  ApiTesterProductionUnsupportedError,
  type ApiTesterProductionUnsupportedCode,
} from "./api-tester-production-contract";

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;
const FIELD_LOCATIONS = ["body", "path", "query", "header"] as const;
const SCALAR_TYPES = ["string", "integer", "number", "boolean"] as const;
const SCALAR_FORMATS = ["email", "uri", "date", "float", "double"] as const;
const MAX_CONSTRUCTED_ARRAY_ITEMS = 64;

export const API_TESTER_PRODUCTION_BINDING_SCHEMA_VERSION_V2 =
  "skill-ir-api-tester-production-binding/v2" as const;
export const API_TESTER_PRODUCTION_CONTRACT_SCHEMA_VERSION_V2 =
  "skill-ir-api-tester-public-contract/v2" as const;
export const API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2 =
  "api-tester-openapi-subset-v2" as const;

export const ApiTesterProductionBindingSchemaV2 = z.object({
  schemaVersion: z.literal(API_TESTER_PRODUCTION_BINDING_SCHEMA_VERSION_V2),
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
      message: "API Tester production v2 input and output paths must be distinct",
    });
  }
  const extensionMatches = binding.input.format === "json"
    ? binding.input.path.toLowerCase().endsWith(".json")
    : /\.ya?ml$/iu.test(binding.input.path);
  if (!extensionMatches) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["input", "path"],
      message: "API Tester production v2 input extension must match the declared format",
    });
  }
});

export type ApiTesterProductionBindingV2 = z.infer<typeof ApiTesterProductionBindingSchemaV2>;

const ScalarValueShape = {
  type: z.enum(SCALAR_TYPES),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().nonnegative().optional(),
  minimum: z.number().finite().optional(),
  maximum: z.number().finite().optional(),
  enumValues: z.array(z.unknown()).min(1).optional(),
  format: z.enum(SCALAR_FORMATS).optional(),
};

function refineScalarContract(
  value: z.infer<z.ZodObject<typeof ScalarValueShape>>,
  context: z.RefinementCtx,
): void {
  if (value.type !== "string"
    && (value.minLength !== undefined || value.maxLength !== undefined
      || ["email", "uri", "date"].includes(value.format ?? ""))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "String constraints require a string type" });
  }
  if (!["integer", "number"].includes(value.type)
    && (value.minimum !== undefined || value.maximum !== undefined
      || ["float", "double"].includes(value.format ?? ""))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Numeric constraints require a numeric type" });
  }
}

export const ApiTesterProductionScalarValueSchemaV2 = z.object(ScalarValueShape)
  .strict()
  .superRefine(refineScalarContract);

export type ApiTesterProductionScalarValueV2 = z.infer<
  typeof ApiTesterProductionScalarValueSchemaV2
>;

const FieldBaseShape = {
  location: z.enum(FIELD_LOCATIONS),
  name: z.string().min(1),
  required: z.boolean(),
};

const ScalarFieldSchema = z.object({
  kind: z.literal("scalar"),
  ...FieldBaseShape,
  ...ScalarValueShape,
}).strict().superRefine(refineScalarContract);

const QueryArrayFieldSchema = z.object({
  kind: z.literal("array"),
  location: z.literal("query"),
  name: z.string().min(1),
  required: z.boolean(),
  items: ApiTesterProductionScalarValueSchemaV2,
  minItems: z.number().int().nonnegative().max(MAX_CONSTRUCTED_ARRAY_ITEMS).optional(),
  maxItems: z.number().int().nonnegative().max(MAX_CONSTRUCTED_ARRAY_ITEMS).optional(),
  uniqueItems: z.literal(true).optional(),
  encoding: z.object({
    style: z.literal("form"),
    explode: z.boolean(),
    wireFormat: z.enum(["repeated-value", "comma-separated"]),
  }).strict(),
}).strict().superRefine((field, context) => {
  const expected = field.encoding.explode ? "repeated-value" : "comma-separated";
  if (field.encoding.wireFormat !== expected) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Query array wire format/explode mismatch" });
  }
});

const BodyArrayFieldSchema = z.object({
  kind: z.literal("array"),
  location: z.literal("body"),
  name: z.string().min(1),
  required: z.boolean(),
  items: ApiTesterProductionScalarValueSchemaV2,
  minItems: z.number().int().nonnegative().max(MAX_CONSTRUCTED_ARRAY_ITEMS).optional(),
  maxItems: z.number().int().nonnegative().max(MAX_CONSTRUCTED_ARRAY_ITEMS).optional(),
  uniqueItems: z.literal(true).optional(),
}).strict();

export const ApiTesterProductionFieldSchemaV2 = z.union([
  ScalarFieldSchema,
  QueryArrayFieldSchema,
  BodyArrayFieldSchema,
]);

export type ApiTesterProductionFieldV2 = z.infer<typeof ApiTesterProductionFieldSchemaV2>;

export const ApiTesterProductionOperationSchemaV2 = z.object({
  method: z.enum(["GET", "PUT", "POST", "DELETE", "OPTIONS", "HEAD", "PATCH", "TRACE"]),
  path: z.string().startsWith("/"),
  successStatuses: z.array(z.number().int().min(200).max(299)).min(1),
  errorStatuses: z.array(z.number().int().min(400).max(599)),
  securityHeaders: z.array(z.string().min(1)),
  fields: z.array(ApiTesterProductionFieldSchemaV2),
}).strict();

export const ApiTesterProductionContractSchemaV2 = z.object({
  schemaVersion: z.literal(API_TESTER_PRODUCTION_CONTRACT_SCHEMA_VERSION_V2),
  supportContractId: z.literal(API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2),
  operations: z.array(ApiTesterProductionOperationSchemaV2).min(1),
}).strict();

export type ApiTesterProductionContractV2 = z.infer<typeof ApiTesterProductionContractSchemaV2>;

type JsonRecord = Record<string, unknown>;
type ComponentKind = "parameters" | "requestBodies" | "schemas" | "securitySchemes";

function unsupported(code: ApiTesterProductionUnsupportedCode, message: string): never {
  throw new ApiTesterProductionUnsupportedError(code, message);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fieldKey(field: ApiTesterProductionFieldV2): string {
  return `${field.location}:${field.name}`;
}

function sortedNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function decodePointerToken(value: string, label: string): string {
  if (/~(?:[^01]|$)/u.test(value)) {
    unsupported("UNSUPPORTED_REFERENCE", `${label} contains an invalid JSON Pointer escape`);
  }
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}

function resolveComponentReference(
  document: JsonRecord,
  value: JsonRecord,
  expectedKind: ComponentKind,
  label: string,
  stack: string[] = [],
): JsonRecord {
  if (!Object.prototype.hasOwnProperty.call(value, "$ref")) return value;
  if (Object.keys(value).length !== 1 || !nonEmptyString(value.$ref)) {
    unsupported("UNSUPPORTED_REFERENCE", `${label} reference must contain only one string $ref`);
  }
  const ref = String(value.$ref);
  const prefix = `#/components/${expectedKind}/`;
  if (!ref.startsWith(prefix)) {
    unsupported("UNSUPPORTED_REFERENCE", `${label} must reference ${prefix}<name>`);
  }
  if (stack.includes(ref)) {
    unsupported("UNSUPPORTED_REFERENCE", `${label} contains a cyclic local reference: ${[...stack, ref].join(" -> ")}`);
  }
  const tokens = ref.slice(2).split("/").map((token) => decodePointerToken(token, label));
  if (tokens.length !== 3 || tokens[0] !== "components" || tokens[1] !== expectedKind || !tokens[2]) {
    unsupported("UNSUPPORTED_REFERENCE", `${label} must target one named ${expectedKind} component`);
  }
  let target: unknown = document;
  for (const token of tokens) {
    if (!isRecord(target) || !Object.prototype.hasOwnProperty.call(target, token)) {
      unsupported("UNSUPPORTED_REFERENCE", `${label} points to a missing target: ${ref}`);
    }
    target = target[token];
  }
  if (!isRecord(target)) {
    unsupported("UNSUPPORTED_REFERENCE", `${label} target must be an object: ${ref}`);
  }
  return resolveComponentReference(document, target, expectedKind, label, [...stack, ref]);
}

function parseFiniteNumber(value: unknown, key: string, fieldKeyValue: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    unsupported("UNSUPPORTED_SCHEMA", `${fieldKeyValue}.${key} must be a finite number`);
  }
  return value;
}

function parseLength(value: unknown, key: string, fieldKeyValue: string): number | undefined {
  const parsed = parseFiniteNumber(value, key, fieldKeyValue);
  if (parsed !== undefined && (!Number.isInteger(parsed) || parsed < 0)) {
    unsupported("UNSUPPORTED_SCHEMA", `${fieldKeyValue}.${key} must be a non-negative integer`);
  }
  return parsed;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}

function scalarMatches(field: ApiTesterProductionScalarValueV2, value: unknown): boolean {
  if (field.type === "string" && typeof value !== "string") return false;
  if (field.type === "integer" && (typeof value !== "number" || !Number.isInteger(value))) return false;
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
    if (field.format === "date" && !validDate(value)) return false;
  }
  if (typeof value === "number") {
    if (field.minimum !== undefined && value < field.minimum) return false;
    if (field.maximum !== undefined && value > field.maximum) return false;
  }
  return true;
}

function constructString(field: ApiTesterProductionScalarValueV2, variant = 0): string | undefined {
  const minimum = field.minLength ?? 0;
  const maximum = field.maxLength ?? Number.POSITIVE_INFINITY;
  if (minimum > maximum) return undefined;
  const token = variant < 62
    ? "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"[variant]!
    : variant.toString(36);
  if (field.format === "email") {
    const suffix = "@b.co";
    const localLength = Math.max(1, minimum - suffix.length);
    const value = `${"a".repeat(Math.max(0, localLength - token.length))}${token}${suffix}`;
    return value.length <= maximum ? value : undefined;
  }
  if (field.format === "uri") {
    const base = `https://a.co/${token}`;
    const value = base.length >= minimum ? base : `${base}${"x".repeat(minimum - base.length)}`;
    return value.length <= maximum ? value : undefined;
  }
  if (field.format === "date") {
    const value = new Date(Date.UTC(2000, 0, variant + 1)).toISOString().slice(0, 10);
    return value.length >= minimum && value.length <= maximum ? value : undefined;
  }
  if (maximum === 0) return variant === 0 ? "" : undefined;
  const length = Math.max(1, minimum, token.length);
  if (length > maximum) return undefined;
  return `${"x".repeat(Math.max(0, length - token.length))}${token}`;
}

function uniqueValues(values: unknown[]): unknown[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scalarCandidates(field: ApiTesterProductionScalarValueV2, count: number): unknown[] {
  if (field.enumValues) {
    return uniqueValues(field.enumValues.filter((candidate) => scalarMatches(field, candidate)))
      .map((candidate) => structuredClone(candidate));
  }
  if (field.type === "integer") {
    const lower = Math.ceil(field.minimum ?? 1);
    const upper = Math.floor(field.maximum ?? lower + Math.max(count, 2) - 1);
    return Array.from({ length: Math.max(0, Math.min(Math.max(count, 2), upper - lower + 1)) },
      (_unused, index) => lower + index).filter((value) => scalarMatches(field, value));
  }
  if (field.type === "number") {
    const lower = field.minimum ?? 1;
    const upper = field.maximum;
    const target = Math.max(count, 2);
    const values = upper === undefined
      ? Array.from({ length: target }, (_unused, index) => lower + index)
      : upper < lower ? []
      : upper === lower ? [lower]
      : Array.from({ length: target }, (_unused, index) => lower + ((upper - lower) * index) / (target - 1));
    return uniqueValues(values.filter((value) => scalarMatches(field, value)));
  }
  if (field.type === "boolean") {
    return [true, false].filter((value) => scalarMatches(field, value));
  }
  const candidates: unknown[] = [];
  for (let index = 0; index < Math.max(count * 2, 64); index++) {
    const value = constructString(field, index);
    if (value !== undefined && scalarMatches(field, value)) candidates.push(value);
    if (uniqueValues(candidates).length >= count) break;
  }
  return uniqueValues(candidates);
}

export function constructApiTesterProductionValidScalarV2(
  field: ApiTesterProductionScalarValueV2,
): unknown {
  const parsed = ApiTesterProductionScalarValueSchemaV2.parse(field);
  const value = scalarCandidates(parsed, 1)[0];
  if (value === undefined) {
    unsupported("UNCONSTRUCTIBLE_CONSTRAINT", "scalar constraints cannot produce a valid value");
  }
  return structuredClone(value);
}

export function constructApiTesterProductionValidValueV2(
  field: ApiTesterProductionFieldV2,
): unknown {
  const parsed = ApiTesterProductionFieldSchemaV2.parse(field);
  if (parsed.kind === "scalar") {
    const { kind: _kind, location: _location, name: _name, required: _required, ...scalar } = parsed;
    return constructApiTesterProductionValidScalarV2(scalar);
  }
  const minimum = parsed.minItems ?? 0;
  const maximum = parsed.maxItems ?? MAX_CONSTRUCTED_ARRAY_ITEMS;
  if (minimum > maximum) {
    unsupported("UNCONSTRUCTIBLE_CONSTRAINT", `${fieldKey(parsed)} minItems exceeds maxItems`);
  }
  const count = minimum === 0 && maximum > 0 ? 1 : minimum;
  const candidates = scalarCandidates(parsed.items, parsed.uniqueItems ? count : 1);
  if (count > 0 && candidates.length === 0) {
    unsupported("UNCONSTRUCTIBLE_CONSTRAINT", `${fieldKey(parsed)} items have no supported valid value`);
  }
  if (parsed.uniqueItems && candidates.length < count) {
    unsupported("UNCONSTRUCTIBLE_CONSTRAINT", `${fieldKey(parsed)} cannot construct ${count} unique items`);
  }
  return parsed.uniqueItems
    ? candidates.slice(0, count).map((candidate) => structuredClone(candidate))
    : Array.from({ length: count }, () => structuredClone(candidates[0]));
}

const DESCRIPTIVE_SCHEMA_KEYS = new Set([
  "type", "minLength", "maxLength", "minimum", "maximum", "enum", "format",
  "description", "title", "example", "default", "deprecated", "readOnly", "writeOnly",
]);

const ARRAY_SCHEMA_KEYS = new Set([
  "type", "items", "minItems", "maxItems", "uniqueItems",
  "description", "title", "example", "default", "deprecated", "readOnly", "writeOnly",
]);

function parseScalarSchema(
  input: JsonRecord,
  fieldKeyValue: string,
): ApiTesterProductionScalarValueV2 {
  const unknownKeys = Object.keys(input).filter((key) => !DESCRIPTIVE_SCHEMA_KEYS.has(key) && !key.startsWith("x-"));
  if (unknownKeys.length > 0) {
    unsupported("UNSUPPORTED_SCHEMA", `${fieldKeyValue} uses unsupported schema keys: ${unknownKeys.join(", ")}`);
  }
  if (!SCALAR_TYPES.includes(input.type as typeof SCALAR_TYPES[number])) {
    unsupported("UNSUPPORTED_SCHEMA", `${fieldKeyValue} requires an explicit primitive type`);
  }
  const type = input.type as ApiTesterProductionScalarValueV2["type"];
  const minLength = parseLength(input.minLength, "minLength", fieldKeyValue);
  const maxLength = parseLength(input.maxLength, "maxLength", fieldKeyValue);
  const minimum = parseFiniteNumber(input.minimum, "minimum", fieldKeyValue);
  const maximum = parseFiniteNumber(input.maximum, "maximum", fieldKeyValue);
  const format = input.format;
  if (type !== "string" && (minLength !== undefined || maxLength !== undefined)) {
    unsupported("UNSUPPORTED_SCHEMA", `${fieldKeyValue} applies string constraints to ${type}`);
  }
  if (!["integer", "number"].includes(type) && (minimum !== undefined || maximum !== undefined)) {
    unsupported("UNSUPPORTED_SCHEMA", `${fieldKeyValue} applies numeric constraints to ${type}`);
  }
  const supportedFormats = type === "string" ? ["email", "uri", "date"]
    : ["integer", "number"].includes(type) ? ["float", "double"] : [];
  if (format !== undefined && !supportedFormats.includes(String(format))) {
    unsupported("UNSUPPORTED_SCHEMA", `${fieldKeyValue} uses unsupported format ${String(format)} for ${type}`);
  }
  if (input.enum !== undefined && (!Array.isArray(input.enum) || input.enum.length === 0)) {
    unsupported("UNSUPPORTED_SCHEMA", `${fieldKeyValue} enum must be a non-empty array`);
  }
  const scalar = ApiTesterProductionScalarValueSchemaV2.parse({
    type,
    ...(minLength !== undefined ? { minLength } : {}),
    ...(maxLength !== undefined ? { maxLength } : {}),
    ...(minimum !== undefined ? { minimum } : {}),
    ...(maximum !== undefined ? { maximum } : {}),
    ...(Array.isArray(input.enum) ? { enumValues: structuredClone(input.enum) } : {}),
    ...(format !== undefined ? { format } : {}),
  });
  constructApiTesterProductionValidScalarV2(scalar);
  return scalar;
}

function parseField(input: {
  document: JsonRecord;
  location: ApiTesterProductionFieldV2["location"];
  name: string;
  schema: JsonRecord;
  required: boolean;
  parameter?: JsonRecord;
}): ApiTesterProductionFieldV2 {
  const fieldKeyValue = `${input.location}:${input.name}`;
  const schema = resolveComponentReference(input.document, input.schema, "schemas", `${fieldKeyValue} schema`);
  if (schema.type !== "array") {
    const scalar = parseScalarSchema(schema, fieldKeyValue);
    const field = ApiTesterProductionFieldSchemaV2.parse({
      kind: "scalar",
      location: input.location,
      name: input.name,
      required: input.required,
      ...scalar,
    });
    constructApiTesterProductionValidValueV2(field);
    return field;
  }
  const unknownKeys = Object.keys(schema).filter((key) => !ARRAY_SCHEMA_KEYS.has(key) && !key.startsWith("x-"));
  if (unknownKeys.length > 0) {
    unsupported("UNSUPPORTED_SCHEMA", `${fieldKeyValue} uses unsupported array keys: ${unknownKeys.join(", ")}`);
  }
  if (!["body", "query"].includes(input.location)) {
    unsupported("UNSUPPORTED_PARAMETER", `${fieldKeyValue} array location is unsupported`);
  }
  if (!isRecord(schema.items)) {
    unsupported("UNSUPPORTED_SCHEMA", `${fieldKeyValue} array requires one primitive items schema`);
  }
  const resolvedItems = resolveComponentReference(input.document, schema.items, "schemas", `${fieldKeyValue} items`);
  const items = parseScalarSchema(resolvedItems, `${fieldKeyValue}[]`);
  const minItems = parseLength(schema.minItems, "minItems", fieldKeyValue);
  const maxItems = parseLength(schema.maxItems, "maxItems", fieldKeyValue);
  if ((minItems ?? 0) > MAX_CONSTRUCTED_ARRAY_ITEMS || (maxItems ?? 0) > MAX_CONSTRUCTED_ARRAY_ITEMS) {
    unsupported("UNSUPPORTED_SCHEMA", `${fieldKeyValue} array bound exceeds ${MAX_CONSTRUCTED_ARRAY_ITEMS}`);
  }
  if (schema.uniqueItems !== undefined && schema.uniqueItems !== true && schema.uniqueItems !== false) {
    unsupported("UNSUPPORTED_SCHEMA", `${fieldKeyValue}.uniqueItems must be boolean`);
  }
  if (maxItems === 0) {
    unsupported("UNCONSTRUCTIBLE_CONSTRAINT", `${fieldKeyValue} cannot witness its item contract when maxItems is zero`);
  }
  const common = {
    kind: "array" as const,
    location: input.location,
    name: input.name,
    required: input.required,
    items,
    ...(minItems !== undefined ? { minItems } : {}),
    ...(maxItems !== undefined ? { maxItems } : {}),
    ...(schema.uniqueItems === true ? { uniqueItems: true as const } : {}),
  };
  let field: ApiTesterProductionFieldV2;
  if (input.location === "query") {
    const style = input.parameter?.style ?? "form";
    const explode = input.parameter?.explode ?? true;
    if (style !== "form" || typeof explode !== "boolean") {
      unsupported("UNSUPPORTED_PARAMETER", `${fieldKeyValue} supports query style=form with boolean explode only`);
    }
    field = ApiTesterProductionFieldSchemaV2.parse({
      ...common,
      location: "query",
      encoding: {
        style: "form",
        explode,
        wireFormat: explode ? "repeated-value" : "comma-separated",
      },
    });
  } else {
    field = ApiTesterProductionFieldSchemaV2.parse({ ...common, location: "body" });
  }
  constructApiTesterProductionValidValueV2(field);
  return field;
}

function parseParameters(document: JsonRecord, value: unknown, label: string): ApiTesterProductionFieldV2[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) unsupported("UNSUPPORTED_PARAMETER", `${label} parameters must be an array`);
  const fields: ApiTesterProductionFieldV2[] = [];
  for (const [index, rawParameter] of value.entries()) {
    if (!isRecord(rawParameter)) {
      unsupported("UNSUPPORTED_PARAMETER", `${label} parameter ${index} must be an object`);
    }
    const parameter = resolveComponentReference(
      document,
      rawParameter,
      "parameters",
      `${label} parameter ${index}`,
    );
    if (!isRecord(parameter.schema)) {
      unsupported("UNSUPPORTED_PARAMETER", `${label} parameter ${index} must have a schema`);
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
      document,
      location: location as "path" | "query" | "header",
      name,
      schema: parameter.schema,
      required: parameter.required === true,
      parameter,
    }));
  }
  return fields;
}

function parseRequestBody(document: JsonRecord, value: unknown, label: string): ApiTesterProductionFieldV2[] {
  if (value === undefined) return [];
  if (!isRecord(value)) unsupported("UNSUPPORTED_REQUEST_BODY", `${label} requestBody must be an object`);
  const requestBody = resolveComponentReference(document, value, "requestBodies", `${label} requestBody`);
  if (!isRecord(requestBody.content)) {
    unsupported("UNSUPPORTED_REQUEST_BODY", `${label} requestBody must have content`);
  }
  if (Object.keys(requestBody.content).length !== 1 || !isRecord(requestBody.content["application/json"])) {
    unsupported("UNSUPPORTED_REQUEST_BODY", `${label} supports application/json only`);
  }
  const media = requestBody.content["application/json"] as JsonRecord;
  if (!isRecord(media.schema)) {
    unsupported("UNSUPPORTED_REQUEST_BODY", `${label} application/json must have a schema`);
  }
  const bodySchema = resolveComponentReference(document, media.schema, "schemas", `${label} body schema`);
  if (bodySchema.type !== "object" || !isRecord(bodySchema.properties)) {
    unsupported("UNSUPPORTED_REQUEST_BODY", `${label} requires an object schema with properties`);
  }
  const bodySchemaKeys = Object.keys(bodySchema).filter((key) =>
    !["type", "properties", "required", "description", "title", "example"].includes(key) && !key.startsWith("x-"));
  if (bodySchemaKeys.length > 0) {
    unsupported("UNSUPPORTED_REQUEST_BODY", `${label} body uses unsupported keys: ${bodySchemaKeys.join(", ")}`);
  }
  const requiredList = bodySchema.required === undefined ? [] : bodySchema.required;
  if (!Array.isArray(requiredList) || requiredList.some((entry) => typeof entry !== "string")
    || new Set(requiredList).size !== requiredList.length) {
    unsupported("UNSUPPORTED_REQUEST_BODY", `${label} body required must be a unique string array`);
  }
  const propertyNames = Object.keys(bodySchema.properties);
  if (requiredList.some((name) => !propertyNames.includes(String(name)))) {
    unsupported("UNSUPPORTED_REQUEST_BODY", `${label} body requires an undeclared property`);
  }
  return propertyNames.sort(compareText).map((name) => {
    const property = (bodySchema.properties as JsonRecord)[name];
    if (!isRecord(property)) {
      unsupported("UNSUPPORTED_REQUEST_BODY", `${label} body property ${name} must be a schema object`);
    }
    return parseField({
      document,
      location: "body",
      name,
      schema: property,
      required: requiredList.includes(name),
    });
  });
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
    const rawScheme = schemes[schemeName];
    if (!isRecord(rawScheme)) {
      unsupported("UNSUPPORTED_SECURITY", `${label} references unknown security scheme ${schemeName}`);
    }
    const scheme = resolveComponentReference(
      document,
      rawScheme,
      "securitySchemes",
      `${label} security scheme ${schemeName}`,
    );
    if (scheme.type === "http" && String(scheme.scheme).toLowerCase() === "bearer") {
      headers.add("Authorization");
    } else if (scheme.type === "apiKey" && scheme.in === "header" && nonEmptyString(scheme.name)) {
      headers.add(String(scheme.name));
    } else {
      unsupported("UNSUPPORTED_SECURITY", `${label} security scheme ${schemeName} is unsupported`);
    }
  }
  if (headers.size === 0) unsupported("UNSUPPORTED_SECURITY", `${label} security requirement is empty`);
  return [...headers].sort(compareText);
}

export function parseApiTesterProductionBindingV2(value: unknown): ApiTesterProductionBindingV2 {
  return ApiTesterProductionBindingSchemaV2.parse(value);
}

export function parseApiTesterProductionDocumentV2(
  text: string,
  format: ApiTesterProductionBindingV2["input"]["format"],
): unknown {
  try {
    return format === "json" ? JSON.parse(text) : parseYaml(text);
  } catch (error) {
    unsupported("INVALID_OPENAPI", error instanceof Error ? error.message : String(error));
  }
}

export function buildApiTesterProductionContractV2(value: unknown): ApiTesterProductionContractV2 {
  if (!isRecord(value) || !nonEmptyString(value.openapi) || !String(value.openapi).startsWith("3.")
    || !isRecord(value.paths) || Object.keys(value.paths).length === 0) {
    unsupported("INVALID_OPENAPI", "expected OpenAPI 3.x with non-empty paths");
  }
  if (value.webhooks !== undefined || value.callbacks !== undefined) {
    unsupported("UNSUPPORTED_OPENAPI_FEATURE", "top-level webhooks/callbacks are unsupported");
  }
  const operations: ApiTesterProductionContractV2["operations"] = [];
  for (const pathName of Object.keys(value.paths).sort(compareText)) {
    const pathItem = value.paths[pathName];
    if (!pathName.startsWith("/") || !isRecord(pathItem)) {
      unsupported("INVALID_OPENAPI", `invalid path item ${pathName}`);
    }
    if (Object.prototype.hasOwnProperty.call(pathItem, "$ref")) {
      unsupported("UNSUPPORTED_REFERENCE", `${pathName} path-item references are outside v2`);
    }
    const sharedFields = parseParameters(value, pathItem.parameters, pathName);
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
        ...parseParameters(value, operation.parameters, operationKey),
        ...parseRequestBody(value, operation.requestBody, operationKey),
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
      operations.push(ApiTesterProductionOperationSchemaV2.parse({
        method: method.toUpperCase(),
        path: pathName,
        ...statuses,
        securityHeaders,
        fields: fields.sort((left, right) => compareText(fieldKey(left), fieldKey(right))),
      }));
    }
  }
  if (operations.length === 0) unsupported("INVALID_OPENAPI", "no supported operations were found");
  operations.sort((left, right) => compareText(left.path, right.path) || compareText(left.method, right.method));
  return ApiTesterProductionContractSchemaV2.parse({
    schemaVersion: API_TESTER_PRODUCTION_CONTRACT_SCHEMA_VERSION_V2,
    supportContractId: API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2,
    operations,
  });
}
