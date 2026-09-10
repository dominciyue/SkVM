import { test, expect } from "bun:test";
import { buildApiRequestBodyNegatives } from "./api-request-body-negatives";
import { verifyApiRequestBodyNegatives } from "./api-request-body-negatives-checker";

const source = JSON.stringify({ openapi: "3.0.3", info: { title: "Synthetic negatives", version: "1" }, paths: {
  "/items": { post: { parameters: [{ in: "query", name: "limit", required: true, schema: { type: "integer", minimum: 1 } }],
    requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name", "count"],
      properties: { name: { type: "string", enum: ["item"] }, count: { type: "integer", minimum: 2 } } } } } },
    responses: { "201": { description: "created" } } } }, "/health": { get: { responses: { "200": { description: "ok" } } } },
} });

test("JSON body negative requests retain complete source obligations and valid non-body baseline", () => {
  const report = buildApiRequestBodyNegatives(source, "json"), check = verifyApiRequestBodyNegatives(source, "json", report);
  expect(check.status).toBe("pass");
  expect(check.constructed).toBeGreaterThan(3);
  expect(report.operations.find((o) => o.key === "GET /health")?.cases).toEqual([]);
  for (const c of report.operations.find((o) => o.key === "POST /items")!.cases) {
    expect(c.status).toBe("constructed");
    expect(c.request?.target).toBe("/items?limit=1");
    expect(c.expectedHttpStatus).toBeNull();
  }
});

test("negative request checker detects omission, body substitution and unrelated request corruption", () => {
  const base = buildApiRequestBodyNegatives(source, "json");
  const mutations: Array<[string, (r: any) => void]> = [
    ["NEGATIVE_OPERATION_COVERAGE_MISMATCH", r => r.operations.pop()],
    ["NEGATIVE_CASE_COVERAGE_MISMATCH", r => r.operations.find((o: any) => o.cases.length).cases.pop()],
    ["NEGATIVE_CASE_COVERAGE_MISMATCH", r => { const o = r.operations.find((o: any) => o.cases.length); o.cases.push(o.cases[0]); }],
    ["NEGATIVE_REQUEST_MISMATCH", r => { const c = r.operations.find((o: any) => o.cases.length).cases[0]; c.request.body.value = { name: "item", count: 2 }; c.request.body.text = JSON.stringify(c.request.body.value); }],
    ["NEGATIVE_REQUEST_MISMATCH", r => r.operations.find((o: any) => o.cases.length).cases[0].request.target = "/wrong"],
    ["NEGATIVE_CASE_BINDING_MISMATCH", r => r.operations.find((o: any) => o.cases.length).cases[0].expectedHttpStatus = 400],
    ["NEGATIVE_RESIDUAL_LOST", r => r.remainingObligations = []],
  ];
  for (const [error, mutate] of mutations) {
    const r = structuredClone(base); mutate(r);
    expect(verifyApiRequestBodyNegatives(source, "json", r).errors).toContain(error);
  }
  const erased = structuredClone(base);
  erased.fields.operations.find((o) => o.schemas.some((s) => s.location === "body"))!.schemas = [];
  expect(verifyApiRequestBodyNegatives(source, "json", erased).errors).toContain("FIELD_EVIDENCE_INVALID");
});

test("negative body checker rejects duplicate JSON keys and source substitutions at the intended layers", () => {
  const report = buildApiRequestBodyNegatives(source, "json"), op = report.operations.find((o) => o.cases.length)!;
  const c = op.cases.find((c) => c.request?.body?.value && typeof c.request.body.value === "object" && !Array.isArray(c.request.body.value))!;
  const value = c.request!.body!.value as Record<string, unknown>, key = Object.keys(value)[0]!;
  c.request!.body!.text = `{${JSON.stringify(key)}:null,${JSON.stringify(value).slice(1)}`;
  expect(verifyApiRequestBodyNegatives(source, "json", report).errors).toContain("NEGATIVE_REQUEST_MISMATCH");
  expect(verifyApiRequestBodyNegatives(source + " ", "json", report).errors).toContain("FIELD_EVIDENCE_INVALID");
  expect(verifyApiRequestBodyNegatives(source + " ", "json", report).errors).toContain("BASELINE_EVIDENCE_INVALID");
});

test("body-method blockers retain every negative obligation as unresolved", () => {
  const doc = JSON.parse(source); doc.paths["/items"].delete = doc.paths["/items"].post; delete doc.paths["/items"].post;
  const text = JSON.stringify(doc), report = buildApiRequestBodyNegatives(text, "json"), check = verifyApiRequestBodyNegatives(text, "json", report);
  expect(check.status).toBe("pass");
  expect(check.obligations).toBeGreaterThan(3);
  expect(check.constructed).toBe(0);
  expect(check.unresolved).toBe(check.obligations);
});
