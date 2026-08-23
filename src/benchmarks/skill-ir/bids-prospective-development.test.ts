import { mkdtemp, readFile, rm } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import {
  buildBidsProspectiveDevelopmentLock,
  validateBidsProspectiveDevelopmentLock,
} from "./bids-prospective-development"
import { buildProspectiveDevelopmentPlan } from "./prospective-development"

const rootDir = path.resolve(import.meta.dir, "../../..")

describe("BIDS prospective development lock", () => {
  test("binds all five completed pre-paid gates and the exact 12-row denominator", async () => {
    const lock = await buildBidsProspectiveDevelopmentLock(rootDir)

    expect(lock.prePaidGates.map((gate) => gate.id)).toEqual([
      "public-json-contract-audit",
      "evaluator-pointer-closure",
      "contribution-identifiability-audit",
      "deterministic-scorer-canary",
      "prospective-construction-cost-identity",
    ])
    expect(lock.prePaidGates.every((gate) => gate.status === "passed")).toBe(true)
    expect(lock.matrix).toMatchObject({
      systems: ["no-skill", "original", "ir-static"],
      taskIds: ["bids-entity-order-dev-001", "bids-metadata-inheritance-dev-002"],
      targetBlocksPerTask: 2,
      reserveBlocksPerTask: 0,
      expectedSelectedRows: 12,
      maximumAttemptRows: 12,
    })
    expect(lock.accounting).toEqual({ qualificationPaidCalls: 1, matrixPaidCalls: 12, totalPaidCallCeiling: 13 })
    expect(lock.qualification).toMatchObject({
      system: "original",
      taskId: "bids-entity-order-dev-001",
      candidateBlock: 1,
      semanticTaskSuccessRequired: false,
      requiredChecks: ["resource", "route", "observability", "scorer"],
    })
    expect(lock.publicContract).toEqual({
      protectedInputs: ["dataset-manifest.json", "bids-audit-interface.json"],
      exactOutputs: ["bids-audit.json"],
      exactOutputSet: true,
    })
    expect(lock.authorizations).toEqual({ paidMatrix: false, heldOut: false, readinessPromotion: false })
  })

  test("builds the frozen 2 x 2 x 3 forward-only plan without reserve rows", async () => {
    const lock = await buildBidsProspectiveDevelopmentLock(rootDir)
    const outDir = await mkdtemp(path.join(rootDir, "results/skill-ir/bids-plan-test-"))
    try {
      const plan = await buildProspectiveDevelopmentPlan({
        rootDir,
        lock,
        outDir: path.relative(rootDir, outDir),
      })

      expect(plan.plan).toHaveLength(12)
      expect(new Set(plan.plan.map((row) => row.system))).toEqual(new Set(["no-skill", "original", "ir-static"]))
      expect(new Set(plan.plan.map((row) => row.runIndex))).toEqual(new Set([1, 2]))
      expect(plan.plan.every((row) => row.workDir.length <= 220)).toBe(true)
      expect(plan.runArgs.retries).toBe(0)
    } finally {
      await rm(outDir, { recursive: true, force: true })
    }
  })

  test("fails closed when frozen evidence or denominator arithmetic drifts", async () => {
    const lock = await buildBidsProspectiveDevelopmentLock(rootDir)
    const drifted = structuredClone(lock)
    drifted.frozenInputs.constructionReport.sha256 = "0".repeat(64)
    await expect(validateBidsProspectiveDevelopmentLock(drifted, rootDir)).rejects.toThrow("digest mismatch")

    const wrongRows: unknown = {
      ...lock,
      matrix: { ...lock.matrix, expectedSelectedRows: 11 },
    }
    await expect(validateBidsProspectiveDevelopmentLock(wrongRows, rootDir)).rejects.toThrow()
  })

  test("committed lock is reproducible and contains no secret value or absolute path", async () => {
    const built = await buildBidsProspectiveDevelopmentLock(rootDir)
    const committed = JSON.parse(await readFile(path.join(
      rootDir,
      "benchmarks/skill-ir/pilots/bids/prospective-development-lock.json",
    ), "utf8"))

    expect(committed).toEqual(built)
    expect(JSON.stringify(committed)).not.toContain(rootDir)
    expect(JSON.stringify(committed)).not.toMatch(/SKVM_XTY_API_KEY\s*[:=]\s*[^"}]+/u)
  })
})
