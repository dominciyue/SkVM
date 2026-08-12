import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { BenchmarkContractAuditManifestSchema } from "./benchmark-contract-audit.ts"
import { runBenchmarkContractAudit } from "./benchmark-contract-audit-run.ts"

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
})
