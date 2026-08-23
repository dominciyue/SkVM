import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  BIDS_CONTRIBUTION_MANIFEST_PATH,
  BIDS_CONTRIBUTION_REPORT_PATH,
  buildBidsContributionEvidence,
  writeBidsContributionEvidence,
} from "./bids-contribution.ts"

describe("BIDS contribution identifiability", () => {
  test("proves that both tasks primarily measure three independent skill-derived claims", async () => {
    const evidence = await buildBidsContributionEvidence(process.cwd())

    expect(evidence.report.status).toBe("eligible-for-baseline")
    expect(evidence.report.counts).toMatchObject({
      tasks: 2,
      criteria: 6,
      independentSkillDerivedClaims: 3,
      answerBearingDuplications: 0,
    })
    expect(evidence.report.coverage.byTask).toEqual([
      {
        taskId: "bids-entity-order-dev-001",
        skillDerivedClaims: 1,
        skillDerivedWeight: 0.8,
      },
      {
        taskId: "bids-metadata-inheritance-dev-002",
        skillDerivedClaims: 2,
        skillDerivedWeight: 0.8,
      },
    ])
    expect(evidence.report.canaries).toHaveLength(5)
    expect(evidence.report.canaries.every((canary) => canary.passed)).toBe(true)
    expect(evidence.report.gates).toEqual({
      enoughIndependentClaims: true,
      everyTaskMeasuresSkillClaim: true,
      enoughSkillDerivedWeightOrHardGate: true,
      noAnswerBearingDuplication: true,
      requiredCanariesPassed: true,
    })
  })

  test("rebuilds the committed manifest and compact report", async () => {
    const rootDir = process.cwd()
    const evidence = await buildBidsContributionEvidence(rootDir)
    const committedManifest = JSON.parse(
      await readFile(path.join(rootDir, BIDS_CONTRIBUTION_MANIFEST_PATH), "utf8"),
    )
    const committedReport = JSON.parse(
      await readFile(path.join(rootDir, BIDS_CONTRIBUTION_REPORT_PATH), "utf8"),
    )

    expect(committedManifest).toEqual(evidence.manifest)
    expect(committedReport).toEqual(evidence.report)
  })

  test("writes only the reusable manifest and compact report", async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), "bids-contribution-"))
    const evidence = await writeBidsContributionEvidence({
      rootDir: process.cwd(),
      outputRoot,
    })

    expect(JSON.parse(await readFile(
      path.join(outputRoot, BIDS_CONTRIBUTION_MANIFEST_PATH),
      "utf8",
    ))).toEqual(evidence.manifest)
    expect(JSON.parse(await readFile(
      path.join(outputRoot, BIDS_CONTRIBUTION_REPORT_PATH),
      "utf8",
    ))).toEqual(evidence.report)
  })
})
