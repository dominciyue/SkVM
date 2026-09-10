import { createSchemaChecker, checkSchemaWitnessShape } from "./api-schema-checker";

type Schema = Record<string, any>;
const record = (v: unknown): v is Schema => !!v && typeof v === "object" && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export type SchemaWitness = { status: "constructed" | "unresolved" | "unsupported"; value?: unknown; attempts: number; reasons: string[] };

function resolveSchema(document: unknown, raw: unknown, seen: string[] = []): Schema {
  if (!record(raw)) throw new Error("schema is not an object");
  if (raw.$ref === undefined) return raw;
  if (typeof raw.$ref !== "string" || !raw.$ref.startsWith("#/") || seen.includes(raw.$ref)) throw new Error("unresolved reference");
  let value: any = document;
  for (const part of raw.$ref.slice(2).split("/")) {
    const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!record(value) || !Object.hasOwn(value, key)) throw new Error("missing reference");
    value = value[key];
  }
  return resolveSchema(document, value, [...seen, raw.$ref]);
}

/** Constraint-guided candidate merge, never used by the checker as source authority. */
function combine(parts: Schema[]): Schema {
  const output: Schema = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      if (key === "properties") {
        const previous = output.properties ?? {};
        output.properties = Object.fromEntries([...new Set([...Object.keys(previous), ...Object.keys(value)])].map((name) =>
          [name, previous[name] && value[name] ? { allOf: [previous[name], value[name]] } : previous[name] ?? value[name]]));
      } else if (key === "required") output.required = [...new Set([...(output.required ?? []), ...value])];
      else if (["minimum", "minLength", "minItems", "minProperties"].includes(key)) output[key] = Math.max(output[key] ?? -Infinity, value);
      else if (["maximum", "maxLength", "maxItems", "maxProperties"].includes(key)) output[key] = Math.min(output[key] ?? Infinity, value);
      else if (key === "enum" && output.enum) output.enum = output.enum.filter((v: unknown) => value.some((b: unknown) => same(v, b)));
      else if (key === "items" && output.items) output.items = { allOf: [output.items, value] };
      else if (key === "type" && output.type && output.type !== value) {
        if ([output.type, value].every((t) => ["number", "integer"].includes(t))) output.type = "integer";
        else throw new Error("conflicting candidate types");
      } else output[key] = value;
    }
  }
  return output;
}

function patternCandidate(pattern: string, variant: number): string {
  let rest = pattern.replace(/^\^/u, "").replace(/\$$/u, "");
  let result = "";
  while (rest) {
    const match = /^(\[[^\]]+\]|\\[dws.\-]|[A-Za-z0-9_ @:/.-])(?:\{(\d{1,2})(?:,(\d{1,2}))?\})?/u.exec(rest);
    if (!match) throw new Error("pattern candidate grammar");
    const token = match[1]!;
    const size = Number(match[2] ?? 1);
    if (size > 64 || result.length + size > 512) throw new Error("pattern witness budget");
    let alphabet = token;
    if (token.startsWith("[")) {
      alphabet = token.slice(1, -1).replace(/([A-Za-z0-9])-([A-Za-z0-9])/gu, (_, lo, hi) =>
        Array.from({ length: Math.max(0, hi.charCodeAt(0) - lo.charCodeAt(0) + 1) }, (_, i) => String.fromCharCode(lo.charCodeAt(0) + i)).join(""));
    }
    alphabet = alphabet.replaceAll("\\d", "0123456789").replaceAll("\\w", "abcdefghijklmnopqrstuvwxyz0123456789_").replaceAll("\\s", " ").replaceAll("\\.", ".").replaceAll("\\-", "-");
    if (!alphabet) throw new Error("empty pattern alphabet");
    result += Array.from({ length: size }, (_, i) => alphabet[(variant + i) % alphabet.length]).join("");
    rest = rest.slice(match[0].length);
  }
  return result;
}

