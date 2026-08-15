import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  StatisticalPowerContractAuditReportSchema,
  runStatisticalPowerContractAudit,
} from "./statistical-power-contract-audit.ts"

describe("statistical-power benchmark contract audit", () => {
  test("rebuilds the checked-in compact audit report", async () => {
    const committed = JSON.parse(await readFile(path.join(
      process.cwd(),
      "results/skill-ir/statistical-power-contract-audit-v1/report.json",
    ), "utf8"))
    expect(committed).toEqual(await runStatisticalPowerContractAudit())
  })

  test("passes all five contribution canary roles and production materialization", async () => {
    const report = await runStatisticalPowerContractAudit()
    expect(StatisticalPowerContractAuditReportSchema.parse(report)).toEqual(report)
    expect(report.counts).toEqual({ cases: 5, matched: 5 })
    expect(report.roles).toEqual({
      canonicalValid: true,
      alternativeValid: true,
      promptOnlyOmission: true,
      reverseEvidence: true,
      forbiddenSink: true,
    })
    expect(report.gates).toEqual({
      twoClosedFormTasks: true,
      publicAbiClosed: true,
      oracleDerivedFromPublicStudy: true,
      productionMaterialization: true,
      noAnswerBearingSink: true,
    })
    expect(report.status).toBe("passed")
  })

  test("keeps the compact report free of task answers and sensitive evidence", async () => {
    const report = await runStatisticalPowerContractAudit()
    expect(JSON.stringify(report)).not.toMatch(
      /expectedAnswer|goldAnswer|sourceQuote|TEST_ONLY_HELDOUT|raw-runs|model-output|sk-[A-Za-z0-9_-]{8,}/u,
    )
  })
})
