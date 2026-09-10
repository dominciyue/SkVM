import { test, expect } from "bun:test";
import { constructSchemaCases } from "./api-schema-cases";
import { verifySchemaCases } from "./api-schema-case-checker";

const schema = { type: "object", required: ["child"], additionalProperties: false, properties: {
  child: { type: "object", required: ["count", "code"], properties: {
    count: { type: "integer", minimum: 2, maximum: 5 }, code: { type: "string", enum: ["A", "B"], minLength: 1 },
  } }, tags: { type: "array", minItems: 1, maxItems: 3, uniqueItems: true, items: { type: "string", minLength: 2, maxLength: 6 } },
  timestamp: { type: "string", format: "date-time" },
} };

test("schema cases retain every source obligation and verify nested negative constraints", () => {
  const report = constructSchemaCases({}, schema);
  expect(report.cases.filter((c) => c.kind === "missing-required").length).toBe(3);
  expect(report.cases.filter((c) => c.status === "covered").length).toBeGreaterThan(10);
  expect(report.cases.every((c) => c.expectedHttpStatus === null)).toBe(true);
  expect(verifySchemaCases({}, schema, report).status).toBe("pass");
});

test("case checker independently detects omitted obligation, false negative and source drift", () => {
  const report = constructSchemaCases({}, schema);
  const omitted = structuredClone(report);
  omitted.cases.splice(2, 1);
  expect(verifySchemaCases({}, schema, omitted).errors).toContain("OBLIGATION_COVERAGE_MISMATCH");
  const falseNegative = structuredClone(report);
  const row = falseNegative.cases.find((c) => c.kind === "minimum" && c.status === "covered")!;
  row.value = report.cases.find((c) => c.kind === "valid-full")!.value;
  expect(verifySchemaCases({}, schema, falseNegative).errors).toContain("CASE_EXPECTATION_MISMATCH");
  const changed = structuredClone(schema);
  changed.properties.child.properties.count.minimum = 10;
  expect(verifySchemaCases({}, changed, report).errors).toContain("SCHEMA_BINDING_MISMATCH");
});

test("schema-valid minimal data cannot masquerade as complete full-property coverage", () => {
  const report = constructSchemaCases({}, schema);
  const minimal = report.cases.find((c) => c.kind === "valid-minimal")!.value;
  report.cases.find((c) => c.kind === "valid-full")!.value = minimal;
  expect(verifySchemaCases({}, schema, report).errors).toContain("CASE_EXPECTATION_MISMATCH");
});

test("case checker rejects malformed runtime envelopes and invented case statuses", () => {
  const report = constructSchemaCases({}, schema);
  for (const malformed of [null, {}, { ...report, schemaVersion: "other" }, { ...report, cases: null },
    { ...report, cases: [null] }]) {
    expect(verifySchemaCases({}, schema, malformed as any).errors).toContain("INVALID_CASE_REPORT");
  }
  report.cases[0]!.status = "ignored" as any;
  report.cases[0]!.reason = "not a valid decision";
  expect(verifySchemaCases({}, schema, report).errors).toContain("INVALID_CASE_REPORT");
});

test("unmodeled keyword and dictionary obligations cannot claim complete enumeration", () => {
  for (const extra of [{ additionalProperties: { type: "integer", minimum: 2 } }, { not: { required: ["forbidden"] } },
    { discriminator: { propertyName: "kind" } }, { madeUpConstraint: true }]) {
    const source = { type: "object", ...extra };
    const report = constructSchemaCases({}, source);
    expect(verifySchemaCases({}, source, report).sourceEnumerationComplete).toBe(false);
    expect(report.sourceIssues.length).toBeGreaterThan(0);
  }
});

test("negative coverage cannot use an error from a different composition branch", () => {
  const source = { type: "string", allOf: [{ minLength: 2 }, { minLength: 5 }] };
  const report = constructSchemaCases({}, source);
  const target = report.cases.find((c) => c.schemaPath === "#/allOf/0/minLength")!;
  expect(target.status).toBe("covered");
  target.value = "four"; // violates branch 1, not the claimed branch 0.
  delete (target as any).validationSchemaPath; // legacy envelope cannot bypass exact source matching.
  expect(verifySchemaCases({}, source, report).errors).toContain("CASE_EXPECTATION_MISMATCH");
});

test("required-field identity and referenced escaped schema locations are preserved", () => {
  const source = { type: "object", required: ["left", "right"], properties: {
    left: { type: "string" }, right: { type: "string" },
    "a/b~c": { $ref: "#/components/schemas/Number" },
  } };
  const document = { components: { schemas: { Number: { type: "number", minimum: 3, exclusiveMinimum: true } } } };
  const report = constructSchemaCases(document, source);
  expect(verifySchemaCases(document, source, report).status).toBe("pass");
  const constraint = report.cases.find((c) => c.kind === "minimum")!;
  expect(constraint.validationSchemaPath).toBe("#/properties/a~1b~0c/exclusiveMinimum");
  expect(constraint.status).toBe("covered");
  report.cases.find((c) => c.kind === "missing-required" && c.operand === "left")!.value = { left: "present" };
  expect(verifySchemaCases(document, source, report).errors).toContain("CASE_EXPECTATION_MISMATCH");
});
