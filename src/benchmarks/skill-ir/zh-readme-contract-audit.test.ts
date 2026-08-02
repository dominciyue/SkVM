import { describe, expect, test } from "bun:test"
import { buildZhReadmeContractAudit } from "./zh-readme-contract-audit.ts"

const rootDir = process.cwd()

describe("zh-readme benchmark contract audit", () => {
  test("accepts alternative-valid README forms and rejects factual failures", async () => {
    const report = await buildZhReadmeContractAudit({ rootDir })
    expect(report.status).toBe("passed")
    expect(report.counts).toEqual({ tasks: 2, cases: 20, matched: 20 })
    expect(report.issues).toEqual([])

    for (const taskId of ["zh-readme-node-cli-dev-001", "zh-readme-python-library-dev-002"]) {
      const cases = report.cases.filter((entry) => entry.taskId === taskId)
      expect(cases.filter((entry) => entry.expectedPass).map((entry) => entry.caseId))
        .toEqual(["positive-primary", "positive-reordered"])
      expect(cases.every((entry) => entry.status === "matched")).toBe(true)
    }
  })

  test("proves reverse-evidence and leak isolation", async () => {
    const report = await buildZhReadmeContractAudit({ rootDir })
    expect(Object.values(report.reverseEvidence).every(Boolean)).toBe(true)
    expect(Object.values(report.leakChecks).every(Boolean)).toBe(true)
    expect(JSON.stringify(report)).not.toMatch(/rawModel|TEST_ONLY_HELDOUT_ZH_README|private repository facts/u)
    expect(report.claimBoundary).toMatch(/Development-only/u)
  })
})