function formatted(format: string, variant: number): unknown {
  const day = String(1 + variant % 28).padStart(2, "0");
  const values: Record<string, unknown> = { date: `2000-01-${day}`, "date-time": `2000-01-${day}T00:00:00Z`, time: "00:00:00Z",
    email: `case${variant}@example.com`, hostname: "example.com", ipv4: `192.0.2.${1 + variant % 200}`, ipv6: "2001:db8::1",
    uri: `https://example.com/case/${variant}`, uuid: `00000000-0000-4000-8000-${String(variant).padStart(12, "0")}`,
    byte: Buffer.from(`case${variant}`).toString("base64"), password: `example${variant}`, binary: `example${variant}` };
  return values[format];
}

export function constructSchemaWitness(document: unknown, raw: unknown, mode: "minimal" | "full" = "minimal"): SchemaWitness {
  const check = createSchemaChecker(document, raw);
  const readiness = check(undefined);
  if (readiness.status !== "checked") return { status: "unsupported", attempts: 0, reasons: readiness.errors.map((e) => e.message) };
  let nodes = 0;
  function build(input: unknown, variant: number, depth: number): unknown {
    if (++nodes > 4096 || depth > 24) throw new Error("witness traversal budget");
    let schema = resolveSchema(document, input);
    if (schema.allOf) {
      const { allOf, ...base } = schema;
      const expand = (s: unknown): Schema[] => {
        const r = resolveSchema(document, s);
        if (!r.allOf) return [r];
        const { allOf: branches, ...other } = r;
        return [other, ...branches.flatMap(expand)];
      };
      schema = combine([base, ...allOf.flatMap(expand)]);
    }
    const choices = schema.oneOf ?? schema.anyOf;
    if (choices) {
      const { oneOf: _one, anyOf: _any, ...base } = schema;
      const candidate = build({ allOf: [base, choices[variant % choices.length]] }, variant, depth + 1);
      // A branch-valid object can also satisfy a competitor. Explore bounded, source-named
      // distinguishing values; the original whole-schema oracle remains authoritative.
      if (schema.oneOf && mode === "full" && record(candidate) && variant >= choices.length
        && createSchemaChecker(document, input)(candidate).valid !== true) {
        const names = [...new Set<string>(choices.flatMap((choice: unknown) =>
          Object.keys(resolveSchema(document, choice).properties ?? {})))].sort();
        const round = Math.floor(variant / choices.length) - 1;
        const name = names[round % names.length];
        const values = [null, "", 0, false, [], {}];
        if (name !== undefined && (Object.hasOwn(candidate, name) || Object.keys(candidate).length < 64)) {
          Object.defineProperty(candidate, name, { value: structuredClone(values[Math.floor(round / names.length) % values.length]),
            enumerable: true, configurable: true, writable: true });
        }
      }
      return candidate;
    }
    if (schema.enum) {
      if (!schema.enum.length) throw new Error("no candidate enum values");
      return structuredClone(schema.enum[variant % schema.enum.length]);
    }
    const kind = schema.type ?? (schema.properties || schema.required ? "object" : schema.items ? "array" : "string");
    if (kind === "object") {
      const properties = schema.properties ?? {};
      const required: string[] = schema.required ?? [];
      const names = (mode === "full" ? [...new Set([...required, ...Object.keys(properties)])] : [...required]).sort();
      const pairs: Array<[string, unknown]> = [];
      for (const name of names) {
        const child = properties[name] ?? schema.additionalProperties;
        if (record(child) && resolveSchema(document, child).readOnly === true) continue;
        if (child === false) throw new Error("required field forbidden by additionalProperties");
        pairs.push([name, build(record(child) ? child : {}, variant, depth + 1)]);
      }
      const minimum = schema.minProperties ?? 0;
      if (minimum > 64 || pairs.length > 64) throw new Error("object size budget");
      for (let i = 0; pairs.length < minimum; i++) {
        const name = Object.keys(properties).find((n) => !pairs.some(([p]) => p === n) && resolveSchema(document, properties[n]).readOnly !== true) ?? `extra${i}`;
        if (schema.additionalProperties === false && !(name in properties)) throw new Error("insufficient object properties");
        pairs.push([name, build(properties[name] ?? (record(schema.additionalProperties) ? schema.additionalProperties : {}), variant + i, depth + 1)]);
      }
      return Object.fromEntries(pairs);
    }
    if (kind === "array") {
      const minimum = schema.minItems ?? 0, maximum = schema.maxItems ?? 64;
      const length = mode === "full" ? Math.max(minimum, Math.min(1, maximum)) : minimum;
      if (length > 64 || length < 0 || length > maximum) throw new Error("array size constraints/budget");
      return Array.from({ length }, (_, i) => build(schema.items ?? {}, variant + i, depth + 1));
    }
    if (kind === "boolean") return variant % 2 === 0;
    if (kind === "integer" || kind === "number") {
      let minimum = schema.minimum ?? (schema.maximum < 0 ? schema.maximum : 0), maximum = schema.maximum ?? Infinity;
      if (schema.format === "int32") { minimum = Math.max(minimum, -2147483648); maximum = Math.min(maximum, 2147483647); }
      let step = schema.multipleOf ?? (kind === "integer" ? 1 : 0.5);
      if (!(step > 0) || !Number.isFinite(step)) throw new Error("invalid candidate step");
      const first = Math.ceil(minimum / step) + (schema.exclusiveMinimum && minimum % step === 0 ? 1 : 0);
      let candidate = Number(((first + variant) * step).toPrecision(15));
      if (candidate > maximum || (schema.exclusiveMaximum && candidate === maximum)) candidate = Number((first * step).toPrecision(15));
      if (kind === "number" && schema.multipleOf === undefined) {
        const lower = schema.minimum ?? -Infinity, upper = schema.maximum ?? Infinity;
        const inRange = (value: number) => Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER
          && (schema.exclusiveMinimum ? value > lower : value >= lower)
          && (schema.exclusiveMaximum ? value < upper : value <= upper);
        if (!inRange(candidate)) {
          // No multipleOf means there is no half-unit lattice in the source contract.
          // Keep successful old candidates; finite endpoints/interior values are only hints.
          const alternatives = [lower, upper, lower / 2 + upper / 2, lower + 0.5, upper - 0.5, 0].filter(inRange);
          if (alternatives.length) candidate = alternatives[variant % alternatives.length]!;
        }
      }
      if (!Number.isFinite(candidate) || Math.abs(candidate) > Number.MAX_SAFE_INTEGER) throw new Error("numeric witness budget");
      return candidate;
    }
    if (kind === "string") {
      if (schema.pattern) return patternCandidate(schema.pattern, variant);
      const format = schema.format ? formatted(schema.format, variant) : undefined;
      if (format !== undefined) return format;
      const minimum = schema.minLength ?? 0, maximum = schema.maxLength ?? 512;
      if (minimum > 512 || minimum > maximum) throw new Error("string length budget");
      const base = variant ? `${String.fromCharCode(33 + variant % 90)}${variant}example` : "example";
      return base.slice(0, maximum).padEnd(minimum, "a");
    }
    throw new Error(`unsupported candidate type ${kind}`);
  }
  const reasons = new Set<string>();
  for (let attempt = 0; attempt < 64; attempt++) {
    nodes = 0;
    try {
      const value = build(raw, attempt, 0);
      const result = check(value);
      if (result.valid && checkSchemaWitnessShape(document, raw, value, mode)) return { status: "constructed", value, attempts: attempt + 1, reasons: [] };
      if (result.valid) reasons.add("schema-valid candidate does not cover requested minimal/full shape");
      for (const error of result.errors) reasons.add(`${error.instancePath}: ${error.keyword}`);
    } catch (error) { reasons.add(String(error)); }
  }
  return { status: "unresolved", attempts: 64, reasons: [...reasons] };
}
