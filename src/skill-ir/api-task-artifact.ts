import { createHash } from "node:crypto";
import { parseApiTaskContract } from "./api-task-contract";
import { buildApiTaskPlan, evaluateApiTaskCompletion, type ApiTaskCompletionOutcome, type ApiTaskPlanObligation } from "./api-task-plan";
import { verifyApiTaskPlan } from "./api-task-plan-checker";
import { analyzeApiTaskSourceClosure } from "./api-tester-source-closure";
import { buildApiFormRequestSpecimens, type RequestSpecimen, type SpecimenCase } from "./api-request-specimens";
import { verifyApiFormRequestSpecimens } from "./api-request-specimens-checker";
import { buildApiRequestBodyNegatives, type BodyNegativeCase } from "./api-request-body-negatives";
import { verifyApiRequestBodyNegatives } from "./api-request-body-negatives-checker";
import { buildApiPytestSuite, type ApiPytestArtifact } from "./api-pytest-suite";
import { verifyApiPytestSuite } from "./api-pytest-suite-checker";
import { checkApiResponseObservation, type ApiResponseObservation } from "./api-response-observation";
import { checkApiResponseHeaders } from "./api-response-headers";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}

export type ApiTaskArtifactObservation = ApiResponseObservation & {
  headers?: Array<{ name: string; value: string }>;
};

export type ApiTaskArtifactRequest = {
  id: string;
  obligationId: string;
  operationKey: string;
  sourceKind: "request-specimen" | "constraint-negative";
  sourceCaseId: string;
  status: "constructed" | "unresolved";
  reasons: string[];
  requestJson: string | null;
};

export type ApiTaskArtifactResult = {
  obligationId: string;
  requirementId: string;
  requirementKind: ApiTaskPlanObligation["requirementKind"];
  operationKey: string;
  targetId: string;
  status: ApiTaskCompletionOutcome["status"];
  reason: string | null;
  artifactIds: string[];
};

export type ApiTaskResponseEvidence = {
  observation: ApiTaskArtifactObservation;
  observationSha256: string;
  bodyCheck: ReturnType<typeof checkApiResponseObservation>;
  headerCheck: ReturnType<typeof checkApiResponseHeaders> | null;
};

export type ApiTaskArtifactPackage = {
  schemaVersion: "skvm-api-task-artifact/v1";
  exposure: "development";
  taskContract: ReturnType<typeof parseApiTaskContract>;
  plan: ReturnType<typeof buildApiTaskPlan>;
  sourceClosure: ReturnType<typeof analyzeApiTaskSourceClosure>;
  evidence: {
    specimens: ReturnType<typeof buildApiFormRequestSpecimens>;
    bodyNegatives: ReturnType<typeof buildApiRequestBodyNegatives>;
  };
  responseEvidence: ApiTaskResponseEvidence[];
  backend: {
    kind: "request-json";
    requests: ApiTaskArtifactRequest[];
  } | {
    kind: "pytest";
    artifact: ApiPytestArtifact;
    selectedRowIds: string[];
  };
  obligationResults: ApiTaskArtifactResult[];
  completion: ReturnType<typeof evaluateApiTaskCompletion>;
  bindings: {
    sourceSha256: string;
    taskContractSha256: string;
    semanticPlanSha256: string;
    sourceClosureSha256: string;
    evidenceSha256: string;
    backendSha256: string;
  };
  runtimeDependencies: string[];
  accounting: { loopbackHttpCalls: 0; remoteHttpCalls: 0; projectModelCalls: 0; paidCalls: 0 };
  wholeSkillCompleted: false;
};

export type BuildApiTaskArtifactInput = {
  task: unknown;
  sourceText: string;
  rootUri: string;
  dependencyManifest?: unknown;
  dependencyPayloads?: Record<string, string | Uint8Array>;
  observations?: ApiTaskArtifactObservation[];
  sourceRepository?: string | null;
};

