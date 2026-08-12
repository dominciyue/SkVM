import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  buildStaticDevelopmentV2Plan,
  validateStaticDevelopmentV2Lock,
  StaticDevelopmentV2LockSchema,
} from "./static-development-v2";
import { staticDevelopmentV2QualificationWatchdogMs } from "./static-development-v2-cli";

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

  test("materializes a sequential candidate plan with progress-aware sidecars", async () => {
    const result = await buildStaticDevelopmentV2Plan({
      rootDir: path.resolve(import.meta.dir, "../../.."),
      lock: StaticDevelopmentV2LockSchema.parse({
        ...lockInput(),
        skillId: "i18n-helper-contribution-v2",
        frozenInputs: {
          source: { path: "benchmarks/skill-ir/pilots/i18n-helper/source/SKILL.md", sha256: "7f7310b78d076d53111580b02f4a3f9e2086323108520e9b684218032b9a3729" },
          tasks: { path: "benchmarks/skill-ir/pilots/i18n-helper/contribution-v2/development/tasks.json", sha256: "43c7b288ba493956224683f56b56e5aa2c8b040f6d78485c5e29b39bca021d4c" },
          resourceContract: { path: "benchmarks/skill-ir/pilots/i18n-helper/contribution-v2/resource-contract.json", sha256: "aa23b9ac49e2609cb1cefedce99e8290c0546c1ea74f8914bb8c57aa1b237cb5" },
          scorer: { path: "src/bench/evaluators/i18n-helper-contribution-v2-grade.ts", sha256: "f868a925abfe96bc18cacd85947becbf60df059cb7a4fdb654440f4a8003a264" },
          baseIr: { path: "benchmarks/skill-ir/pilots/i18n-helper/contribution-v2/base-ir.json", sha256: "9a10f30a16541238f952fb4afbfa73c068ce7c63699c45decf508d88d6277645" },
          sourceAudit: { path: "benchmarks/skill-ir/pilots/i18n-helper/contribution-v2/base-ir-source-audit.json", sha256: "4bd4753826afca9d335200efb22c40c2ed08c83485072bb582a71d56f672c0c4" },
        },
        implementation: [{ path: "src/core/pi-runtime.ts", sha256: "a".repeat(64) }],
        matrix: {
          ...lockInput().matrix,
          taskIds: ["i18n-helper-contribution-multifile-dev-001", "i18n-helper-contribution-partial-plural-dev-002"],
        },
      }),
      outDir: "results/skill-ir/future-static-v2/run",
    });
    expect(result.plan).toHaveLength(30);
    expect(result.plan.every((row) => row.command.includes("--idle-timeout-ms=120000"))).toBe(true);
    expect(result.plan.every((row) => row.command.some((arg) => arg.startsWith("--execution-observation=")))).toBe(true);
  });

  test("fails closed when a frozen implementation digest drifts", async () => {
    const existing = { path: "src/core/pi-runtime.ts", sha256: "0".repeat(64) };
    await expect(validateStaticDevelopmentV2Lock({
      ...lockInput(),
      frozenInputs: Object.fromEntries(Object.keys(lockInput().frozenInputs).map((key) => [key, existing])),
      implementation: [existing],
    }, path.resolve(import.meta.dir, "../../.."))).rejects.toThrow("digest mismatch");
  });

  test("gives a full qualification row the outer watchdog, not the route-probe timeout", () => {
    expect(staticDevelopmentV2QualificationWatchdogMs({
      routeProbeTimeoutMs: 180_000,
      outerWatchdogMs: 660_000,
    })).toBe(660_000);
  });
});
