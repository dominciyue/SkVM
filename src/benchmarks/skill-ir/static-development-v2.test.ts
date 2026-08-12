import { describe, expect, test } from "bun:test";
import { StaticDevelopmentV2LockSchema } from "./static-development-v2";

function lockInput() {
  const frozen = { path: "path/file.json", sha256: "a".repeat(64) };
  return {
    schemaVersion: "skill-ir-static-development-lock/v2",
    status: "preregistered",
    experimentId: "future-static-v2",
    evaluationMode: "improvement",
    methodEvidence: true,
    corpus: "pilot",
    skillId: "future-skill",
    frozenInputs: {
      source: frozen,
      tasks: frozen,
      resourceContract: frozen,
      scorer: frozen,
      baseIr: frozen,
      sourceAudit: frozen,
      publicContract: frozen,
      admissionEvidence: frozen,
    },
    implementation: [frozen],
    model: { route: "xty/gpt-5.6-sol", family: "gpt" },
    adapter: { id: "pi", version: "0.67.68" },
    matrix: {
      systems: ["no-skill", "original", "ir-static"],
      contexts: ["clean"],
      agents: ["skvm"],
      environments: ["windows"],
      taskSplit: "development",
      taskIds: ["task-a", "task-b"],
      targetBlocksPerTask: 3,
      reserveBlocksPerTask: 2,
      expectedSelectedRows: 18,
      expectedSelectedTriplets: 6,
      maximumAttemptRows: 30,
      maximumCandidateTriplets: 10,
    },
    runtime: {
      apiKeyEnv: "SKVM_XTY_API_KEY",
      pythonEnv: "SKVM_PYTHON",
      retries: 0,
      routeProbeTimeoutMs: 180000,
      resourceProbeRequired: true,
      routeProbeRequired: true,
      absoluteTimeoutMs: 600000,
      idleTimeoutMs: 120000,
      maxSteps: 30,
      outerWatchdogMs: 660000,
      adapterConfig: "managed",
      maximumWorkDirLength: 220,
      outputRoot: "results/skill-ir/future-static-v2",
    },
    gate: {
      minimumIrStaticSuccesses: 5,
      minimumIrStaticMeanScore: 0.85,
      maximumActiveExecutionFailures: 0,
      maximumHardGateRegressions: 0,
      minimumImprovedPairs: 1,
      maximumRegressedPairs: 0,
    },
    promotionBoundary: {
      corpusStatusAtRun: "runnable",
      entersMainClaim: false,
      permitsHeldOut: false,
      permitsDynamicRepair: false,
      permitsArtifactPromotion: false,
      permitsScorerRetuning: false,
      permitsResidualAudit: true,
    },
    prohibited: ["held-out execution"],
  } as const;
}

describe("static development v2 lock", () => {
  test("freezes target/reserve triplets and progress-aware Pi limits", () => {
    const lock = StaticDevelopmentV2LockSchema.parse(lockInput());
    expect(lock.matrix).toMatchObject({
      targetBlocksPerTask: 3,
      reserveBlocksPerTask: 2,
      expectedSelectedRows: 18,
      expectedSelectedTriplets: 6,
      maximumAttemptRows: 30,
      maximumCandidateTriplets: 10,
    });
    expect(lock.runtime).toMatchObject({
      absoluteTimeoutMs: 600000,
      idleTimeoutMs: 120000,
      maxSteps: 30,
      outerWatchdogMs: 660000,
      retries: 0,
    });
  });

  test("rejects inconsistent denominator arithmetic and legacy timeout values", () => {
    expect(() => StaticDevelopmentV2LockSchema.parse({
      ...lockInput(),
      matrix: { ...lockInput().matrix, maximumAttemptRows: 12 },
    })).toThrow("denominator");
    expect(() => StaticDevelopmentV2LockSchema.parse({
      ...lockInput(),
      runtime: { ...lockInput().runtime, absoluteTimeoutMs: 300000 },
    })).toThrow("progress-aware");
  });
});
