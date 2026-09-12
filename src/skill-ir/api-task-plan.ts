import { createHash } from "node:crypto";
import { parseApiTaskContract, type ApiTaskContract, type ApiTaskOutput, type ApiTaskRequirement } from "./api-task-contract";
import { parseApiTesterOperationSource, type ApiTesterSourceOperation } from "./api-tester-operation-source";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

export type ApiTaskTarget = {
  kind: "operation" | "required-input" | "schema-input" | "response";
  id: string;
  sourceLocator: string;
};

export type ApiTaskPlanObligation = {
  obligationId: string;
  requirementId: string;
  requirementKind: ApiTaskRequirement["kind"];
  required: boolean;
  sourceRequirementLocator: string;
  operationKey: string;
  operationLocator: string;
  target: ApiTaskTarget;
  applicability: "applicable" | "insufficient-input" | "unresolved-mapping";
  reason: string | null;
  caseContract: {
    mode: "minimal" | "full" | "negative" | "response";
    omit: string | null;
    expectedHttpStatus: null;
  };
  checker: "request-specimen" | "constraint-negative" | "response-observation";
  output: ApiTaskOutput;
  status: "planned";
};

export type ApiTaskPlan = {
  schemaVersion: "skvm-api-task-plan/v1";
  taskContractSha256: string;
  semanticPlanSha256: string;
  source: { sha256: string; format: "json" | "yaml"; dialect: "oas3.0"; enumerationComplete: boolean; enumerationIssues: unknown[] };
  provenance: { taskId: string; mappingOrigin: ApiTaskContract["mapping"]["origin"]; sourceSkill: string | null; sourceRepository: string | null };
  profile: ApiTaskContract["profile"];
  operationKeys: string[];
  requirements: ApiTaskRequirement[];
  obligations: ApiTaskPlanObligation[];
  output: { requested: ApiTaskOutput; status: "supported" | "unsupported-output" };
  capabilities: { supportedOutputs: ApiTaskOutput[] };
  planningComplete: boolean;
  issues: string[];
  coverage: {
    selectedOperations: number;
    requirements: number;
    obligations: number;
    requiredObligations: number;
    applicableRequiredObligations: number;
    insufficientInputRequiredObligations: number;
    unresolvedMappingRequiredObligations: number;
  };
  constructionStatus: "not-run";
  taskComplete: false;
};

export type ApiTaskCompletionOutcome = {
  obligationId: string;
  status: "checked-exported" | "failed" | "unresolved" | "not-applicable";
};

export function apiTaskObligationId(requirementId: string, operationKey: string, target: ApiTaskTarget): string {
  return JSON.stringify([requirementId, operationKey, target.kind, target.id]);
}

function requiredInputTargets(operation: ApiTesterSourceOperation): ApiTaskTarget[] {
  const targets = operation.parameters
    .filter((parameter) => parameter.required === true && parameter.name !== null && parameter.location !== null)
    .map((parameter) => ({
      kind: "required-input" as const,
      id: `${parameter.location}:${parameter.name}`,
      sourceLocator: parameter.locator,
    }));
  if (operation.request.required === true) {
    targets.push({ kind: "required-input", id: "body", sourceLocator: `${operation.locator}/requestBody` });
  }
  return targets.sort((left, right) => left.id.localeCompare(right.id));
}

function schemaInputTargets(operation: ApiTesterSourceOperation): ApiTaskTarget[] {
  const targets = operation.parameters
    .filter((parameter) => parameter.name !== null && parameter.location !== null)
    .map((parameter) => ({
      kind: "schema-input" as const,
      id: `${parameter.location}:${parameter.name}`,
      sourceLocator: parameter.locator,
    }));
  for (const mediaType of operation.request.mediaTypes) {
    targets.push({
      kind: "schema-input",
      id: `body:${mediaType}`,
      sourceLocator: `${operation.locator}/requestBody/content/${mediaType.replaceAll("~", "~0").replaceAll("/", "~1")}/schema`,
    });
  }
  return targets.sort((left, right) => left.id.localeCompare(right.id));
}

