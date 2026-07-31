import { describe, expect, test } from "bun:test"
import {
  ApiTesterContractAuditReportSchema,
  buildApiTesterContractAudit,
} from "./api-tester-contract-audit.ts"

describe("api-tester contract audit", () => {
  test("matches alternative-valid and invalid cases while keeping evaluator evidence isolated", async () => {
    const report = await buildApiTesterContractAudit({ rootDir: process.cwd() })
    expect(ApiTesterContractAuditReportSchema.parse(report)).toEqual(report)
    expect(report.status).toBe("passed")
    expect(report.counts).toEqual({ tasks: 2, cases: 18, matched: 18 })
    expect(report.inputs.taskSplitFreezeSha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(report.inputs.contractImplementationSha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(report.cases.filter((entry) => entry.expectedPass).map((entry) => entry.caseId))
      .toEqual(["valid-edge", "invalid-outside", "valid-edge", "invalid-outside"])
    expect(Object.values(report.reverseEvidence).every(Boolean)).toBe(true)
    expect(Object.values(report.leakChecks).every(Boolean)).toBe(true)
    expect(report.issues).toEqual([])
  }, 30_000)
})
