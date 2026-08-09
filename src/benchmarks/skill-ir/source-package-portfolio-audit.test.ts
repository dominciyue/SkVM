import { describe, expect, test } from "bun:test"
import { buildSourcePackagePortfolioAudit } from "./source-package-portfolio-audit.ts"

describe("method portfolio source package audit", () => {
  test("quantifies seven real method cases without using held-out contents as evidence", async () => {
    const report = await buildSourcePackagePortfolioAudit({
      rootDir: process.cwd(),
      observationPaths: ["results/skill-ir/zrm-pi-v2/measurement-validity.json"],
    })
    expect(report.schemaVersion).toBe("skill-ir-source-package-portfolio-audit/v1")
    expect(report.counts.cases).toBe(7)
    expect(report.counts.resourceBearingCases).toBe(7)
    expect(report.counts.skillResourceFiles).toBe(19)
    expect(report.counts.casesWithScripts).toBe(2)
    expect(report.counts.pathCollisions).toBe(0)
    expect(report.counts.confirmedOutputContaminationObservations).toBe(1)
    expect(report.cases.find((entry) => entry.skillId === "law-to-markdown"))
      .toMatchObject({ skillResourceFiles: 7, hasExecutableResources: true, collisions: [] })
    expect(report.cases.find((entry) => entry.skillId === "zh-readme"))
      .toMatchObject({ skillResourceFiles: 1, hasExecutableResources: false, collisions: [] })
    expect(report.observations[0]).toMatchObject({
      calibrationId: "zh-readme-pi-direct-cli-short-path-development-v2",
      code: "skill-package-reference-contamination",
    })
    expect(JSON.stringify(report)).not.toContain("TEST_ONLY_HELDOUT")
  })
})
