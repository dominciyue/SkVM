import { describe, expect, test } from "bun:test";
import { buildApiTaskPlan, evaluateApiTaskCompletion } from "./api-task-plan";
import { verifyApiTaskPlan } from "./api-task-plan-checker";

const SOURCE = `openapi: 3.0.3
info:
  title: Planning fixture
  version: 1.0.0
paths:
  /health:
    get:
      responses:
        '200': { description: ok }
  /items/{id}:
    parameters:
      - name: id
        in: path
        required: true
        schema: { type: string, minLength: 1 }
    get:
      parameters:
        - name: limit
          in: query
          required: true
          schema: { type: integer, minimum: 1, maximum: 50 }
      responses:
        '200': { description: ok }
  /items:
    post:
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [name]
              properties:
                name: { type: string, minLength: 1 }
      responses:
        '201': { description: created }
`;

function contract(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "skvm-api-task/v1",
    taskId: "planning-fixture",
    profile: "oas30-offline-test/v1",
    input: { path: "api.yaml", format: "yaml", dialect: "oas3.0" },
    dependencyManifest: null,
    operationKeys: ["GET /items/{id}"],
    requirements: [{ id: "minimal", kind: "valid-minimal", required: true, scope: "each-selected-operation", sourceLocator: "user:requirements/0" }],
    output: "request-json",
    observations: null,
    execution: { mode: "offline-validation" },
    mapping: { origin: "agent-reviewed", sourceSkill: "owner/repo:SKILL.md", unresolvedRequirementIds: [] },
    ...overrides,
  };
}

describe("API task construction planning", () => {
  test("different source-grounded requirements change the complete pre-construction denominator", () => {
    const minimal = buildApiTaskPlan(contract(), SOURCE, { sourceRepository: "owner/repo", supportedOutputs: ["request-json", "pytest"] });
    const rich = buildApiTaskPlan(contract({
      requirements: [
        { id: "full", kind: "valid-full", required: true, scope: "each-selected-operation", sourceLocator: "SKILL.md:10" },
        { id: "omission", kind: "required-omission", required: true, scope: "each-selected-operation", sourceLocator: "SKILL.md:18" },
        { id: "negative", kind: "constraint-negative", required: true, scope: "each-selected-operation", sourceLocator: "SKILL.md:19" },
      ],
    }), SOURCE, { sourceRepository: "owner/repo", supportedOutputs: ["request-json", "pytest"] });
    expect(minimal.coverage).toMatchObject({ selectedOperations: 1, requirements: 1, obligations: 1, requiredObligations: 1 });
    expect(rich.coverage).toMatchObject({ selectedOperations: 1, requirements: 3, obligations: 5, requiredObligations: 5 });
    expect(rich.obligations.map((row) => [row.requirementId, row.target.kind, row.target.id])).toEqual([
      ["full", "operation", "operation"],
      ["omission", "required-input", "path:id"],
      ["omission", "required-input", "query:limit"],
      ["negative", "schema-input", "path:id"],
      ["negative", "schema-input", "query:limit"],
    ]);
    expect(rich.semanticPlanSha256).not.toBe(minimal.semanticPlanSha256);
  });

  test("renaming skill and repository provenance does not change plan semantics", () => {
    const first = buildApiTaskPlan(contract(), SOURCE, { sourceRepository: "owner/repo", supportedOutputs: ["request-json"] });
    const second = buildApiTaskPlan(contract({
      mapping: { origin: "agent-reviewed", sourceSkill: "renamed/member:OTHER.md", unresolvedRequirementIds: [] },
    }), SOURCE, { sourceRepository: "renamed/repository", supportedOutputs: ["request-json"] });
    expect(second.semanticPlanSha256).toBe(first.semanticPlanSha256);
    expect(second.provenance).not.toEqual(first.provenance);
  });

  test("independent verification detects a deleted required plan item", () => {
    const task = contract({
      requirements: [
        { id: "full", kind: "valid-full", required: true, scope: "each-selected-operation", sourceLocator: "SKILL.md:10" },
        { id: "omission", kind: "required-omission", required: true, scope: "each-selected-operation", sourceLocator: "SKILL.md:18" },
      ],
    });
    const plan = buildApiTaskPlan(task, SOURCE, { sourceRepository: "owner/repo", supportedOutputs: ["request-json"] });
    expect(verifyApiTaskPlan(task, SOURCE, plan, { supportedOutputs: ["request-json"] }).status).toBe("pass");
    plan.obligations.splice(1, 1);
    const checked = verifyApiTaskPlan(task, SOURCE, plan, { supportedOutputs: ["request-json"] });
    expect(checked.status).toBe("fail");
    expect(checked.errors).toContain("OBLIGATION_COVERAGE_MISMATCH");
  });

  test("reports a valid but unavailable native output as unsupported-output", () => {
    const plan = buildApiTaskPlan(contract({ output: "pytest" }), SOURCE, {
      sourceRepository: "owner/repo",
      supportedOutputs: ["request-json"],
    });
    expect(plan.output).toEqual({ requested: "pytest", status: "unsupported-output" });
    expect(plan.taskComplete).toBe(false);
    expect(verifyApiTaskPlan(contract({ output: "pytest" }), SOURCE, plan, { supportedOutputs: ["request-json"] }).status).toBe("pass");
  });

  test("does not invent a required omission case when the operation has no required input", () => {
    const plan = buildApiTaskPlan(contract({
      operationKeys: ["GET /health"],
      requirements: [{ id: "omission", kind: "required-omission", required: true, scope: "each-selected-operation", sourceLocator: "SKILL.md:18" }],
    }), SOURCE, { sourceRepository: "owner/repo", supportedOutputs: ["request-json"] });
    expect(plan.obligations).toHaveLength(1);
    expect(plan.obligations[0]).toMatchObject({
      applicability: "insufficient-input",
      target: { kind: "required-input", id: "no-required-input" },
    });
    expect(plan.coverage.insufficientInputRequiredObligations).toBe(1);
  });

  test("one checked case cannot complete a task with another required obligation missing", () => {
    const task = contract({
      requirements: [
        { id: "minimal", kind: "valid-minimal", required: true, scope: "each-selected-operation", sourceLocator: "SKILL.md:10" },
        { id: "full", kind: "valid-full", required: true, scope: "each-selected-operation", sourceLocator: "SKILL.md:11" },
      ],
    });
    const plan = buildApiTaskPlan(task, SOURCE, { sourceRepository: "owner/repo", supportedOutputs: ["request-json"] });
    const completion = evaluateApiTaskCompletion(plan, [{ obligationId: plan.obligations[0]!.obligationId, status: "checked-exported" }]);
    expect(completion.taskComplete).toBe(false);
    expect(completion.required).toEqual({ total: 2, checkedExported: 1, failed: 0, unresolved: 0, insufficientInput: 0, missing: 1 });
  });

  test("response conformance remains insufficient without supplied observations", () => {
    const plan = buildApiTaskPlan(contract({
      requirements: [{ id: "response", kind: "response-conformance", required: true, scope: "each-selected-operation", sourceLocator: "SKILL.md:30" }],
    }), SOURCE, { sourceRepository: "owner/repo", supportedOutputs: ["request-json"] });
    expect(plan.obligations[0]).toMatchObject({ applicability: "insufficient-input", reason: "response observation was not supplied" });
    expect(plan.taskComplete).toBe(false);
  });
});
