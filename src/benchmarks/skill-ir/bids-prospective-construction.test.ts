import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import {
  BidsProspectiveConstructionMetadataSchema,
  buildBidsProspectiveConstructionReport,
  type BidsProspectiveConstructionMetadata,
} from "./bids-prospective-construction"

const rootDir = path.resolve(import.meta.dir, "../../..")

function metadata(): BidsProspectiveConstructionMetadata {
  return {
    schemaVersion: "skill-ir-bids-prospective-construction-metadata/v1",
    constructionId: "bids-prospective-construction-2026-08-23",
    baselineCommit: "dd1bedf41ced1a1895b57049ed1a139507211d58",
    startedAt: "2026-08-23T05:06:26.337Z",
    completedAt: "2026-08-23T05:36:26.337Z",
    unautomatedConstructionSteps: [
      "base IR and source audit were manually authored and reviewed",
      "declarative artifact adapter was manually authored",
      "compiler, runtime, tests, and construction evidence were manually authored",
    ],
  }
}

describe("BIDS prospective construction evidence", () => {
  test("captures one real compiler/package invocation without claiming automatic construction", async () => {
    const report = await buildBidsProspectiveConstructionReport(rootDir, metadata())

    expect(report.cost.identity).toMatchObject({
      skillId: "bids",
      constructionOrigin: "manual-existing",
    })
    expect(report.cost.stages.map((stage) => stage.id)).toEqual(["compiler-package"])
    expect(report.cost.summary).toMatchObject({ modelCalls: 0, aggregateModelTokens: 0, packageCount: 1 })
    expect(report.cost.packages[0]).toMatchObject({ id: "bids-audit", skillId: "bids", validation: "passed" })
    expect(report.cost.eligibility.status).toBe("mechanism-only")
    expect(report.adaptation).toMatchObject({
      humanMinutes: 30,
      coreBranchDelta: 0,
      measurementStatus: "prospective-measured",
    })
    expect(report.adaptation.adapterLoc).toBeGreaterThan(0)
    expect(report.prePaidGate).toEqual({
      status: "passed",
      automaticCostEligible: false,
      permitsQualificationLock: true,
    })
    expect(report.authorizations).toEqual({ paidExecution: false, heldOut: false, readinessPromotion: false })
  })

  test("requires honest manual steps and chronologically valid human-time evidence", () => {
    expect(() => BidsProspectiveConstructionMetadataSchema.parse({
      ...metadata(),
      unautomatedConstructionSteps: [],
    })).toThrow()
    expect(() => BidsProspectiveConstructionMetadataSchema.parse({
      ...metadata(),
      completedAt: "2026-08-23T05:00:00.000Z",
    })).toThrow("completedAt")
  })

  test("binds the compiler, runtime, public inputs, and generic catalog without absolute paths", async () => {
    const report = await buildBidsProspectiveConstructionReport(rootDir, metadata())
    const evidencePaths = [
      ...report.cost.identity.evidence.sourceClosure,
      report.cost.identity.evidence.taskContract,
      report.cost.identity.evidence.publicContract,
      report.cost.identity.evidence.resourceContract,
      report.cost.identity.evidence.baseIr,
      report.cost.identity.evidence.sourceAudit,
      report.cost.identity.evidence.adapter,
      report.cost.identity.evidence.compilerImplementation,
      ...report.cost.identity.evidence.catalogRuntime,
    ].map((entry) => entry.relativePath)

    expect(evidencePaths).toContain("src/benchmarks/skill-ir/bids-artifact-runtime.ts")
    expect(evidencePaths).toContain("src/benchmarks/skill-ir/validated-artifact-catalog.ts")
    expect(JSON.stringify(report)).not.toContain(rootDir)
    expect(JSON.stringify(report)).not.toMatch(/SKVM_XTY_API_KEY\s*[:=]\s*[^"}]+/u)
  })

  test("fails before invoking the compiler when a bound evidence digest drifts", async () => {
    const adapterPath = path.join(rootDir, "benchmarks/skill-ir/pilots/bids/artifact-adapter.json")
    expect(await readFile(adapterPath, "utf8")).toContain("bids-source-derived-audit")
    const bad = { ...metadata(), baselineCommit: "0".repeat(40) }
    await expect(buildBidsProspectiveConstructionReport(rootDir, bad)).rejects.toThrow("baseline commit")
  })
})
