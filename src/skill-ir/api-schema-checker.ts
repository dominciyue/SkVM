import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

type RecordValue = Record<string, any>;
const compiledSchemas = new Map<string, ValidateFunction>();
let cacheHits = 0, schemaCompiles = 0;
/** Process-local diagnostics; no validation outcomes or source material are exposed. */
export function getSchemaCheckerCacheMetrics() {
  return { hits: cacheHits, compiles: schemaCompiles, entries: compiledSchemas.size };
}
const object = (v: unknown): v is RecordValue => !!v && typeof v === "object" && !Array.isArray(v);
const annotations = new Set(["title", "description", "default", "example", "examples", "deprecated", "externalDocs", "xml", "readOnly", "writeOnly"]);
const ordinary = new Set(["type", "enum", "minimum", "maximum", "multipleOf", "minLength", "maxLength", "pattern", "format", "minItems", "maxItems", "uniqueItems", "minProperties", "maxProperties"]);
const formats = new Set(["date", "date-time", "time", "email", "hostname", "ipv4", "ipv6", "uri", "uuid", "byte", "int32", "int64", "float", "double", "password", "binary"]);

/** Deliberately bounded regex language; validation itself is performed by Ajv/ECMAScript. */
function safePattern(pattern: unknown): boolean {
  if (typeof pattern !== "string" || pattern.length > 128) return false;
  const body = pattern.replace(/^\^/u, "").replace(/\$$/u, "");
  const token = /(?:\[(?:[A-Za-z0-9_ -]|\\[dws-])+\]|\\[dws.\-]|[A-Za-z0-9_ @:/.-])(?:\{\d{1,2}(?:,\d{1,2})?\})?/uy;
  let at = 0;
  while (at < body.length) {
    token.lastIndex = at;
    const match = token.exec(body);
    if (!match) return false;
    at = token.lastIndex;
  }
  return true;
}

export type SchemaValueCheck = { status: "checked" | "unsupported" | "invalid-schema"; valid: boolean | null;
  errors: Array<{ keyword: string; instancePath: string; schemaPath: string; message: string; params: Record<string, unknown> }>; annotationsNotValidated: string[] };

