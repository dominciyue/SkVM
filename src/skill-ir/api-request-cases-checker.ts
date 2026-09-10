import { createHash } from "node:crypto";
import { parseDocument } from "yaml";
import { independentlyEnumerateApiTesterOperations, verifyApiTesterProjectionDependencies } from "./api-tester-operation-coverage";
import { verifySchemaCases } from "./api-schema-case-checker";
import type { ApiRequestCasesReport } from "./api-request-cases";
import { verifyApiParameterWire } from "./api-parameter-wire-checker";

type Raw = Record<string, any>;
const object = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const canonical = (v: any): string => Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : object(v)
  ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}` : JSON.stringify(v) ?? "undefined";

/** Reads the source itself; no value import from the constructor or its schema-plan extraction. */
export function verifyApiRequestCases(sourceText: string, format: "json" | "yaml", report: ApiRequestCasesReport) {
  const errors = new Set<string>();
  const universe = independentlyEnumerateApiTesterOperations(sourceText, format);
  let schemaCasesCovered = 0, schemaObligations = 0;
  const operationChecks: Array<{ key: string; schemas: number; covered: number; obligations: number; allSchemaWitnessesAvailable: boolean;
    schemaEnumerationComplete: boolean; encodedCases: number; wireCaseObligations: number; positiveWireCasesAvailable: boolean; sourceAdvisories: unknown[] }> = [];
  const result = () => ({ status: errors.size ? "fail" as const : "pass" as const, errors: [...errors].sort(),
    sourceOperations: universe.operations.length, schemaCasesCovered, schemaObligations, operationChecks });
  if (!report || report.schemaVersion !== "api-request-cases/v2" || report.wholeSkillCompleted !== false
    || !Array.isArray(report.enumerationIssues) || !Array.isArray(report.operations)
    || report.operations.some((o) => !o || typeof o.key !== "string" || !Array.isArray(o.schemas)
      || o.schemas.some((s) => !s || typeof s.id !== "string") || !Array.isArray(o.remainingObligations)
      || !Array.isArray(o.issues) || !Array.isArray(o.sourceAdvisories))) {
    errors.add("INVALID_REQUEST_CASE_REPORT"); return result();
  }
  if (report.sourceSha256 !== createHash("sha256").update(sourceText).digest("hex") || report.sourceFormat !== format) errors.add("SOURCE_BINDING_MISMATCH");
  if (!universe.complete || report.enumerationComplete !== universe.complete) errors.add("SOURCE_ENUMERATION_INCOMPLETE");
  const keys = report.operations.map((o) => o.key);
  if (new Set(keys).size !== keys.length || canonical([...keys].sort()) !== canonical(universe.operations.map((o) => o.key).sort())) errors.add("SOURCE_COVERAGE_MISMATCH");
  let document: Raw;
  try {
    const yaml = parseDocument(sourceText, { uniqueKeys: true });
    if (yaml.errors.length) throw new Error("source syntax");
    document = format === "json" ? JSON.parse(sourceText) : yaml.toJS({ maxAliasCount: 100 });
  } catch { errors.add("SOURCE_PARSE_FAILED"); return result(); }
  function resolve(raw: any): any {
    const seen = new Set<string>();
    while (object(raw) && Object.hasOwn(raw, "$ref")) {
      if (typeof raw.$ref !== "string" || !raw.$ref.startsWith("#/") || seen.has(raw.$ref)) throw new Error("reference unresolved");
      seen.add(raw.$ref);
      let target: any = document;
      for (const encoded of raw.$ref.slice(2).split("/")) {
        const key = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
        if (!object(target) || !Object.hasOwn(target, key)) throw new Error("reference missing");
        target = target[key];
      }
      raw = target;
    }
    return raw;
  }
  for (const expected of universe.operations) {
    const row = report.operations.find((o) => o.key === expected.key);
    if (!row) continue;
    if (row.locator !== expected.locator || row.operationId !== expected.operationId || row.summary !== expected.summary) errors.add("SOURCE_METADATA_MISMATCH");
    if (!row.remainingObligations.includes("http-status-trigger-evidence")) errors.add("UNPROVEN_HTTP_STATUS_COVERAGE");
    for (const residual of ["parameter-presence-and-serialization", "credentials-and-live-auth", "response-validation",
      "business-lifecycle", "requested-output-format", "prose-only-constraints"]) {
      if (!row.remainingObligations.includes(residual)) errors.add("RESIDUAL_OBLIGATION_LOST");
    }
    const split = expected.key.indexOf(" "), method = expected.key.slice(0, split).toLowerCase(), path = expected.key.slice(split + 1);
    const item = document.paths[path], operation = item[method];
    if (!row.projectedOperation) { if (!row.issues.length) errors.add("UNEXPLAINED_OPERATION_FAILURE"); continue; }
    const projected = { ...document, paths: { [path]: { [method]: row.projectedOperation } } };
    const dependencies = verifyApiTesterProjectionDependencies({ sourceDocument: document, projectedDocument: projected, operationKey: expected.key });
    if (!dependencies.checks.projectionPreservation) for (const error of dependencies.errors) errors.add(error);
    if (canonical(row.sourceAdvisories) !== canonical(dependencies.sourceIssues)) errors.add("SOURCE_ADVISORY_MISMATCH");
    try {
      const fields: Array<{ id: string; location: string; name: string; required: boolean; schema: any; parameter?: Raw }> = [];
      const parameters = new Map<string, any>();
      for (const list of [item.parameters ?? [], operation.parameters ?? []]) for (const raw of list) {
        const p = resolve(raw);
        if (!object(p) || typeof p.name !== "string" || typeof p.in !== "string") throw new Error("parameter identity unresolved");
        parameters.set(`${p.in}:${p.name}`, p);
      }
      for (const [id, p] of parameters) {
        if (p.schema !== undefined || !object(p.content)) fields.push({ id, location: p.in, name: p.name, required: p.required === true, schema: p.schema, parameter: p });
        else for (const [media, spec] of Object.entries(p.content)) fields.push({ id: `${id}:${media}`, location: p.in, name: p.name, required: p.required === true, schema: (spec as Raw).schema, parameter: p });
      }
      if (operation.requestBody !== undefined) {
        const b = resolve(operation.requestBody);
        if (!object(b) || !object(b.content)) throw new Error("request content unresolved");
        for (const [media, spec] of Object.entries(b.content)) fields.push({ id: `body:${media}`, location: "body", name: media, required: b.required === true, schema: (spec as Raw).schema });
      }
      const actual = row.schemas.map((s) => s.id);
      if (new Set(actual).size !== actual.length || canonical([...actual].sort()) !== canonical(fields.map((s) => s.id).sort())) errors.add("SCHEMA_FIELD_COVERAGE_MISMATCH");
      let covered = 0, obligations = 0, allSchemaWitnessesAvailable = fields.length > 0 && dependencies.checks.constructionObligations;
      let schemaEnumerationComplete = true, encodedCases = 0, wireCaseObligations = 0, positiveWireCasesAvailable = fields.length > 0;
      for (const field of fields) {
        const actual = row.schemas.find((s) => s.id === field.id);
        if (!actual) { allSchemaWitnessesAvailable = false; continue; }
        for (const key of ["schema", "location", "name", "required"] as const) if (canonical(actual[key]) !== canonical(field[key])) errors.add("SOURCE_SCHEMA_BINDING_MISMATCH");
        const checked = verifySchemaCases(document, field.schema, actual.cases);
        for (const error of checked.errors) errors.add(error);
        if (checked.errors.includes("INVALID_CASE_REPORT")) { allSchemaWitnessesAvailable = false; positiveWireCasesAvailable = false; continue; }
        schemaEnumerationComplete &&= checked.sourceEnumerationComplete;
        const expectedWireIds = actual.cases.cases.filter((c) => c.status === "covered").map((c) => c.id).sort();
        wireCaseObligations += expectedWireIds.length;
        if (!Array.isArray(actual.wireCases) || actual.wireCases.some((c) => !c || typeof c.caseId !== "string")
          || canonical(actual.wireCases.map((c) => c.caseId).sort()) !== canonical(expectedWireIds)) errors.add("WIRE_CASE_COVERAGE_MISMATCH");
        else for (const wire of actual.wireCases) {
          if (wire.status === "unsupported") {
            if (typeof wire.reason !== "string" || !wire.reason || wire.wire !== null) errors.add("UNEXPLAINED_WIRE_FAILURE");
            continue;
          }
          if (wire.status !== "encoded" || typeof wire.wire !== "string") { errors.add("INVALID_WIRE_CASE"); continue; }
          const value = actual.cases.cases.find((c) => c.id === wire.caseId)!.value;
          if (field.parameter) {
            if (verifyApiParameterWire(field.parameter, value, wire.wire).status !== "pass") errors.add("PARAMETER_WIRE_MISMATCH");
            else encodedCases++;
          } else {
            try {
              if (!(field.name === "application/json" || /^application\/[A-Za-z0-9._-]+\+json$/u.test(field.name))
                || canonical(JSON.parse(wire.wire)) !== canonical(value)) errors.add("BODY_WIRE_MISMATCH");
              else encodedCases++;
            } catch { errors.add("BODY_WIRE_MISMATCH"); }
          }
        }
        positiveWireCasesAvailable &&= ["valid-minimal", "valid-full"].every((kind) => {
          const positive = actual.cases.cases.find((c) => c.kind === kind);
          return positive?.status === "covered" && actual.wireCases?.some((w) => w.caseId === positive.id && w.status === "encoded") === true;
        });
        covered += checked.covered; obligations += checked.obligations;
        allSchemaWitnessesAvailable &&= checked.status === "pass" && actual.cases.cases.filter((c) => c.kind.startsWith("valid-")).every((c) => c.status === "covered");
      }
      schemaCasesCovered += covered; schemaObligations += obligations;
      operationChecks.push({ key: expected.key, schemas: fields.length, covered, obligations, allSchemaWitnessesAvailable,
        schemaEnumerationComplete, encodedCases, wireCaseObligations, positiveWireCasesAvailable: allSchemaWitnessesAvailable && positiveWireCasesAvailable,
        sourceAdvisories: dependencies.sourceIssues });
    } catch (error) { if (!row.issues.length) errors.add("UNEXPLAINED_SCHEMA_EXTRACTION_FAILURE"); }
  }
  return result();
}
