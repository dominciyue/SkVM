import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
  buildRestrictedDomainPlanPreModelFreeze,
  RestrictedDomainPlanShadowCatalogSchema,
  RestrictedDomainPlanShadowReportSchema,
  RestrictedDomainPlanPreModelFreezeSchema,
  runRestrictedDomainPlanShadow,
  verifyRestrictedDomainPlanImplementationIdentity,
  verifyRestrictedDomainPlanProviderIdentity,
} from "./automatic-domain-plan-shadow";
import { RestrictedDomainPlanSchema } from "./automatic-restricted-domain-plan";
import { sha256Bytes } from "./source-fixture";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe("restricted Domain Plan shadow", () => {
  test("fails closed when frozen implementation bytes or provider identity drift", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "skill-ir-domain-plan-identity-"));
    temporaryDirectories.push(rootDir);
    await writeFile(join(rootDir, "implementation.ts"), "frozen\n", "utf8");
    const implementation = [{
      path: "implementation.ts",
      sha256: sha256Bytes(Buffer.from("frozen\n", "utf8")),
    }];
    await expect(verifyRestrictedDomainPlanImplementationIdentity(rootDir, implementation)).resolves.toBeUndefined();
    await writeFile(join(rootDir, "implementation.ts"), "drifted\n", "utf8");
    await expect(verifyRestrictedDomainPlanImplementationIdentity(rootDir, implementation)).rejects.toThrow("digest mismatch");

    expect(() => verifyRestrictedDomainPlanProviderIdentity(
      { baseUrl: "https://current.example/v1", backendModel: "backend-current" },
      {
        modelId: "xty/gpt-5.6-sol",
        routeKind: "openai-compatible",
        baseUrlSha256: sha256Bytes(Buffer.from("https://frozen.example/v1", "utf8")),
        backendModel: "backend-frozen",
      },
    )).toThrow("provider identity drift");
  });

  test("freezes two evaluator-free single-call requests before any paid synthesis", async () => {
    const rootDir = process.cwd();
    const catalogPath = join(rootDir, "benchmarks/skill-ir/corpus/automatic-domain-plan-shadow-v1.json");
    const catalog = RestrictedDomainPlanShadowCatalogSchema.parse(JSON.parse(await readFile(catalogPath, "utf8")));
    const outDir = await mkdtemp(join(tmpdir(), "skill-ir-domain-plan-freeze-"));
    temporaryDirectories.push(outDir);
    const freeze = await buildRestrictedDomainPlanPreModelFreeze(rootDir, catalog, outDir);
    expect(freeze.summary).toEqual({
      caseCount: 2,
      requestCount: 2,
      paidCalls: 0,
      authorizedPaidCalls: 2,
      retries: 0,
      heldOutAccesses: 0,
      evaluatorPayloadAccesses: 0,
      coreBranchDelta: 0,
    });
    expect(new Set(freeze.requests.map((entry) => entry.requestSha256)).size).toBe(2);
    expect(freeze.requests.every((entry) => entry.constructionTaskSplit === "development"
      && entry.transferTaskSplit === "development"
      && entry.requestContainsEvaluatorPayload === false
      && entry.requestContainsHeldOut === false
      && entry.forbiddenTaskDataLiteralCount > 0)).toBe(true);
    expect(freeze.authorization).toEqual({
      executeAllowed: true,
      modelId: "xty/gpt-5.6-sol",
      callsPerCase: 1,
      maximumPaidCalls: 2,
      retries: 0,
      continueAfterIndependentCaseFailure: true,
    });
    expect(RestrictedDomainPlanPreModelFreezeSchema.parse(freeze)).toEqual(freeze);
    expect(JSON.parse(await readFile(join(outDir, "pre-model-freeze.json"), "utf8"))).toEqual(freeze);
  });

  test("does not load the manual evaluator while freezing model requests", async () => {
    const rootDir = process.cwd();
    const catalog = RestrictedDomainPlanShadowCatalogSchema.parse(JSON.parse(await readFile(
      join(rootDir, "benchmarks/skill-ir/corpus/automatic-domain-plan-shadow-v1.json"),
      "utf8",
    )));
    const outDir = await mkdtemp(join(tmpdir(), "skill-ir-domain-plan-no-evaluator-load-"));
    temporaryDirectories.push(outDir);
    const freeze = await buildRestrictedDomainPlanPreModelFreeze(rootDir, {
      ...catalog,
      cases: catalog.cases.map((entry) => ({
        ...entry,
        manualEvaluatorModule: {
          path: "src/benchmarks/skill-ir/absent-manual-evaluator.ts",
          sha256: "0".repeat(64),
        },
      })),
    }, outDir);
    expect(freeze.summary.evaluatorPayloadAccesses).toBe(0);
  });

  test("rejects a pre-model measurement start that is still in the future", async () => {
    const rootDir = process.cwd();
    const catalog = RestrictedDomainPlanShadowCatalogSchema.parse(JSON.parse(await readFile(
      join(rootDir, "benchmarks/skill-ir/corpus/automatic-domain-plan-shadow-v1.json"),
      "utf8",
    )));
    const outDir = await mkdtemp(join(tmpdir(), "skill-ir-domain-plan-future-freeze-"));
    temporaryDirectories.push(outDir);
    await expect(buildRestrictedDomainPlanPreModelFreeze(rootDir, {
      ...catalog,
      measurementStartedAt: "2099-01-01T00:00:00.000Z",
    }, outDir)).rejects.toThrow("measurement start is in the future");
  });

  test("freezes both generated plans before real two-task execution and manual evaluation", async () => {
    const rootDir = process.cwd();
    const catalog = RestrictedDomainPlanShadowCatalogSchema.parse(JSON.parse(await readFile(
      join(rootDir, "benchmarks/skill-ir/corpus/automatic-domain-plan-shadow-v1.json"),
      "utf8",
    )));
    const freezeDir = await mkdtemp(join(rootDir, "results/skill-ir/automatic-domain-plan-shadow-test-"));
    temporaryDirectories.push(freezeDir);
    const freeze = await buildRestrictedDomainPlanPreModelFreeze(rootDir, catalog, freezeDir);
    const preModelFreezePath = relative(rootDir, join(freezeDir, "pre-model-freeze.json")).replaceAll("\\", "/");
    const outDir = await mkdtemp(join(tmpdir(), "skill-ir-domain-plan-shadow-out-"));
    temporaryDirectories.push(outDir);
    const plans = {
      "env-manager": RestrictedDomainPlanSchema.parse({
        schemaVersion: "skill-ir-restricted-domain-plan/v1",
        planId: "automatic-env-inventory",
        steps: [
          { id: "definitions", op: "parse-key-value-lines", path: ".env", keyPattern: "^[A-Z][A-Z0-9_]*$" },
          {
            id: "references",
            op: "regex-find-files",
            includePathPattern: "^src/.*\\.(?:js|ts)$",
            contentPattern: "(?:process\\.env\\.|import\\.meta\\.env\\.)(?<name>[A-Z][A-Z0-9_]*)",
            flags: "g",
            captures: ["name"],
          },
          { id: "reference-names", op: "pluck", source: "references", field: "name" },
          { id: "used", op: "set-operation", operator: "intersection", left: "definitions", right: "reference-names" },
          { id: "unused", op: "set-operation", operator: "difference", left: "definitions", right: "reference-names" },
          { id: "undefined", op: "set-operation", operator: "difference", left: "reference-names", right: "definitions" },
          {
            id: "hardcoded",
            op: "regex-find-files",
            includePathPattern: "^src/.*\\.(?:js|ts)$",
            contentPattern: "(?:const|let|var)\\s+(?<name>[A-Z][A-Z0-9_]*(?:KEY|TOKEN|PASSWORD|SECRET))\\s*=\\s*[\\\"'][^\\\"']{32,}[\\\"']",
            flags: "g",
            captures: ["name"],
          },
          { id: "hardcoded-findings", op: "project-records", source: "hardcoded", fields: ["path", "name"] },
          { id: "exposures", op: "filter-regex", source: "references", field: "name", pattern: "^(?:VITE_|NEXT_PUBLIC_|REACT_APP_|NUXT_PUBLIC_|VUE_APP_).*(?:KEY|TOKEN|PASSWORD|SECRET)$", flags: "", keep: "matching" },
          { id: "exposure-findings", op: "project-records", source: "exposures", fields: ["path", "name"] },
          {
            id: "write-report",
            op: "write-json",
            path: "env-report.json",
            fields: [
              { key: "definedAndUsed", value: { kind: "ref", ref: "used" } },
              { key: "definedUnconfirmedUnused", value: { kind: "ref", ref: "unused" } },
              { key: "usedUndefined", value: { kind: "ref", ref: "undefined" } },
              { key: "hardcodedSecrets", value: { kind: "ref", ref: "hardcoded-findings" } },
              { key: "exposureRisks", value: { kind: "ref", ref: "exposure-findings" } },
            ],
          },
        ],
        audit: { paidCalls: 1, retries: 0, heldOutAccesses: 0, evaluatorPayloadAccesses: 0, skillSpecificBranches: 0 },
      }),
      "law-to-markdown": RestrictedDomainPlanSchema.parse({
        schemaVersion: "skill-ir-restricted-domain-plan/v1",
        planId: "automatic-law-classification",
        steps: [
          { id: "document", op: "read-text", path: "document.txt" },
          { id: "is-law", op: "regex-test", source: "document", pattern: "^[^\\r\\n]*(?:法|条例|规定)\\r?\\n[\\s\\S]*第[一二三四五六七八九十百千万0-9]+条", flags: "m" },
          { id: "class", op: "choose", condition: "is-law", whenTrue: { kind: "literal", value: "law" }, whenFalse: { kind: "literal", value: "non-law" } },
          { id: "deliverable", op: "choose", condition: "is-law", whenTrue: { kind: "literal", value: "markdown/document/document+最终成果.md" }, whenFalse: { kind: "literal", value: null } },
          {
            id: "write-review",
            op: "write-text-template",
            path: "markdown/document/document+审核报告.md",
            template: "审核完成。\n```json law-review-evidence\n{\"inputPath\":\"document.txt\",\"documentClass\":{{class}},\"deliverablePath\":{{deliverable}}}\n```\n",
            bindings: [
              { token: "class", value: { kind: "ref", ref: "class" }, encoding: "json" },
              { token: "deliverable", value: { kind: "ref", ref: "deliverable" }, encoding: "json" },
            ],
          },
          { id: "write-deliverable", op: "copy-text", source: "document", path: "markdown/document/document+最终成果.md", when: "is-law" },
        ],
        audit: { paidCalls: 1, retries: 0, heldOutAccesses: 0, evaluatorPayloadAccesses: 0, skillSpecificBranches: 0 },
      }),
    } as const;
    const previousKey = process.env.SKVM_XTY_API_KEY;
    delete process.env.SKVM_XTY_API_KEY;
    try {
      const report = await runRestrictedDomainPlanShadow({
        rootDir,
        catalog,
        preModelFreeze: freeze,
        outDir,
        measurementCompletedAt: "2026-08-24T15:00:00.000Z",
        meteredHumanMinutes: 10,
        preModelFreezePath,
        complete: async ({ caseId }) => ({
          plan: plans[caseId as keyof typeof plans],
          providerAttempts: 1,
          logicalPaidCalls: 1,
          tokens: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 },
          durationMs: 1000,
        }),
      });
      expect(report.planFreezeCompletedBeforeManualEvaluatorModuleLoad).toBe(true);
      expect(report.summary).toMatchObject({
        synthesisSucceeded: 2,
        transferExecutableCases: 2,
        paidCalls: 2,
        retries: 0,
        heldOutAccesses: 0,
        evaluatorPayloadsSentToModel: 0,
        manualEvaluatorModuleLoads: 2,
        semanticParity: "not-established",
      });
      expect(report.reuseGate).toMatchObject({ status: "passed", distinctTransferExecutableCases: 2, coreBranchDelta: 0 });
      expect(report.cases.every((entry) => entry.taskExecutions.length === 2
        && entry.taskExecutions.every((task) => task.protectedInputsPreserved))).toBe(true);
      expect(RestrictedDomainPlanShadowReportSchema.parse(report)).toEqual(report);
    } finally {
      if (previousKey === undefined) delete process.env.SKVM_XTY_API_KEY;
      else process.env.SKVM_XTY_API_KEY = previousKey;
    }
  }, 60_000);
});
