import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  EXECUTION_OBSERVABILITY_DEPENDENCY_PATHS,
  evaluatePublicContractCalibrationGate,
  PublicContractCalibrationLockSchema,
  PublicContractCalibrationLockV2Schema,
  readAndValidatePublicContractCalibrationLock,
  validatePublicContractCalibrationLock,
} from "./public-contract-calibration.ts"
import type { ScoredAgentRunRow } from "./scoring.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")

async function executionDependencies() {
  return Promise.all(EXECUTION_OBSERVABILITY_DEPENDENCY_PATHS.map(async (filePath) => ({
    path: filePath,
    sha256: createHash("sha256").update(await readFile(path.join(rootDir, filePath))).digest("hex"),
  })))
}

const cases = [
  {
    skillId: "law-to-markdown-v2",
    lockPath: "benchmarks/skill-ir/pilots/law-to-markdown/v2/development-calibration-lock.json",
    taskIds: ["law-to-markdown-v2-statute-dev-001", "law-to-markdown-v2-standard-dev-002"],
  },
  {
    skillId: "i18n-helper",
    lockPath: "benchmarks/skill-ir/pilots/i18n-helper/development-calibration-lock.json",
    taskIds: ["i18n-helper-react-basic-dev-001", "i18n-helper-react-interpolation-dev-002"],
  },
  {
    skillId: "law-to-markdown-v3",
    lockPath: "benchmarks/skill-ir/pilots/law-to-markdown/v3/development-calibration-lock.json",
    taskIds: ["law-to-markdown-v3-statute-dev-001", "law-to-markdown-v3-standard-dev-002"],
  },
  {
    skillId: "i18n-helper-v2",
    lockPath: "benchmarks/skill-ir/pilots/i18n-helper/v2/development-calibration-lock.json",
    taskIds: ["i18n-helper-v2-react-basic-dev-001", "i18n-helper-v2-react-interpolation-dev-002"],
  },
  {
    skillId: "i18n-helper-v3",
    lockPath: "benchmarks/skill-ir/pilots/i18n-helper/v3/development-calibration-lock.json",
    taskIds: ["i18n-helper-v3-react-basic-dev-001", "i18n-helper-v3-react-interpolation-dev-002"],
  },
  {
    skillId: "i18n-helper-v3",
    lockPath: "benchmarks/skill-ir/pilots/i18n-helper/v3/execution-observable-calibration-lock-v2.json",
    taskIds: ["i18n-helper-v3-react-basic-dev-001", "i18n-helper-v3-react-interpolation-dev-002"],
  },
] as const

function scoredRow(input: {
  skillId: string
  calibrationId: string
  taskId: string
  system: "no-skill" | "original"
  runIndex: 1 | 2
  success: boolean
  score: number
}): ScoredAgentRunRow {
  return {
    caseId: `${input.skillId}:skvm:windows:clean:${input.taskId}`,
    skill: input.skillId,
    agent: "skvm",
    environment: "windows",
    context: "clean",
    task: input.taskId,
    system: input.system,
    model: "xty/gpt-5.6-sol",
    modelFamily: "gpt",
    adapter: "pi",
    adapterVersion: "0.67.68",
    panelConfigId: input.calibrationId,
    runIndex: input.runIndex,
    taskSplit: "development",
    success: input.success,
    ruleViolations: input.success ? 0 : 1,
    stepCoverage: input.score,
    latencyMs: 100,
    inputTokens: 1000,
    outputTokens: 200,
    tokenCost: 1200,
    runStatus: "ok",
    successSource: "deterministic-evaluator",
    failedCriteria: input.success ? [] : ["public-contract-check"],
    evaluatorScore: input.score,
  }
}

function admissibleRows(lock: Awaited<ReturnType<typeof readAndValidatePublicContractCalibrationLock>>) {
  const [first, second] = lock.matrix.taskIds
  return [
    scoredRow({ skillId: lock.skillId, calibrationId: lock.calibrationId, taskId: first, system: "no-skill", runIndex: 1, success: false, score: 0.6 }),
    scoredRow({ skillId: lock.skillId, calibrationId: lock.calibrationId, taskId: first, system: "original", runIndex: 1, success: true, score: 1 }),
    scoredRow({ skillId: lock.skillId, calibrationId: lock.calibrationId, taskId: first, system: "no-skill", runIndex: 2, success: false, score: 0.8 }),
    scoredRow({ skillId: lock.skillId, calibrationId: lock.calibrationId, taskId: first, system: "original", runIndex: 2, success: false, score: 0.8 }),
    scoredRow({ skillId: lock.skillId, calibrationId: lock.calibrationId, taskId: second, system: "no-skill", runIndex: 1, success: false, score: 0.8 }),
    scoredRow({ skillId: lock.skillId, calibrationId: lock.calibrationId, taskId: second, system: "original", runIndex: 1, success: true, score: 1 }),
    scoredRow({ skillId: lock.skillId, calibrationId: lock.calibrationId, taskId: second, system: "no-skill", runIndex: 2, success: false, score: 0.6 }),
    scoredRow({ skillId: lock.skillId, calibrationId: lock.calibrationId, taskId: second, system: "original", runIndex: 2, success: false, score: 0.8 }),
  ]
}

