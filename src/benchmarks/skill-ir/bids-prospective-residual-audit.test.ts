import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import {
  BidsProspectiveResidualAuditSchema,
  bidsRepairSemanticsMatch,
} from "./bids-prospective-residual-audit"

const rootDir = path.resolve(import.meta.dir, "../../..")

describe("BIDS prospective residual audit", () => {
  test("separates repair semantics from underspecified evidence-path presentation", () => {
    const expected = {
      schemaVersion: "skill-ir-bids-audit-report/v1",
      datasetId: "dataset",
      issues: [{
        code: "ENTITY_ORDER", severity: "error", affectedPath: "data.nii.gz",
        evidencePaths: ["references/bids_schema.json"],
        repair: { operation: "rename", targetPath: "data.nii.gz", destinationPath: "fixed.nii.gz", field: null, value: null },
      }],
      summary: { issueCount: 1, errorCount: 1 },
    }
    const plausible = structuredClone(expected)
    plausible.issues[0]!.evidencePaths = ["data.nii.gz"]
    expect(bidsRepairSemanticsMatch(plausible, expected)).toBe(true)
  })

  test("marks the frozen v1 measurement invalid when public value semantics do not identify the oracle", async () => {
    const report = BidsProspectiveResidualAuditSchema.parse(JSON.parse(await readFile(path.join(
      rootDir, "results/skill-ir/bids-prospective-development-v1/residual-audit.json",
    ), "utf8")))
    expect(report.status).toBe("measurement-invalid")
    expect(report.contract.publicFieldPathsDisclosed).toBe(true)
    expect(report.contract.affectedPathValueSemanticsDisclosed).toBe(false)
    expect(report.contract.evidencePathValueSemanticsDisclosed).toBe(false)
    expect(report.counts.repairSemanticMatches).toBeGreaterThan(report.counts.exactMatches)
    expect(report.authorizations).toEqual({ dynamic: false, heldOut: false, readinessPromotion: false })
  })
})
