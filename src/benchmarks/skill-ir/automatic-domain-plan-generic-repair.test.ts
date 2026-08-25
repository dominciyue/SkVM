import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertDeclaredRequiredOutputWrites,
  auditRestrictedDomainPlanTypeNamespaces,
  buildGenericDomainPlanRepairFreeze,
  buildTypeConstrainedRestrictedDomainPlanCompletionPayload,
  buildTypeConstrainedRestrictedDomainPlanRequest,
  GenericDomainPlanRepairCatalogSchema,
  runGenericDomainPlanRepair,
} from "./automatic-domain-plan-generic-repair";
import type { RestrictedDomainPlan } from "./automatic-restricted-domain-plan";
import type { SanitizedProviderResponseMetadata } from "./automatic-domain-plan-synthesis";
import { sha256Bytes } from "./source-fixture";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

async function ref(path: string) {
  return { path, sha256: sha256Bytes(await readFile(path)) };
}

async function envInputs() {
  const [sourceText, taskDescription, taskSet] = await Promise.all([
    readFile("benchmarks/skill-ir/pilots/env-manager/source/SKILL.md", "utf8"),
    readFile("benchmarks/skill-ir/task-descriptions/env-manager.json", "utf8").then(JSON.parse),
    readFile("benchmarks/skill-ir/pilots/env-manager/successor-v3/development/tasks.json", "utf8").then(JSON.parse),
  ]);
  return { sourceText, taskDescription, taskSet };
}

async function catalog() {
  return GenericDomainPlanRepairCatalogSchema.parse({
    schemaVersion: "skill-ir-domain-plan-generic-repair-catalog/v1",
    catalogId: "env-domain-plan-generic-repair-attempt-2026-08-25",
    attemptId: "env-generic-type-and-output-repair-001",
    measurementStartedAt: "2026-08-25T00:00:00.000Z",
    caseId: "env-manager",
    parentAttributionReport: await ref("results/skill-ir/automatic-domain-plan-attribution-v1/report.json"),
    parentManualParityReport: await ref("results/skill-ir/automatic-domain-plan-manual-parity-v1/env-manager.json"),
    source: await ref("benchmarks/skill-ir/pilots/env-manager/source/SKILL.md"),
    taskDescription: await ref("benchmarks/skill-ir/task-descriptions/env-manager.json"),
    taskSet: await ref("benchmarks/skill-ir/pilots/env-manager/successor-v3/development/tasks.json"),
    manualEvaluatorModule: await ref("src/bench/evaluators/env-manager-grade-v3.ts"),
    constructionTaskId: "env-manager-scorer-authority-node-dev-001",
    transferTaskId: "env-manager-scorer-authority-vite-dev-002",
    publicContractFixturePaths: ["env-audit-interface.json"],
    model: {
      modelId: "xty/gpt-5.6-sol",
      cacheRoot: ".skvm",
      timeoutMs: 660000,
      maximumPaidCalls: 1,
      retries: 0,
    },
  });
}

const metadata: SanitizedProviderResponseMetadata = {
  httpStatus: 200,
  responseBodyTextLength: 200,
  responseBodySha256: "a".repeat(64),
  responseJsonParsed: true,
  choiceCount: 1,
  finishReason: "tool_calls",
  assistantContentPresent: false,
  assistantContentTextLength: 0,
  toolCallCount: 1,
  requestedToolCallPresent: true,
  requestedToolCallArgumentsLength: 300,
  usagePresent: true,
};

const executableThreeOutputPlan: RestrictedDomainPlan = {
  schemaVersion: "skill-ir-restricted-domain-plan/v1",
  planId: "generic-environment-audit",
  steps: [
    { id: "strings-defined", op: "parse-key-value-lines", path: ".env", keyPattern: "^[A-Za-z_][A-Za-z0-9_]*$" },
    {
      id: "json-report",
      op: "write-json",
      path: "env-report.json",
      fields: [
        { key: "definedAndUsed", value: { kind: "ref", ref: "strings-defined" } },
        { key: "definedUnconfirmedUnused", value: { kind: "ref", ref: "strings-defined" } },
        { key: "usedUndefined", value: { kind: "ref", ref: "strings-defined" } },
        { key: "hardcodedSecrets", value: { kind: "ref", ref: "strings-defined" } },
        { key: "exposureRisks", value: { kind: "ref", ref: "strings-defined" } },
      ],
    },
    {
      id: "text-example",
      op: "write-text-template",
      path: ".env.example",
      template: "# Generated without copying protected values.\n",
      bindings: [],
    },
    {
      id: "json-schema",
      op: "write-json",
      path: ".env.schema.json",
      fields: [{ key: "generated", value: { kind: "literal", value: true } }],
    },
  ],
  audit: { paidCalls: 1, retries: 0, heldOutAccesses: 0, evaluatorPayloadAccesses: 0, skillSpecificBranches: 0 },
};

function completion(plan: RestrictedDomainPlan) {
  return {
    plan,
    providerAttempts: 1 as const,
    logicalPaidCalls: 1 as const,
    tokens: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 as const },
    durationMs: 1000,
    responseMetadata: metadata,
  };
}

