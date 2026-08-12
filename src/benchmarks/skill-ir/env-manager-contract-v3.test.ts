import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { BenchmarkContractAuditManifestSchema } from "./benchmark-contract-audit.ts"
import { runBenchmarkContractAudit } from "./benchmark-contract-audit-run.ts"
import { verifyMethodCaseTaskSplitFreeze } from "./method-case-task-split-freeze.ts"

const root = "benchmarks/skill-ir/pilots/env-manager/successor-v3"

describe("env-manager scorer-authority benchmark contract v3", () => {
  test("publishes both schema representations and arm-neutral initial protection", async () => {
    const publicInterface = JSON.parse(await readFile(`${root}/public-interface.json`, "utf8"))
    expect(publicInterface.schemaVersion).toBe("skill-ir-env-manager-interface/v3")
    expect(publicInterface.schemaRepresentations).toEqual({
      variablesWrapper: "variables maps names to rules; required is a boolean rule field",
      jsonSchemaObject: "properties maps names to rules; required is the top-level required-name array",
      sensitiveRule: "sensitive true and writeOnly true are equivalent sensitivity markers",
    })
    expect(publicInterface.semantics.protectedInputs).toContain("frozen initial workdir manifest")

    const manifest = BenchmarkContractAuditManifestSchema.parse(
      JSON.parse(await readFile(`${root}/benchmark-contract-audit.json`, "utf8")),
    )
    const report = await runBenchmarkContractAudit(manifest)
    expect(report.skillId).toBe("env-manager-v3")
    expect(report.status).toBe("passed")
    expect(report.staticStatus).toBe("passed")
    expect(report.counts).toEqual({ tasks: 2, criteria: 3, requirements: 3, canaries: 8 })
    expect(report.canaries.every((canary) => canary.status === "matched")).toBe(true)
    expect(report.issues).toEqual([])
  })

  test("registers a distinct successor alias without increasing the method-case count", async () => {
    const corpus = JSON.parse(await readFile("benchmarks/skill-ir/corpus/corpora/pilot.json", "utf8"))
    const successor = corpus.skills.find((skill: { id: string }) => skill.id === "env-manager-v3")
    expect(successor).toMatchObject({
      benchmarkVersionOf: "env-manager",
      portfolioRole: "method-development",
      status: "tasks-authored",
      tasksPath: `${root}/development/tasks.json`,
      benchmarkContractAuditPath: `${root}/benchmark-contract-audit.json`,
    })
  })

  test("freezes development inputs while keeping the future held-out split unconsumed", async () => {
    const freeze = JSON.parse(await readFile(`${root}/development-task-freeze.json`, "utf8"))
    const verified = await verifyMethodCaseTaskSplitFreeze(process.cwd(), freeze)
    expect(verified).toMatchObject({
      benchmarkId: "env-manager-v3",
      heldoutBoundary: {
        status: "not-authored",
        permitsExecution: false,
        futureTasksRequireFreshIsolation: true,
      },
    })
  })

})
