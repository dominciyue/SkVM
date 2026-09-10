import { createSchemaChecker } from "./api-schema-checker";
import { constructSchemaWitness } from "./api-schema-witness";
import { enumerateSchemaObligations, obligationInstancePointer, schemaFingerprint, type SchemaObligation, type SchemaCaseSet } from "./api-schema-obligations";

const object = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);

function mutations(base: unknown, obligation: SchemaObligation): unknown[] {
  const root = structuredClone(base);
  let parent: any = null, value: any = root, last: string | number | null = null;
  for (const part of obligation.instancePath) { parent = value; last = part; value = value?.[part]; }
  if (obligation.instancePath.length && (parent === undefined || parent === null)) return [];
  const operand = obligation.operand as { value?: any; exclusive?: boolean } | undefined;
  const size = operand?.value;
  let values: unknown[] = [];
  switch (obligation.kind) {
    case "wrong-type": values = [null, {}, [], "wrong-type", 7, false]; break;
    case "enum": values = ["__outside_enum__", 987654321, null, {}, []]; break;
    case "minimum": values = [operand?.exclusive ? size : size - 1]; break;
    case "maximum": values = [operand?.exclusive ? size : size + 1]; break;
    case "multipleOf": values = [size / 2, size + 0.5, 0.5]; break;
    case "minLength": if (size > 0 && size <= 513) values = ["a".repeat(size - 1)]; break;
    case "maxLength": if (size < 512) values = ["a".repeat(size + 1)]; break;
    case "pattern": values = ["", "!", "__pattern_violation__", "\n"]; break;
    case "format": values = typeof value === "number" ? [1e30, 0.5] : ["not-a-format", "2020-13-99T00:00:00Z", ""]; break;
    case "minItems": if (Array.isArray(value) && size > 0) values = [value.slice(0, size - 1)]; break;
    case "maxItems": if (Array.isArray(value) && size < 64) values = [Array.from({ length: size + 1 }, (_, i) => value[i % Math.max(1, value.length)] ?? null)]; break;
    case "uniqueItems": if (Array.isArray(value) && value.length) values = [[value[0], value[0]]]; break;
    case "minProperties": if (object(value) && size > 0) values = [Object.fromEntries(Object.entries(value).slice(0, size - 1))]; break;
    case "maxProperties": if (object(value) && size < 64) values = [Object.fromEntries(Array.from({ length: size + 1 }, (_, i) => [`extra${i}`, null]))]; break;
    case "additionalProperties": if (object(value)) values = [{ ...value, __unexpected_property__: true }]; break;
    case "missing-required": {
      if (!object(value) || !Object.hasOwn(value, String(obligation.operand))) break;
      const next = structuredClone(value); delete next[String(obligation.operand)]; values = [next]; break;
    }
    case "read-only": values = ["server-only"]; break;
  }
  return values.map((next) => {
    if (last === null) return next;
    const result: any = structuredClone(root);
    let holder = result;
    for (const part of obligation.instancePath.slice(0, -1)) holder = holder[part];
    Object.defineProperty(holder, last, { value: next, writable: true, enumerable: true, configurable: true });
    return result;
  });
}

export function constructSchemaCases(document: unknown, schema: unknown): SchemaCaseSet {
  const source = enumerateSchemaObligations(document, schema);
  const minimal = constructSchemaWitness(document, schema, "minimal");
  const full = constructSchemaWitness(document, schema, "full");
  const check = createSchemaChecker(document, schema);
  const report: SchemaCaseSet = { schemaVersion: "api-schema-cases/v1", schemaSha256: schemaFingerprint(document, schema), sourceIssues: source.issues, cases: [] };
  for (const obligation of source.obligations) {
    const row = { ...obligation, status: "unresolved" as "covered" | "unresolved", reason: null as string | null, expectedHttpStatus: null, value: undefined as unknown };
    if (obligation.kind.startsWith("valid-")) {
      const witness = obligation.kind === "valid-full" ? full : minimal;
      if (witness.status === "constructed") { row.status = "covered"; row.value = witness.value; }
      else row.reason = witness.reasons.join("; ");
    } else if (full.status !== "constructed") row.reason = "full valid witness unavailable: " + full.reasons.join("; ");
    else {
      const pointer = obligationInstancePointer(obligation.instancePath);
      for (const value of mutations(full.value, obligation)) {
        const result = check(value);
        if (result.valid === false && result.errors.some((e) => e.keyword === obligation.keyword && e.instancePath === pointer
          && e.schemaPath === obligation.validationSchemaPath
          && (obligation.kind !== "missing-required" || e.params.missingProperty === obligation.operand))) {
          row.status = "covered"; row.value = value; break;
        }
      }
      if (row.status !== "covered") row.reason = "no independently confirmed target violation within bounded candidates";
    }
    report.cases.push(row);
  }
  return report;
}
