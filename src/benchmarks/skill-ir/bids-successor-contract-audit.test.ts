import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  BidsSuccessorContractAuditReportSchema,
  buildBidsSuccessorContractAudit,
} from "./bids-successor-contract-audit.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")

describe("BIDS successor contract and scorer freeze", () => {
  test("passes pointer closure, full value disclosure, and every deterministic canary", async () => {
    const report = await buildBidsSuccessorContractAudit({ rootDir })

    expect(report.status).toBe("passed")
    expect(report.pointerDisclosure).toMatchObject({
      status: "passed",
      counts: { publicFieldPaths: 17, evaluatorFieldPaths: 17, undisclosedEvaluatorFieldPaths: 0 },
    })
    expect(report.valueSemanticsDisclosure).toMatchObject({
      status: "passed",
      counts: {
        publicSemantics: 7,
        evaluatorSemantics: 7,
        undisclosedEvaluatorSemantics: 0,
        mismatchedEvaluatorSemantics: 0,
        canaries: 21,
        missingCanaryRoles: 0,
        failedCanaries: 0,
      },
    })
    expect(report.roles).toEqual({
      canonicalReportsAccepted: true,
      dataSidecarRepresentationsAccepted: true,
      unrelatedManifestPathRejected: true,
      duplicateSemanticRepairRejected: true,
      nonNormalizedPathRejected: true,
      wrongSummaryRejected: true,
      semanticOmissionRejected: true,
    })
  })

  test("freezes a true successor without authorizing execution or changing v1 claims", async () => {
    const report = await buildBidsSuccessorContractAudit({ rootDir })

    expect(report.semanticDelta).toEqual({
      retained: ["report-path-normalization", "summary-count-relationship"],
      generalized: ["affected-path-repair-related-role"],
      replaced: ["repair-related-manifest-evidence", "issue-semantic-repair-identity"],
    })
    expect(report.compatibility).toMatchObject({ bidsV1Preserved: true, bidsV1Rescored: false })
    expect(report.authorizations).toEqual({
      successorIdentityFrozen: true,
      qualification: false,
      paidExecution: false,
      dynamic: false,
      heldOut: false,
      readinessPromotion: false,
    })
  })

  test("matches the checked-in compact successor freeze", async () => {
    const checkedIn = BidsSuccessorContractAuditReportSchema.parse(JSON.parse(await readFile(path.join(
      rootDir, "results/skill-ir/bids-successor-contract-audit-v1.json",
    ), "utf8")))
    expect(checkedIn).toEqual(await buildBidsSuccessorContractAudit({ rootDir }))
  })
})