describe("generic restricted Domain Plan engineering repair", () => {
  test("puts every declared required output and the typed register contract into the request and tool schema", async () => {
    const { sourceText, taskDescription, taskSet } = await envInputs();
    const request = buildTypeConstrainedRestrictedDomainPlanRequest({
      sourceText,
      taskDescription,
      constructionTask: taskSet.tasks[0],
      publicContractFixturePaths: ["env-audit-interface.json"],
    });
    for (const output of [".env.example", ".env.schema.json", "env-report.json"]) {
      expect(request.prompt).toContain(output);
    }
    expect(request.prompt).toContain("Every declared required output");

    const payload = buildTypeConstrainedRestrictedDomainPlanCompletionPayload({
      backendModel: "gpt-5.6-sol",
      request,
    });
    const tool = payload.tools[0]!;
    const schemaText = JSON.stringify(tool.function.parameters);
    expect(tool.function.strict).toBe(true);
    expect(schemaText).toContain("^text-");
    expect(schemaText).toContain("^strings-");
    expect(schemaText).toContain("^records-");
    expect(schemaText).toContain("^bool-");
    expect(schemaText).toContain("^json-");
  });

  test("rejects typed-register lies and missing or conditional required writes before persistence", () => {
    expect(auditRestrictedDomainPlanTypeNamespaces(executableThreeOutputPlan)).toEqual([]);
    expect(() => assertDeclaredRequiredOutputWrites(executableThreeOutputPlan, [
      ".env.example",
      ".env.schema.json",
      "env-report.json",
    ])).not.toThrow();

    const wrongType = structuredClone(executableThreeOutputPlan);
    wrongType.steps[0]!.id = "text-defined";
    for (const step of wrongType.steps) {
      if (step.op !== "write-json") continue;
      for (const field of step.fields) {
        if (field.value.kind === "ref" && field.value.ref === "strings-defined") field.value.ref = "text-defined";
      }
    }
    expect(auditRestrictedDomainPlanTypeNamespaces(wrongType).map((issue) => issue.code))
      .toContain("step-output-namespace-mismatch");

    const missing = structuredClone(executableThreeOutputPlan);
    missing.steps = missing.steps.filter((step) => !("path" in step && step.path === ".env.schema.json"));
    expect(() => assertDeclaredRequiredOutputWrites(missing, [
      ".env.example",
      ".env.schema.json",
      "env-report.json",
    ])).toThrow("missing required output write");

    const conditional = structuredClone(executableThreeOutputPlan);
    conditional.steps.splice(
      1,
      0,
      { id: "text-env", op: "read-text", path: ".env" },
      { id: "bool-condition", op: "regex-test", source: "text-env", pattern: ".+", flags: "s" },
    );
    const write = conditional.steps.find((step) => "path" in step && step.path === ".env.example")!;
    Object.assign(write, { when: "bool-condition" });
    expect(() => assertDeclaredRequiredOutputWrites(conditional, [
      ".env.example",
      ".env.schema.json",
      "env-report.json",
    ])).toThrow("required output write is conditional");
  });

  test("freezes a new one-call identity and only runs real two-workdir parity after all generic gates pass", async () => {
    const outDir = await mkdtemp(join(process.cwd(), "results/skill-ir/generic-domain-repair-test-"));
    temporaryDirectories.push(outDir);
    const frozenCatalog = await catalog();
    const freeze = await buildGenericDomainPlanRepairFreeze(process.cwd(), frozenCatalog, outDir);
    expect(freeze.attemptId).toBe("env-generic-type-and-output-repair-001");
    expect(freeze.authorization).toEqual({ executeAllowed: true, maximumPaidCalls: 1, retries: 0 });
    expect(freeze.requiredOutputPaths).toEqual([".env.example", ".env.schema.json", "env-report.json"]);
    expect(freeze.summary).toMatchObject({ paidCalls: 0, authorizedPaidCalls: 1, coreBranchDelta: 0 });

    const report = await runGenericDomainPlanRepair({
      rootDir: process.cwd(),
      catalog: frozenCatalog,
      freeze,
      freezePath: join(outDir, "pre-model-freeze.json"),
      outDir,
      measurementCompletedAt: "2026-08-25T00:01:00.000Z",
      complete: async () => completion(executableThreeOutputPlan),
    });
    expect(report.status).toBe("clean-execution-observed");
    expect(report.audits).toEqual({
      leakage: "passed",
      constructionBinding: "passed",
      transferBinding: "passed",
      typeNamespaces: "passed",
      staticTypes: "passed",
      declaredOutputs: "passed",
    });
    expect(report.staticTypeIssueCount).toBe(0);
    expect(report.parity).not.toBeNull();
    expect(report.parity!.tasks.every((task) => task.runtime.status === "complete")).toBe(true);
    expect(report.parity!.tasks.every((task) => task.declaredOutputs.requiredPresent.length === 3)).toBe(true);
    expect(report.summary).toMatchObject({ paidCalls: 1, retries: 0, heldOutAccesses: 0, coreBranchDelta: 0 });
  });
});
