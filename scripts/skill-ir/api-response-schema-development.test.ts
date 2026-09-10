import { test, expect } from "bun:test";
import { analyzeResponseSchemas } from "./api-response-schema-development";

test("response catalog retains every declaration and distinguishes source examples from traffic", () => {
  const valid = { description: "Synthetic", content: { "application/json": { schema: { type: "integer", minimum: 2 },
    examples: { good: { value: 3 }, bad: { value: 1 }, external: { externalValue: "https://example.invalid/data" } } } } };
  const source = JSON.stringify({ openapi: "3.0.3", info: { title: "catalog", version: "1" }, paths: {
    "/items": { get: { responses: { "200": valid, "2XX": valid, default: valid, "404": { $ref: "#/components/responses/Missing" },
      "500": { description: "text", content: { "text/plain": { schema: { type: "string" }, example: "not JSON" } } } } } },
    "/empty": { get: { responses: { "204": { description: "no body" } } } },
  } });
  const report = analyzeResponseSchemas(source, "json");
  expect(report.operations).toHaveLength(2);
  expect(report.operations.flatMap((o) => o.responses)).toHaveLength(6);
  expect(report.totals.validExamples).toBe(3);
  expect(report.totals.invalidExamples).toBe(3);
  expect(report.totals.unresolvedExamples).toBe(4);
  expect(report.liveObservations).toBe(0);
  expect(report.operations.find((o) => o.key === "GET /items")!.responses.find((r) => r.statusKey === "404")!.issues.length).toBeGreaterThan(0);
  expect(report.operations.find((o) => o.key === "GET /items")!.responses.find((r) => r.statusKey === "500")!.media[0]!.schemaStatus).toBe("unsupported-media");
});

test("referenced response and root-schema example locators point to actual source definitions", () => {
  const source = JSON.stringify({ openapi: "3.0.3", info: { title: "refs", version: "1" }, components: {
    schemas: { Result: { type: "integer", minimum: 2, example: 3 } },
    responses: { Ok: { description: "ok", content: { "application/json": { schema: { $ref: "#/components/schemas/Result" } } } } },
  }, paths: { "/items": { get: { responses: { "200": { $ref: "#/components/responses/Ok" } } } } } });
  const report = analyzeResponseSchemas(source, "json"), response = report.operations[0]!.responses[0]!;
  expect(response.resolvedLocator).toBe("#/components/responses/Ok");
  expect(response.media[0]!.examples[0]!.locator).toBe("#/components/schemas/Result/example");
  expect(report.totals.validExamples).toBe(1);
});
