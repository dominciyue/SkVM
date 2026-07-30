import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  analyzeExperimentalDesignV2HarderCalibration,
} from "./experimental-design-v2-harder-calibration-analysis.ts"

const rootDir = process.cwd()
const current = path.join(
  rootDir,
  "results/skill-ir/experimental-design-v2-harder-pi-calibration-2026-07-31",
)

describe("experimental-design v2 harder calibration analysis", () => {
  test("quantifies a valid but still saturated matrix without upgrading the claim", async () => {
    const report = analyzeExperimentalDesignV2HarderCalibration({
      qualificationBytes: await readFile(path.join(current, "qualification.json")),
      gateBytes: await readFile(path.join(current, "gate-report.json")),
      scoredBytes: await readFile(path.join(current, "scored-runs.jsonl")),
      predecessorAnalysisBytes: await readFile(path.join(
        rootDir,
        "results/skill-ir/experimental-design-v2-pi-post-cleanup-2026-07-29/calibration-analysis.json",
      )),
    })
    const persisted = JSON.parse(await readFile(
      path.join(current, "calibration-analysis.json"),
      "utf8",
    )) as unknown

    expect(persisted).toEqual(report)
    expect(report.status).toBe("gate-failed")
    expect(report.matrix).toMatchObject({
      observedRows: 8,
      completePairs: 4,
      infrastructureFailures: 0,
      differingPairs: 0,
    })
    expect(report.systems["no-skill"]).toMatchObject({ successes: 4, meanScore: 1 })
    expect(report.systems.original).toMatchObject({ successes: 4, meanScore: 1 })
    expect(report.ratios.originalToNoSkillAggregateTokens).toBeCloseTo(2.1856, 4)
    expect(report.ratios.originalToNoSkillMeanLatency).toBeCloseTo(1.0854, 4)
    expect(report.predecessorComparison.semanticDifferentiationChanged).toBe(false)
    expect(report.interpretation.baseIrAuditAllowed).toBe(false)
    expect(report.interpretation.nextAudit).toBe("public-contract-task-sufficiency")
    expect(JSON.stringify(report)).not.toContain("TEST_ONLY_HELDOUT_V2_")
  })
})