function specimenFor(obligation: ApiTaskPlanObligation, specimens: ReturnType<typeof buildApiFormRequestSpecimens>): SpecimenCase | null {
  const operation = specimens.operations.find((row) => row.key === obligation.operationKey);
  if (!operation?.caseInventoryComplete) return null;
  const mode = obligation.requirementKind === "valid-full" ? "full" : "minimal";
  const omit = obligation.requirementKind === "required-omission" ? obligation.target.id : null;
  return operation.cases.filter((row) => row.mode === mode && row.omit === omit).sort((left, right) => left.id.localeCompare(right.id))[0] ?? null;
}

function negativeCasesFor(obligation: ApiTaskPlanObligation, negatives: ReturnType<typeof buildApiRequestBodyNegatives>): BodyNegativeCase[] {
  if (!obligation.target.id.startsWith("body:")) return [];
  return (negatives.operations.find((row) => row.key === obligation.operationKey)?.cases ?? [])
    .filter((row) => row.fieldId === obligation.target.id)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function credentialsRequired(operationKey: string, specimens: ReturnType<typeof buildApiFormRequestSpecimens>): boolean {
  const security = specimens.operations.find((row) => row.key === operationKey)?.security;
  if (!Array.isArray(security)) return true;
  return security.length > 0 && !security.some((requirement) => record(requirement) && Object.keys(requirement).length === 0);
}

function requestRow(
  obligation: ApiTaskPlanObligation,
  sourceKind: ApiTaskArtifactRequest["sourceKind"],
  sourceCaseId: string,
  status: ApiTaskArtifactRequest["status"],
  reasons: string[],
  request: RequestSpecimen | null,
): ApiTaskArtifactRequest {
  return {
    id: JSON.stringify([obligation.obligationId, sourceKind, sourceCaseId]),
    obligationId: obligation.obligationId,
    operationKey: obligation.operationKey,
    sourceKind,
    sourceCaseId,
    status,
    reasons: [...reasons],
    requestJson: request === null ? null : JSON.stringify(request),
  };
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

/**
 * Connects a source-backed TaskContract plan to the existing request and pytest exporters.
 * Missing construction evidence remains an unresolved obligation; no status or live behavior is inferred.
 */
export async function buildApiTaskArtifact(input: BuildApiTaskArtifactInput): Promise<ApiTaskArtifactPackage> {
  const task = parseApiTaskContract(input.task);
  const observations = input.observations ?? [];
  if (observations.length > 10000) throw new Error("observation budget exceeded");
  if (new Set(observations.map(({ operationKey }) => operationKey)).size !== observations.length) throw new Error("duplicate operation observation");
  if (task.observations === null && observations.length) throw new Error("observations were not declared by task");

  const plan = buildApiTaskPlan(task, input.sourceText, {
    sourceRepository: input.sourceRepository ?? null,
    supportedOutputs: ["pytest", "request-json"],
  });
  const planCheck = verifyApiTaskPlan(task, input.sourceText, plan, { supportedOutputs: ["pytest", "request-json"] });
  if (planCheck.status !== "pass") throw new Error(`unverified API task plan: ${planCheck.errors.join("; ")}`);
  const sourceClosure = analyzeApiTaskSourceClosure({
    task,
    sourceText: input.sourceText,
    rootUri: input.rootUri,
    dependencyManifest: input.dependencyManifest,
    dependencyPayloads: input.dependencyPayloads,
  });
  const specimens = buildApiFormRequestSpecimens(input.sourceText, task.input.format);
  const specimenCheck = verifyApiFormRequestSpecimens(input.sourceText, task.input.format, specimens);
  if (specimenCheck.status !== "pass") throw new Error(`unverified request specimens: ${specimenCheck.errors.join("; ")}`);
  const bodyNegatives = buildApiRequestBodyNegatives(input.sourceText, task.input.format);
  const negativeCheck = verifyApiRequestBodyNegatives(input.sourceText, task.input.format, bodyNegatives);
  if (negativeCheck.status !== "pass") throw new Error(`unverified request negatives: ${negativeCheck.errors.join("; ")}`);
  const checkedResponses = responseEvidence(input.sourceText, task.input.format, observations);

  const requests: ApiTaskArtifactRequest[] = [];
  let pytestArtifact: ApiPytestArtifact | null = null;
  let pytestRows: any[] = [];
  if (task.output === "pytest") {
    pytestArtifact = await buildApiPytestSuite(input.sourceText, task.input.format);
    const pytestCheck = await verifyApiPytestSuite(input.sourceText, task.input.format, pytestArtifact);
    if (pytestCheck.status !== "pass") throw new Error(`unverified pytest artifact: ${pytestCheck.errors.join("; ")}`);
    pytestRows = JSON.parse(pytestArtifact.suiteJson).rows;
  }

  const results: ApiTaskArtifactResult[] = [];
  for (const obligation of plan.obligations) {
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
      const candidate = specimenFor(obligation, specimens);
      if (!candidate) {
        result.reason = obligation.target.id.startsWith("path:")
          ? "missing path parameter testing is outside the existing specimen contract"
          : "source-backed request specimen is unavailable";
        continue;
      }
      if (task.output === "request-json") {
        const row = requestRow(obligation, "request-specimen", candidate.id, candidate.status, candidate.reasons, candidate.request);
        requests.push(row);
        result.artifactIds.push(row.id);
      } else {
        const row = pytestRows.find((entry) => entry.operationKey === obligation.operationKey && entry.caseId === candidate.id);
        if (row) result.artifactIds.push(row.id);
      }
      if (candidate.status === "constructed" && result.artifactIds.length && !credentialsRequired(obligation.operationKey, specimens)) {
        result.status = "checked-exported";
      }
      else if (candidate.status === "constructed" && result.artifactIds.length) {
        result.reason = "credentials and live authentication are not constructed by the existing backend";
      }
      else result.reason = candidate.reasons.join("; ") || "selected request case is not exported";
      continue;
    }
    if (obligation.requirementKind === "constraint-negative") {
      const cases = negativeCasesFor(obligation, bodyNegatives);
      if (task.output === "pytest") {
        result.reason = cases.length
          ? "constraint-negative requests are not rows in the existing pytest runtime contract"
          : "parameter constraint-negative assembly is outside the existing backend contract";
        continue;
      }
      for (const candidate of cases) {
        const row = requestRow(obligation, "constraint-negative", candidate.id, candidate.status, candidate.reasons, candidate.request);
        requests.push(row);
        result.artifactIds.push(row.id);
      }
      if (cases.length && cases.every((row) => row.status === "constructed")
        && !credentialsRequired(obligation.operationKey, specimens)) result.status = "checked-exported";
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

  const backend: ApiTaskArtifactPackage["backend"] = task.output === "request-json"
    ? { kind: "request-json", requests }
    : { kind: "pytest", artifact: pytestArtifact!, selectedRowIds: [...new Set(results.flatMap((row) => row.artifactIds)
      .filter((id) => pytestRows.some((entry) => entry.id === id)))].sort() };
  const obligationOutcomes = results.map(({ obligationId, status }) => ({ obligationId, status }));
  const completion = evaluateApiTaskCompletion(plan, obligationOutcomes);
  const evidence = { specimens, bodyNegatives };
  const runtimeDependencies = task.output === "pytest"
    ? ["python>=3.11", "pytest>=8", "httpx>=0.27", "explicit loopback oracle for execution"]
    : ["UTF-8 JSON consumer", "no network required"];
  return {
    schemaVersion: "skvm-api-task-artifact/v1",
    exposure: "development",
    taskContract: task,
    plan,
    sourceClosure,
    evidence,
    responseEvidence: checkedResponses,
    backend,
    obligationResults: results,
    completion,
    bindings: {
      sourceSha256: plan.source.sha256,
      taskContractSha256: plan.taskContractSha256,
      semanticPlanSha256: plan.semanticPlanSha256,
      sourceClosureSha256: sha(stable(sourceClosure)),
      evidenceSha256: sha(stable(evidence)),
      backendSha256: sha(stable(backend)),
    },
    runtimeDependencies,
    accounting: { loopbackHttpCalls: 0, remoteHttpCalls: 0, projectModelCalls: 0, paidCalls: 0 },
    wholeSkillCompleted: false,
  };
}
