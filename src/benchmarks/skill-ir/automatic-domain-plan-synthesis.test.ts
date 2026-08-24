import { describe, expect, test } from "bun:test";
import {
  auditRestrictedDomainPlanLeakage,
  buildRestrictedDomainPlanRequest,
  completeRestrictedDomainPlanOnce,
  deriveForbiddenTaskDataLiterals,
} from "./automatic-domain-plan-synthesis";
import { RestrictedDomainPlanSchema } from "./automatic-restricted-domain-plan";

function plan() {
  return RestrictedDomainPlanSchema.parse({
    schemaVersion: "skill-ir-restricted-domain-plan/v1",
    planId: "synthesis-test",
    steps: [
      { id: "source", op: "read-text", path: ".env" },
      {
        id: "write",
        op: "write-json",
        path: "report.json",
        fields: [{ key: "status", value: { kind: "literal", value: "public-status" } }],
      },
    ],
    audit: { paidCalls: 1, retries: 0, heldOutAccesses: 0, evaluatorPayloadAccesses: 0, skillSpecificBranches: 0 },
  });
}

describe("restricted Domain Plan synthesis", () => {
  test("builds a generation request without evaluator, gold, threshold, or held-out fields", () => {
    const request = buildRestrictedDomainPlanRequest({
      sourceText: "# Public skill\nRead public-status rules.\n",
      taskDescription: {
        schemaVersion: "skill-ir-task-description/v1",
        descriptionId: "synthesis-task",
        taskKind: "analysis-report",
        inputs: [
          { id: "environment", path: ".env", format: "text", access: "read-only", required: true },
          { id: "contract", path: "contract.json", format: "json", access: "read-only", required: true },
        ],
        outputs: [{ id: "report", path: "report.json", format: "json", required: true, structure: { kind: "json-object", requiredFields: ["status"], allowAdditionalFields: false } }],
        passCriteria: [{ id: "grounding", predicate: "source-grounding", targetRefs: ["environment", "contract", "report"], statement: "Follow public-status rules." }],
      },
      constructionTask: {
        id: "dev-001",
        split: "development",
        prompt: "Use the public contract.",
        fixtures: {
          ".env": "PRIVATE_TASK_KEY=TEST_ONLY_PRIVATE_VALUE_1234\n",
          "contract.json": "{\"status\":\"public-status\"}\n",
        },
        eval: [{ evaluatorId: "private-evaluator", payload: { gold: "secret-answer" } }],
        hardGateIds: ["private-gate"],
        passThreshold: 1,
        heldOutPath: "held-out/secret.json",
      },
      publicContractFixturePaths: ["contract.json"],
    });
    const serialized = JSON.stringify(request);
    expect(serialized).toContain("PRIVATE_TASK_KEY");
    expect(serialized).not.toContain("private-evaluator");
    expect(serialized).not.toContain("secret-answer");
    expect(serialized).not.toContain("private-gate");
    expect(serialized).not.toContain("passThreshold");
    expect(serialized).not.toContain("held-out/secret.json");
    expect(request.audit).toEqual({
      evaluatorPayloadAccesses: 0,
      heldOutAccesses: 0,
      retries: 0,
      requestedCalls: 1,
      toolAccess: false,
    });
  });

  test("rejects plan literals copied only from construction-task data while allowing public contract literals", () => {
    const forbidden = deriveForbiddenTaskDataLiterals({
      sourceText: "# Public skill\n",
      taskDescriptionText: "public-status report.json",
      prompt: "Use the public contract.",
      fixtures: {
        ".env": "PRIVATE_TASK_KEY=TEST_ONLY_PRIVATE_VALUE_1234\n",
        "contract.json": "{\"status\":\"public-status\"}\n",
        "document.txt": "Task Specific Long Document Title 8472\nBody unique-token-9955\n",
      },
      publicContractFixturePaths: ["contract.json"],
    });
    expect(forbidden).toContain("PRIVATE_TASK_KEY");
    expect(forbidden).toContain("TEST_ONLY_PRIVATE_VALUE_1234");
    expect(forbidden).toContain("Task Specific Long Document Title 8472");
    expect(() => auditRestrictedDomainPlanLeakage(plan(), forbidden)).not.toThrow();
    const leaked = structuredClone(plan());
    const write = leaked.steps.find((entry) => entry.id === "write")! as {
      fields: Array<{ value: { kind: "literal"; value: string } }>;
    };
    write.fields[0]!.value.value = "PRIVATE_TASK_KEY";
    expect(() => auditRestrictedDomainPlanLeakage(leaked, forbidden)).toThrow("construction-task-only literal");
  });

  test("uses exactly one HTTP attempt and validates the forced tool result", async () => {
    let calls = 0;
    const expected = plan();
    const result = await completeRestrictedDomainPlanOnce({
      baseUrl: "https://example.invalid/v1",
      apiKey: "test-key",
      backendModel: "test-model",
      request: {
        system: "Generate the plan.",
        prompt: "Use the schema.",
        audit: { evaluatorPayloadAccesses: 0, heldOutAccesses: 0, retries: 0, requestedCalls: 1, toolAccess: false },
      },
      fetchImpl: async (_input, init) => {
        calls += 1;
        const body = JSON.parse(String(init?.body));
        expect(body.tool_choice).toEqual({ type: "function", function: { name: "submit_restricted_domain_plan" } });
        return new Response(JSON.stringify({
          choices: [{
            finish_reason: "tool_calls",
            message: {
              content: "",
              tool_calls: [{ id: "call-1", type: "function", function: { name: "submit_restricted_domain_plan", arguments: JSON.stringify(expected) } }],
            },
          }],
          usage: { prompt_tokens: 100, completion_tokens: 25, prompt_tokens_details: { cached_tokens: 40 } },
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });
    expect(calls).toBe(1);
    expect(result).toMatchObject({
      plan: expected,
      providerAttempts: 1,
      logicalPaidCalls: 1,
      tokens: { input: 60, output: 25, cacheRead: 40, cacheWrite: 0 },
    });
  });
});
