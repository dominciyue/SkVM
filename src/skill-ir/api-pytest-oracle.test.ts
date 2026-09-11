import { test, expect } from "bun:test";
import { createHash } from "node:crypto";
import { buildApiPytestSuite } from "./api-pytest-suite";
import { verifyApiPytestOracle } from "./api-pytest-oracle";

test("external fixture oracle binds request identity and source-valid response, never inferred status", async () => {
  const source = JSON.stringify({ openapi: "3.0.3", info: { title: "Synthetic oracle", version: "1" }, paths: {
    "/health": { get: { responses: { "200": { description: "hand-written fixture", content: { "application/json": { schema: {
      type: "object", required: ["ok"], properties: { ok: { type: "boolean", enum: [true] } },
    } } } } } } },
  } });
  const artifact = await buildApiPytestSuite(source, "json"), suite = JSON.parse(artifact.suiteJson);
  const sha = (v: string) => createHash("sha256").update(v).digest("hex");
  const oracle = { schemaVersion: "api-pytest-loopback-oracle/v1", suiteSha256: sha(artifact.suiteJson), fixtureSha256: "a".repeat(64),
    origin: "http://127.0.0.1:12345", cases: suite.rows.map((r: any) => ({ id: r.id, requestSha256: sha(r.requestJson),
      response: { statusCode: 200, mediaType: "application/json", bodyText: '{"ok":true}' } })) };
  expect((await verifyApiPytestOracle(source, "json", artifact, oracle)).status).toBe("pass");
  for (const [mutate, error] of [
    [(o: any) => o.suiteSha256 = "0".repeat(64), "ORACLE_SUITE_BINDING_MISMATCH"],
    [(o: any) => o.cases.push(o.cases[0]), "ORACLE_CASE_COVERAGE_MISMATCH"],
    [(o: any) => o.cases[0].requestSha256 = "0".repeat(64), "ORACLE_REQUEST_BINDING_MISMATCH"],
    [(o: any) => o.cases[0].response.statusCode = 201, "ORACLE_RESPONSE_NOT_SOURCE_VALID"],
    [(o: any) => o.cases[0].response.bodyText = '{"ok":false}', "ORACLE_RESPONSE_NOT_SOURCE_VALID"],
    [(o: any) => o.origin = "http://example.invalid", "LOOPBACK_ORIGIN_REQUIRED"],
  ] as const) {
    const changed = structuredClone(oracle); mutate(changed);
    expect((await verifyApiPytestOracle(source, "json", artifact, changed)).errors).toContain(error);
  }
});
