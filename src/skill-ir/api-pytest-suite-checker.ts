import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseDocument } from "yaml";
import { verifyApiFormRequestSpecimens } from "./api-request-specimens-checker";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Independent source-backed inventory/binding verification; no emitter import. */
export async function verifyApiPytestSuite(source: string, format: "json" | "yaml", artifact: unknown) {
  const errors = new Set<string>();
  let collectedCases = 0, constructedCases = 0, unresolvedCases = 0;
  const finish = () => ({ status: errors.size ? "fail" as const : "pass" as const, errors: [...errors].sort(), collectedCases, constructedCases, unresolvedCases });
  const value = artifact as any;
  if (!value || typeof value.suiteJson !== "string" || typeof value.testPython !== "string") { errors.add("INVALID_PYTEST_ARTIFACT"); return finish(); }
  let suite: any;
  try {
    suite = JSON.parse(value.suiteJson);
    if (parseDocument(value.suiteJson, { uniqueKeys: true }).errors.length) throw new Error("duplicate JSON keys");
  } catch { errors.add("INVALID_PYTEST_SUITE_JSON"); return finish(); }
  if (!suite || suite.schemaVersion !== "api-pytest-request-suite/v1" || suite.exposure !== "development" || suite.wholeSkillCompleted !== false
    || !Array.isArray(suite.rows) || !same(suite.runtimeRequirements, ["explicit-loopback-oracle", "credentials-unsupported", "real-api-behavior-unverified", "full-native-duty-incomplete"])) {
    errors.add("INVALID_PYTEST_SUITE"); return finish();
  }
  if (suite.sourceSha256 !== sha(source) || suite.sourceFormat !== format) errors.add("PYTEST_SOURCE_BINDING_MISMATCH");
  const runtime = (await readFile(new URL("./api-pytest-runtime.py", import.meta.url), "utf8")).replaceAll("\r\n", "\n");
  if (value.testPython !== `SUITE_SHA256 = "${sha(value.suiteJson)}"\n${runtime}`) errors.add("PYTEST_RUNTIME_MISMATCH");
  const checked = verifyApiFormRequestSpecimens(source, format, suite.specimens);
  for (const error of checked.errors) errors.add(`SPECIMENS:${error}`);
  if (checked.status !== "pass") return finish();
  if (!suite.specimens.operations.length) errors.add("PYTEST_EMPTY_OPERATION_UNIVERSE");
  const expected = new Map<string, any>();
  for (const operation of suite.specimens.operations) {
    const cases = operation.caseInventoryComplete ? operation.cases : [{ id: null, status: "inventory-unresolved", reasons: operation.issues, request: null }];
    for (const c of cases) {
      const id = JSON.stringify([operation.key, c.id]);
      expected.set(id, { id, operationKey: operation.key, caseId: c.id, status: c.status,
        reasons: c.reasons, security: operation.security, requestJson: c.request === null ? null : JSON.stringify(c.request) });
    }
  }
  const actual = new Set<string>();
  for (const row of suite.rows) {
    if (!row || typeof row.id !== "string" || actual.has(row.id) || !expected.has(row.id)) { errors.add("PYTEST_CASE_COVERAGE_MISMATCH"); continue; }
    actual.add(row.id);
    if (!same(row, expected.get(row.id))) errors.add("PYTEST_CASE_BINDING_MISMATCH");
    collectedCases++; if (row.status === "constructed") constructedCases++; else unresolvedCases++;
  }
  if (actual.size !== expected.size) errors.add("PYTEST_CASE_COVERAGE_MISMATCH");
  return finish();
}
