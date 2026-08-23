import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  BIDS_SUCCESSOR_PUBLIC_VALUE_SEMANTICS,
  BidsSuccessorAuditReportSchema,
  buildBidsSuccessorDevelopmentTaskSet,
  buildBidsSuccessorPublicInterface,
  deriveBidsSuccessorAuditOracle,
  loadBidsSuccessorSourceRules,
  writeBidsSuccessorContractArtifacts,
} from "./bids-successor-contract.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const successorDir = "benchmarks/skill-ir/pilots/bids/successor-v2"

describe("BIDS successor measurement contract", () => {
  test("publishes the complete non-answer-bearing pointer and value-semantics contract", () => {
    const publicInterface = buildBidsSuccessorPublicInterface()

    expect(publicInterface.schemaVersion).toBe("skill-ir-bids-public-interface/v2")
    expect(publicInterface.reportContract.schemaVersion).toBe("skill-ir-bids-audit-report/v2")
    expect(publicInterface.publicFieldPaths).toHaveLength(17)
    expect(publicInterface.valueSemantics).toEqual(BIDS_SUCCESSOR_PUBLIC_VALUE_SEMANTICS)
    expect(publicInterface.valueSemantics.map((item) => item.id)).toEqual([
      "issues-order-equivalence",
      "evidence-paths-order-equivalence",
      "affected-path-repair-related-role",
      "repair-related-manifest-evidence",
      "issue-semantic-repair-identity",
      "report-path-normalization",
      "summary-count-relationship",
    ])
    expect(JSON.stringify(publicInterface)).not.toMatch(/expectedAnswer|goldAnswer|TEST_ONLY_HELDOUT/iu)
  })

  test("reuses the two development problems under a distinct evaluator and interface identity", () => {
    const taskSet = buildBidsSuccessorDevelopmentTaskSet()

    expect(taskSet.tasks).toHaveLength(2)
    expect(taskSet.tasks.every((task) => task.split === "development")).toBe(true)
    expect(taskSet.tasks.every((task) => task.eval.every((criterion) =>
      criterion.evaluatorId === "skill-ir-bids-successor"
      && criterion.payload.schemaVersion === "skill-ir-bids-eval/v2"
    ))).toBe(true)
    expect(taskSet.tasks.every((task) => !/(rename|entity order|RepetitionTime|TaskName|expected|gold)/iu.test(task.prompt))).toBe(true)
    expect(taskSet.tasks.every((task) => task.fixtures["bids-audit-interface.json"]?.includes(
      "skill-ir-bids-public-interface/v2",
    ))).toBe(true)
  })

  test("derives canonical reports whose evidence is drawn only from the task manifest", async () => {
    const taskSet = buildBidsSuccessorDevelopmentTaskSet()
    const rules = await loadBidsSuccessorSourceRules(rootDir)

    for (const task of taskSet.tasks) {
      const manifest = JSON.parse(task.fixtures["dataset-manifest.json"]!) as { files: Array<{ path: string }> }
      const report = await deriveBidsSuccessorAuditOracle(manifest, rules)
      const manifestPaths = new Set(manifest.files.map((file) => file.path))
      expect(BidsSuccessorAuditReportSchema.safeParse(report).success).toBe(true)
      expect(report.issues.every((issue) => issue.evidencePaths.every((candidate) => manifestPaths.has(candidate)))).toBe(true)
    }
  })

  test("rebuilds and writes the committed successor artifacts", async () => {
    const expectedInterface = buildBidsSuccessorPublicInterface()
    const expectedTasks = buildBidsSuccessorDevelopmentTaskSet(expectedInterface)
    expect(JSON.parse(await readFile(path.join(rootDir, successorDir, "public-interface.json"), "utf8"))).toEqual(expectedInterface)
    expect(JSON.parse(await readFile(path.join(rootDir, successorDir, "development/tasks.json"), "utf8"))).toEqual(expectedTasks)

    const directory = await mkdtemp(path.join(tmpdir(), "bids-successor-contract-"))
    try {
      await writeBidsSuccessorContractArtifacts({ outputDirectory: directory })
      expect(JSON.parse(await readFile(path.join(directory, "public-interface.json"), "utf8"))).toEqual(expectedInterface)
      expect(JSON.parse(await readFile(path.join(directory, "development/tasks.json"), "utf8"))).toEqual(expectedTasks)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
