import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSingleDomainPlanGenerationFreeze,
  runSingleDomainPlanGeneration,
  SingleDomainPlanGenerationCatalogSchema,
} from "./automatic-domain-plan-single-generation";
import { type RestrictedDomainPlan } from "./automatic-restricted-domain-plan";
import { type SanitizedProviderResponseMetadata } from "./automatic-domain-plan-synthesis";
import { sha256Bytes } from "./source-fixture";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

async function ref(path: string) {
  return { path, sha256: sha256Bytes(await readFile(path)) };
}

async function catalog() {
  return SingleDomainPlanGenerationCatalogSchema.parse({
    schemaVersion: "skill-ir-domain-plan-single-generation-catalog/v1",
    catalogId: "law-domain-plan-generation-v1",
    measurementStartedAt: "2026-08-24T16:20:00.000Z",
    parentShadowCatalog: await ref("benchmarks/skill-ir/corpus/automatic-domain-plan-shadow-v1.json"),
    caseId: "law-to-markdown",
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

const safeLawPlan: RestrictedDomainPlan = {
  schemaVersion: "skill-ir-restricted-domain-plan/v1",
  planId: "convert-public-document",
  steps: [
    { id: "document", op: "read-text", path: "document.txt" },
    {
      id: "write-review",
      op: "write-text-template",
      path: "markdown/document/document+审核报告.md",
      template: "{{document}}",
      bindings: [{ token: "document", value: { kind: "ref", ref: "document" }, encoding: "text" }],
    },
  ],
  audit: { paidCalls: 1, retries: 0, heldOutAccesses: 0, evaluatorPayloadAccesses: 0, skillSpecificBranches: 0 },
};

describe("single case task-bound Domain Plan generation", () => {
  test("freezes exactly one strict request and no paid evidence", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "skill-ir-single-domain-freeze-"));
    temporaryDirectories.push(outDir);
    const freeze = await buildSingleDomainPlanGenerationFreeze(process.cwd(), await catalog(), outDir);
    expect(freeze.case.caseId).toBe("law-to-markdown");
    expect(freeze.request.toolSchemaMode).toBe("domain-plan-strict");
    expect(freeze.authorization).toEqual({ executeAllowed: true, maximumPaidCalls: 1, retries: 0 });
    expect(freeze.summary).toMatchObject({
      paidCalls: 0,
      authorizedPaidCalls: 1,
      heldOutAccesses: 0,
      evaluatorPayloadAccesses: 0,
      coreBranchDelta: 0,
    });
  });

  test("persists a plan only after leakage, two-task binding, and static type audits pass", async () => {
    const outDir = await mkdtemp(join(process.cwd(), "results/skill-ir/single-domain-generation-test-"));
    temporaryDirectories.push(outDir);
    const freeze = await buildSingleDomainPlanGenerationFreeze(process.cwd(), await catalog(), outDir);
    const report = await runSingleDomainPlanGeneration({
      rootDir: process.cwd(),
      catalog: await catalog(),
      freeze,
      freezePath: join(outDir, "pre-model-freeze.json"),
      outDir,
      measurementCompletedAt: "2026-08-24T16:21:00.000Z",
      complete: async () => completion(safeLawPlan),
    });
    expect(report.status).toBe("plan-produced");
    expect(report.audits).toEqual({
      leakage: "passed",
      constructionBinding: "passed",
      transferBinding: "passed",
      staticTypes: "passed",
    });
    expect(report.generatedPlan).not.toBeNull();
    expect(JSON.parse(await readFile(join(outDir, "generated-plan.json"), "utf8"))).toEqual(safeLawPlan);
  });

  test("rejects a schema-valid plan with a deterministic static type error before plan persistence", async () => {
    const outDir = await mkdtemp(join(process.cwd(), "results/skill-ir/single-domain-generation-reject-"));
    temporaryDirectories.push(outDir);
    const freeze = await buildSingleDomainPlanGenerationFreeze(process.cwd(), await catalog(), outDir);
    const invalidPlan: RestrictedDomainPlan = {
      schemaVersion: "skill-ir-restricted-domain-plan/v1",
      planId: "invalid-static-flow",
      steps: [
        { id: "keys", op: "parse-key-value-lines", path: "document.txt", keyPattern: "^[A-Z]+$" },
        {
          id: "write-review",
          op: "write-text-template",
          path: "markdown/document/document+审核报告.md",
          template: "{{keys}}",
          bindings: [{ token: "keys", value: { kind: "ref", ref: "keys" }, encoding: "text" }],
        },
      ],
      audit: { paidCalls: 1, retries: 0, heldOutAccesses: 0, evaluatorPayloadAccesses: 0, skillSpecificBranches: 0 },
    };
    const report = await runSingleDomainPlanGeneration({
      rootDir: process.cwd(),
      catalog: await catalog(),
      freeze,
      freezePath: join(outDir, "pre-model-freeze.json"),
      outDir,
      complete: async () => completion(invalidPlan),
    });
    expect(report.status).toBe("static-type-rejected");
    expect(report.generatedPlan).toBeNull();
    expect(report.audits.staticTypes).toBe("failed");
    expect(await Bun.file(join(outDir, "generated-plan.json")).exists()).toBe(false);
    expect(report.summary).toMatchObject({ paidCalls: 1, retries: 0, evaluatorPayloadAccesses: 0 });
  });
});
