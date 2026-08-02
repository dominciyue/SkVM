import { describe, expect, test } from "bun:test"
import {
  ZhCodeReviewerContractAuditReportSchema,
  buildZhCodeReviewerContractAudit,
} from "./zh-code-reviewer-contract-audit.ts"

describe("zh-code-reviewer benchmark contract audit", () => {
  test("accepts alternative-valid reviews and rejects semantic failures", async () => {
    const report = ZhCodeReviewerContractAuditReportSchema.parse(
      await buildZhCodeReviewerContractAudit({ rootDir: process.cwd() }),
    )
    expect(report.status).toBe("passed")
    expect(report.counts).toEqual({ tasks: 2, cases: 18, matched: 18 })
    expect(report.cases.filter((entry) => entry.expectedPass).length).toBe(4)
    expect(report.cases.filter((entry) => !entry.expectedPass).length).toBe(14)
    expect(report.cases.every((entry) => entry.status === "matched")).toBe(true)
  })

  test("proves reverse-evidence and leak isolation", async () => {
    const report = await buildZhCodeReviewerContractAudit({ rootDir: process.cwd() })
    expect(Object.values(report.reverseEvidence).every(Boolean)).toBe(true)
    expect(Object.values(report.leakChecks).every(Boolean)).toBe(true)
    expect(report.claimBoundary).toContain("no model")
    expect(JSON.stringify(report)).not.toMatch(/sk-[A-Za-z0-9]{10,}/u)
    expect(JSON.stringify(report)).not.toContain("TEST_ONLY_HELDOUT_ZH_CODE_REVIEWER")
  })
})
