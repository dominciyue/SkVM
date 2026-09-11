import { createHash } from "node:crypto";
import { z } from "zod";
import { verifyApiPytestSuite } from "./api-pytest-suite-checker";
import { checkApiResponseObservation } from "./api-response-observation";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const hash = z.string().regex(/^[0-9a-f]{64}$/u);
const Oracle = z.object({ schemaVersion: z.literal("api-pytest-loopback-oracle/v1"), suiteSha256: hash, fixtureSha256: hash,
  origin: z.string(), cases: z.array(z.object({ id: z.string(), requestSha256: hash, response: z.object({
    statusCode: z.number().int().min(100).max(599), mediaType: z.string(), bodyText: z.string(),
  }).strict() }).strict()).min(1).max(100000) }).strict();

/** Validates an explicit synthetic oracle; does not construct/guess expected responses. */
export async function verifyApiPytestOracle(source: string, format: "json" | "yaml", artifact: unknown, raw: unknown) {
  const errors = new Set<string>(), observations: unknown[] = [];
  let boundCases = 0, unboundCases = 0;
  const finish = () => ({ status: errors.size ? "fail" as const : "pass" as const, errors: [...errors].sort(), boundCases, unboundCases,
    observations, claimLimit: "fixture identity is a binding, not independently proven behavior or a real API oracle" });
  const verified = await verifyApiPytestSuite(source, format, artifact);
  if (verified.status !== "pass") { errors.add("ORACLE_ARTIFACT_UNVERIFIED"); return finish(); }
  const parsed = Oracle.safeParse(raw);
  if (!parsed.success) { errors.add("INVALID_PYTEST_ORACLE"); return finish(); }
  const oracle = parsed.data, suiteJson = (artifact as { suiteJson: string }).suiteJson, suite = JSON.parse(suiteJson);
  if (oracle.suiteSha256 !== sha(suiteJson)) errors.add("ORACLE_SUITE_BINDING_MISMATCH");
  const origin = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})$/u.exec(oracle.origin);
  if (!origin || Number(origin[1]) > 65535) errors.add("LOOPBACK_ORIGIN_REQUIRED");
  const used = new Set<string>();
  for (const c of oracle.cases) {
    const row = suite.rows.find((r: any) => r.id === c.id);
    if (used.has(c.id) || !row || row.status !== "constructed") { errors.add("ORACLE_CASE_COVERAGE_MISMATCH"); continue; }
    used.add(c.id);
    if (c.requestSha256 !== sha(row.requestJson)) errors.add("ORACLE_REQUEST_BINDING_MISMATCH");
    if (!Array.isArray(row.security) || row.security.length) errors.add("ORACLE_SECURITY_UNSUPPORTED");
    const observation = checkApiResponseObservation(source, format, { operationKey: row.operationKey, ...c.response });
    observations.push({ id: c.id, check: observation });
    if (observation.status !== "checked" || !observation.valid) errors.add("ORACLE_RESPONSE_NOT_SOURCE_VALID");
    boundCases++;
  }
  unboundCases = suite.rows.filter((r: any) => !used.has(r.id)).length;
  return finish();
}
