import { describe, expect, test } from "bun:test"
import { summarizeI18nContributionMeasurementAudit } from "./i18n-helper-contribution-measurement-audit.ts"

describe("i18n-helper contribution measurement audit", () => {
  test("marks a frozen baseline measurement-invalid when public-semantics replay removes scorer failures", () => {
    const report = summarizeI18nContributionMeasurementAudit([
      {
        caseId: "case-a",
        system: "no-skill",
        runIndex: 1,
        priorScore: 0.3,
        priorCriteria: {
          "i18n-contribution-delta": true,
          "i18n-contribution-artifact": true,
          "i18n-contribution-extraction": false,
          "i18n-contribution-preservation": false,
          "i18n-contribution-locales": false,
        },
        v2ExtractionPass: true,
        v2LocalesPass: true,
      },
      {
        caseId: "case-a",
        system: "original",
        runIndex: 1,
        priorScore: 0.5,
        priorCriteria: {
          "i18n-contribution-delta": true,
          "i18n-contribution-artifact": true,
          "i18n-contribution-extraction": false,
          "i18n-contribution-preservation": true,
          "i18n-contribution-locales": false,
        },
        v2ExtractionPass: true,
        v2LocalesPass: true,
      },
    ])

    expect(report.status).toBe("measurement-invalid")
    expect(report.counts).toMatchObject({ rows: 2, rowsWithFalseRejection: 2, v2Successes: 1 })
    expect(report.rows.map((row) => row.counterfactualScore)).toEqual([0.8, 1])
    expect(report.claimBoundary).toContain("counterfactual")
  })

  test("keeps genuine residual failures visible instead of treating v2 as an automatic pass", () => {
    const report = summarizeI18nContributionMeasurementAudit([{
      caseId: "case-b",
      system: "original",
      runIndex: 1,
      priorScore: 0.2,
      priorCriteria: {
        "i18n-contribution-delta": false,
        "i18n-contribution-artifact": false,
        "i18n-contribution-extraction": false,
        "i18n-contribution-preservation": true,
        "i18n-contribution-locales": false,
      },
      v2ExtractionPass: false,
      v2LocalesPass: false,
    }])

    expect(report.counts).toMatchObject({ rowsWithFalseRejection: 0, v2Successes: 0 })
    expect(report.rows[0]).toMatchObject({ counterfactualScore: 0.2, counterfactualSuccess: false })
  })
})
