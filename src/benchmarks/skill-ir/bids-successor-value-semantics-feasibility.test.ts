import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import {
  BidsSuccessorValueSemanticsFeasibilitySchema,
  buildBidsSuccessorValueSemanticsFeasibility,
} from "./bids-successor-value-semantics-feasibility.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")

describe("BIDS successor value-semantics feasibility", () => {
  test("separates public obligations from v1 evaluator over-specificity", async () => {
    const report = await buildBidsSuccessorValueSemanticsFeasibility({ rootDir })

    expect(report.status).toBe("feasible-with-evaluator-redesign")
    expect(report.assessments.map(({ id, successorTreatment }) => ({ id, successorTreatment }))).toEqual([
      { id: "affected-path-canonical-role", successorTreatment: "generalize-to-repair-related-manifest-path" },
      { id: "evidence-path-canonical-role", successorTreatment: "replace-with-repair-related-manifest-evidence" },
      { id: "issue-element-identity", successorTreatment: "replace-with-semantic-repair-identity" },
      { id: "report-path-normalization", successorTreatment: "retain-public-obligation" },
      { id: "summary-count-relationship", successorTreatment: "retain-public-obligation" },
    ])
    expect(report.assessments.every((item) =>
      item.sourceDerivable && item.generalTaskRule && !item.answerBearing && item.canaryBacked
    )).toBe(true)
    expect(report.counts).toEqual({
      missingV1Semantics: 5,
      retainedPublicObligations: 2,
      generalizedSemantics: 1,
      replacedEvaluatorSpecificities: 2,
      canaries: 15,
      failedCanaries: 0,
    })
  })

  test("permits only a new measurement identity and consumes no model or held-out content", async () => {
    const report = await buildBidsSuccessorValueSemanticsFeasibility({ rootDir })

    expect(report.historicalEvidence).toEqual({
      bidsV1Preserved: true,
      residualAuditConsumed: true,
      valuePreflightConsumed: true,
      modelOutputContentConsumed: false,
      heldOutConsumed: false,
    })
    expect(report.authorizations).toEqual({
      successorIdentityFreeze: true,
      qualification: false,
      paidExecution: false,
      dynamic: false,
      heldOut: false,
      readinessPromotion: false,
    })
  })

  test("matches the checked-in compact feasibility evidence", async () => {
    const checkedIn = BidsSuccessorValueSemanticsFeasibilitySchema.parse(JSON.parse(await readFile(path.join(
      rootDir, "results/skill-ir/bids-successor-value-semantics-feasibility-v1.json",
    ), "utf8")))
    expect(checkedIn).toEqual(await buildBidsSuccessorValueSemanticsFeasibility({ rootDir }))
  })
})
