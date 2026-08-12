import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  collectDirectScorerDependencies,
  PublicContractCalibrationLockV2Schema,
  PublicContractCalibrationLockV3Schema,
  validatePublicContractCalibrationLock,
} from "./public-contract-calibration.ts"

describe("public-contract calibration lock v2 dependency closure", () => {
  test("defines a resilient paired v3 denominator without weakening v1/v2", () => {
    const base = {
      schemaVersion: "skill-ir-public-contract-calibration-lock/v3",
      status: "preregistered",
      calibrationId: "env-manager-source-contract-baseline-v1",
      methodEvidence: false,
      corpus: "pilot",
      skillId: "env-manager-v2",
      frozenInputs: {
        source: { path: "source/SKILL.md", sha256: "0".repeat(64) },
        tasks: { path: "development/tasks.json", sha256: "1".repeat(64) },
        publicContract: { path: "public-contract.json", sha256: "2".repeat(64) },
        publicContractSourceAudit: { path: "public-contract-source-audit.json", sha256: "3".repeat(64) },
        scorer: { path: "src/bench/evaluators/env-manager-grade-v2.ts", sha256: "4".repeat(64) },
        scorerDependencies: [{ path: "src/core/workdir-manifest.ts", sha256: "5".repeat(64) }],
        implementation: [{ path: "src/benchmarks/skill-ir/execution-resilience.ts", sha256: "6".repeat(64) }],
        taskSplitFreeze: { path: "task-split-freeze.json", sha256: "7".repeat(64) },
        contractAuditManifest: { path: "benchmark-contract-audit.json", sha256: "8".repeat(64) },
        contractAuditReport: { path: "results/audit.json", sha256: "9".repeat(64) },
      },
      model: { route: "xty/gpt-5.6-sol", family: "gpt" },
      adapter: { id: "pi", version: "0.67.68" },
      matrix: {
        systems: ["no-skill", "original"], contexts: ["clean"], agents: ["skvm"], environments: ["windows"],
        taskSplit: "development", taskIds: ["task-a", "task-b"], targetBlocksPerTask: 2, reserveBlocksPerTask: 1,
        expectedSelectedRows: 8, expectedSelectedPairs: 4, maximumAttemptRows: 12, maximumCandidatePairs: 6,
      },
      qualification: { system: "original", taskId: "task-a", candidateBlock: 1 },
      runtime: {
        apiKeyEnv: "SKVM_XTY_API_KEY", retries: 0, adapterConfig: "managed", absoluteTimeoutMs: 600000,
        idleTimeoutMs: 120000, maxSteps: 30, outerWatchdogMs: 660000, maximumWorkDirLength: 220,
      },
      gate: {
        requireNoSkillNonSaturation: true, minimumDifferingPairs: 1, minimumPositivePairs: 1,
        minimumOriginalSuccesses: 1, requireOriginalNonRegression: true, maximumActiveExecutionFailures: 0,
        maximumParserOrRuntimeBlockers: 0,
      },
      claimBoundary: {
        developmentOnly: true, capabilityCalibration: true, createsBaseIr: false, permitsHeldOut: false,
        skillOptimizationEvidence: false, tokenEvidence: false,
      },
      prohibited: ["held-out execution", "score-aware pair replacement", "single-arm replacement"],
    }
    expect(PublicContractCalibrationLockV3Schema.parse(base)).toMatchObject({
      matrix: { maximumAttemptRows: 12, expectedSelectedRows: 8 },
      runtime: { absoluteTimeoutMs: 600000, idleTimeoutMs: 120000, outerWatchdogMs: 660000 },
    })
    expect(() => PublicContractCalibrationLockV3Schema.parse({
      ...base,
      runtime: { ...base.runtime, idleTimeoutMs: 600000 },
    })).toThrow()
    expect(() => PublicContractCalibrationLockV3Schema.parse({
      ...base,
      matrix: { ...base.matrix, maximumAttemptRows: 8 },
    })).toThrow("denominator")
  })

  test("requires a non-empty exact scorer dependency declaration", () => {
    const base = {
      schemaVersion: "skill-ir-public-contract-calibration-lock/v2",
      status: "preregistered",
      calibrationId: "i18n-helper-v3-public-output-abi-v2",
      methodEvidence: false,
      corpus: "pilot",
      skillId: "i18n-helper-v3",
      frozenInputs: {
        source: { path: "source/SKILL.md", sha256: "0".repeat(64) },
        tasks: { path: "development/tasks.json", sha256: "1".repeat(64) },
        publicContract: { path: "public-contract.json", sha256: "2".repeat(64) },
        publicContractSourceAudit: { path: "public-contract-source-audit.json", sha256: "3".repeat(64) },
        scorer: { path: "src/bench/evaluators/i18n-helper-grade-v3.ts", sha256: "4".repeat(64) },
        scorerDependencies: [
          { path: "src/bench/public-output-abi-v2.ts", sha256: "5".repeat(64) },
        ],
        taskSplitFreeze: { path: "task-split-freeze.json", sha256: "6".repeat(64) },
        contractAuditManifest: { path: "benchmark-contract-audit.json", sha256: "7".repeat(64) },
        contractAuditReport: { path: "results/audit.json", sha256: "8".repeat(64) },
      },
      model: { route: "xty/gpt-5.6-sol", family: "gpt" },
      adapter: { id: "pi", version: "0.67.68" },
      matrix: {
        systems: ["no-skill", "original"], contexts: ["clean"], agents: ["skvm"],
        environments: ["windows"], taskSplit: "development", taskIds: ["task-a", "task-b"],
        repetitions: 2, expectedRows: 8, expectedPairs: 4,
      },
      qualification: { system: "original", taskId: "task-a", runIndex: 1 },
      runtime: {
        apiKeyEnv: "SKVM_XTY_API_KEY", retries: 0, adapterConfig: "managed",
        taskTimeoutMs: 300000, maxSteps: 30, teardownGraceMs: 60000,
        outerWatchdogMs: 360000, explicitEvaluatorLoad: true,
      },
      gate: {
        maximumInfrastructureFailures: 0, requireNoSkillNonSaturation: true,
        minimumDifferingPairs: 1, requireOriginalNonRegression: true,
        minimumPositivePairs: 1, minimumOriginalSuccesses: 1,
      },
      claimBoundary: {
        developmentOnly: true, capabilityCalibration: true, createsBaseIr: false,
        permitsHeldOut: false, skillOptimizationEvidence: false, tokenEvidence: false,
      },
      prohibited: [
        "held-out execution", "scorer retuning after model results",
        "base IR construction before gate pass", "optimization or token claim from calibration",
      ],
    }
    expect(PublicContractCalibrationLockV2Schema.parse(base)).toMatchObject({
      schemaVersion: "skill-ir-public-contract-calibration-lock/v2",
      skillId: "i18n-helper-v3",
      frozenInputs: {
        scorerDependencies: base.frozenInputs.scorerDependencies,
      },
    })
    expect(() => PublicContractCalibrationLockV2Schema.parse({
      ...base,
      frozenInputs: { ...base.frozenInputs, scorerDependencies: [] },
    })).toThrow()
  })

  test("enumerates only direct relative TypeScript imports using resolved repository paths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "skill-ir-scorer-deps-"))
    try {
      await mkdir(path.join(root, "src", "bench", "evaluators"), { recursive: true })
      await mkdir(path.join(root, "src", "bench"), { recursive: true })
      await mkdir(path.join(root, "src", "framework"), { recursive: true })
      await writeFile(path.join(root, "src", "bench", "evaluators", "grade.ts"), [
        'import path from "node:path"',
        'import { helper } from "../helper.ts"',
        'import type { Kind } from "../../framework/types.ts"',
        'export { other } from "../other.ts"',
        'const lazy = import("../lazy.ts")',
        "void path; void helper; void lazy",
        "",
      ].join("\n"))
      for (const relative of [
        "src/bench/helper.ts",
        "src/bench/other.ts",
        "src/bench/lazy.ts",
        "src/framework/types.ts",
      ]) {
        await writeFile(path.join(root, ...relative.split("/")), "export const other = true\nexport const helper = true\nexport type Kind = string\n")
      }
      await expect(collectDirectScorerDependencies(root, "src/bench/evaluators/grade.ts")).resolves.toEqual([
        "src/bench/helper.ts",
        "src/bench/other.ts",
        "src/framework/types.ts",
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("rejects missing and digest-drifted dependencies in the frozen i18n v3 lock", async () => {
    const lockPath = path.join(
      process.cwd(),
      "benchmarks/skill-ir/pilots/i18n-helper/v3/development-calibration-lock.json",
    )
    const lock = JSON.parse(await readFile(lockPath, "utf8")) as any
    const withoutAbi = structuredClone(lock)
    withoutAbi.frozenInputs.scorerDependencies = withoutAbi.frozenInputs.scorerDependencies.filter(
      (file: { path: string }) => file.path !== "src/bench/public-output-abi-v2.ts",
    )
    await expect(validatePublicContractCalibrationLock(withoutAbi, process.cwd())).rejects.toThrow(
      "dependency closure mismatch",
    )

    const drifted = structuredClone(lock)
    drifted.frozenInputs.scorerDependencies[0].sha256 = "0".repeat(64)
    await expect(validatePublicContractCalibrationLock(drifted, process.cwd())).rejects.toThrow("digest mismatch")
  })
})
