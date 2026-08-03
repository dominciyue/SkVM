import { describe, expect, test } from "bun:test"
import { buildNamespacedResourceCanary } from "./resource-namespace-canary.ts"

describe("namespaced resource compatibility canary", () => {
  test("passes the Law and Experimental Design script-bearing cases without root resource exposure", async () => {
    const report = await buildNamespacedResourceCanary(process.cwd())
    expect(report.schemaVersion).toBe("skill-ir-namespaced-resource-canary/v1")
    expect(report.status).toBe("passed")
    expect(report.cases).toHaveLength(2)
    expect(report.cases.every((entry) => entry.status === "passed")).toBe(true)
    expect(report.cases.every((entry) => entry.unresolvedReferences.length === 0)).toBe(true)
    expect(report.cases.every((entry) => entry.rootResourcePathsPresent.length === 0)).toBe(true)
    expect(report.cases.every((entry) => entry.integrity === "passed")).toBe(true)
    expect(report.cases.every((entry) => entry.pythonSyntaxChecks.every((check) => check.status === "passed"))).toBe(true)
  })
})