function targetsFor(requirement: ApiTaskRequirement, operation: ApiTesterSourceOperation): Array<{ target: ApiTaskTarget; applicability: ApiTaskPlanObligation["applicability"]; reason: string | null }> {
  if (requirement.kind === "required-omission") {
    const targets = requiredInputTargets(operation);
    if (targets.length === 0) return [{
      target: { kind: "required-input", id: "no-required-input", sourceLocator: operation.locator },
      applicability: "insufficient-input",
      reason: "selected operation has no required request input",
    }];
    return targets.map((target) => ({ target, applicability: "applicable", reason: null }));
  }
  if (requirement.kind === "constraint-negative") {
    const targets = schemaInputTargets(operation);
    if (targets.length === 0) return [{
      target: { kind: "schema-input", id: "no-schema-input", sourceLocator: operation.locator },
      applicability: "insufficient-input",
      reason: "selected operation has no request schema input",
    }];
    return targets.map((target) => ({ target, applicability: "applicable", reason: null }));
  }
  if (requirement.kind === "response-conformance") return [{
    target: { kind: "response", id: "response", sourceLocator: `${operation.locator}/responses` },
    applicability: "applicable",
    reason: null,
  }];
  return [{
    target: { kind: "operation", id: "operation", sourceLocator: operation.locator },
    applicability: "applicable",
    reason: null,
  }];
}

function caseContract(kind: ApiTaskRequirement["kind"], target: ApiTaskTarget): ApiTaskPlanObligation["caseContract"] {
  if (kind === "valid-minimal") return { mode: "minimal", omit: null, expectedHttpStatus: null };
  if (kind === "valid-full") return { mode: "full", omit: null, expectedHttpStatus: null };
  if (kind === "required-omission") return { mode: "negative", omit: target.id, expectedHttpStatus: null };
  if (kind === "constraint-negative") return { mode: "negative", omit: null, expectedHttpStatus: null };
  return { mode: "response", omit: null, expectedHttpStatus: null };
}

function checker(kind: ApiTaskRequirement["kind"]): ApiTaskPlanObligation["checker"] {
  if (kind === "constraint-negative") return "constraint-negative";
  if (kind === "response-conformance") return "response-observation";
  return "request-specimen";
}

function semanticProjection(plan: Omit<ApiTaskPlan, "semanticPlanSha256">): unknown {
  return {
    profile: plan.profile,
    source: { sha256: plan.source.sha256, format: plan.source.format, dialect: plan.source.dialect },
    operationKeys: [...plan.operationKeys].sort(),
    requirements: plan.requirements.map(({ id, kind, required, scope }) => ({ id, kind, required, scope })).sort((a, b) => a.id.localeCompare(b.id)),
    obligations: plan.obligations.map((row) => ({
      obligationId: row.obligationId,
      requirementId: row.requirementId,
      requirementKind: row.requirementKind,
      required: row.required,
      operationKey: row.operationKey,
      target: { kind: row.target.kind, id: row.target.id },
      applicability: row.applicability,
      reason: row.reason,
      caseContract: row.caseContract,
      checker: row.checker,
      output: row.output,
    })).sort((a, b) => a.obligationId.localeCompare(b.obligationId)),
    output: plan.output,
  };
}

