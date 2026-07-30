import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  runExperimentalDesignV2HarderDifferentialAudit,
  runExperimentalDesignV2HarderMaterializationAudit,
} from "./experimental-design-v2-harder-audit.ts"
import {
  buildExperimentalDesignV2HarderDevelopmentTaskSet,
} from "./experimental-design-v2-harder-development.ts"

const rootDir = process.cwd()
const v2Root = path.join(rootDir, "benchmarks/skill-ir/pilots/experimental-design/v2")

describe("experimental-design v2 harder development audits", () => {
  test("accepts two distinct legal allocations and rejects four public invalid controls per task", async () => {
    const contractBytes = await readFile(path.join(v2Root, "public-contract.json"))
    const taskSet = buildExperimentalDesignV2HarderDevelopmentTaskSet(contractBytes)
    const report = await runExperimentalDesignV2HarderDifferentialAudit({
      rootDir,
      taskSet,
      publicContractBytes: contractBytes,
    })
    const persisted = JSON.parse(await readFile(path.join(
      rootDir,
      "results/skill-ir/experimental-design-v2-harder-development-contract-audit-2026-07-31.json",
    ), "utf8")) as unknown

    expect(persisted).toEqual(report)
    expect(report.status).toBe("passed")
    expect(report.counts).toEqual({ tasks: 2, cases: 12, matched: 12 })
    for (const taskId of taskSet.tasks.map((task) => task.id)) {
      const cases = report.cases.filter((entry) => entry.taskId === taskId)
      expect(cases.map((entry) => entry.caseId)).toEqual([
        "canonical-valid",
        "alternative-valid",
        "sequential-invalid",
        "stratum-invalid",
        "report-contradiction",
        "extra-output",
      ])
      expect(cases.every((entry) => entry.status === "matched")).toBe(true)
      expect(cases.find((entry) => entry.caseId === "canonical-valid")?.observedPass).toBe(true)
      expect(cases.find((entry) => entry.caseId === "alternative-valid")?.observedPass).toBe(true)
      expect(cases.filter((entry) => entry.expectedPass === false).every(
        (entry) => entry.observedPass === false,
      )).toBe(true)
    }
    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain("TEST_ONLY_HELDOUT_V2_")
    expect(serialized).not.toMatch(/expectedAnswer|goldAnswer|model-output|raw-runs/iu)
  })

  test("materializes both task arms through the production workspace preparer", async () => {
    const contractBytes = await readFile(path.join(v2Root, "public-contract.json"))
    const taskSet = buildExperimentalDesignV2HarderDevelopmentTaskSet(contractBytes)
    const report = await runExperimentalDesignV2HarderMaterializationAudit({
      rootDir,
      taskSet,
    })
    const persisted = JSON.parse(await readFile(path.join(
      rootDir,
      "results/skill-ir/experimental-design-v2-harder-development-materialization-audit-2026-07-31.json",
    ), "utf8")) as unknown

    expect(persisted).toEqual(report)
    expect(report.status).toBe("passed")
    expect(report.counts).toEqual({ tasks: 2, arms: 4, checks: 36, passed: 36 })
    expect(report.arms.every((arm) => arm.status === "passed")).toBe(true)
    expect(report.arms.filter((arm) => arm.system === "no-skill").every(
      (arm) => arm.sourceResourceFiles === 0,
    )).toBe(true)
    expect(report.arms.filter((arm) => arm.system === "original").every(
      (arm) => arm.sourceResourceFiles > 0,
    )).toBe(true)
  })
})
