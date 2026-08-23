import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  BIDS_DEVELOPMENT_TASK_IDS,
  BIDS_PUBLIC_FIELD_PATHS,
  BidsAuditReportSchema,
  buildBidsDevelopmentTaskSet,
  buildBidsPublicInterface,
  deriveBidsAuditOracle,
  loadBidsSourceRules,
  writeBidsContractArtifacts,
} from "./bids-contract.ts"

const projectRoot = path.resolve(import.meta.dir, "../../..")

describe("BIDS development contract", () => {
  test("publishes every nested report field and explicit set-like array semantics", () => {
    const publicInterface = buildBidsPublicInterface()

    expect(publicInterface.publicFieldPaths).toEqual([...BIDS_PUBLIC_FIELD_PATHS])
    expect(publicInterface.reportContract).toMatchObject({
      schemaVersion: "skill-ir-bids-audit-report/v1",
      additionalProperties: false,
      issues: {
        order: "set-like",
        duplicates: "forbid",
        evidencePaths: { order: "set-like", duplicates: "forbid" },
      },
    })
    expect(BIDS_PUBLIC_FIELD_PATHS).toEqual([
      "/schemaVersion",
      "/datasetId",
      "/issues",
      "/issues/*/code",
      "/issues/*/severity",
      "/issues/*/affectedPath",
      "/issues/*/evidencePaths",
      "/issues/*/evidencePaths/*",
      "/issues/*/repair",
      "/issues/*/repair/operation",
      "/issues/*/repair/targetPath",
      "/issues/*/repair/destinationPath",
      "/issues/*/repair/field",
      "/issues/*/repair/value",
      "/summary",
      "/summary/issueCount",
      "/summary/errorCount",
    ])
  })

  test("authors exactly two development tasks without instance answers or an action recipe", () => {
    const tasks = buildBidsDevelopmentTaskSet(buildBidsPublicInterface())

    expect(tasks.tasks.map((task) => task.id)).toEqual([...BIDS_DEVELOPMENT_TASK_IDS])
    expect(tasks.tasks.every((task) => task.split === "development")).toBe(true)
    expect(tasks.tasks.every((task) => task.prompt.includes("assess whether the supplied logical dataset is suitable for BIDS submission"))).toBe(true)
    expect(tasks.tasks.every((task) => !/(rename|entity order|RepetitionTime|TaskName|expected|gold)/iu.test(task.prompt))).toBe(true)
    expect(JSON.stringify(tasks)).not.toContain("TEST_ONLY_HELDOUT")
  })

  test("derives entity-order and metadata-inheritance repairs from the frozen source rules", async () => {
    const sourceRules = await loadBidsSourceRules(projectRoot)
    const tasks = buildBidsDevelopmentTaskSet()
    const reports = await Promise.all(tasks.tasks.map((task) =>
      deriveBidsAuditOracle(JSON.parse(task.fixtures["dataset-manifest.json"]!), sourceRules)
    ))

    expect(reports[0]!.issues).toHaveLength(2)
    expect(new Set(reports[0]!.issues.map((issue) => issue.code))).toEqual(new Set(["ENTITY_ORDER"]))
    expect(reports[0]!.issues.every((issue) => issue.repair.operation === "rename")).toBe(true)
    expect(reports[1]!.issues.map((issue) => issue.code).sort()).toEqual([
      "MISSING_REQUIRED_METADATA",
      "MISSING_REQUIRED_METADATA",
      "TASK_NAME_MISMATCH",
    ])
    expect(reports.every((report) => BidsAuditReportSchema.safeParse(report).success)).toBe(true)
  })

  test("rebuilds the committed interface and task set byte-semantically", async () => {
    const [committedInterface, committedTasks] = await Promise.all([
      readFile(path.join(projectRoot, "benchmarks/skill-ir/pilots/bids/public-interface.json"), "utf8").then(JSON.parse),
      readFile(path.join(projectRoot, "benchmarks/skill-ir/pilots/bids/development/tasks.json"), "utf8").then(JSON.parse),
    ])

    expect(committedInterface).toEqual(buildBidsPublicInterface())
    expect(committedTasks).toEqual(buildBidsDevelopmentTaskSet(committedInterface))
  })

  test("writes the public interface and development task set together", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "bids-contract-"))
    try {
      const written = await writeBidsContractArtifacts({ outputDirectory: directory })
      expect(JSON.parse(await readFile(path.join(directory, "public-interface.json"), "utf8"))).toEqual(written.publicInterface)
      expect(JSON.parse(await readFile(path.join(directory, "development/tasks.json"), "utf8"))).toEqual(written.taskSet)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
