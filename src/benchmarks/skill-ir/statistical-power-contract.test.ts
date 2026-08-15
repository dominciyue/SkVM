import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  StatisticalPowerDevelopmentAuthorizationSchema,
  StatisticalPowerStudySchema,
  buildStatisticalPowerDevelopmentAuthorization,
  buildStatisticalPowerDevelopmentTaskSet,
  buildStatisticalPowerPublicInterface,
  deriveStatisticalPowerOracle,
} from "./statistical-power-contract.ts"

describe("statistical-power development contract", () => {
  test("rebuilds the checked-in public interface, tasks, and phased authorization", async () => {
    const root = path.join(process.cwd(), "benchmarks/skill-ir/pilots/statistical-power")
    const interfaceBytes = await readFile(path.join(root, "public-interface.json"))
    const taskBytes = await readFile(path.join(root, "development/tasks.json"))
    const selectionPolicyBytes = await readFile(path.join(process.cwd(), "benchmarks/skill-ir/corpus/prospective-dynamic-candidate.json"))
    const selectionReportBytes = await readFile(path.join(process.cwd(), "results/skill-ir/prospective-dynamic-candidate.json"))
    const authorization = JSON.parse(await readFile(path.join(root, "development-authorization.json"), "utf8"))
    const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")

    expect(JSON.parse(interfaceBytes.toString("utf8"))).toEqual(buildStatisticalPowerPublicInterface())
    expect(JSON.parse(taskBytes.toString("utf8"))).toEqual(
      buildStatisticalPowerDevelopmentTaskSet(buildStatisticalPowerPublicInterface()),
    )
    expect(authorization).toEqual(buildStatisticalPowerDevelopmentAuthorization({
      taskSetSha256: digest(taskBytes),
      publicInterfaceSha256: digest(interfaceBytes),
      selectionPolicySha256: digest(selectionPolicyBytes),
      selectionReportSha256: digest(selectionReportBytes),
    }))
  })

  test("binds every public semantic claim to source and excludes outcome evidence", async () => {
    const audit = JSON.parse(await readFile(path.join(
      process.cwd(),
      "benchmarks/skill-ir/pilots/statistical-power/public-contract-source-audit.json",
    ), "utf8")) as {
      claims: Array<{ source: { path: string; sha256: string }; quote: string }>
      excludedEvidenceClasses: string[]
    }
    expect(audit.claims.length).toBeGreaterThanOrEqual(5)
    for (const claim of audit.claims) {
      const bytes = await readFile(path.join(process.cwd(), claim.source.path))
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(claim.source.sha256)
      expect(bytes.toString("utf8")).toContain(claim.quote)
    }
    expect(audit.excludedEvidenceClasses).toEqual([
      "evaluator-payload",
      "held-out-runtime-output",
      "historical-result",
      "profile-feedback",
      "secret-value",
    ])
  })

  test("builds two closed-form development tasks without answer-bearing instructions", () => {
    const publicInterface = buildStatisticalPowerPublicInterface()
    const taskSet = buildStatisticalPowerDevelopmentTaskSet(publicInterface)

    expect(taskSet.skillId).toBe("statistical-power")
    expect(taskSet.tasks.map((task) => task.id)).toEqual([
      "statistical-power-unequal-means-dev-001",
      "statistical-power-two-proportions-dev-002",
    ])
    expect(taskSet.tasks.every((task) => task.split === "development")).toBe(true)
    expect(taskSet.tasks.map((task) => JSON.parse(task.fixtures["study.json"]).design.test)).toEqual([
      "t_ind",
      "two_proportions",
    ])
    expect(taskSet.tasks.every((task) => task.successCriteria.length === 0)).toBe(true)
    expect(taskSet.tasks.every((task) => task.eval.length === 6)).toBe(true)

    const visible = JSON.stringify(taskSet)
    expect(visible).not.toMatch(/expectedAnswer|goldAnswer|sourceQuote|observed power|post-hoc power/iu)
    expect(visible).not.toMatch(/apply Bonferroni|divide alpha|inflate|ceil\(|run scripts\/power\.py/iu)
    expect(visible).not.toContain("TEST_ONLY_HELDOUT")
  })

  test("keeps the public schema explicit while rejecting mixed or unsafe study inputs", () => {
    const publicInterface = buildStatisticalPowerPublicInterface()
    expect(publicInterface.outputs).toEqual([
      "power-analysis.json",
      "power-analysis.md",
    ])
    expect(publicInterface.jsonContract.sensitivity.arraySemantics).toEqual({
      order: "study-declared",
      duplicates: "forbid",
    })

    const taskSet = buildStatisticalPowerDevelopmentTaskSet(publicInterface)
    const means = JSON.parse(taskSet.tasks[0]!.fixtures["study.json"])
    expect(StatisticalPowerStudySchema.parse(means).design.test).toBe("t_ind")
    expect(() => StatisticalPowerStudySchema.parse({
      ...means,
      effect: { metric: "group2-proportion", referenceProportion: 0.35, planningValue: 0.5, sensitivityValues: [0.45, 0.5] },
    })).toThrow()
    expect(() => StatisticalPowerStudySchema.parse({
      ...means,
      allocationRatio: 0,
    })).toThrow()
  })

  test("derives unequal-allocation, multiplicity, attrition, and sensitivity values", async () => {
    const taskSet = buildStatisticalPowerDevelopmentTaskSet(buildStatisticalPowerPublicInterface())
    const means = StatisticalPowerStudySchema.parse(JSON.parse(taskSet.tasks[0]!.fixtures["study.json"]))
    const proportions = StatisticalPowerStudySchema.parse(JSON.parse(taskSet.tasks[1]!.fixtures["study.json"]))

    const meansOracle = await deriveStatisticalPowerOracle(means)
    expect(meansOracle.adjustedAlpha).toBe(0.025)
    expect(meansOracle.planning.sampleSize).toEqual({
      analyzed: { group1: 93, group2: 186, total: 279 },
      enrolled: { group1: 110, group2: 219, total: 329 },
    })
    expect(meansOracle.sensitivity.map((entry) => [entry.inputEffect, entry.sampleSize.analyzed.total])).toEqual([
      [0.35, 459],
      [0.45, 279],
      [0.55, 188],
    ])

    const proportionsOracle = await deriveStatisticalPowerOracle(proportions)
    expect(proportionsOracle.adjustedAlpha).toBeCloseTo(0.05 / 3, 12)
    expect(proportionsOracle.planning.sampleSize).toEqual({
      analyzed: { group1: 212, group2: 317, total: 529 },
      enrolled: { group1: 236, group2: 353, total: 589 },
    })
    expect(proportionsOracle.sensitivity.map((entry) => [entry.inputEffect, entry.sampleSize.enrolled.total])).toEqual([
      [0.45, 1305],
      [0.5, 589],
      [0.55, 334],
    ])
  })

  test("freezes sequential 8 + 8 + conditional 4 development calls and no held-out", () => {
    const authorization = buildStatisticalPowerDevelopmentAuthorization({
      taskSetSha256: "1".repeat(64),
      publicInterfaceSha256: "2".repeat(64),
      selectionPolicySha256: "3".repeat(64),
      selectionReportSha256: "4".repeat(64),
    })
    expect(authorization.phases.map((phase) => [phase.id, phase.maxPaidCalls])).toEqual([
      ["calibration", 8],
      ["static-residual", 8],
      ["conditional-dynamic", 4],
    ])
    expect(authorization.maximumPaidCallsAcrossEligiblePhases).toBe(20)
    expect(authorization.heldout).toEqual({
      status: "not-authored",
      permitsExecution: false,
      futureTasksRequireFreshIsolation: true,
    })

    const reordered = structuredClone(authorization) as unknown as { phases: unknown[] }
    ;[reordered.phases[0], reordered.phases[1]] = [reordered.phases[1]!, reordered.phases[0]!]
    expect(StatisticalPowerDevelopmentAuthorizationSchema.safeParse(reordered).success).toBe(false)

    const drift = structuredClone(authorization) as unknown as { phases: Array<{ maxPaidCalls: number }> }
    drift.phases[0]!.maxPaidCalls = 9
    expect(StatisticalPowerDevelopmentAuthorizationSchema.safeParse(drift).success).toBe(false)
  })
})
