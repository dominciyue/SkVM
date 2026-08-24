import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildRestrictedDomainPlanAttributionFreeze,
  RestrictedDomainPlanAttributionCatalogSchema,
  RestrictedDomainPlanAttributionFreezeSchema,
  RestrictedDomainPlanAttributionReportSchema,
  runRestrictedDomainPlanAttribution,
} from "./automatic-domain-plan-attribution";
import {
  buildRestrictedDomainPlanTransportRequest,
} from "./automatic-domain-plan-transport-qualification";
import {
  RestrictedDomainPlanSynthesisError,
  type SanitizedProviderResponseMetadata,
} from "./automatic-domain-plan-synthesis";
import { RestrictedDomainPlanSchema, type RestrictedDomainPlan } from "./automatic-restricted-domain-plan";
import { sha256Bytes } from "./source-fixture";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

async function catalog() {
  const refs = await Promise.all([
    "benchmarks/skill-ir/corpus/automatic-domain-plan-shadow-v1.json",
    "results/skill-ir/automatic-domain-plan-shadow-v1/report.json",
    "results/skill-ir/automatic-domain-plan-transport-qualification-v1/report.json",
  ].map(async (path) => ({ path, sha256: sha256Bytes(await readFile(path)) })));
  return RestrictedDomainPlanAttributionCatalogSchema.parse({
    schemaVersion: "skill-ir-restricted-domain-plan-attribution-catalog/v1",
    catalogId: "domain-plan-failure-attribution-v1",
    measurementStartedAt: "2026-08-24T00:00:00.000Z",
    parentShadowCatalog: refs[0],
    parentShadowReport: refs[1],
    transportQualificationReport: refs[2],
    caseId: "env-manager",
    model: {
      modelId: "xty/gpt-5.6-sol",
      cacheRoot: ".skvm",
      timeoutMs: 660000,
      maximumPaidCalls: 3,
      retries: 0,
    },
  });
}

function metadata(argumentsLength: number): SanitizedProviderResponseMetadata {
  return {
    httpStatus: 200,
    responseBodyTextLength: 500,
    responseBodySha256: "a".repeat(64),
    responseJsonParsed: true,
    choiceCount: 1,
    finishReason: "tool_calls",
    assistantContentPresent: false,
    assistantContentTextLength: 0,
    toolCallCount: 1,
    requestedToolCallPresent: true,
    requestedToolCallArgumentsLength: argumentsLength,
    usagePresent: true,
  };
}

function completion(plan: RestrictedDomainPlan) {
  return {
    plan,
    providerAttempts: 1 as const,
    logicalPaidCalls: 1 as const,
    tokens: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 as const },
    durationMs: 1000,
    responseMetadata: metadata(JSON.stringify(plan).length),
  };
}

function envPlan(): RestrictedDomainPlan {
  return RestrictedDomainPlanSchema.parse({
    schemaVersion: "skill-ir-restricted-domain-plan/v1",
    planId: "attribution-env-plan",
    steps: [
      { id: "definitions", op: "parse-key-value-lines", path: ".env", keyPattern: "^[A-Z][A-Z0-9_]*$" },
      {
        id: "write-report",
        op: "write-json",
        path: "env-report.json",
        fields: [
          { key: "definedAndUsed", value: { kind: "ref", ref: "definitions" } },
          { key: "definedUnconfirmedUnused", value: { kind: "ref", ref: "definitions" } },
          { key: "usedUndefined", value: { kind: "ref", ref: "definitions" } },
          { key: "hardcodedSecrets", value: { kind: "ref", ref: "definitions" } },
          { key: "exposureRisks", value: { kind: "ref", ref: "definitions" } },
        ],
      },
    ],
    audit: { paidCalls: 1, retries: 0, heldOutAccesses: 0, evaluatorPayloadAccesses: 0, skillSpecificBranches: 0 },
  });
}

