import { mkdtemp, readFile, rm } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import { buildBidsSuccessorDevelopmentPlan } from "./bids-successor-development.ts"
import {
  assertBidsSuccessorPersistedPrefix,
  buildBidsSuccessorMatrixFreeze,
  buildBidsSuccessorMatrixPolicy,
  orderedBidsSuccessorMatrixRows,
  validateBidsSuccessorMatrixFreeze,
  validateBidsSuccessorMatrixPolicy,
} from "./bids-successor-matrix.ts"
import { shouldStopBidsSuccessorMatrix } from "./bids-successor-matrix-run.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const lockPath = "benchmarks/skill-ir/pilots/bids/successor-v2/development-lock.json"
const qualificationPath = "results/skill-ir/bids-successor-development-v1/qualification.json"
const policyPath = "benchmarks/skill-ir/pilots/bids/successor-v2/development-analysis-policy.json"

describe("BIDS successor development matrix identity", () => {
  test("binds the passed qualification, successor authority, independent runner, and preregistered estimands", async () => {
    const policy = await buildBidsSuccessorMatrixPolicy(rootDir)

    expect(policy).toMatchObject({
      schemaVersion: "skill-ir-bids-successor-analysis-policy/v1",
      analysisId: "bids-successor-development-analysis-2026-08-23",
      measurementIdentity: "bids-successor-semantic-scorer-v2",
      timing: "after-qualification-before-model-matrix",
      denominator: {
        modelRows: 12,
        modelTriplets: 4,
        deterministicControlRows: 4,
        systems: ["no-skill", "original", "ir-static"],
        order: "task-then-repetition-then-system",
        retries: 0,
        reserveBlocksPerTask: 0,
        forwardOnly: true,
      },
      measurementEligibility: {
        requiredModelRows: 12,
        requiredScoredModelRows: 12,
        requiredDeterministicControlRows: 4,
        maximumActiveExecutionFailures: 1,
        maximumParserOrRuntimeBlockers: 0,
        deterministicScorerRequired: true,
      },
      authorizations: {
        modelMatrix: true,
        deterministicControl: true,
        dynamic: false,
        heldOut: false,
        readinessPromotion: false,
      },
      accounting: {
        priorQualificationPaidCalls: 1,
        currentStagePaidCalls: 0,
        modelMatrixPaidCallCeiling: 12,
        retriesPaidCallCeiling: 0,
      },
    })
    expect(policy.lock.path).toBe(lockPath)
    expect(policy.qualification.path).toBe(qualificationPath)
    expect(policy.tasks.path).toBe("benchmarks/skill-ir/pilots/bids/successor-v2/development/tasks.json")
    expect(policy.scorer.path).toBe("src/bench/evaluators/bids-successor-grade.ts")
    expect(policy.implementation.map((file) => file.path)).toEqual([
      "src/benchmarks/skill-ir/bids-successor-matrix.ts",
      "src/benchmarks/skill-ir/bids-successor-matrix-run.ts",
      "src/benchmarks/skill-ir/prospective-development-run.ts",
      "src/benchmarks/skill-ir/prospective-development-result.ts",
    ])
    expect(policy.estimands.map((item) => item.id)).toEqual([
      "original-minus-no-skill",
      "ir-static-minus-original",
      "validated-artifact-minus-original",
    ])
    expect(policy.prohibited).toEqual([
      "qualification-repeat",
      "bids-v1-rescoring-or-row-reuse",
      "retry-or-reserve-selection",
      "post-hoc-row-selection",
      "dynamic",
      "held-out",
      "readiness-promotion",
    ])
  })

  test("orders exactly 12 unique rows by task, repetition, then frozen system", async () => {
    const policy = await buildBidsSuccessorMatrixPolicy(rootDir)
    const validated = await validateBidsSuccessorMatrixPolicy(policy, rootDir)
    const outDir = await mkdtemp(path.join(rootDir, "results/skill-ir/bids-successor-matrix-test-"))
    try {
      const plan = await buildBidsSuccessorDevelopmentPlan({
        rootDir,
        lock: validated.lock,
        outDir: path.relative(rootDir, outDir).replaceAll("\\", "/"),
      })
      const rows = orderedBidsSuccessorMatrixRows(plan.plan, validated.lock)
      expect(rows).toHaveLength(12)
      expect(rows.slice(0, 3).map((row) => row.system)).toEqual(["no-skill", "original", "ir-static"])
      expect(rows.slice(0, 6).map((row) => row.runIndex)).toEqual([1, 1, 1, 2, 2, 2])
      expect(new Set(rows.map((row) => `${row.caseId}\0${row.runIndex}\0${row.system}`)).size).toBe(12)
      expect(() => orderedBidsSuccessorMatrixRows(rows.slice(1), validated.lock))
        .toThrow("requires one row")
    } finally {
      await rm(outDir, { recursive: true, force: true })
    }
  })

  test("accepts only an exact persisted prefix and rejects gaps, duplicates, or misalignment", async () => {
    const policy = await buildBidsSuccessorMatrixPolicy(rootDir)
    const validated = await validateBidsSuccessorMatrixPolicy(policy, rootDir)
    const outDir = await mkdtemp(path.join(rootDir, "results/skill-ir/bids-successor-prefix-test-"))
    try {
      const plan = await buildBidsSuccessorDevelopmentPlan({
        rootDir,
        lock: validated.lock,
        outDir: path.relative(rootDir, outDir).replaceAll("\\", "/"),
      })
      const rows = orderedBidsSuccessorMatrixRows(plan.plan, validated.lock)
      const raw = rows.slice(0, 2).map((row) => ({
        caseId: row.caseId,
        runIndex: row.runIndex,
        system: row.system,
      }))
      const envelopes = rows.slice(0, 2).map((row) => ({
        taskId: row.caseId.split(":").at(-1)!,
        candidateBlock: row.runIndex,
        system: row.system,
      }))

      expect(() => assertBidsSuccessorPersistedPrefix(rows, [], [])).not.toThrow()
      expect(() => assertBidsSuccessorPersistedPrefix(rows, raw, envelopes)).not.toThrow()
      expect(() => assertBidsSuccessorPersistedPrefix(rows, raw, envelopes.slice(1)))
        .toThrow("length mismatch")
      expect(() => assertBidsSuccessorPersistedPrefix(rows, [raw[1]!, raw[0]!], envelopes))
        .toThrow("identity mismatch")
      expect(() => assertBidsSuccessorPersistedPrefix(rows, [raw[0]!, raw[0]!], envelopes))
        .toThrow("identity mismatch")
    } finally {
      await rm(outDir, { recursive: true, force: true })
    }
  })

  test("fails closed on qualification or lock drift", async () => {
    const policy = await buildBidsSuccessorMatrixPolicy(rootDir)
    await expect(validateBidsSuccessorMatrixPolicy(policy, rootDir)).resolves.toMatchObject({
      policy: { analysisId: policy.analysisId },
      qualification: { status: "passed", accounting: { paidCalls: 1 } },
    })

    const staleQualification = structuredClone(policy)
    staleQualification.qualification.sha256 = "0".repeat(64)
    await expect(validateBidsSuccessorMatrixPolicy(staleQualification, rootDir))
      .rejects.toThrow("digest mismatch")

    const staleLock = structuredClone(policy)
    staleLock.lock.sha256 = "0".repeat(64)
    await expect(validateBidsSuccessorMatrixPolicy(staleLock, rootDir))
      .rejects.toThrow("digest mismatch")

    const implementationPathDrift = structuredClone(policy)
    implementationPathDrift.implementation[1] = implementationPathDrift.implementation[2]
    await expect(validateBidsSuccessorMatrixPolicy(implementationPathDrift, rootDir))
      .rejects.toThrow("path drift")
  })

  test("stops only for frozen parser/runtime blockers", () => {
    expect(shouldStopBidsSuccessorMatrix("parser-incompatible")).toBe(true)
    expect(shouldStopBidsSuccessorMatrix("runtime-crash")).toBe(true)
    expect(shouldStopBidsSuccessorMatrix("qualification-failure")).toBe(true)
    expect(shouldStopBidsSuccessorMatrix("measurement-invalid")).toBe(true)
    expect(shouldStopBidsSuccessorMatrix("active-idle-timeout")).toBe(false)
    expect(shouldStopBidsSuccessorMatrix("active-absolute-timeout")).toBe(false)
    expect(shouldStopBidsSuccessorMatrix("step-limit")).toBe(false)
    expect(shouldStopBidsSuccessorMatrix("semantic-complete")).toBe(false)
  })

  test("reproduces the committed policy and zero-paid matrix freeze", async () => {
    const builtPolicy = await buildBidsSuccessorMatrixPolicy(rootDir)
    const committedPolicy = JSON.parse(await readFile(path.join(rootDir, policyPath), "utf8"))
    expect(committedPolicy).toEqual(builtPolicy)

    const freeze = await buildBidsSuccessorMatrixFreeze(rootDir)
    expect(freeze).toMatchObject({
      schemaVersion: "skill-ir-bids-successor-matrix-freeze/v1",
      status: "passed",
      measurementIdentity: "bids-successor-semantic-scorer-v2",
      plan: {
        rows: 12,
        triplets: 4,
        successorTaskRows: 12,
        order: "task-then-repetition-then-system",
        resumablePrefixRows: 0,
      },
      scorer: { evaluatorId: "skill-ir-bids-successor", directLoaded: true },
      accounting: {
        priorQualificationPaidCalls: 1,
        currentStagePaidCalls: 0,
        matrixExecuted: false,
        modelMatrixPaidCallCeiling: 12,
      },
      authorizations: {
        modelMatrix: true,
        dynamic: false,
        heldOut: false,
        readinessPromotion: false,
      },
    })
    expect(JSON.stringify(freeze)).not.toContain(rootDir)
    expect(JSON.stringify(freeze)).not.toMatch(/SKVM_XTY_API_KEY\s*[:=]\s*[^"}]+/u)
    const committedFreeze = JSON.parse(await readFile(path.join(
      rootDir, "results/skill-ir/bids-successor-matrix-freeze-v1.json",
    ), "utf8"))
    expect(committedFreeze).toEqual(freeze)
    await expect(validateBidsSuccessorMatrixFreeze(committedFreeze, rootDir, committedPolicy))
      .resolves.toEqual(committedFreeze)

    const stalePolicyBinding = structuredClone(committedFreeze)
    stalePolicyBinding.identityClosure.policy.sha256 = "0".repeat(64)
    await expect(validateBidsSuccessorMatrixFreeze(stalePolicyBinding, rootDir, committedPolicy))
      .rejects.toThrow("digest mismatch")
  })
})
