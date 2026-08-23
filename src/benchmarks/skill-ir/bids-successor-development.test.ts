import { mkdtemp, readFile, rm } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import { customEvaluators } from "../../framework/types.ts"
import type { ExecutionEnvelope } from "./execution-resilience.ts"
import {
  buildBidsSuccessorDevelopmentLock,
  buildBidsSuccessorDevelopmentPlan,
  buildBidsSuccessorDevelopmentFreeze,
  buildBidsSuccessorQualification,
  BidsSuccessorQualificationSchema,
  loadBidsSuccessorDevelopmentScorer,
  validateBidsSuccessorDevelopmentLock,
} from "./bids-successor-development.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")

function envelope(classification: ExecutionEnvelope["classification"]): ExecutionEnvelope {
  return {
    schemaVersion: "skill-ir-execution-envelope/v1",
    experimentId: "bids-successor-development-2026-08-23",
    taskId: "bids-entity-order-dev-001",
    system: "original",
    candidateBlock: 1,
    attemptId: "bids-entity-order-dev-001:qualification:original",
    process: {
      started: true,
      exitCode: classification === "semantic-complete" ? 0 : null,
      termination: classification === "active-idle-timeout" ? "idle-timeout" : "natural",
      durationMs: 1234,
    },
    activity: {
      requestDispatched: true,
      providerResponses: 1,
      assistantMessages: 1,
      toolCalls: 0,
      toolResults: 0,
    },
    terminal: { present: classification === "semantic-complete" },
    usage: { available: true, input: 10, output: 2, cacheRead: 3, cacheWrite: 0 },
    parser: { outcome: "ok", unknownTypes: [] },
    outputs: { fileCount: 2 },
    classification,
    replacementEligible: false,
  }
}

