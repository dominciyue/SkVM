import { describe, expect, test } from "bun:test"
import { runZhReadmeContractAuditV2 } from "./zh-readme-contract-audit-v2.ts"

describe("zh-readme v2 benchmark contract audit", () => {
  test("accepts public equivalence and rejects broken task-repository links", async () => {
    const report = await runZhReadmeContractAuditV2(process.cwd())
    expect(report).toMatchObject({
      schemaVersion: "skill-ir-zh-readme-contract-audit/v2",
      status: "passed",
      counts: { tasks: 2, cases: 24, matched: 24 },
      publicEquivalence: {
        conservativeMissingEvidenceAccepted: true,
        boundedCommandEquivalenceAccepted: true,
        licenseDisplayEquivalenceAccepted: true,
        brokenLocalLinkRejected: true,
      },
      issues: [],
    })
    expect(report.cases.filter((entry) => entry.caseId === "positive-public-equivalence" && entry.observedPass))
      .toHaveLength(2)
    expect(report.cases.filter((entry) => entry.caseId === "broken-local-link" && !entry.observedPass))
      .toHaveLength(2)
  })
})
