import { createHash } from "node:crypto"
import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { customEvaluators } from "../../framework/types.ts"
import { buildBidsSuccessorContractAudit } from "../../benchmarks/skill-ir/bids-successor-contract-audit.ts"
import {
  BidsSuccessorAuditReportSchema,
  buildBidsSuccessorDevelopmentTaskSet,
  deriveBidsSuccessorAuditOracle,
  loadBidsSuccessorSourceRules,
} from "../../benchmarks/skill-ir/bids-successor-contract.ts"
import {
  bidsSuccessorGrade,
  bidsSuccessorReportsMatch,
  repairRelatedManifestPaths,
} from "./bids-successor-grade.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")

async function metadataFixture() {
  const task = buildBidsSuccessorDevelopmentTaskSet().tasks[1]!
  const manifest = JSON.parse(task.fixtures["dataset-manifest.json"]!)
  const report = await deriveBidsSuccessorAuditOracle(manifest, await loadBidsSuccessorSourceRules(rootDir))
  const issue = report.issues.find((candidate) => candidate.code === "TASK_NAME_MISMATCH")
  if (!issue) throw new Error("metadata fixture requires TASK_NAME_MISMATCH")
  const related = [...repairRelatedManifestPaths(issue.repair, manifest)]
  if (related.length < 2) throw new Error("metadata fixture requires data/sidecar alternatives")
  return { manifest, report, issueIndex: report.issues.indexOf(issue), related }
}

describe("BIDS successor semantic scorer", () => {
  test("registers the distinct scorer and binds its implementation digest", async () => {
    const source = await readFile(path.join(rootDir, "src/bench/evaluators/bids-successor-grade.ts"), "utf8")
    const digest = createHash("sha256").update(source, "utf8").digest("hex")
    const audit = await buildBidsSuccessorContractAudit({ rootDir })

    expect(customEvaluators.get("skill-ir-bids-successor")).toBe(bidsSuccessorGrade)
    expect(audit.identityClosure.scorer.sha256).toBe(digest)
  })

  test("accepts both repair-related data and sidecar representations", async () => {
    const { manifest, report, issueIndex, related } = await metadataFixture()
    const alternative = structuredClone(report)
    alternative.issues[issueIndex]!.affectedPath = related.find((candidate) =>
      candidate !== report.issues[issueIndex]!.affectedPath
    )!
    alternative.issues[issueIndex]!.evidencePaths = [alternative.issues[issueIndex]!.affectedPath]

    expect(bidsSuccessorReportsMatch(report, report, manifest)).toBe(true)
    expect(bidsSuccessorReportsMatch(alternative, report, manifest)).toBe(true)
  })

  test("rejects unrelated manifest evidence and semantic omission", async () => {
    const { manifest, report, issueIndex } = await metadataFixture()
    const unrelated = structuredClone(report)
    unrelated.issues[issueIndex]!.affectedPath = "dataset_description.json"
    unrelated.issues[issueIndex]!.evidencePaths = ["dataset_description.json"]
    const omitted = structuredClone(report)
    omitted.issues.pop()
    omitted.summary.issueCount -= 1
    omitted.summary.errorCount -= 1

    expect(bidsSuccessorReportsMatch(unrelated, report, manifest)).toBe(false)
    expect(bidsSuccessorReportsMatch(omitted, report, manifest)).toBe(false)
  })

  test("rejects duplicate semantic repair even when path presentation differs", async () => {
    const { report, issueIndex, related } = await metadataFixture()
    const duplicate = structuredClone(report)
    const second = structuredClone(duplicate.issues[issueIndex]!)
    second.affectedPath = related.find((candidate) => candidate !== second.affectedPath)!
    second.evidencePaths = [second.affectedPath]
    duplicate.issues.push(second)
    duplicate.summary.issueCount += 1
    duplicate.summary.errorCount += 1

    expect(BidsSuccessorAuditReportSchema.safeParse(duplicate).success).toBe(false)
  })

  test("rejects non-normalized paths and summary drift", async () => {
    const { report, issueIndex } = await metadataFixture()
    const unnormalized = structuredClone(report)
    unnormalized.issues[issueIndex]!.affectedPath = `./${unnormalized.issues[issueIndex]!.affectedPath}`
    const wrongSummary = structuredClone(report)
    wrongSummary.summary.issueCount += 1

    expect(BidsSuccessorAuditReportSchema.safeParse(unnormalized).success).toBe(false)
    expect(BidsSuccessorAuditReportSchema.safeParse(wrongSummary).success).toBe(false)
  })

  test("keeps issue and evidence ordering set-like", async () => {
    const { manifest, report } = await metadataFixture()
    const reordered = structuredClone(report)
    reordered.issues.reverse()
    reordered.issues.forEach((issue) => issue.evidencePaths.reverse())

    expect(bidsSuccessorReportsMatch(reordered, report, manifest)).toBe(true)
  })
})
