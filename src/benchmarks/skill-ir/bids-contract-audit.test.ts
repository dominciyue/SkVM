import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  BidsContractAuditReportSchema,
  buildBidsContractAudit,
  hasForbiddenBidsEvidenceSink,
  writeBidsContractAudit,
} from "./bids-contract-audit.ts"

const projectRoot = path.resolve(import.meta.dir, "../../..")

describe("BIDS benchmark contract preflight", () => {
  test("distinguishes BIDS task labels from a real secret token boundary", () => {
    expect(hasForbiddenBidsEvidenceSink({ path: "sub-01_task-nback_bold.nii.gz" })).toBe(false)
    expect(hasForbiddenBidsEvidenceSink({ token: "sk-abcdefghijklmnopqrstuvwxyz123456" })).toBe(true)
  })

  test("passes disclosure and all source-derived scorer canaries without paid execution", async () => {
    const report = await buildBidsContractAudit({ rootDir: projectRoot })

    expect(report.status).toBe("passed")
    expect(report.disclosure).toMatchObject({
      status: "passed",
      counts: { publicFieldPaths: 17, evaluatorFieldPaths: 17, undisclosedEvaluatorFieldPaths: 0 },
    })
    expect(report.roles).toEqual({
      canonicalValid: true,
      alternativeValid: true,
      promptOnlyOmission: true,
      reverseEvidence: true,
      forbiddenSink: true,
      typeNegative: true,
    })
    expect(report.counts).toEqual({ tasks: 2, canonicalReports: 2, matchedCanonicalReports: 2 })
    expect(report.authorizations).toEqual({ paidExecution: false, heldOut: false, qualification: false })
  })

  test("fails closed when an evaluator pointer is not publicly disclosed", async () => {
    const report = await buildBidsContractAudit({
      rootDir: projectRoot,
      evaluatorFieldPaths: ["/issues/*/hiddenExpected"],
    })

    expect(report.status).toBe("failed")
    expect(report.disclosure.undisclosedEvaluatorFieldPaths).toEqual(["/issues/*/hiddenExpected"])
  })

  test("rebuilds the committed compact audit report", async () => {
    const committed = JSON.parse(await readFile(
      path.join(projectRoot, "results/skill-ir/bids-contract-audit-v1/report.json"),
      "utf8",
    ))
    expect(BidsContractAuditReportSchema.parse(committed)).toEqual(
      await buildBidsContractAudit({ rootDir: projectRoot }),
    )
  })

  test("writes only the compact preflight report", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "bids-audit-"))
    const outputPath = path.join(directory, "report.json")
    try {
      const report = await writeBidsContractAudit({ rootDir: projectRoot, outputPath })
      expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(report)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
