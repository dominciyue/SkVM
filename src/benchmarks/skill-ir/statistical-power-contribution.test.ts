import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  SkillContributionIdentifiabilityReportSchema,
  analyzeSkillContribution,
  verifyContributionManifest,
} from "./skill-contribution-identifiability.ts"

describe("statistical-power contribution identifiability", () => {
  test("recomputes an eligible report from source/task/scorer-bound evidence", async () => {
    const rootDir = process.cwd()
    const manifestPath = path.join(
      rootDir,
      "benchmarks/skill-ir/pilots/statistical-power/contribution-identifiability.json",
    )
    const reportPath = path.join(
      rootDir,
      "results/skill-ir/statistical-power-contribution-identifiability-v1/report.json",
    )
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
    const committed = JSON.parse(await readFile(reportPath, "utf8"))
    const report = analyzeSkillContribution(await verifyContributionManifest(manifest, rootDir))

    expect(SkillContributionIdentifiabilityReportSchema.parse(committed)).toEqual(report)
    expect(report.status).toBe("eligible-for-baseline")
    expect(report.counts).toMatchObject({
      tasks: 2,
      criteria: 12,
      independentSkillDerivedClaims: 4,
      answerBearingDuplications: 0,
    })
    expect(report.coverage.byTask).toEqual([
      { taskId: "statistical-power-unequal-means-dev-001", skillDerivedClaims: 4, skillDerivedWeight: 0.8 },
      { taskId: "statistical-power-two-proportions-dev-002", skillDerivedClaims: 4, skillDerivedWeight: 0.8 },
    ])
    expect(report.gates).toEqual({
      enoughIndependentClaims: true,
      everyTaskMeasuresSkillClaim: true,
      enoughSkillDerivedWeightOrHardGate: true,
      noAnswerBearingDuplication: true,
      requiredCanariesPassed: true,
    })
  })
})