/** Independent of all witness/case generation. Never receives the generator's normalized schema. */
export function createSchemaChecker(document: unknown, schema: unknown): (value: unknown) => SchemaValueCheck {
  let nodes = 0;
  const notes = new Set<string>();
  function adapt(raw: unknown, depth: number, refs: string[]): any {
    if (++nodes > 4096 || depth > 24) throw new Error("unsupported: schema traversal budget");
    if (!object(raw)) throw new Error("unsupported: OpenAPI 3.0 schema must be an object");
    if ("$ref" in raw) {
      if (typeof raw.$ref !== "string" || !raw.$ref.startsWith("#/") || refs.includes(raw.$ref)) throw new Error("unsupported: external/invalid/cyclic reference");
      if (Object.keys(raw).some((k) => k !== "$ref" && !["description", "summary"].includes(k))) throw new Error("unsupported: validation-bearing reference siblings");
      let target: unknown = document;
      for (const token of raw.$ref.slice(2).split("/")) {
        if (/~(?:[^01]|$)/u.test(token)) throw new Error("unsupported: invalid reference pointer");
        const key = token.replaceAll("~1", "/").replaceAll("~0", "~");
        if (!object(target) || !Object.hasOwn(target, key)) throw new Error("unsupported: missing reference");
        target = target[key];
      }
      return adapt(target, depth + 1, [...refs, raw.$ref]);
    }
    const result: RecordValue = {};
    for (const [key, value] of Object.entries(raw)) {
      if (annotations.has(key) || key.startsWith("x-")) { if (key.startsWith("x-")) notes.add(key); continue; }
      if (ordinary.has(key)) {
        if (key === "type" && !["object", "array", "string", "integer", "number", "boolean"].includes(value)) throw new Error("unsupported: schema type");
        if (key === "format" && !formats.has(value)) throw new Error(`unsupported: format ${value}`);
        if (key === "pattern" && !safePattern(value)) throw new Error("unsupported: pattern outside safe grammar");
        result[key] = structuredClone(value);
      } else if (["allOf", "anyOf", "oneOf"].includes(key)) {
        if (!Array.isArray(value) || !value.length || value.length > 64) throw new Error("unsupported: composition branches");
        result[key] = value.map((part) => adapt(part, depth + 1, refs));
      } else if (key === "not") result.not = adapt(value, depth + 1, refs);
      else if (key === "items") result.items = adapt(value, depth + 1, refs);
      else if (key === "additionalProperties") result.additionalProperties = typeof value === "boolean" ? value : adapt(value, depth + 1, refs);
      else if (key === "properties") {
        if (!object(value)) throw new Error("unsupported: properties must be an object");
        result.properties = Object.fromEntries(Object.entries(value).map(([name, prop]) => {
          const adapted = adapt(prop, depth + 1, refs);
          // Read-only fields are forbidden in this request-generation contract, including via refs.
          return [name, adapted];
        }));
      } else if (key === "required") {
        if (!Array.isArray(value) || value.some((v) => typeof v !== "string") || new Set(value).size !== value.length) throw new Error("unsupported: invalid required list");
        result.required = [...value];
      } else if (!["nullable", "exclusiveMinimum", "exclusiveMaximum"].includes(key)) throw new Error(`unsupported: schema keyword ${key}`);
    }
    if (raw.readOnly !== undefined && typeof raw.readOnly !== "boolean") throw new Error("unsupported: invalid readOnly");
    if (raw.format !== undefined) {
      const numeric = ["int32", "int64", "float", "double"].includes(raw.format);
      const compatible = numeric ? (["int32", "int64"].includes(raw.format) ? raw.type === "integer" : ["number", "integer"].includes(raw.type)) : raw.type === "string";
      if (!compatible) throw new Error("unsupported: format/type combination");
    }
    if (raw.readOnly === true) return false;
    if (result.properties && result.required) result.required = result.required.filter((name: string) => result.properties[name] !== false);
    if (raw.nullable !== undefined && typeof raw.nullable !== "boolean") throw new Error("unsupported: invalid nullable");
    // A standalone nullable without a local type has no effect in OAS 3.0.
    if (raw.nullable === true && typeof raw.type === "string") result.nullable = true;
    for (const [exclusive, inclusive] of [["exclusiveMinimum", "minimum"], ["exclusiveMaximum", "maximum"]]) {
      if (raw[exclusive!] !== undefined) {
        if (typeof raw[exclusive!] !== "boolean") throw new Error("unsupported: OAS 3.0 exclusive bound must be boolean");
        if (raw[exclusive!]) {
          if (typeof raw[inclusive!] !== "number") throw new Error("unsupported: exclusive bound without numeric bound");
          result[exclusive!] = raw[inclusive!];
          delete result[inclusive!];
        }
      }
    }
    return result;
  }
  try {
    const normalized = adapt(schema, 0, []);
    // Adapt source anew before lookup: object identity cannot hide reference or constraint edits.
    const key = JSON.stringify(normalized);
    let validate = compiledSchemas.get(key);
    if (validate) {
      cacheHits++;
      compiledSchemas.delete(key);
      compiledSchemas.set(key, validate);
    } else {
      const ajv = new Ajv({ strictSchema: true, strictTypes: false, strictTuples: false, strictRequired: false, allErrors: true,
        coerceTypes: false, useDefaults: false, removeAdditional: false, validateFormats: true, logger: false });
      addFormats(ajv, { mode: "full", keywords: false });
      validate = ajv.compile(normalized);
      schemaCompiles++;
      if (Buffer.byteLength(key, "utf8") <= 128 * 1024) {
        compiledSchemas.set(key, validate);
        if (compiledSchemas.size > 128) compiledSchemas.delete(compiledSchemas.keys().next().value!);
      }
    }
    const check = validate;
    return (value) => {
      const valid = check(value) as boolean;
      return { status: "checked", valid, errors: (check.errors ?? []).map((e: ErrorObject) => ({ keyword: e.keyword,
        instancePath: e.instancePath, schemaPath: e.schemaPath, message: e.message ?? "schema violation", params: structuredClone(e.params) })), annotationsNotValidated: [...notes].sort() };
    };
  } catch (error) {
    const message = String(error);
    return () => ({ status: message.includes("unsupported:") ? "unsupported" : "invalid-schema", valid: null,
      errors: [{ keyword: "schema", instancePath: "", schemaPath: "#", message, params: {} }], annotationsNotValidated: [...notes].sort() });
  }
}

