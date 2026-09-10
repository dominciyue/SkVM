import { createHash } from "node:crypto";

export type SchemaObligation = { id: string; kind: string; instancePath: Array<string | number>; schemaPath: string; keyword: string | null; operand?: unknown };
export type SchemaCase = SchemaObligation & { status: "covered" | "unresolved" | "not-applicable"; value?: unknown; reason: string | null; expectedHttpStatus: null };
export type SchemaCaseSet = { schemaVersion: "api-schema-cases/v1"; schemaSha256: string; sourceIssues: string[]; cases: SchemaCase[] };
export const schemaFingerprint = (document: unknown, schema: unknown) => createHash("sha256").update(JSON.stringify({ document, schema })).digest("hex");
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const token = (v: string) => v.replaceAll("~", "~0").replaceAll("/", "~1");
const enumerated = new Set(["$ref", "type", "required", "properties", "items", "additionalProperties", "allOf", "anyOf", "oneOf",
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "enum", "pattern", "format",
  "minItems", "maxItems", "uniqueItems", "minProperties", "maxProperties", "nullable", "readOnly"]);
const annotations = new Set(["title", "description", "default", "example", "examples", "deprecated", "externalDocs", "xml", "writeOnly"]);

/** Source-derived obligations. Both callers invoke it on original input, never a reported obligation list. */
export function enumerateSchemaObligations(document: unknown, schema: unknown) {
  const obligations: SchemaObligation[] = [];
  const issues: string[] = [];
  let nodes = 0;
  function add(kind: string, path: Array<string | number>, locator: string, keyword: string | null, operand?: unknown) {
    obligations.push({ id: `${locator}:${kind}`, kind, instancePath: path, schemaPath: locator, keyword, ...(operand === undefined ? {} : { operand }) });
  }
  add("valid-minimal", [], "#", null);
  add("valid-full", [], "#", null);
  function walk(raw: unknown, path: Array<string | number>, locator: string, refs: string[], depth: number) {
    if (++nodes > 4096 || depth > 24) { issues.push(`${locator}: obligation budget`); return; }
    if (!record(raw)) { issues.push(`${locator}: non-object schema`); return; }
    for (const key of Object.keys(raw)) if (!enumerated.has(key) && !annotations.has(key) && !key.startsWith("x-")) {
      issues.push(`${locator}/${token(key)}: obligation enumeration unsupported`);
    }
    if (record(raw.additionalProperties)) issues.push(`${locator}/additionalProperties: dictionary-value obligations not enumerated`);
    if (raw.$ref !== undefined) {
      if (typeof raw.$ref !== "string" || !raw.$ref.startsWith("#/") || refs.includes(raw.$ref)) { issues.push(`${locator}: unresolved reference`); return; }
      let value: any = document;
      for (const part of raw.$ref.slice(2).split("/")) {
        const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
        if (!record(value) || !Object.hasOwn(value, key)) { issues.push(`${locator}: missing reference`); return; }
        value = value[key];
      }
      walk(value, path, `${locator}/$ref`, [...refs, raw.$ref], depth + 1);
      return;
    }
    if (raw.readOnly === true) { add("read-only", path, `${locator}/readOnly`, "false schema"); return; }
    if (raw.type) add("wrong-type", path, `${locator}/type`, "type", raw.type);
    if (Array.isArray(raw.required)) for (const name of raw.required) {
      if (raw.properties?.[name]?.readOnly !== true) add("missing-required", path, `${locator}/required/${token(name)}`, "required", name);
    }
    for (const key of ["minimum", "maximum", "multipleOf", "minLength", "maxLength", "enum", "pattern", "format", "minItems", "maxItems", "uniqueItems", "minProperties", "maxProperties"]) {
      if (raw[key] === undefined || (key === "uniqueItems" && raw[key] !== true)) continue;
      const exclusive = key === "minimum" ? raw.exclusiveMinimum : key === "maximum" ? raw.exclusiveMaximum : false;
      add(key, path, `${locator}/${key}`, exclusive ? key === "minimum" ? "exclusiveMinimum" : "exclusiveMaximum" : key, { value: raw[key], exclusive: exclusive === true });
    }
    if (raw.additionalProperties === false) add("additionalProperties", path, `${locator}/additionalProperties`, "additionalProperties");
    for (const [name, prop] of Object.entries(raw.properties ?? {})) walk(prop, [...path, name], `${locator}/properties/${token(name)}`, refs, depth + 1);
    if (raw.items) walk(raw.items, [...path, 0], `${locator}/items`, refs, depth + 1);
    for (const key of ["allOf", "anyOf", "oneOf"]) if (Array.isArray(raw[key])) raw[key].forEach((part: unknown, i: number) => walk(part, path, `${locator}/${key}/${i}`, refs, depth + 1));
  }
  walk(schema, [], "#", [], 0);
  return { obligations, issues };
}

export function obligationInstancePointer(path: Array<string | number>): string {
  return path.length ? "/" + path.map((v) => token(String(v))).join("/") : "";
}
