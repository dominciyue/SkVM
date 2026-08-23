import { mkdtemp, readFile, rm } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import { validateBidsProspectiveDevelopmentLock } from "./bids-prospective-development"
import { orderedProspectiveDevelopmentRows } from "./bids-prospective-development-matrix-run"
import { buildProspectiveDevelopmentPlan } from "./prospective-development"

const rootDir = path.resolve(import.meta.dir, "../../..")

describe("BIDS prospective model matrix runner", () => {
  test("orders every unique paid row by task, repetition, then frozen arm without selection", async () => {
    const lock = await validateBidsProspectiveDevelopmentLock(JSON.parse(await readFile(path.join(
      rootDir, "benchmarks/skill-ir/pilots/bids/prospective-development-lock.json",
    ), "utf8")), rootDir)
    const outDir = await mkdtemp(path.join(rootDir, "results/skill-ir/bids-matrix-plan-test-"))
    try {
      const plan = await buildProspectiveDevelopmentPlan({
        rootDir, lock, outDir: path.relative(rootDir, outDir),
      })
      const rows = orderedProspectiveDevelopmentRows(plan.plan, lock)
      expect(rows).toHaveLength(12)
      expect(rows.slice(0, 3).map((row) => row.system)).toEqual(["no-skill", "original", "ir-static"])
      expect(rows.slice(0, 6).map((row) => row.runIndex)).toEqual([1, 1, 1, 2, 2, 2])
      expect(new Set(rows.map((row) => `${row.caseId}\0${row.runIndex}\0${row.system}`)).size).toBe(12)
    } finally {
      await rm(outDir, { recursive: true, force: true })
    }
  })
})
