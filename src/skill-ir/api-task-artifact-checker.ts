import { createHash } from "node:crypto";
import { parseApiTaskContract } from "./api-task-contract";
import { evaluateApiTaskCompletion, type ApiTaskPlanObligation } from "./api-task-plan";
import { verifyApiTaskPlan } from "./api-task-plan-checker";
import { analyzeApiTaskSourceClosure } from "./api-tester-source-closure";
import { verifyApiFormRequestSpecimens } from "./api-request-specimens-checker";
import { verifyApiRequestBodyNegatives } from "./api-request-body-negatives-checker";
import { verifyApiPytestSuite } from "./api-pytest-suite-checker";
import { checkApiResponseObservation } from "./api-response-observation";
import { checkApiResponseHeaders } from "./api-response-headers";
import type {
  ApiTaskArtifactObservation,
  ApiTaskArtifactPackage,
  ApiTaskArtifactRequest,
  ApiTaskArtifactResult,
  ApiTaskResponseEvidence,
  BuildApiTaskArtifactInput,
} from "./api-task-artifact";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}

function responseEvidence(sourceText: string, format: "json" | "yaml", observations: ApiTaskArtifactObservation[]): ApiTaskResponseEvidence[] {
  return observations.map((observation) => ({
    observation: structuredClone(observation),
    observationSha256: sha(stable(observation)),
    bodyCheck: checkApiResponseObservation(sourceText, format, observation),
    headerCheck: observation.headers === undefined ? null : checkApiResponseHeaders(sourceText, format, {
      operationKey: observation.operationKey,
      statusCode: observation.statusCode,
      headers: observation.headers,
    }),
  }));
}

function specimenFor(obligation: ApiTaskPlanObligation, specimens: any): any | null {
  const operation = specimens.operations.find((row: any) => row.key === obligation.operationKey);
  if (!operation?.caseInventoryComplete) return null;
  const mode = obligation.requirementKind === "valid-full" ? "full" : "minimal";
  const omit = obligation.requirementKind === "required-omission" ? obligation.target.id : null;
  return operation.cases.filter((row: any) => row.mode === mode && row.omit === omit)
    .sort((left: any, right: any) => left.id.localeCompare(right.id))[0] ?? null;
}

function negativeCasesFor(obligation: ApiTaskPlanObligation, negatives: any): any[] {
  if (!obligation.target.id.startsWith("body:")) return [];
  return (negatives.operations.find((row: any) => row.key === obligation.operationKey)?.cases ?? [])
    .filter((row: any) => row.fieldId === obligation.target.id)
    .sort((left: any, right: any) => left.id.localeCompare(right.id));
}

function credentialsRequired(operationKey: string, specimens: any): boolean {
  const security = specimens.operations.find((row: any) => row.key === operationKey)?.security;
  if (!Array.isArray(security)) return true;
  return security.length > 0 && !security.some((requirement: unknown) => record(requirement) && Object.keys(requirement).length === 0);
}

function requestRow(obligation: ApiTaskPlanObligation, sourceKind: ApiTaskArtifactRequest["sourceKind"], candidate: any): ApiTaskArtifactRequest {
  return {
    id: JSON.stringify([obligation.obligationId, sourceKind, candidate.id]),
    obligationId: obligation.obligationId,
    operationKey: obligation.operationKey,
    sourceKind,
    sourceCaseId: candidate.id,
    status: candidate.status,
    reasons: [...candidate.reasons],
    requestJson: candidate.request === null ? null : JSON.stringify(candidate.request),
  };
}

