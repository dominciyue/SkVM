import { describe, expect, test } from "bun:test"
import {
  buildStatisticalPowerDisclosureAudit,
  buildStatisticalPowerMeasurementValidity,
} from "./statistical-power-measurement-validity.ts"

const digest = "a".repeat(64)

describe("statistical-power measurement validity", () => {
  test("detects the hidden nested-field contract missed by the pre-run canaries", () => {
    const disclosure = buildStatisticalPowerDisclosureAudit({
      requiredTopLevelFields: [
        "schemaVersion",
        "studyId",
        "analysis",
        "sampleSize",
        "sensitivity",
        "assumptions",
        "reproducibility",
      ],
      assumptions: { type: "nonempty-string-array" },
      sensitivity: { fields: ["inputEffect", "standardizedEffect", "sampleSize"] },
    })

    expect(disclosure.status).toBe("failed")
    expect(disclosure.undisclosedEvaluatorFieldPaths).toContain("/analysis/adjustedAlpha")
    expect(disclosure.undisclosedEvaluatorFieldPaths).toContain("/sampleSize/analyzed/group1")
    expect(disclosure.undisclosedEvaluatorFieldPaths).not.toContain("/sensitivity/*/inputEffect")
  })

  test("separates the paid preflight call from the frozen matrix denominator", () => {
    const report = buildStatisticalPowerMeasurementValidity({
      calibrationId: "statistical-power-development-baseline-v1",
      inputs: {
        lock: { path: "lock.json", sha256: digest },
        publicInterface: { path: "public-interface.json", sha256: digest },
        scorer: { path: "scorer.ts", sha256: digest },
        qualification: { path: "qualification.json", sha256: digest },
        selectedScoredRows: { path: "run/selected-scored-runs.jsonl", sha256: digest },
        executionEnvelopes: { path: "run/execution-envelopes.jsonl", sha256: digest },
        gate: { path: "gate-report.json", sha256: digest },
      },
      disclosure: buildStatisticalPowerDisclosureAudit({
        requiredTopLevelFields: ["analysis", "sampleSize", "sensitivity", "assumptions", "reproducibility"],
        assumptions: { type: "nonempty-string-array" },
        sensitivity: { fields: ["inputEffect", "standardizedEffect", "sampleSize"] },
      }),
      qualificationRows: 1,
      selectedMatrixRows: 8,
      semanticCompleteRows: 8,
      activeExecutionFailures: 0,
      parserOrRuntimeBlockers: 0,
      parsedPublicReports: 8,
      topLevelContractReports: 8,
      strictSchemaReports: 0,
      numericGatePassed: false,
      noSkillMeanScore: 0.1,
      originalMeanScore: 0.1,
      differingPairs: 0,
    })

    expect(report.decision).toBe("measurement-invalid")
    expect(report.blocker).toBe("public-scorer-schema-underdetermined")
    expect(report.paidCalls).toEqual({ qualification: 1, selectedMatrix: 8, total: 9 })
    expect(report.authorizations).toEqual({ baseIr: false, staticResidual: false, dynamic: false, heldOut: false })
  })
})