describe("restricted Domain Plan failure attribution", () => {
  test("freezes a three-call progressive bisection before execution", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "skill-ir-domain-plan-attribution-freeze-"));
    temporaryDirectories.push(outDir);
    const freeze = await buildRestrictedDomainPlanAttributionFreeze(process.cwd(), await catalog(), outDir);
    expect(freeze.stages.map((entry) => [entry.stageId, entry.toolSchemaMode])).toEqual([
      ["context-minimal", "shape-minimal"],
      ["context-strict", "domain-plan-strict"],
      ["task-bound-strict", "domain-plan-strict"],
    ]);
    expect(freeze.stages[0]!.requestChars).toBeGreaterThan(839);
    expect(freeze.stages[1]!.providerPayloadChars).toBeGreaterThan(freeze.stages[0]!.providerPayloadChars);
    expect(freeze.stages[2]!.expectedPlanSha256).toBeNull();
    expect(freeze.summary).toEqual({
      stageCount: 3,
      paidCalls: 0,
      authorizedPaidCalls: 3,
      retries: 0,
      heldOutAccesses: 0,
      evaluatorPayloadAccesses: 0,
      coreBranchDelta: 0,
    });
    expect(RestrictedDomainPlanAttributionFreezeSchema.parse(freeze)).toEqual(freeze);
  });

  test("persists one safe task-bound plan and proves both development bindings before semantic parity design", async () => {
    const outDir = await mkdtemp(join(process.cwd(), "results/skill-ir/automatic-domain-plan-attribution-test-"));
    temporaryDirectories.push(outDir);
    const freeze = await buildRestrictedDomainPlanAttributionFreeze(process.cwd(), await catalog(), outDir);
    const canonical = buildRestrictedDomainPlanTransportRequest().expectedPlan;
    const report = await runRestrictedDomainPlanAttribution({
      rootDir: process.cwd(),
      catalog: await catalog(),
      freeze,
      freezePath: join(outDir, "pre-model-freeze.json"),
      outDir,
      measurementCompletedAt: "2026-08-24T15:00:00.000Z",
      complete: async ({ stageId }) => completion(stageId === "task-bound-strict" ? envPlan() : canonical),
    });
    expect(report.status).toBe("plan-produced");
    expect(report.bisection).toEqual({
      priorTaskFreeTransport: "passed",
      realContextRequest: "passed",
      strictToolSchema: "passed",
      taskBoundGeneration: "plan-produced",
      twoTaskBinding: "passed",
    });
    expect(report.stages[2]!.postParseAudits).toEqual({
      leakage: "passed",
      constructionBinding: "passed",
      transferBinding: "passed",
      failureDigest: null,
    });
    expect(report.generatedPlan).not.toBeNull();
    expect(JSON.parse(await readFile(join(outDir, "generated-plan.json"), "utf8"))).toEqual(envPlan());
    expect(RestrictedDomainPlanAttributionReportSchema.parse(report)).toEqual(report);
  });

  test("localizes a task-bound strict-schema failure and stores only sanitized response evidence", async () => {
    const outDir = await mkdtemp(join(process.cwd(), "results/skill-ir/automatic-domain-plan-attribution-fail-"));
    temporaryDirectories.push(outDir);
    const freeze = await buildRestrictedDomainPlanAttributionFreeze(process.cwd(), await catalog(), outDir);
    const canonical = buildRestrictedDomainPlanTransportRequest().expectedPlan;
    const report = await runRestrictedDomainPlanAttribution({
      rootDir: process.cwd(),
      catalog: await catalog(),
      freeze,
      freezePath: join(outDir, "pre-model-freeze.json"),
      outDir,
      measurementCompletedAt: "2026-08-24T15:00:00.000Z",
      complete: async ({ stageId }) => {
        if (stageId !== "task-bound-strict") return completion(canonical);
        throw new RestrictedDomainPlanSynthesisError({
          stage: "plan-schema",
          durationMs: 1200,
          detail: "private invalid arguments and raw model content",
          httpStatus: 200,
          responseMetadata: {
            ...metadata(777),
            responseBodySha256: "b".repeat(64),
          },
        });
      },
    });
    expect(report.status).toBe("persistent-domain-plan-generation-failure");
    expect(report.bisection).toMatchObject({
      realContextRequest: "passed",
      strictToolSchema: "passed",
      taskBoundGeneration: "strict-schema-reject",
      twoTaskBinding: "not-run",
    });
    expect(report.stages[2]!.failure).toMatchObject({
      stage: "plan-schema",
      failureClass: "strict-schema-reject",
      httpStatus: 200,
    });
    expect(report.stages[2]!.responseMetadata).toMatchObject({
      responseBodyTextLength: 500,
      toolCallCount: 1,
      requestedToolCallPresent: true,
      requestedToolCallArgumentsLength: 777,
    });
    expect(JSON.stringify(report)).not.toContain("private invalid arguments");
    expect(report.summary).toMatchObject({ paidCalls: 3, retries: 0, heldOutAccesses: 0, evaluatorPayloadAccesses: 0 });
  });
});