function deriveExpected(input: {
  task: ReturnType<typeof parseApiTaskContract>;
  artifact: ApiTaskArtifactPackage;
  sourceClosure: ReturnType<typeof analyzeApiTaskSourceClosure>;
  checkedResponses: ApiTaskResponseEvidence[];
}) {
  const { task, artifact, sourceClosure, checkedResponses } = input;
  const requests: ApiTaskArtifactRequest[] = [];
  const pytestRows = artifact.backend.kind === "pytest" ? JSON.parse(artifact.backend.artifact.suiteJson).rows : [];
  const results: ApiTaskArtifactResult[] = [];
  for (const obligation of artifact.plan.obligations) {
    const result: ApiTaskArtifactResult = {
      obligationId: obligation.obligationId,
      requirementId: obligation.requirementId,
      requirementKind: obligation.requirementKind,
      operationKey: obligation.operationKey,
      targetId: obligation.target.id,
      status: "unresolved",
      reason: null,
      artifactIds: [],
    };
    results.push(result);
    if (obligation.applicability === "insufficient-input") {
      result.status = "not-applicable";
      result.reason = obligation.reason;
      continue;
    }
    if (obligation.applicability === "unresolved-mapping") {
      result.reason = obligation.reason;
      continue;
    }
    const closure = sourceClosure.operationRequirements.find((row) => row.operationKey === obligation.operationKey
      && row.requirementId === obligation.requirementId);
    if (!closure || closure.status !== "source-ready") {
      result.reason = closure ? `source closure ${closure.status}` : "source closure obligation missing";
      continue;
    }
    if (["valid-minimal", "valid-full", "required-omission"].includes(obligation.requirementKind)) {
      const candidate = specimenFor(obligation, artifact.evidence.specimens);
      if (!candidate) {
        result.reason = obligation.target.id.startsWith("path:")
          ? "missing path parameter testing is outside the existing specimen contract"
          : "source-backed request specimen is unavailable";
        continue;
      }
      if (task.output === "request-json") {
        const row = requestRow(obligation, "request-specimen", candidate);
        requests.push(row);
        result.artifactIds.push(row.id);
      } else {
        const row = pytestRows.find((entry: any) => entry.operationKey === obligation.operationKey && entry.caseId === candidate.id);
        if (row) result.artifactIds.push(row.id);
      }
      if (candidate.status === "constructed" && result.artifactIds.length
        && !credentialsRequired(obligation.operationKey, artifact.evidence.specimens)) result.status = "checked-exported";
      else if (candidate.status === "constructed" && result.artifactIds.length) {
        result.reason = "credentials and live authentication are not constructed by the existing backend";
      }
      else result.reason = candidate.reasons.join("; ") || "selected request case is not exported";
      continue;
    }
    if (obligation.requirementKind === "constraint-negative") {
      const cases = negativeCasesFor(obligation, artifact.evidence.bodyNegatives);
      if (task.output === "pytest") {
        result.reason = cases.length
          ? "constraint-negative requests are not rows in the existing pytest runtime contract"
          : "parameter constraint-negative assembly is outside the existing backend contract";
        continue;
      }
      for (const candidate of cases) {
        const row = requestRow(obligation, "constraint-negative", candidate);
        requests.push(row);
        result.artifactIds.push(row.id);
      }
      if (cases.length && cases.every((row) => row.status === "constructed")
        && !credentialsRequired(obligation.operationKey, artifact.evidence.specimens)) result.status = "checked-exported";
      else if (cases.length && cases.every((row) => row.status === "constructed")) {
        result.reason = "credentials and live authentication are not constructed by the existing backend";
      }
      else result.reason = cases.length
        ? `${cases.filter((row) => row.status === "constructed").length}/${cases.length} source constraints constructed`
        : "parameter constraint-negative assembly is outside the existing backend contract";
      continue;
    }
    const matches = checkedResponses.filter((row) => row.observation.operationKey === obligation.operationKey);
    if (matches.length !== 1) {
      result.reason = matches.length ? "multiple response observations are ambiguous" : "declared response observation content was not supplied";
      continue;
    }
    const checked = matches[0]!;
    result.artifactIds.push(`response-observation:${checked.observationSha256}`);
    const bodyValid = checked.bodyCheck.status === "checked" && checked.bodyCheck.valid === true;
    const headersValid = checked.headerCheck === null || checked.headerCheck.status === "checked" && checked.headerCheck.valid === true;
    if (bodyValid && headersValid) result.status = "checked-exported";
    else {
      result.status = "failed";
      result.reason = "supplied response observation does not satisfy the declared source response";
    }
  }
  return { requests, results, pytestRows };
}

