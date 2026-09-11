import { createHash } from "node:crypto";
import { parseApiTesterOperationSource } from "./api-tester-operation-source";
import { createResponseSchemaChecker, type SchemaValueCheck } from "./api-schema-checker";
type Raw = Record<string, any>;
const object = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const token = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Source-bound field constraints only; no HTTP request, status inference or framing proof. */
export function checkApiResponseHeaders(source: string, format: "json" | "yaml", observation: unknown) {
  const result = { sourceSha256: sha(source), sourceFormat: format, observationSha256: null as string | null,
    status: "unresolved" as "unresolved" | "checked" | "invalid-observation", valid: null as boolean | null,
    responseKey: null as string | null, sourceEnumerationComplete: false,
    headers: [] as Array<{ name: string; locator: string; status: string; valid: boolean | null; value?: unknown; errors: string[]; schemaCheck?: SchemaValueCheck }>,
    unclaimedObservedHeaders: [] as string[], errors: [] as string[], wholeResponseVerified: false,
    remainingObligations: ["body-and-media", "protocol-header-semantics-and-framing", "repeated-header-combination", "business-status-trigger", "live-observation-provenance"] };
  if (!object(observation) || typeof observation.operationKey !== "string" || !Number.isInteger(observation.statusCode)
    || observation.statusCode < 100 || observation.statusCode > 599 || !Array.isArray(observation.headers) || observation.headers.length > 64
    || observation.headers.some((h: unknown) => !object(h) || typeof h.name !== "string" || !token.test(h.name)
      || typeof h.value !== "string" || Buffer.byteLength(h.value, "utf8") > 4096 || /[\u0000-\u001f\u007f]/u.test(h.value))) {
    result.status = "invalid-observation"; result.errors.push("INVALID_HEADER_OBSERVATION"); return result;
  }
  const observed = new Map<string, { name: string; value: string }>();
  for (const h of observation.headers) {
    if (observed.has(h.name.toLowerCase())) { result.status = "invalid-observation"; result.errors.push("DUPLICATE_OBSERVED_HEADER"); return result; }
    observed.set(h.name.toLowerCase(), h);
  }
  result.observationSha256 = sha(JSON.stringify([observation.operationKey, observation.statusCode, observation.headers]));
  try {
    const parsed = parseApiTesterOperationSource(source, format), doc = parsed.document;
    result.sourceEnumerationComplete = parsed.enumeration.complete;
    if (!doc || !/^3\.0\./u.test(String(doc.openapi))) throw new Error("OpenAPI3.0 source required");
    function resolveRef(raw: unknown): Raw {
      let value = raw; const seen = new Set<string>();
      while (object(value) && Object.hasOwn(value, "$ref")) {
        const ref = value.$ref;
        if (typeof ref !== "string" || !ref.startsWith("#/") || seen.has(ref) || seen.size >= 32
          || Object.keys(value).some(k => !["$ref", "summary", "description"].includes(k))) throw new Error("unsupported reference");
        seen.add(ref); value = doc;
        for (const part of ref.slice(2).split("/")) {
          if (/~(?:[^01]|$)/u.test(part)) throw new Error("invalid pointer");
          const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
          if (!object(value) || !Object.hasOwn(value, key)) throw new Error("missing reference");
          value = value[key];
        }
      }
      if (!object(value)) throw new Error("declaration object required");
      return value;
    }
    function decode(schema: Raw, wire: string): unknown {
      if (schema.type === "string") return wire;
      if (schema.type === "boolean") { if (!["true", "false"].includes(wire)) throw new Error("invalid boolean wire"); return wire === "true"; }
      if (["integer", "number"].includes(schema.type)) {
        if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u.test(wire)) throw new Error("invalid numeric wire");
        const value = Number(wire);
        if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) throw new Error("unsafe numeric wire");
        return value;
      }
      throw new Error("unsupported scalar schema");
    }
    const op = parsed.enumeration.operations.find(o => o.key === observation.operationKey);
    if (!op) throw new Error("operation unavailable");
    const responses = (doc.paths as Raw)[op.path][op.method.toLowerCase()].responses;
    if (!object(responses) || Object.keys(responses).some(k => !/^(?:[1-5][0-9]{2}|[1-5]XX|default|x-.+)$/u.test(k))) throw new Error("unsupported responses map");
    const exact = String(observation.statusCode), range = `${Math.floor(observation.statusCode / 100)}XX`;
    const selected = Object.hasOwn(responses, exact) ? exact : Object.hasOwn(responses, range) ? range : Object.hasOwn(responses, "default") ? "default" : null;
    if (!selected) { result.status = "checked"; result.valid = false; result.errors.push("RESPONSE_STATUS_UNDECLARED"); return result; }
    result.responseKey = selected;
    const response = resolveRef(responses[selected]);
    if (typeof response.description !== "string" || (response.headers !== undefined && !object(response.headers))) throw new Error("invalid response declaration");
    const declarations = Object.entries(response.headers ?? {}), names = new Set<string>(), ambiguous = new Set<string>();
    for (const [name] of declarations) {
      if (!token.test(name) || names.has(name.toLowerCase())) ambiguous.add(name.toLowerCase());
      names.add(name.toLowerCase());
    }
    result.unclaimedObservedHeaders = [...observed.values()].filter(h => !names.has(h.name.toLowerCase())).map(h => h.name).sort();
    for (const [name, raw] of declarations) {
      const locator = `${op.key}/responses/${selected}/headers/${name.replaceAll("~", "~0").replaceAll("/", "~1")}`;
      const row: typeof result.headers[number] = { name, locator, status: "unresolved", valid: null, errors: [] };
      result.headers.push(row);
      if (ambiguous.has(name.toLowerCase())) { row.errors.push("INVALID_OR_AMBIGUOUS_SOURCE_HEADER_NAME"); continue; }
      if (name.toLowerCase() === "content-type") { row.status = "ignored-content-type"; continue; }
      try {
        const header = resolveRef(raw);
        if (Object.keys(header).some(k => !["description", "required", "deprecated", "style", "explode", "schema", "example", "examples"].includes(k) && !k.startsWith("x-"))
          || header.schema === undefined || (header.required !== undefined && typeof header.required !== "boolean")
          || (header.style !== undefined && header.style !== "simple") || (header.explode !== undefined && typeof header.explode !== "boolean")) throw new Error("unsupported header semantics");
        const schema = resolveRef(header.schema), element = schema.type === "array" ? resolveRef(schema.items) : schema;
        if (!["string", "boolean", "integer", "number"].includes(element.type)) throw new Error("unsupported header value type");
        const check = createResponseSchemaChecker(doc, header.schema);
        if (check(undefined).status !== "checked") throw new Error("source schema unresolved");
        const h = observed.get(name.toLowerCase());
        if (!h) { row.status = header.required ? "missing-required" : "absent-optional"; row.valid = !header.required; if (header.required) row.errors.push("REQUIRED_HEADER_MISSING"); continue; }
        try { row.value = schema.type === "array" ? h.value.split(",").map(v => decode(element, v)) : decode(element, h.value); }
        catch (error) { row.status = "invalid-wire"; row.valid = false; row.errors.push(String(error)); continue; }
        row.schemaCheck = check(row.value); row.valid = row.schemaCheck.valid; row.status = "checked";
        if (!row.valid) row.errors.push("HEADER_SCHEMA_MISMATCH");
      } catch (error) { row.errors.push(String(error)); }
    }
    if (result.headers.some(h => h.status === "unresolved")) return result;
    result.status = "checked"; result.valid = !result.headers.some(h => h.valid === false);
  } catch (error) { result.errors.push(`HEADER_SOURCE_UNRESOLVED: ${String(error)}`); }
  return result;
}