export function buildApiTaskPlan(
  value: unknown,
  sourceText: string,
  options: { sourceRepository?: string | null; supportedOutputs: ApiTaskOutput[] },
): ApiTaskPlan {
  const task = parseApiTaskContract(value);
  const parsed = parseApiTesterOperationSource(sourceText, task.input.format);
  if (!parsed.document || !parsed.enumeration.complete) {
    throw new Error(`API task source enumeration incomplete: ${parsed.enumeration.unresolved.map((row) => row.code).join(", ")}`);
  }
  if (!/^3\.0(?:\.|$)/u.test(String(parsed.document.openapi))) throw new Error("API task source dialect is not OpenAPI 3.0.x");
  const byKey = new Map(parsed.enumeration.operations.map((operation) => [operation.key, operation]));
  const operationKeys = (task.operationKeys === "all"
    ? parsed.enumeration.operations.map(({ key }) => key)
    : task.operationKeys).slice().sort();
  for (const key of operationKeys) if (!byKey.has(key as any)) throw new Error(`API task operation is not in source: ${key}`);
  const supportedOutputs = [...new Set(options.supportedOutputs)].sort();
  const outputStatus = supportedOutputs.includes(task.output) ? "supported" as const : "unsupported-output" as const;
  const obligations: ApiTaskPlanObligation[] = [];
  for (const operationKey of operationKeys) {
    const operation = byKey.get(operationKey as any)!;
    for (const requirement of task.requirements) {
      for (const item of targetsFor(requirement, operation)) {
        let applicability = item.applicability;
        let reason = item.reason;
        if (task.mapping.unresolvedRequirementIds.includes(requirement.id)) {
          applicability = "unresolved-mapping";
          reason = "source requirement mapping is unresolved";
        } else if (requirement.kind === "response-conformance" && task.observations === null) {
          applicability = "insufficient-input";
          reason = "response observation was not supplied";
        }
        obligations.push({
          obligationId: apiTaskObligationId(requirement.id, operation.key, item.target),
          requirementId: requirement.id,
          requirementKind: requirement.kind,
          required: requirement.required,
          sourceRequirementLocator: requirement.sourceLocator,
          operationKey: operation.key,
          operationLocator: operation.locator,
          target: item.target,
          applicability,
          reason,
          caseContract: caseContract(requirement.kind, item.target),
          checker: checker(requirement.kind),
          output: task.output,
          status: "planned",
        });
      }
    }
  }
  const required = obligations.filter((row) => row.required);
  const withoutSemantic = {
    schemaVersion: "skvm-api-task-plan/v1" as const,
    taskContractSha256: digest(stable(task)),
    source: {
      sha256: digest(sourceText),
      format: task.input.format,
      dialect: task.input.dialect,
      enumerationComplete: parsed.enumeration.complete,
      enumerationIssues: parsed.enumeration.unresolved,
    },
    provenance: {
      taskId: task.taskId,
      mappingOrigin: task.mapping.origin,
      sourceSkill: task.mapping.sourceSkill,
      sourceRepository: options.sourceRepository ?? null,
    },
    profile: task.profile,
    operationKeys,
    requirements: task.requirements.map((row) => ({ ...row })),
    obligations,
    output: { requested: task.output, status: outputStatus },
    capabilities: { supportedOutputs },
    planningComplete: true,
    issues: outputStatus === "supported" ? [] : [`unsupported-output: ${task.output}`],
    coverage: {
      selectedOperations: operationKeys.length,
      requirements: task.requirements.length,
      obligations: obligations.length,
      requiredObligations: required.length,
      applicableRequiredObligations: required.filter((row) => row.applicability === "applicable").length,
      insufficientInputRequiredObligations: required.filter((row) => row.applicability === "insufficient-input").length,
      unresolvedMappingRequiredObligations: required.filter((row) => row.applicability === "unresolved-mapping").length,
    },
    constructionStatus: "not-run" as const,
    taskComplete: false as const,
  };
  return { ...withoutSemantic, semanticPlanSha256: digest(stable(semanticProjection(withoutSemantic as Omit<ApiTaskPlan, "semanticPlanSha256">))) };
}

export function evaluateApiTaskCompletion(plan: ApiTaskPlan, outcomes: ApiTaskCompletionOutcome[]) {
  const errors: string[] = [];
  const outcomeById = new Map<string, ApiTaskCompletionOutcome>();
  const known = new Set(plan.obligations.map(({ obligationId }) => obligationId));
  for (const outcome of outcomes) {
    if (!known.has(outcome.obligationId)) errors.push(`unknown obligation outcome: ${outcome.obligationId}`);
    else if (outcomeById.has(outcome.obligationId)) errors.push(`duplicate obligation outcome: ${outcome.obligationId}`);
    else outcomeById.set(outcome.obligationId, outcome);
  }
  const counts = { total: 0, checkedExported: 0, failed: 0, unresolved: 0, insufficientInput: 0, missing: 0 };
  for (const obligation of plan.obligations.filter((row) => row.required)) {
    counts.total++;
    if (obligation.applicability === "insufficient-input") { counts.insufficientInput++; continue; }
    if (obligation.applicability === "unresolved-mapping") { counts.unresolved++; continue; }
    const outcome = outcomeById.get(obligation.obligationId);
    if (!outcome) { counts.missing++; continue; }
    if (outcome.status === "checked-exported") counts.checkedExported++;
    else if (outcome.status === "failed") counts.failed++;
    else counts.unresolved++;
  }
  const taskComplete = plan.planningComplete
    && plan.output.status === "supported"
    && errors.length === 0
    && counts.total > 0
    && counts.checkedExported === counts.total;
  return { schemaVersion: "skvm-api-task-completion/v1" as const, taskComplete, required: counts, errors };
}
