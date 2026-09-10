import { createHash } from "node:crypto";
import { parseApiTesterOperationSource, projectApiTesterOperation } from "./api-tester-operation-source";
import { verifyApiTesterProjectionDependencies } from "./api-tester-operation-coverage";
import { constructSchemaCases } from "./api-schema-cases";
import type { SchemaCaseSet } from "./api-schema-obligations";
import { encodeApiParameter } from "./api-parameter-wire";

type Raw = Record<string, any>;
const object = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
export type WireCase = { caseId: string; status: "encoded" | "unsupported"; wire: string | null; reason: string | null };
export type RequestSchemaCases = { id: string; location: string; name: string; required: boolean; schema: unknown; cases: SchemaCaseSet; wireCases: WireCase[] };
export type ApiRequestCaseOperation = { key: string; locator: string; operationId: string | null; summary: string | null;
  projectedOperation: Raw | null; schemas: RequestSchemaCases[]; sourceAdvisories: unknown[]; remainingObligations: string[]; issues: string[] };
export type ApiRequestCasesReport = { schemaVersion: "api-request-cases/v2"; sourceSha256: string; sourceFormat: "json" | "yaml";
  enumerationComplete: boolean; enumerationIssues: unknown[]; operations: ApiRequestCaseOperation[];
  accounting: { modelCalls: 0; paidCalls: 0 }; wholeSkillCompleted: false };

function dereference(document: Raw, raw: any): any {
  const seen = new Set<string>();
  while (object(raw) && raw.$ref !== undefined) {
    if (typeof raw.$ref !== "string" || !raw.$ref.startsWith("#/") || seen.has(raw.$ref)) throw new Error("unresolved parameter/request reference");
    seen.add(raw.$ref);
    let value: any = document;
    for (const part of raw.$ref.slice(2).split("/")) {
      const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
      if (!object(value) || !Object.hasOwn(value, key)) throw new Error("missing parameter/request reference");
      value = value[key];
    }
    raw = value;
  }
  return raw;
}

export function buildApiRequestCases(sourceText: string, format: "json" | "yaml"): ApiRequestCasesReport {
  const parsed = parseApiTesterOperationSource(sourceText, format);
  if (!parsed.document || !/^3\.0\./u.test(String(parsed.document.openapi))) throw new Error("request cases require a parseable OpenAPI 3.0.x source");
  const document = parsed.document;
  const report: ApiRequestCasesReport = { schemaVersion: "api-request-cases/v2", sourceSha256: createHash("sha256").update(sourceText).digest("hex"),
    sourceFormat: format, enumerationComplete: parsed.enumeration.complete, enumerationIssues: parsed.enumeration.unresolved,
    operations: [], accounting: { modelCalls: 0, paidCalls: 0 }, wholeSkillCompleted: false };
  for (const operation of parsed.enumeration.operations) {
    const row: ApiRequestCaseOperation = { key: operation.key, locator: operation.locator, operationId: operation.operationId, summary: operation.summary,
      projectedOperation: null, schemas: [], sourceAdvisories: [], issues: [], remainingObligations: ["http-status-trigger-evidence",
        "parameter-presence-and-serialization", "credentials-and-live-auth", "response-validation", "business-lifecycle", "requested-output-format", "prose-only-constraints"] };
    report.operations.push(row);
    try {
      const projection = projectApiTesterOperation(document, operation.key);
      const projected = (projection.document.paths as Raw)[operation.path][operation.method.toLowerCase()];
      row.projectedOperation = projected;
      const dependencies = verifyApiTesterProjectionDependencies({ sourceDocument: document, projectedDocument: projection.document, operationKey: operation.key });
      row.sourceAdvisories = dependencies.sourceIssues;
      row.issues.push(...projection.unresolved.map((i) => `${i.code}: ${i.locator}`));
      if (!dependencies.checks.projectionPreservation) row.issues.push(...dependencies.errors);
      const add = (id: string, location: string, name: string, required: boolean, schema: unknown, parameter?: Raw) => {
        const cases = constructSchemaCases(document, schema);
        const wireCases: WireCase[] = cases.cases.filter((c) => c.status === "covered").map((c) => {
          const encoded = parameter ? encodeApiParameter(parameter, c.value)
            : name === "application/json" || /^application\/[A-Za-z0-9._-]+\+json$/u.test(name)
              ? { status: "encoded" as const, wire: JSON.stringify(c.value) }
              : { status: "unsupported" as const, reason: "body media serialization unsupported" };
          return { caseId: c.id, status: encoded.status, wire: encoded.status === "encoded" ? encoded.wire : null,
            reason: encoded.status === "unsupported" ? encoded.reason : null };
        });
        row.schemas.push({ id, location, name, required, schema, cases, wireCases });
      };
      for (const raw of projected.parameters ?? []) {
        const parameter = dereference(document, raw);
        if (!object(parameter) || typeof parameter.in !== "string" || typeof parameter.name !== "string") throw new Error("unresolved parameter identity");
        if (parameter.schema !== undefined) add(`${parameter.in}:${parameter.name}`, parameter.in, parameter.name, parameter.required === true, parameter.schema, parameter);
        else if (object(parameter.content)) for (const [media, value] of Object.entries(parameter.content)) add(`${parameter.in}:${parameter.name}:${media}`, parameter.in, parameter.name, parameter.required === true, (value as Raw).schema, parameter);
        else add(`${parameter.in}:${parameter.name}`, parameter.in, parameter.name, parameter.required === true, undefined, parameter);
      }
      if (projected.requestBody !== undefined) {
        const body = dereference(document, projected.requestBody);
        if (!object(body) || !object(body.content)) throw new Error("unresolved request content");
        for (const [media, value] of Object.entries(body.content)) add(`body:${media}`, "body", media, body.required === true, (value as Raw).schema);
      }
    } catch (error) { row.issues.push(String(error)); }
  }
  return report;
}
