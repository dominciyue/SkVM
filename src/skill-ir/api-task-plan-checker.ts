import { createHash } from "node:crypto";
import { parseApiTaskContract, type ApiTaskOutput, type ApiTaskRequirement } from "./api-task-contract";
import { apiTaskObligationId, type ApiTaskPlan, type ApiTaskPlanObligation, type ApiTaskTarget } from "./api-task-plan";
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

function expectedTargets(requirement: ApiTaskRequirement, operation: ApiTesterSourceOperation): ApiTaskTarget[] {
  if (requirement.kind === "required-omission") {
    const result: ApiTaskTarget[] = operation.parameters
      .filter((parameter) => parameter.required === true && parameter.name !== null && parameter.location !== null)
      .map((parameter) => ({ kind: "required-input", id: `${parameter.location}:${parameter.name}`, sourceLocator: parameter.locator }));
    if (operation.request.required === true) result.push({ kind: "required-input", id: "body", sourceLocator: `${operation.locator}/requestBody` });
    return result.length ? result.sort((a, b) => a.id.localeCompare(b.id))
      : [{ kind: "required-input", id: "no-required-input", sourceLocator: operation.locator }];
  }
  if (requirement.kind === "constraint-negative") {
    const result: ApiTaskTarget[] = operation.parameters
      .filter((parameter) => parameter.name !== null && parameter.location !== null)
      .map((parameter) => ({ kind: "schema-input", id: `${parameter.location}:${parameter.name}`, sourceLocator: parameter.locator }));
    for (const mediaType of operation.request.mediaTypes) result.push({
      kind: "schema-input",
      id: `body:${mediaType}`,
      sourceLocator: `${operation.locator}/requestBody/content/${mediaType.replaceAll("~", "~0").replaceAll("/", "~1")}/schema`,
    });
    return result.length ? result.sort((a, b) => a.id.localeCompare(b.id))
      : [{ kind: "schema-input", id: "no-schema-input", sourceLocator: operation.locator }];
  }
  if (requirement.kind === "response-conformance") return [{ kind: "response", id: "response", sourceLocator: `${operation.locator}/responses` }];
  return [{ kind: "operation", id: "operation", sourceLocator: operation.locator }];
}

function expectedApplicability(requirement: ApiTaskRequirement, target: ApiTaskTarget, task: ReturnType<typeof parseApiTaskContract>) {
  if (task.mapping.unresolvedRequirementIds.includes(requirement.id)) {
    return { applicability: "unresolved-mapping" as const, reason: "source requirement mapping is unresolved" };
  }
  if (requirement.kind === "response-conformance" && task.observations === null) {
    return { applicability: "insufficient-input" as const, reason: "response observation was not supplied" };
  }
  if (target.id === "no-required-input") {
    return { applicability: "insufficient-input" as const, reason: "selected operation has no required request input" };
  }
  if (target.id === "no-schema-input") {
    return { applicability: "insufficient-input" as const, reason: "selected operation has no request schema input" };
  }
  return { applicability: "applicable" as const, reason: null };
}

function expectedCase(kind: ApiTaskRequirement["kind"], target: ApiTaskTarget): ApiTaskPlanObligation["caseContract"] {
  if (kind === "valid-minimal") return { mode: "minimal", omit: null, expectedHttpStatus: null };
  if (kind === "valid-full") return { mode: "full", omit: null, expectedHttpStatus: null };
  if (kind === "required-omission") return { mode: "negative", omit: target.id, expectedHttpStatus: null };
  if (kind === "constraint-negative") return { mode: "negative", omit: null, expectedHttpStatus: null };
  return { mode: "response", omit: null, expectedHttpStatus: null };
}

function expectedChecker(kind: ApiTaskRequirement["kind"]): ApiTaskPlanObligation["checker"] {
  return kind === "constraint-negative" ? "constraint-negative" : kind === "response-conformance" ? "response-observation" : "request-specimen";
}