describe("public-contract method-case calibration locks", () => {
  for (const item of cases) {
    test(`validates the frozen ${item.skillId} development identity`, async () => {
      const lock = await readAndValidatePublicContractCalibrationLock({ rootDir, lockPath: item.lockPath })
      expect(lock).toMatchObject({
        skillId: item.skillId,
        model: { route: "xty/gpt-5.6-sol", family: "gpt" },
        adapter: { id: "pi", version: "0.67.68" },
        matrix: {
          systems: ["no-skill", "original"],
          contexts: ["clean"],
          taskIds: item.taskIds,
          repetitions: 2,
          expectedRows: 8,
          expectedPairs: 4,
        },
        qualification: { system: "original", taskId: item.taskIds[0], runIndex: 1 },
        runtime: {
          adapterConfig: "managed",
          taskTimeoutMs: 300000,
          maxSteps: 30,
          teardownGraceMs: 60000,
          outerWatchdogMs: 360000,
        },
        claimBoundary: {
          capabilityCalibration: true,
          createsBaseIr: false,
          permitsHeldOut: false,
          skillOptimizationEvidence: false,
        },
      })
    })
  }

  test("rejects model, held-out, digest, and gate drift", async () => {
    const lock = await readAndValidatePublicContractCalibrationLock({
      rootDir,
      lockPath: cases[0].lockPath,
    })
    expect(() => PublicContractCalibrationLockSchema.parse({
      ...lock,
      model: { route: "xty/weaker-model", family: "gpt" },
    })).toThrow()
    expect(() => PublicContractCalibrationLockSchema.parse({
      ...lock,
      matrix: { ...lock.matrix, taskSplit: "held-out" },
    })).toThrow()
    expect(() => PublicContractCalibrationLockSchema.parse({
      ...lock,
      gate: { ...lock.gate, maximumInfrastructureFailures: 1 },
    })).toThrow()
    await expect(readAndValidatePublicContractCalibrationLock({
      rootDir,
      lockPath: cases[0].lockPath,
      overrides: { scorerSha256: "0".repeat(64) },
    })).rejects.toThrow("digest")
  })

  test("binds the prospective execution-observability path without changing old v2 locks", async () => {
    const oldLock = await readAndValidatePublicContractCalibrationLock({
      rootDir,
      lockPath: cases[4].lockPath,
    })
    expect(oldLock.runtime).not.toHaveProperty("requireObservableCompletion")

    const dependencies = await executionDependencies()
    const prospective = {
      ...oldLock,
      calibrationId: "i18n-helper-v3-execution-observable-development-v2",
      frozenInputs: { ...oldLock.frozenInputs, executionDependencies: dependencies },
      runtime: { ...oldLock.runtime, requireObservableCompletion: true },
    }
    expect(PublicContractCalibrationLockV2Schema.parse(prospective)).toMatchObject({
      runtime: { requireObservableCompletion: true },
      frozenInputs: { executionDependencies: dependencies },
    })
    await expect(validatePublicContractCalibrationLock(prospective, rootDir)).resolves.toMatchObject({
      calibrationId: prospective.calibrationId,
    })

    expect(() => PublicContractCalibrationLockV2Schema.parse({
      ...prospective,
      frozenInputs: { ...prospective.frozenInputs, executionDependencies: undefined },
    })).toThrow("execution observability dependencies")
    await expect(validatePublicContractCalibrationLock({
      ...prospective,
      frozenInputs: {
        ...prospective.frozenInputs,
        executionDependencies: dependencies.map((item, index) => index === 0
          ? { ...item, sha256: "0".repeat(64) }
          : item),
      },
    }, rootDir)).rejects.toThrow("digest mismatch")
  })

  test("requires a positive, successful, non-regressing original arm", async () => {
    const lock = await readAndValidatePublicContractCalibrationLock({
      rootDir,
      lockPath: cases[0].lockPath,
    })
    expect(evaluatePublicContractCalibrationGate(admissibleRows(lock), lock)).toMatchObject({
      schemaVersion: "skill-ir-public-contract-calibration-gate/v1",
      passed: true,
      counts: { positivePairs: 3, originalSuccesses: 2 },
      gates: { positivePair: true, originalHasSuccess: true, originalMeanNonRegression: true },
      interpretation: { baseIrAuditAllowed: true, heldOutAllowed: false, entersMainClaim: false },
    })

    const regressing = admissibleRows(lock).map((row) => row.system === "original"
      ? { ...row, success: false, evaluatorScore: 0.1 }
      : row)
    expect(evaluatePublicContractCalibrationGate(regressing, lock)).toMatchObject({
      passed: false,
      gates: { originalHasSuccess: false, originalMeanNonRegression: false },
      interpretation: { baseIrAuditAllowed: false },
    })
  })
})