export type VerifyApiTaskArtifactInput = BuildApiTaskArtifactInput & { artifact: unknown };

/** Reconstructs every denominator from the original TaskContract and source; the emitted outcome list is never its own universe. */
export async function verifyApiTaskArtifact(input: VerifyApiTaskArtifactInput) {
  const errors = new Set<string>();
  const finish = (expectedObligations = 0, actualObligations = 0) => ({
    status: errors.size ? "fail" as const : "pass" as const,
    errors: [...errors].sort(),
    expectedObligations,
    actualObligations,
  });
  let task: ReturnType<typeof parseApiTaskContract>;
  try { task = parseApiTaskContract(input.task); }
  catch { errors.add("INVALID_TASK_CONTRACT"); return finish(); }
  const artifact = input.artifact as ApiTaskArtifactPackage;
  if (!record(artifact) || artifact.schemaVersion !== "skvm-api-task-artifact/v1" || artifact.exposure !== "development"
    || artifact.wholeSkillCompleted !== false || !record(artifact.plan) || !record(artifact.sourceClosure)
    || !record(artifact.evidence) || !Array.isArray(artifact.responseEvidence) || !record(artifact.backend)
    || !Array.isArray(artifact.obligationResults) || !record(artifact.completion) || !record(artifact.bindings)
    || !Array.isArray(artifact.runtimeDependencies)) {
    errors.add("INVALID_TASK_ARTIFACT");
    return finish();
  }
  if (stable(artifact.taskContract) !== stable(task)) errors.add("TASK_CONTRACT_BINDING_MISMATCH");
  const planCheck = verifyApiTaskPlan(task, input.sourceText, artifact.plan, { supportedOutputs: ["pytest", "request-json"] });
  for (const error of planCheck.errors) errors.add(`PLAN:${error}`);

  let closure: ReturnType<typeof analyzeApiTaskSourceClosure>;
  try {
    closure = analyzeApiTaskSourceClosure({
      task,
      sourceText: input.sourceText,
      rootUri: input.rootUri,
      dependencyManifest: input.dependencyManifest,
      dependencyPayloads: input.dependencyPayloads,
    });
    if (stable(artifact.sourceClosure) !== stable(closure)) errors.add("SOURCE_CLOSURE_BINDING_MISMATCH");
  } catch {
    errors.add("SOURCE_CLOSURE_VERIFICATION_FAILED");
    return finish(planCheck.expectedObligations, artifact.obligationResults.length);
  }

  try {
    const specimenCheck = verifyApiFormRequestSpecimens(input.sourceText, task.input.format, artifact.evidence.specimens);
    for (const error of specimenCheck.errors) errors.add(`SPECIMENS:${error}`);
  } catch { errors.add("SPECIMENS:INVALID_EMBEDDED_EVIDENCE"); }
  try {
    const negativeCheck = verifyApiRequestBodyNegatives(input.sourceText, task.input.format, artifact.evidence.bodyNegatives);
    for (const error of negativeCheck.errors) errors.add(`BODY_NEGATIVES:${error}`);
  } catch { errors.add("BODY_NEGATIVES:INVALID_EMBEDDED_EVIDENCE"); }

  const observations = input.observations ?? [];
  if (new Set(observations.map(({ operationKey }) => operationKey)).size !== observations.length) errors.add("DUPLICATE_OPERATION_OBSERVATION");
  if (task.observations === null && observations.length) errors.add("UNDECLARED_OBSERVATIONS");
  const checkedResponses = responseEvidence(input.sourceText, task.input.format, observations);
  if (stable(artifact.responseEvidence) !== stable(checkedResponses)) errors.add("RESPONSE_EVIDENCE_BINDING_MISMATCH");

  if (artifact.backend.kind !== task.output) errors.add("BACKEND_OUTPUT_MISMATCH");
  if (task.output === "pytest" && artifact.backend.kind === "pytest") {
    const pytestCheck = await verifyApiPytestSuite(input.sourceText, task.input.format, artifact.backend.artifact);
    for (const error of pytestCheck.errors) errors.add(`PYTEST:${error}`);
  } else if (task.output === "request-json" && artifact.backend.kind !== "request-json") {
    errors.add("INVALID_REQUEST_JSON_BACKEND");
  }

  let expected: ReturnType<typeof deriveExpected>;
  try { expected = deriveExpected({ task, artifact, sourceClosure: closure, checkedResponses }); }
  catch { errors.add("ARTIFACT_SELECTION_UNVERIFIABLE"); return finish(planCheck.expectedObligations, artifact.obligationResults.length); }
  const expectedIds = expected.results.map(({ obligationId }) => obligationId).sort();
  const actualIds = artifact.obligationResults.map(({ obligationId }) => obligationId).sort();
  if (new Set(actualIds).size !== actualIds.length || stable(actualIds) !== stable(expectedIds)) errors.add("ARTIFACT_OBLIGATION_COVERAGE_MISMATCH");
  if (stable(artifact.obligationResults) !== stable(expected.results)) errors.add("ARTIFACT_OBLIGATION_BINDING_MISMATCH");
  if (artifact.backend.kind === "request-json") {
    if (!Array.isArray(artifact.backend.requests) || stable(artifact.backend.requests) !== stable(expected.requests)) {
      errors.add("REQUEST_ARTIFACT_BINDING_MISMATCH");
    }
  } else if (artifact.backend.kind === "pytest") {
    const selected = [...new Set(expected.results.flatMap((row) => row.artifactIds)
      .filter((id) => expected.pytestRows.some((entry: any) => entry.id === id)))].sort();
    if (!Array.isArray(artifact.backend.selectedRowIds) || stable(artifact.backend.selectedRowIds) !== stable(selected)) {
      errors.add("PYTEST_TASK_SELECTION_MISMATCH");
    }
  }
  const completion = evaluateApiTaskCompletion(artifact.plan, expected.results.map(({ obligationId, status }) => ({ obligationId, status })));
  if (stable(artifact.completion) !== stable(completion)) errors.add("TASK_COMPLETION_BINDING_MISMATCH");
  const expectedDependencies = task.output === "pytest"
    ? ["python>=3.11", "pytest>=8", "httpx>=0.27", "explicit loopback oracle for execution"]
    : ["UTF-8 JSON consumer", "no network required"];
  if (stable(artifact.runtimeDependencies) !== stable(expectedDependencies)) errors.add("RUNTIME_DEPENDENCY_MISMATCH");
  if (stable(artifact.accounting) !== stable({ loopbackHttpCalls: 0, remoteHttpCalls: 0, projectModelCalls: 0, paidCalls: 0 })) errors.add("ACCOUNTING_MISMATCH");
  const evidence = { specimens: artifact.evidence.specimens, bodyNegatives: artifact.evidence.bodyNegatives };
  const bindings = {
    sourceSha256: artifact.plan.source.sha256,
    taskContractSha256: artifact.plan.taskContractSha256,
    semanticPlanSha256: artifact.plan.semanticPlanSha256,
    sourceClosureSha256: sha(stable(artifact.sourceClosure)),
    evidenceSha256: sha(stable(evidence)),
    backendSha256: sha(stable(artifact.backend)),
  };
  if (stable(artifact.bindings) !== stable(bindings)) errors.add("PACKAGE_BINDING_MISMATCH");
  return finish(expectedIds.length, actualIds.length);
}
