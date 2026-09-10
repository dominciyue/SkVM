import { createSchemaChecker, checkSchemaWitnessShape } from "./api-schema-checker";
import { enumerateSchemaObligations, obligationInstancePointer, schemaFingerprint, type SchemaCaseSet } from "./api-schema-obligations";

export function verifySchemaCases(document: unknown, schema: unknown, report: SchemaCaseSet) {
  const errors = new Set<string>();
  const expected = enumerateSchemaObligations(document, schema);
  if (!report || report.schemaVersion !== "api-schema-cases/v1" || !Array.isArray(report.sourceIssues) || !Array.isArray(report.cases)
    || report.cases.some((c) => !c || typeof c.id !== "string" || !["covered", "unresolved", "not-applicable"].includes(c.status)
      || (c.reason !== null && typeof c.reason !== "string") || !Array.isArray(c.instancePath))) {
    return { status: "fail" as const, errors: ["INVALID_CASE_REPORT"], obligations: expected.obligations.length,
      covered: 0, uncovered: expected.obligations.length, sourceEnumerationComplete: expected.issues.length === 0 };
  }
  if (report.schemaSha256 !== schemaFingerprint(document, schema)) errors.add("SCHEMA_BINDING_MISMATCH");
  if (JSON.stringify(report.sourceIssues) !== JSON.stringify(expected.issues)) errors.add("SOURCE_ISSUES_MISMATCH");
  const ids = report.cases.map((c) => c.id);
  if (new Set(ids).size !== ids.length || JSON.stringify([...ids].sort()) !== JSON.stringify(expected.obligations.map((c) => c.id).sort())) errors.add("OBLIGATION_COVERAGE_MISMATCH");
  const check = createSchemaChecker(document, schema);
  let covered = 0;
  for (const obligation of expected.obligations) {
    const row = report.cases.find((c) => c.id === obligation.id);
    if (!row) continue;
    for (const key of ["kind", "instancePath", "schemaPath", "keyword", "operand"] as const) if (JSON.stringify(row[key]) !== JSON.stringify(obligation[key])) errors.add("OBLIGATION_BINDING_MISMATCH");
    if (row.expectedHttpStatus !== null) errors.add("UNPROVEN_HTTP_STATUS");
    if (row.status !== "covered") {
      if (!row.reason) errors.add("UNEXPLAINED_UNCOVERED_OBLIGATION");
      continue;
    }
    covered++;
    const result = check(row.value);
    const positive = obligation.kind.startsWith("valid-");
    const target = obligationInstancePointer(obligation.instancePath);
    const correctlyRejected = result.errors.some((e) => e.keyword === obligation.keyword && e.instancePath === target);
    const correctShape = !positive || checkSchemaWitnessShape(document, schema, row.value, obligation.kind === "valid-full" ? "full" : "minimal");
    if (result.status !== "checked" || !correctShape || (positive ? !result.valid : result.valid !== false || !correctlyRejected)) errors.add("CASE_EXPECTATION_MISMATCH");
  }
  return { status: errors.size ? "fail" as const : "pass" as const, errors: [...errors].sort(),
    obligations: expected.obligations.length, covered, uncovered: expected.obligations.length - covered, sourceEnumerationComplete: expected.issues.length === 0 };
}
