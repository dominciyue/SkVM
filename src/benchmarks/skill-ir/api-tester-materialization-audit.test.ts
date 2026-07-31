import { describe, expect, test } from "bun:test"
import {
  ApiTesterMaterializationAuditReportSchema,
  buildApiTesterMaterializationAudit,
} from "./api-tester-materialization-audit.ts"

describe("api-tester production materialization audit", () => {
  test("passes every no-skill/original production-workspace check without held-out consumption", async () => {
    const report = await buildApiTesterMaterializationAudit({ rootDir: process.cwd() })
    expect(ApiTesterMaterializationAuditReportSchema.parse(report)).toEqual(report)
    expect(report.status).toBe("passed")
    expect(report.counts).toEqual({ tasks: 2, arms: 4, checks: 36, passed: 36 })
    expect(report.issues).toEqual([])
    expect(report.arms.filter((arm) => arm.system === "no-skill").every((arm) => arm.sourceResourceFiles === 0)).toBe(true)
    expect(report.arms.filter((arm) => arm.system === "original").every((arm) => arm.sourceResourceFiles > 0)).toBe(true)
    expect(JSON.stringify(report)).not.toContain("TEST_ONLY_HELDOUT_API_TESTER")
  })
})
