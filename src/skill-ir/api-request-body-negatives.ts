import { buildApiRequestCases, type ApiRequestCasesReport } from "./api-request-cases";
import { buildApiRequestSpecimens, type ApiRequestSpecimens, type RequestSpecimen } from "./api-request-specimens";

export type BodyNegativeCase = { id: string; fieldId: string; obligationId: string; baselineId: string;
  status: "constructed" | "unresolved"; reasons: string[]; request: RequestSpecimen | null; expectedHttpStatus: null };
export type ApiRequestBodyNegatives = { schemaVersion: "api-request-body-negatives/v1";
  fields: ApiRequestCasesReport; specimens: ApiRequestSpecimens; wholeSkillCompleted: false;
  remainingObligations: string[]; operations: Array<{ key: string; cases: BodyNegativeCase[] }> };

/** Compose evidence, never infer an HTTP status from a schema violation. */
export function buildApiRequestBodyNegatives(source: string, format: "json" | "yaml"): ApiRequestBodyNegatives {
  const fields = buildApiRequestCases(source, format), specimens = buildApiRequestSpecimens(source, format);
  const report: ApiRequestBodyNegatives = { schemaVersion: "api-request-body-negatives/v1", fields, specimens,
    wholeSkillCompleted: false, remainingObligations: ["parameter-schema-negative-assembly", "credentials-and-live-auth",
      "origin-and-server-selection", "response-status-and-business-oracle", "native-output-format", "single-fault-isolation"], operations: [] };
  for (const operation of fields.operations) {
    const cases: BodyNegativeCase[] = [];
    report.operations.push({ key: operation.key, cases });
    for (const field of operation.schemas.filter((f) => f.location === "body")) {
      const baselineId = JSON.stringify(["full", field.name, null]);
      const baseline = specimens.operations.find((o) => o.key === operation.key)?.cases.find((c) => c.id === baselineId);
      for (const obligation of field.cases.cases.filter((c) => !c.kind.startsWith("valid-"))) {
        const row: BodyNegativeCase = { id: JSON.stringify([field.id, obligation.id]), fieldId: field.id,
          obligationId: obligation.id, baselineId, status: "unresolved", reasons: [], request: null, expectedHttpStatus: null };
        cases.push(row);
        if (cases.length > 512) row.reasons.push("negative request construction budget");
        else if (obligation.status !== "covered") row.reasons.push(`field witness unresolved: ${obligation.reason}`);
        else if (baseline?.status !== "constructed" || !baseline.request?.body) row.reasons.push("full body request baseline unavailable");
        else {
          const wire = field.wireCases.find((w) => w.caseId === obligation.id);
          if (wire?.status !== "encoded" || typeof wire.wire !== "string") row.reasons.push("negative JSON body wire unavailable");
          else if (Buffer.byteLength(wire.wire) > 262144) row.reasons.push("negative body byte budget");
          else {
            row.request = structuredClone(baseline.request);
            row.request.body = { mediaType: field.name, value: structuredClone(obligation.value), text: wire.wire };
            row.status = "constructed";
          }
        }
      }
    }
  }
  return report;
}
