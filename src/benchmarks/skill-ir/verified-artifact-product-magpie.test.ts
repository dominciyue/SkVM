import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { validateVerifiedArtifactProduct } from "../../skill-ir/verified-artifact-product";
import {
  MAGPIE_PRODUCT_CONFIG_PATH,
  MagpieMachineCheckedProductReportSchema,
  runMagpieVerifiedArtifactProduct,
} from "./verified-artifact-product-magpie";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Magpie A-optional verified artifact product recipe", () => {
  test("runs all nine public cases through the shared CLI and binds only the frozen 003 denominator", async () => {
    const rootDir = resolve(import.meta.dir, "../../..");
    const runRoot = await mkdtemp(join(tmpdir(), "skvm-magpie-product-"));
    temporaryDirectories.push(runRoot);

    const result = await runMagpieVerifiedArtifactProduct({
      rootDir,
      runRoot,
      completedAt: "2026-09-01T02:00:00.000Z",
    });

    expect(result.report).toMatchObject({
      schemaVersion: "skill-ir-magpie-machine-checked-product-demonstration/v1",
      status: "passed",
      workflowId: "magpie-release-audit-product",
      productExecution: {
        entrypoint: "runVerifiedArtifactCli",
        stageOrder: ["compile", "review-or-accept", "package", "run", "cost"],
        publicCases: 9,
        productsValidated: 9,
        coreBranchDelta: 0,
      },
      quality: {
        evidence: "machine-checked-fixed-public-slice-non-regression",
        productCheckerPasses: 9,
        historicalOriginalPasses: 6,
        historicalArtifactPasses: 18,
        historicalCompletePairs: 18,
        historicalPairwiseRegressions: 0,
        upstreamJudgeSemanticEquivalence: "not-established",
      },
      tokenEconomics: {
        scope: "explicit-production-api-input-plus-output-tokens-only",
        originalSamples: 18,
        originalAggregateInputTokens: 73537,
        originalAggregateOutputTokens: 14038,
        originalAggregateCacheReadTokensDisclosedSeparately: 40960,
        originalMeanInputPlusOutputTokensPerRun: 4865.277777777777,
        artifactModelTokensPerRun: 0,
        oneTimeExplicitProductionApiModelTokens: 0,
        conditionalBreakEvenCalls: 0,
        firstRecurringRunNetPositive: true,
      },
      adaptationCost: {
        adapterPhysicalLoc: 287,
        checkerPhysicalLoc: 351,
        humanMinutes: null,
        totalCost: "not-computable",
      },
      currentStageAccounting: {
        apiCalls: 0,
        modelCalls: 0,
        paidCalls: 0,
        historicalOriginalRowsRerun: 0,
        historicalOriginalRowsDigestBound: 18,
      },
      researchEligibility: "not-eligible",
      authorizations: {
        portfolioMutation: false,
        readinessMutation: false,
        heldOut: false,
        liveSource: false,
        p2Started: false,
      },
    });
    expect(result.report.claimBoundary).toContain("explicitly metered production API input+output tokens");
    expect(result.report.claimBoundary).toContain("not research efficiency-positive");
    expect(result.report.claimBoundary).not.toMatch(/original skill.*33%/iu);
    expect(result.products).toHaveLength(9);

    for (const entry of result.report.products) {
      const validated = await validateVerifiedArtifactProduct(resolve(runRoot, entry.productDirectory));
      expect(validated).toMatchObject({
        manifest: { stageOrder: ["compile", "review-or-accept", "package", "run", "cost"] },
        qualityEvidence: { qualityEvidence: "machine-checked", researchDisposition: "not-eligible" },
        cost: {
          qualityEvidence: "machine-checked",
          researchEligibility: "not-eligible",
          breakEven: { status: "computed", calls: 0 },
          production: { oneTime: { totalHumanMinutes: null } },
        },
      });
    }
    expect(MagpieMachineCheckedProductReportSchema.parse(
      JSON.parse(await readFile(join(runRoot, "report.json"), "utf8")),
    )).toEqual(result.report);
    expect(await readFile(join(rootDir, MAGPIE_PRODUCT_CONFIG_PATH), "utf8")).toMatch(/machine-checked|not-eligible/gu);
    const recipeSource = await readFile(join(rootDir, "src/benchmarks/skill-ir/verified-artifact-product-magpie.ts"), "utf8");
    expect(recipeSource).toContain("runVerifiedArtifactCli");
    expect(recipeSource).not.toContain("runMagpieReleaseAuditArtifact(");
  }, 60_000);
});
