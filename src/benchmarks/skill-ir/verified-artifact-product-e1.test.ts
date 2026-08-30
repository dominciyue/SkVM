import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { validateVerifiedArtifactProduct } from "../../skill-ir/verified-artifact-product";
import {
  ENV_MANAGER_A_OPTIONAL_CONFIG_PATH,
  ENV_MANAGER_E1_CONFIG_PATH,
  EnvManagerMachineCheckedProductReportSchema,
  runEnvManagerVerifiedArtifactE1,
  runEnvManagerVerifiedArtifactMachineChecked,
} from "./verified-artifact-product-e1";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("verified artifact product E1", () => {
  test("runs the existing Env pilot through one evaluator-free product chain", async () => {
    const rootDir = resolve(import.meta.dir, "../../..");
    const temporaryRoot = await mkdtemp(join(tmpdir(), "skvm-verified-artifact-e1-"));
    temporaryDirectories.push(temporaryRoot);
    const workDir = join(temporaryRoot, "workdir");
    const outDir = join(temporaryRoot, "product");

    const result = await runEnvManagerVerifiedArtifactE1({
      rootDir,
      workDir,
      outDir,
      acceptedAt: "2026-08-29T02:00:00.000Z",
      acceptanceHumanMinutes: 1,
      acceptanceNote: "Conditionally accepted the exact declared output delta for this frozen reviewed pilot.",
    });

    expect(result.fixtureMaterialization).toMatchObject({
      role: "fixture-only",
      taskId: "env-manager-scorer-authority-node-dev-001",
      evaluatorLoaded: false,
    });
    expect(result.product).toMatchObject({
      candidate: { status: "review-required", automaticConstructionStatus: "non-executable", coreBranchDelta: 0 },
      qualityEvidence: { qualityEvidence: "user-accepted", researchDisposition: "not-eligible" },
      cost: {
        qualityEvidence: "user-accepted",
        claim: "token-saving-under-user-accepted-quality",
        researchEligibility: "not-eligible",
        breakEven: { status: "computed", calls: 1 },
        production: {
          oneTime: { acceptance: { humanMinutes: 1 }, reviewAdapter: { humanMinutes: 8, physicalLoc: 125 } },
          recurring: { acceptanceHumanMinutesPerRun: 0 },
        },
      },
    });
    const configText = await readFile(join(rootDir, ENV_MANAGER_E1_CONFIG_PATH), "utf8");
    expect(configText).not.toMatch(/taskSet|evaluator|scorer/iu);
    expect(await readFile(join(workDir, ".env.example"), "utf8")).toContain("APP_PORT=");
    expect(await validateVerifiedArtifactProduct(outDir)).toMatchObject({
      cost: { breakEven: { status: "computed", calls: 1 } },
    });
  });

  test("runs Env A-optional with the pinned v3 evaluator and frozen token denominator", async () => {
    const rootDir = resolve(import.meta.dir, "../../..");
    const temporaryRoot = await mkdtemp(join(tmpdir(), "skvm-verified-artifact-env-machine-"));
    temporaryDirectories.push(temporaryRoot);

    const result = await runEnvManagerVerifiedArtifactMachineChecked({
      rootDir,
      workDir: join(temporaryRoot, "workdir"),
      runRoot: join(temporaryRoot, "run"),
      completedAt: "2026-08-29T08:00:00.000Z",
    });

    expect(result.fixtureMaterialization).toMatchObject({
      role: "fixture-only",
      taskId: "env-manager-scorer-authority-node-dev-001",
      evaluatorLoaded: false,
    });
    expect(result.product).toMatchObject({
      candidate: { status: "review-required", coreBranchDelta: 0 },
      qualityEvidence: {
        qualityEvidence: "machine-checked",
        status: "pass",
        researchDisposition: "eligible-for-authority-review",
      },
      cost: {
        qualityEvidence: "machine-checked",
        claim: "token-saving-under-machine-checked-quality",
        researchEligibility: "eligible-for-authority-review",
        production: {
          oneTime: { modelTokens: { status: "measured", value: 9358 } },
          recurring: {
            original: { status: "measured", samples: 4, aggregateModelTokens: 202010 },
            artifact: { modelTokensPerRun: 0 },
          },
        },
        breakEven: { status: "computed", calls: 1 },
      },
    });
    expect(result.product.cost.amortization[0]).toEqual({
      calls: 1,
      originalModelTokens: 50502.5,
      optimizedModelTokens: 9358,
      status: "computed",
    });
    expect(result.report).toMatchObject({
      schemaVersion: "skill-ir-env-manager-machine-checked-product-demonstration/v1",
      status: "passed",
      currentStageAccounting: { apiCalls: 0, modelCalls: 0, paidCalls: 0 },
      quality: { evidence: "machine-checked", criteriaPassed: 3, criteriaTotal: 3 },
      tokenEconomics: {
        source: "digest-bound-historical-original-plus-current-deterministic-artifact",
        originalSamples: 4,
        originalAggregateModelTokens: 202010,
        originalModelTokensPerRun: 50502.5,
        artifactModelTokensPerRun: 0,
        oneTimeModelTokens: 9358,
        breakEvenCalls: 1,
      },
      researchPromotion: "eligible-for-authority-review-not-promoted",
    });
    expect(EnvManagerMachineCheckedProductReportSchema.parse(
      JSON.parse(await readFile(join(temporaryRoot, "run/report.json"), "utf8")),
    )).toEqual(result.report);
    expect(await validateVerifiedArtifactProduct(join(temporaryRoot, "run/product"))).toMatchObject({
      qualityEvidence: { qualityEvidence: "machine-checked" },
      cost: { breakEven: { status: "computed", calls: 1 } },
    });
    const configText = await readFile(join(rootDir, ENV_MANAGER_A_OPTIONAL_CONFIG_PATH), "utf8");
    expect(configText).toMatch(/machine-checked|checker/iu);
    expect(configText).not.toMatch(/user-accepted/iu);
  });
});
