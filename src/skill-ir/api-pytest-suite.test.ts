import { test, expect } from "bun:test";
import { buildApiPytestSuite } from "./api-pytest-suite";
import { verifyApiPytestSuite } from "./api-pytest-suite-checker";

const source = JSON.stringify({ openapi: "3.0.3", info: { title: "Synthetic native suite", version: "1" }, paths: {
  "/items": { post: {
    requestBody: { required: true, content: { "application/json": { schema: {
      type: "object", required: ["name"], properties: { name: { type: "string", enum: ["x"] } },
    } } } },
    responses: { "200": { description: "fixture only" } },
  } },
  "/unresolved": { post: { requestBody: { $ref: "#/components/requestBodies/Missing" }, responses: { "200": { description: "unresolved" } } } },
} });

test("native suite keeps all source cases and incomplete operation placeholders", async () => {
  const artifact = await buildApiPytestSuite(source, "json"), suite = JSON.parse(artifact.suiteJson);
  expect(suite.schemaVersion).toBe("api-pytest-request-suite/v1");
  expect(suite.rows).toHaveLength(4);
  expect(suite.rows.filter((r: any) => r.status === "constructed")).toHaveLength(3);
  expect(suite.rows.find((r: any) => r.status === "inventory-unresolved").reasons.length).toBeGreaterThan(0);
  expect(suite.wholeSkillCompleted).toBe(false);
  expect((await verifyApiPytestSuite(source, "json", artifact)).status).toBe("pass");
  expect(artifact.testPython).not.toContain("Synthetic native suite");
});

test("independent verifier rejects source, runtime, request and case-universe mutations", async () => {
  const base = await buildApiPytestSuite(source, "json");
  for (const mutate of [
    (s: any) => s.rows.pop(),
    (s: any) => s.rows.push(s.rows[0]),
    (s: any) => s.rows[0].requestJson = '{}',
    (s: any) => s.rows[0].security = [{ Token: [] }],
    (s: any) => s.specimens.operations.pop(),
  ]) {
    const artifact = structuredClone(base), suite = JSON.parse(artifact.suiteJson); mutate(suite);
    artifact.suiteJson = JSON.stringify(suite);
    const result = await verifyApiPytestSuite(source, "json", artifact);
    expect(result.status).toBe("fail");
    expect(result.errors.some((e: string) => e === "PYTEST_CASE_COVERAGE_MISMATCH" || e === "PYTEST_CASE_BINDING_MISMATCH" || e.startsWith("SPECIMENS:"))).toBe(true);
  }
  const code = structuredClone(base); code.testPython += "\nassert False\n";
  expect((await verifyApiPytestSuite(source, "json", code)).errors).toContain("PYTEST_RUNTIME_MISMATCH");
  expect((await verifyApiPytestSuite(source.replace("Synthetic", "Changed"), "json", base)).errors).toContain("PYTEST_SOURCE_BINDING_MISMATCH");
});

test("suite duplicate decoded JSON keys are rejected before Python collection", async () => {
  const artifact = await buildApiPytestSuite(source, "json");
  artifact.suiteJson = artifact.suiteJson.replace('"exposure": "development"', '"exposure": "wrong", "expo\\u0073ure": "development"');
  expect((await verifyApiPytestSuite(source, "json", artifact)).errors).toContain("INVALID_PYTEST_SUITE_JSON");
});

test("empty source operation universe cannot masquerade as a native test suite", async () => {
  const empty = JSON.stringify({ openapi: "3.0.3", info: { title: "Empty", version: "1" }, paths: {} });
  await expect(buildApiPytestSuite(empty, "json")).rejects.toThrow("no source operations");
});
