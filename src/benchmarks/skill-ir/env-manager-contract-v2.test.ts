import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { BenchmarkContractAuditManifestSchema } from "./benchmark-contract-audit.ts"
import { runBenchmarkContractAudit } from "./benchmark-contract-audit-run.ts"
import { verifyMethodCaseTaskSplitFreeze } from "./method-case-task-split-freeze.ts"

const manifestPath = "benchmarks/skill-ir/pilots/env-manager/successor-v2/benchmark-contract-audit.json"

describe("env-manager source-derived benchmark contract v2", () => {
  test("passes static traceability and all semantic/safety canaries", async () => {
    const manifest = BenchmarkContractAuditManifestSchema.parse(
      JSON.parse(await readFile(manifestPath, "utf8")),
    )
    const report = await runBenchmarkContractAudit(manifest)
    expect(report.skillId).toBe("env-manager-v2")
    expect(report.status).toBe("passed")
    expect(report.staticStatus).toBe("passed")
    expect(report.counts).toEqual({ tasks: 2, criteria: 3, requirements: 3, canaries: 8 })
    expect(report.canaries.every((canary) => canary.status === "matched")).toBe(true)
    expect(report.issues).toEqual([])
    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain("TEST_ONLY_")
    expect(serialized).not.toContain("APP_PORT")
    expect(serialized).not.toContain("VITE_PUBLIC_TOKEN")
  })

  test("freezes disjoint development and held-out tasks at the successor identity commit", async () => {
    const freeze = JSON.parse(await readFile(
      "benchmarks/skill-ir/pilots/env-manager/successor-v2/task-split-freeze.json",
      "utf8",
    ))
    await expect(verifyMethodCaseTaskSplitFreeze(process.cwd(), freeze)).resolves.toMatchObject({
      benchmarkId: "env-manager-v2",
      developmentTasks: {
        taskIds: ["env-manager-source-contract-node-dev-001", "env-manager-source-contract-vite-dev-002"],
      },
      heldoutTasks: {
        taskIds: ["env-manager-source-contract-python-heldout-001", "env-manager-source-contract-next-heldout-002"],
      },
    })
  })
})
