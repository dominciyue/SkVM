import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildRestrictedDomainPlanTransportFreeze,
  buildRestrictedDomainPlanTransportRequest,
  RestrictedDomainPlanTransportCatalogSchema,
  RestrictedDomainPlanTransportFreezeSchema,
  RestrictedDomainPlanTransportReportSchema,
  runRestrictedDomainPlanTransportQualification,
} from "./automatic-domain-plan-transport-qualification";
import { RestrictedDomainPlanSynthesisError } from "./automatic-domain-plan-synthesis";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

function catalog() {
  return RestrictedDomainPlanTransportCatalogSchema.parse({
    schemaVersion: "skill-ir-restricted-domain-plan-transport-catalog/v1",
    catalogId: "domain-plan-transport-qualification-v1",
    measurementStartedAt: "2026-08-24T06:20:00.000Z",
    model: {
      modelId: "xty/gpt-5.6-sol",
      cacheRoot: ".skvm",
      timeoutMs: 660000,
      calls: 1,
      retries: 0,
    },
  });
}

describe("restricted Domain Plan transport qualification", () => {
  test("freezes one task-free canonical forced-tool request before any paid call", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "skill-ir-domain-plan-transport-freeze-"));
    temporaryDirectories.push(outDir);
    const freeze = await buildRestrictedDomainPlanTransportFreeze(process.cwd(), catalog(), outDir);
    expect(freeze.summary).toEqual({
      paidCalls: 0,
      authorizedPaidCalls: 1,
      retries: 0,
      taskPayloadAccesses: 0,
      heldOutAccesses: 0,
      evaluatorPayloadAccesses: 0,
    });
    expect(RestrictedDomainPlanTransportFreezeSchema.parse(freeze)).toEqual(freeze);
    expect(JSON.parse(await readFile(join(outDir, "pre-model-freeze.json"), "utf8"))).toEqual(freeze);
  });

  test("records a schema-valid forced-tool result without reclassifying Task 18.31", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "skill-ir-domain-plan-transport-pass-"));
    temporaryDirectories.push(outDir);
    const freeze = await buildRestrictedDomainPlanTransportFreeze(process.cwd(), catalog(), outDir);
    const canonical = buildRestrictedDomainPlanTransportRequest();
    const report = await runRestrictedDomainPlanTransportQualification({
      rootDir: process.cwd(),
      catalog: catalog(),
      freeze,
      freezePath: join(outDir, "pre-model-freeze.json"),
      reportPath: join(outDir, "report.json"),
      measurementCompletedAt: "2026-08-24T13:00:00.000Z",
      complete: async () => ({
        plan: canonical.expectedPlan,
        providerAttempts: 1,
        logicalPaidCalls: 1,
        tokens: { input: 40, output: 20, cacheRead: 0, cacheWrite: 0 },
        durationMs: 1200,
        responseMetadata: {
          httpStatus: null,
          responseBodyTextLength: null,
          responseBodySha256: null,
          responseJsonParsed: false,
          choiceCount: null,
          finishReason: null,
          assistantContentPresent: null,
          assistantContentTextLength: null,
          toolCallCount: null,
          requestedToolCallPresent: null,
          requestedToolCallArgumentsLength: null,
          usagePresent: null,
        },
      }),
    });
    expect(report).toMatchObject({
      status: "passed",
      canonicalPlanMatched: true,
      failure: null,
      historicalTaskFailuresReclassified: false,
      conclusion: "persistent-forced-tool-contract-compatible",
      summary: { paidCalls: 1, retries: 0, taskPayloadAccesses: 0, heldOutAccesses: 0, evaluatorPayloadAccesses: 0 },
    });
    expect(RestrictedDomainPlanTransportReportSchema.parse(report)).toEqual(report);
  });

  test("persists a typed failure stage, duration, and digest without raw provider detail", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "skill-ir-domain-plan-transport-fail-"));
    temporaryDirectories.push(outDir);
    const freeze = await buildRestrictedDomainPlanTransportFreeze(process.cwd(), catalog(), outDir);
    const report = await runRestrictedDomainPlanTransportQualification({
      rootDir: process.cwd(),
      catalog: catalog(),
      freeze,
      freezePath: join(outDir, "pre-model-freeze.json"),
      reportPath: join(outDir, "report.json"),
      measurementCompletedAt: "2026-08-24T13:00:00.000Z",
      complete: async () => {
        throw new RestrictedDomainPlanSynthesisError({
          stage: "tool-call",
          durationMs: 900,
          detail: "private provider response",
        });
      },
    });
    expect(report).toMatchObject({
      status: "failed",
      canonicalPlanMatched: null,
      conclusion: "forced-tool-qualification-failed",
      failure: { stage: "tool-call", durationMs: 900, httpStatus: null },
      historicalTaskFailuresReclassified: false,
    });
    expect(JSON.stringify(report)).not.toContain("private provider response");
    expect(report.failure?.detailDigest).toMatch(/^[a-f0-9]{64}$/);
  });
});