export function checkSchemaValue(document: unknown, schema: unknown, value: unknown): SchemaValueCheck {
  return createSchemaChecker(document, schema)(value);
}

/** Checks witness coverage shape against source, separately from mere value validity. */
export function checkSchemaWitnessShape(document: unknown, schema: unknown, value: unknown, mode: "minimal" | "full"): boolean {
  let nodes = 0;
  function dereference(raw: any): any {
    const seen = new Set<string>();
    while (object(raw) && typeof raw.$ref === "string") {
      if (!raw.$ref.startsWith("#/") || seen.has(raw.$ref)) throw new Error("unresolved shape reference");
      seen.add(raw.$ref);
      let target: any = document;
      for (const part of raw.$ref.slice(2).split("/")) {
        const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
        if (!object(target) || !Object.hasOwn(target, key)) throw new Error("missing shape reference");
        target = target[key];
      }
      raw = target;
    }
    return raw;
  }
  function shape(raw: unknown, data: any, depth: number): boolean {
    if (++nodes > 4096 || depth > 24) return false;
    const parts: any[] = [];
    function collect(input: any, level: number) {
      if (++nodes > 4096 || level > 24) throw new Error("shape budget");
      const r = dereference(input);
      if (!object(r)) return;
      parts.push(r);
      for (const p of r.allOf ?? []) collect(p, level + 1);
      const variants = r.oneOf ?? r.anyOf;
      if (variants) {
        const selected = variants.find((p: any) => checkSchemaValue(document, p, data).valid === true);
        if (!selected) throw new Error("no applicable schema branch");
        collect(selected, level + 1);
      }
    }
    collect(raw, depth);
    if (object(data)) {
      const props = new Map<string, any[]>();
      const required = new Set<string>();
      let minimum = 0;
      for (const p of parts) {
        for (const name of p.required ?? []) required.add(name);
        minimum = Math.max(minimum, p.minProperties ?? 0);
        for (const [name, field] of Object.entries(p.properties ?? {})) props.set(name, [...(props.get(name) ?? []), field]);
      }
      const readOnly = new Set([...props].filter(([, defs]) => defs.some((d) => dereference(d)?.readOnly === true)).map(([name]) => name));
      for (const name of readOnly) required.delete(name);
      if (mode === "full" && [...props.keys()].some((name) => !readOnly.has(name) && !Object.hasOwn(data, name))) return false;
      if (mode === "minimal" && Object.keys(data).length > Math.max(required.size, minimum)) return false;
      for (const [name, defs] of props) if (Object.hasOwn(data, name) && !shape({ allOf: defs }, data[name], depth + 1)) return false;
    } else if (Array.isArray(data)) {
      const minimum = Math.max(0, ...parts.map((p) => p.minItems ?? 0));
      const maximum = Math.min(Infinity, ...parts.map((p) => p.maxItems ?? Infinity));
      if (mode === "minimal" && data.length !== minimum) return false;
      if (mode === "full" && data.length < Math.max(minimum, Math.min(1, maximum))) return false;
      const items = parts.flatMap((p) => p.items ? [p.items] : []);
      if (items.length && data.some((item) => !shape({ allOf: items }, item, depth + 1))) return false;
    }
    return true;
  }
  try { return shape(schema, value, 0); } catch { return false; }
}
