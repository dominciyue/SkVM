import { test, expect } from "bun:test";
import { analyzeResponseSchemas, runResponseDevelopment } from "./api-response-schema-development";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

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

test("response batch retains a malformed UTF-8 source failure alongside its valid sibling", async () => {
  const root = await mkdtemp(join(tmpdir(), "skvm-response-utf8-"));
  const text = JSON.stringify({ openapi: "3.0.3", info: { title: "Synthetic", version: "1" }, paths: { "/item": { get: { responses: { "200": { description: "ok" } } } } } });
  const invalid = Buffer.from(text); invalid[invalid.indexOf("Synthetic")] = 0xff;
  await writeFile(join(root, "bad.json"), invalid);
  await writeFile(join(root, "good.json"), text);
  await writeFile(join(root, "inputs.json"), JSON.stringify({ inputs: [
    { inputId: "bad", status: "acquired", localPath: "bad.json", format: "json", sha256: createHash("sha256").update(invalid).digest("hex") },
    { inputId: "good", status: "acquired", localPath: "good.json", format: "json", sha256: createHash("sha256").update(text).digest("hex") },
  ] }));
  const summary = await runResponseDevelopment({ rootDir: root, executionRoot: process.cwd(), inputIndexPath: "inputs.json", outputPath: "output" });
  expect((summary.rows as any[]).map((r) => r.status)).toEqual(["error", "analyzed"]);
  expect((summary.rows[0] as any).error).toContain("UTF-8");
  expect(JSON.parse(await readFile(join(root, "output/report.json"), "utf8")).rows).toHaveLength(2);
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
