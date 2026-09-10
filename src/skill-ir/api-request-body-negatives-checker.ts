import { parseDocument } from "yaml";
import { verifyApiRequestCases } from "./api-request-cases-checker";
import { verifyApiRequestSpecimens } from "./api-request-specimens-checker";

type Raw = Record<string, any>;
const object = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const stable = (v: any): string => Array.isArray(v) ? `[${v.map(stable).join(",")}]` : object(v)
  ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}` : JSON.stringify(v) ?? "undefined";

/** Validated source-bound field obligations are the inventory, not the assembled row list. */
export function verifyApiRequestBodyNegatives(source: string, format: "json" | "yaml", report: unknown) {
  const errors = new Set<string>();
  let obligations = 0, constructed = 0, unresolved = 0;
  const finish = () => ({ status: errors.size ? "fail" as const : "pass" as const, errors: [...errors].sort(), obligations, constructed, unresolved });
  if (!object(report) || report.schemaVersion !== "api-request-body-negatives/v1" || report.wholeSkillCompleted !== false
    || !Array.isArray(report.remainingObligations) || !Array.isArray(report.operations)
    || report.operations.some((o: unknown) => !object(o) || typeof o.key !== "string" || !Array.isArray(o.cases))) {
    errors.add("INVALID_BODY_NEGATIVE_REPORT"); return finish();
  }
  try {
    if (verifyApiRequestCases(source, format, report.fields).status !== "pass") errors.add("FIELD_EVIDENCE_INVALID");
    if (verifyApiRequestSpecimens(source, format, report.specimens).status !== "pass") errors.add("BASELINE_EVIDENCE_INVALID");
  } catch { errors.add("INVALID_EMBEDDED_EVIDENCE"); }
  if (errors.size) return finish();
  for (const residual of ["parameter-schema-negative-assembly", "credentials-and-live-auth", "origin-and-server-selection",
    "response-status-and-business-oracle", "native-output-format", "single-fault-isolation"])
    if (!report.remainingObligations.includes(residual)) errors.add("NEGATIVE_RESIDUAL_LOST");
  const keys = report.operations.map((o: Raw) => o.key);
  if (new Set(keys).size !== keys.length || stable([...keys].sort()) !== stable(report.fields.operations.map((o: Raw) => o.key).sort())) errors.add("NEGATIVE_OPERATION_COVERAGE_MISMATCH");
  for (const operation of report.fields.operations) {
    const expected: Array<{ id: string; field: Raw; obligation: Raw }> = [];
    for (const field of operation.schemas) if (field.location === "body")
      for (const obligation of field.cases.cases) if (!obligation.kind.startsWith("valid-"))
        expected.push({ id: JSON.stringify([field.id, obligation.id]), field, obligation });
    obligations += expected.length;
    const actual = report.operations.find((o: Raw) => o.key === operation.key);
    if (!actual) continue;
    if (actual.cases.some((c: unknown) => !object(c) || typeof c.id !== "string" || !Array.isArray(c.reasons))) {
      errors.add("INVALID_BODY_NEGATIVE_CASE"); continue;
    }
    const ids = actual.cases.map((c: Raw) => c.id);
    if (new Set(ids).size !== ids.length || stable([...ids].sort()) !== stable(expected.map((c) => c.id).sort())) errors.add("NEGATIVE_CASE_COVERAGE_MISMATCH");
    for (const target of expected) {
      const row = actual.cases.find((c: Raw) => c.id === target.id);
      if (!row) continue;
      const baselineId = JSON.stringify(["full", target.field.name, null]);
      if (row.fieldId !== target.field.id || row.obligationId !== target.obligation.id || row.baselineId !== baselineId
        || row.expectedHttpStatus !== null) errors.add("NEGATIVE_CASE_BINDING_MISMATCH");
      if (row.status === "unresolved") {
        unresolved++;
        if (!row.reasons.length || row.reasons.some((r: unknown) => typeof r !== "string" || !r) || row.request !== null) errors.add("UNEXPLAINED_NEGATIVE_FAILURE");
        continue;
      }
      const baseline = report.specimens.operations.find((o: Raw) => o.key === operation.key)?.cases.find((c: Raw) => c.id === baselineId);
      try {
        if (row.status !== "constructed" || row.reasons.length || !object(row.request) || !object(row.request.body)
          || target.obligation.status !== "covered" || baseline?.status !== "constructed" || !baseline.request?.body) throw new Error("evidence unavailable");
        const body = row.request.body;
        if (typeof body.text !== "string" || Buffer.byteLength(body.text) > 262144 || body.mediaType !== target.field.name
          || stable(body.value) !== stable(target.obligation.value) || stable(JSON.parse(body.text)) !== stable(body.value)
          || parseDocument(body.text, { uniqueKeys: true }).errors.length) throw new Error("body differs from checked negative");
        if (stable({ ...row.request, body: baseline.request.body }) !== stable(baseline.request)) throw new Error("non-body baseline changed");
        constructed++;
      } catch { errors.add("NEGATIVE_REQUEST_MISMATCH"); }
    }
  }
  return finish();
}
