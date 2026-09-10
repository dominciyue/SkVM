import { test, expect } from "bun:test";
import { buildApiRequestCases } from "./api-request-cases";
import { verifyApiRequestCases } from "./api-request-cases-checker";

test("JSON body wire rejects duplicate decoded names but permits formatting changes", () => {
  const report = buildApiRequestCases(source, "json");
  for (const text of ['{"child":null,"child":{"id":2}}', '{"child":{"id":0,"i\\u0064":2}}']) {
    const bad = structuredClone(report);
    const body = bad.operations[1]!.schemas.find((s) => s.location === "body")!;
    const minimal = body.cases.cases.find((c) => c.kind === "valid-minimal")!;
    body.wireCases.find((w) => w.caseId === minimal.id)!.wire = text;
    expect(verifyApiRequestCases(source, "json", bad).errors).toContain("BODY_WIRE_MISMATCH");
  }
  for (const op of report.operations) for (const body of op.schemas.filter((s) => s.location === "body"))
    for (const wire of body.wireCases) if (wire.status === "encoded") wire.wire = JSON.stringify(JSON.parse(wire.wire!), null, 2);
  expect(verifyApiRequestCases(source, "json", report).status).toBe("pass");
});

const source = JSON.stringify({ openapi: "3.0.3", info: { title: "Synthetic contract", version: "1" },
  security: [{ token: [] }], components: { securitySchemes: { token: { type: "http", scheme: "bearer" } }, schemas: {
    Child: { type: "object", required: ["id"], properties: { id: { type: "integer", minimum: 2 }, name: { type: "string" } } },
  } }, paths: { "/items/{id}": { parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
    post: { requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["child"], properties: {
      child: { $ref: "#/components/schemas/Child" }, tags: { type: "array", items: { type: "string" } },
    } } } } }, responses: { "200": { description: "created" } } },
    get: { responses: { "200": { description: "ok" } } },
  } } });

test("shared request cases keep source coverage, nested obligations and unproven HTTP status separate", () => {
  const report = buildApiRequestCases(source, "json");
  expect(report.operations.length).toBe(2);
  expect(report.operations[1]!.schemas.some((s) => s.location === "body")).toBe(true);
  expect(report.operations.every((o) => o.remainingObligations.includes("http-status-trigger-evidence"))).toBe(true);
  const check = verifyApiRequestCases(source, "json", report);
  expect(check.status).toBe("pass");
  expect(check.schemaCasesCovered).toBeGreaterThan(10);
});

test("independent source and dependency checks detect operation loss, inherited parameter loss and security loss", () => {
  const report = buildApiRequestCases(source, "json");
  const omitted = structuredClone(report); omitted.operations.pop();
  expect(verifyApiRequestCases(source, "json", omitted).errors).toContain("SOURCE_COVERAGE_MISMATCH");
  const parameter = structuredClone(report); delete parameter.operations[0]!.projectedOperation!.parameters;
  expect(verifyApiRequestCases(source, "json", parameter).errors).toContain("PARAMETER_DEPENDENCY_LOST");
  const security = structuredClone(report); security.operations[0]!.projectedOperation!.security = [];
  expect(verifyApiRequestCases(source, "json", security).errors).toContain("SECURITY_DEPENDENCY_LOST");
  const caseLoss = structuredClone(report); caseLoss.operations[0]!.schemas = [];
  expect(verifyApiRequestCases(source, "json", caseLoss).errors).toContain("SCHEMA_FIELD_COVERAGE_MISMATCH");
});

test("operation checker rejects malformed envelopes and erased residual responsibilities", () => {
  const report = buildApiRequestCases(source, "json");
  for (const bad of [null, {}, { ...report, operations: [null] }, { ...report, schemaVersion: "invented" },
    { ...report, wholeSkillCompleted: true }]) {
    expect(verifyApiRequestCases(source, "json", bad as any).errors).toContain("INVALID_REQUEST_CASE_REPORT");
  }
  report.operations[0]!.remainingObligations = ["http-status-trigger-evidence"];
  expect(verifyApiRequestCases(source, "json", report).errors).toContain("RESIDUAL_OBLIGATION_LOST");
});

test("request schema cases include independently checked parameter and JSON body encoding", () => {
  const report = buildApiRequestCases(source, "json");
  const parameter = report.operations[0]!.schemas[0]!;
  expect(parameter.wireCases.some((c) => c.status === "encoded")).toBe(true);
  const body = report.operations[1]!.schemas.find((s) => s.location === "body")!;
  expect(body.wireCases.some((c) => c.status === "encoded")).toBe(true);
  const bad = structuredClone(report);
  bad.operations[0]!.schemas[0]!.wireCases.find((c) => c.status === "encoded")!.wire = "corrupted";
  expect(verifyApiRequestCases(source, "json", bad).errors).toContain("PARAMETER_WIRE_MISMATCH");
  const missing = structuredClone(report); missing.operations[0]!.schemas[0]!.wireCases = [];
  expect(verifyApiRequestCases(source, "json", missing).errors).toContain("WIRE_CASE_COVERAGE_MISMATCH");
});
