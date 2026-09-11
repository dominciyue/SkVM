import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { buildApiFormRequestSpecimens } from "./api-request-specimens";
import { verifyApiFormRequestSpecimens } from "./api-request-specimens-checker";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
export type ApiPytestArtifact = { suiteJson: string; testPython: string };
type PytestRow = { id: string; operationKey: string; caseId: string | null; status: "constructed" | "unresolved" | "inventory-unresolved";
  reasons: string[]; security: unknown; requestJson: string | null };

/** Source text stays in data. Only a fixed-length digest is emitted into Python. */
export async function buildApiPytestSuite(source: string, format: "json" | "yaml"): Promise<ApiPytestArtifact> {
  const specimens = buildApiFormRequestSpecimens(source, format);
  const verified = verifyApiFormRequestSpecimens(source, format, specimens);
  if (verified.status !== "pass") throw new Error(`unverified source specimens: ${verified.errors.join("; ")}`);
  if (!specimens.operations.length) throw new Error("no source operations for native suite");
  const rows = specimens.operations.flatMap<PytestRow>((operation) => operation.caseInventoryComplete
    ? operation.cases.map((c) => ({ id: JSON.stringify([operation.key, c.id]), operationKey: operation.key, caseId: c.id,
      status: c.status, reasons: c.reasons, security: operation.security, requestJson: c.request === null ? null : JSON.stringify(c.request) }))
    : [{ id: JSON.stringify([operation.key, null]), operationKey: operation.key, caseId: null,
      status: "inventory-unresolved", reasons: operation.issues, security: operation.security, requestJson: null }]);
  const suiteJson = JSON.stringify({ schemaVersion: "api-pytest-request-suite/v1", exposure: "development",
    sourceSha256: sha(source), sourceFormat: format, specimens, rows, wholeSkillCompleted: false,
    runtimeRequirements: ["explicit-loopback-oracle", "credentials-unsupported", "real-api-behavior-unverified", "full-native-duty-incomplete"] }, null, 2) + "\n";
  const runtime = (await readFile(new URL("./api-pytest-runtime.py", import.meta.url), "utf8")).replaceAll("\r\n", "\n");
  return { suiteJson, testPython: `SUITE_SHA256 = "${sha(suiteJson)}"\n${runtime}` };
}