describe("BIDS successor development freeze", () => {
  test("binds only the successor measurement authority and a unique 1 + 12 forward denominator", async () => {
    const lock = await buildBidsSuccessorDevelopmentLock(rootDir)

    expect(lock).toMatchObject({
      schemaVersion: "skill-ir-bids-successor-development-lock/v1",
      status: "preregistered",
      experimentId: "bids-successor-development-2026-08-23",
      measurementIdentity: "bids-successor-semantic-scorer-v2",
      model: { route: "xty/gpt-5.6-sol", family: "gpt" },
      adapter: { id: "pi", version: "0.67.68" },
      matrix: {
        systems: ["no-skill", "original", "ir-static"],
        contexts: ["clean"],
        agents: ["skvm"],
        environments: ["windows"],
        taskIds: ["bids-entity-order-dev-001", "bids-metadata-inheritance-dev-002"],
        targetBlocksPerTask: 2,
        reserveBlocksPerTask: 0,
        expectedSelectedRows: 12,
        maximumAttemptRows: 12,
        rowReuse: "same-lock-forward-only",
      },
      accounting: { qualificationPaidCalls: 1, matrixPaidCalls: 12, totalPaidCallCeiling: 13 },
      runtime: { retries: 0, outputRoot: "results/skill-ir/bids-successor-development-v1" },
      authorizations: {
        qualification: true,
        paidMatrix: false,
        dynamic: false,
        heldOut: false,
        readinessPromotion: false,
      },
    })
    expect(lock.frozenInputs.tasks.path).toBe(
      "benchmarks/skill-ir/pilots/bids/successor-v2/development/tasks.json",
    )
    expect(lock.frozenInputs.publicContract.path).toBe(
      "benchmarks/skill-ir/pilots/bids/successor-v2/public-interface.json",
    )
    expect(lock.frozenInputs.scorer.path).toBe("src/bench/evaluators/bids-successor-grade.ts")
    expect(lock.frozenInputs.successorContractAudit.path).toBe(
      "results/skill-ir/bids-successor-contract-audit-v1.json",
    )
    expect(JSON.stringify(lock.frozenInputs)).not.toContain("scorerRegistry")
    expect(lock.compatibility.bidsV1Rescored).toBe(false)
    expect(lock.compatibility.predecessorFiles.map((file) => file.path)).toEqual([
      "benchmarks/skill-ir/pilots/bids/development/tasks.json",
      "src/bench/evaluators/bids-grade.ts",
      "benchmarks/skill-ir/pilots/bids/prospective-development-lock.json",
      "results/skill-ir/bids-prospective-development-v1/result.json",
    ])
  })

  test("materializes all 12 rows with successor tasks and evaluator payloads", async () => {
    const lock = await buildBidsSuccessorDevelopmentLock(rootDir)
    const outDir = await mkdtemp(path.join(rootDir, "results/skill-ir/bids-successor-plan-test-"))
    try {
      const built = await buildBidsSuccessorDevelopmentPlan({
        rootDir,
        lock,
        outDir: path.relative(rootDir, outDir).replaceAll("\\", "/"),
      })
      expect(built.plan).toHaveLength(12)
      expect(new Set(built.plan.map((row) => row.system))).toEqual(
        new Set(["no-skill", "original", "ir-static"]),
      )
      expect(new Set(built.plan.map((row) => row.runIndex))).toEqual(new Set([1, 2]))
      expect(built.runArgs.retries).toBe(0)
      expect(built.plan.every((row) => row.workDir.length <= 220)).toBe(true)

      for (const row of built.plan) {
        const task = JSON.parse(await readFile(row.taskPath, "utf8")) as {
          fixtures: Record<string, string>
          eval: Array<{ evaluatorId?: string; payload?: { schemaVersion?: string } }>
        }
        const publicInterface = JSON.parse(task.fixtures["bids-audit-interface.json"]!) as {
          measurementIdentity?: string
        }
        expect(publicInterface.measurementIdentity).toBe("bids-successor-semantic-scorer-v2")
        expect(task.eval.every((criterion) => criterion.evaluatorId === "skill-ir-bids-successor")).toBe(true)
        expect(task.eval.every((criterion) => criterion.payload?.schemaVersion === "skill-ir-bids-eval/v2")).toBe(true)
      }
    } finally {
      await rm(outDir, { recursive: true, force: true })
    }
  })

  test("direct-loads exactly the lock-declared scorer without registry-file authority", async () => {
    const lock = await buildBidsSuccessorDevelopmentLock(rootDir)
    customEvaluators.delete("skill-ir-bids-successor")
    expect(customEvaluators.has("skill-ir-bids-successor")).toBe(false)

    await loadBidsSuccessorDevelopmentScorer(rootDir, lock, lock.frozenInputs.scorer.path)
    expect(customEvaluators.has("skill-ir-bids-successor")).toBe(true)
    await expect(loadBidsSuccessorDevelopmentScorer(
      rootDir,
      lock,
      "src/bench/evaluators/bids-grade.ts",
    )).rejects.toThrow("lock-declared")
    await expect(loadBidsSuccessorDevelopmentScorer(rootDir, lock, "../outside.ts"))
      .rejects.toThrow()
  })

  test("qualification gates infrastructure only and discloses task failure", async () => {
    const report = buildBidsSuccessorQualification({
      experimentId: "bids-successor-development-2026-08-23",
      lockSha256: "a".repeat(64),
      resource: {
        status: "ok",
        reportPath: "results/skill-ir/bids-successor-development-v1/qualification/resource-probe.json",
        reportSha256: "b".repeat(64),
      },
      envelope: envelope("active-idle-timeout"),
      scorer: { rowProduced: true, deterministicEvaluator: true, semanticSuccess: false },
      exactOutputsPresent: false,
    })
    expect(report.status).toBe("passed")
    expect(report.checks).toEqual({ resource: true, route: true, observability: true, scorer: true })
    expect(report.disclosure).toEqual({
      exactOutputsPresent: false,
      semanticSuccess: false,
      usedAsGate: false,
    })
    expect(report.authorizations).toEqual({
      paidMatrix: true,
      dynamic: false,
      heldOut: false,
      readinessPromotion: false,
    })

    const blocked = envelope("pre-semantic-idle-timeout")
    blocked.activity.providerResponses = 0
    blocked.activity.assistantMessages = 0
    blocked.parser = { outcome: "empty", unknownTypes: [] }
    expect(buildBidsSuccessorQualification({
      experimentId: blocked.experimentId,
      lockSha256: "a".repeat(64),
      resource: {
        status: "ok",
        reportPath: "results/skill-ir/bids-successor-development-v1/qualification/resource-probe.json",
        reportSha256: "b".repeat(64),
      },
      envelope: blocked,
      scorer: { rowProduced: false, deterministicEvaluator: false, semanticSuccess: null },
      exactOutputsPresent: false,
    }).status).toBe("failed")

    const forged = structuredClone(report) as Record<string, any>
    forged.execution.classification = "made-up-success"
    expect(BidsSuccessorQualificationSchema.safeParse(forged).success).toBe(false)
  })

  test("committed lock is reproducible, fail-closed, and contains no secret or absolute path", async () => {
    const built = await buildBidsSuccessorDevelopmentLock(rootDir)
    const committed = JSON.parse(await readFile(path.join(
      rootDir,
      "benchmarks/skill-ir/pilots/bids/successor-v2/development-lock.json",
    ), "utf8"))
    expect(committed).toEqual(built)
    expect(JSON.stringify(committed)).not.toContain(rootDir)
    expect(JSON.stringify(committed)).not.toMatch(/SKVM_XTY_API_KEY\s*[:=]\s*[^"}]+/u)

    const drifted = structuredClone(built)
    drifted.frozenInputs.successorContractAudit.sha256 = "0".repeat(64)
    await expect(validateBidsSuccessorDevelopmentLock(drifted, rootDir)).rejects.toThrow("digest mismatch")
  })

  test("freezes a compact zero-paid dry-run and opens qualification only", async () => {
    const lockPath = "benchmarks/skill-ir/pilots/bids/successor-v2/development-lock.json"
    const report = await buildBidsSuccessorDevelopmentFreeze({ rootDir, lockPath })
    expect(report).toMatchObject({
      schemaVersion: "skill-ir-bids-successor-development-freeze/v1",
      status: "passed",
      measurementIdentity: "bids-successor-semantic-scorer-v2",
      plan: {
        rows: 12,
        triplets: 4,
        successorTaskRows: 12,
        retries: 0,
        reserveBlocksPerTask: 0,
      },
      scorer: {
        evaluatorId: "skill-ir-bids-successor",
        directLoaded: true,
        registryFileAuthority: false,
      },
      accounting: {
        paidCalls: 0,
        qualificationExecuted: false,
        matrixExecuted: false,
      },
      authorizations: {
        qualification: true,
        paidExecution: false,
        dynamic: false,
        heldOut: false,
        readinessPromotion: false,
      },
    })
    expect(report.compatibility).toMatchObject({ bidsV1Preserved: true, bidsV1Rescored: false })
    const committed = JSON.parse(await readFile(path.join(
      rootDir,
      "results/skill-ir/bids-successor-development-freeze-v1.json",
    ), "utf8"))
    expect(committed).toEqual(report)
  })
})