function semanticProjection(plan: ApiTaskPlan): unknown {
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

/** Re-enumerates the original source and TaskContract; the plan is never treated as its own universe. */
export function verifyApiTaskPlan(
  taskValue: unknown,
  sourceText: string,
  planValue: unknown,
  options: { supportedOutputs: ApiTaskOutput[] },
) {
  const errors = new Set<string>();
  let task: ReturnType<typeof parseApiTaskContract>;
  try { task = parseApiTaskContract(taskValue); } catch { return { status: "fail" as const, errors: ["INVALID_TASK_CONTRACT"], expectedObligations: 0, actualObligations: 0 }; }
  const parsed = parseApiTesterOperationSource(sourceText, task.input.format);
  if (!parsed.document || !parsed.enumeration.complete || !/^3\.0(?:\.|$)/u.test(String(parsed.document?.openapi))) {
    return { status: "fail" as const, errors: ["SOURCE_ENUMERATION_INCOMPLETE"], expectedObligations: 0, actualObligations: 0 };
  }
  const plan = planValue as ApiTaskPlan;
  if (!plan || plan.schemaVersion !== "skvm-api-task-plan/v1" || !Array.isArray(plan.operationKeys)
    || !Array.isArray(plan.requirements) || !Array.isArray(plan.obligations)) {
    return { status: "fail" as const, errors: ["INVALID_TASK_PLAN"], expectedObligations: 0, actualObligations: 0 };
  }
  const byKey = new Map(parsed.enumeration.operations.map((operation) => [operation.key, operation]));
  const selected = (task.operationKeys === "all" ? parsed.enumeration.operations.map(({ key }) => key) : task.operationKeys).slice().sort();
  if (selected.some((key) => !byKey.has(key as any))) errors.add("TASK_OPERATION_NOT_IN_SOURCE");
  if (stable(plan.operationKeys) !== stable(selected)) errors.add("OPERATION_COVERAGE_MISMATCH");
  if (stable(plan.requirements) !== stable(task.requirements)) errors.add("REQUIREMENT_BINDING_MISMATCH");
  if (plan.source.sha256 !== digest(sourceText) || plan.source.format !== task.input.format || plan.source.dialect !== task.input.dialect) errors.add("SOURCE_BINDING_MISMATCH");
  if (plan.taskContractSha256 !== digest(stable(task))) errors.add("TASK_BINDING_MISMATCH");
  if (plan.provenance.taskId !== task.taskId || plan.provenance.mappingOrigin !== task.mapping.origin || plan.provenance.sourceSkill !== task.mapping.sourceSkill) errors.add("PROVENANCE_BINDING_MISMATCH");
  const supported = [...new Set(options.supportedOutputs)].sort();
  const outputStatus = supported.includes(task.output) ? "supported" : "unsupported-output";
  if (stable(plan.capabilities.supportedOutputs) !== stable(supported)
    || plan.output.requested !== task.output || plan.output.status !== outputStatus) errors.add("OUTPUT_CAPABILITY_MISMATCH");
  if (plan.taskComplete !== false || plan.constructionStatus !== "not-run" || plan.planningComplete !== true) errors.add("INVALID_PRECONSTRUCTION_STATE");

  const expected = new Map<string, Omit<ApiTaskPlanObligation, "status">>();
  for (const operationKey of selected) {
    const operation = byKey.get(operationKey as any);
    if (!operation) continue;
    for (const requirement of task.requirements) {
      for (const target of expectedTargets(requirement, operation)) {
        const state = expectedApplicability(requirement, target, task);
        const obligationId = apiTaskObligationId(requirement.id, operation.key, target);
        expected.set(obligationId, {
          obligationId,
          requirementId: requirement.id,
          requirementKind: requirement.kind,
          required: requirement.required,
          sourceRequirementLocator: requirement.sourceLocator,
          operationKey: operation.key,
          operationLocator: operation.locator,
          target,
          applicability: state.applicability,
          reason: state.reason,
          caseContract: expectedCase(requirement.kind, target),
          checker: expectedChecker(requirement.kind),
          output: task.output,
        });
      }
    }
  }
  const actualIds = plan.obligations.map(({ obligationId }) => obligationId);
  if (new Set(actualIds).size !== actualIds.length
    || stable([...actualIds].sort()) !== stable([...expected.keys()].sort())) errors.add("OBLIGATION_COVERAGE_MISMATCH");
  for (const row of plan.obligations) {
    const expectedRow = expected.get(row.obligationId);
    if (!expectedRow) continue;
    if (row.status !== "planned" || stable({ ...row, status: undefined }) !== stable({ ...expectedRow, status: undefined })) {
      errors.add(`OBLIGATION_BINDING_MISMATCH: ${row.obligationId}`);
    }
  }
  const expectedRows = [...expected.values()];
  const required = expectedRows.filter((row) => row.required);
  const coverage = {
    selectedOperations: selected.length,
    requirements: task.requirements.length,
    obligations: expectedRows.length,
    requiredObligations: required.length,
    applicableRequiredObligations: required.filter((row) => row.applicability === "applicable").length,
    insufficientInputRequiredObligations: required.filter((row) => row.applicability === "insufficient-input").length,
    unresolvedMappingRequiredObligations: required.filter((row) => row.applicability === "unresolved-mapping").length,
  };
  if (stable(plan.coverage) !== stable(coverage)) errors.add("COVERAGE_SUMMARY_MISMATCH");
  if (plan.semanticPlanSha256 !== digest(stable(semanticProjection(plan)))) errors.add("SEMANTIC_PLAN_DIGEST_MISMATCH");
  const expectedIssues = outputStatus === "supported" ? [] : [`unsupported-output: ${task.output}`];
  if (stable(plan.issues) !== stable(expectedIssues)) errors.add("PLAN_ISSUE_MISMATCH");
  return {
    status: errors.size ? "fail" as const : "pass" as const,
    errors: [...errors].sort(),
    expectedObligations: expected.size,
    actualObligations: plan.obligations.length,
  };
}
