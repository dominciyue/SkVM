import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { expect, test } from "bun:test"
import { buildNamespacedResourceDevelopmentExecutionPlan } from "./namespaced-resource-development-execution.ts"

test("namespaced development execution plan is persistent and exposes executable commands", async () => {
  const rootDir = process.cwd()
  const outDir = await mkdtemp(path.join(os.tmpdir(), "skvm-namespaced-execution-"))
  const plan = await buildNamespacedResourceDevelopmentExecutionPlan({
    rootDir,
    outDir,
    model: "xty/gpt-5.6-sol",
    adapter: "pi",
    adapterVersion: "0.67.68",
    panelConfigId: "namespaced-resource-development-v1",
  })

  expect(plan.schemaVersion).toBe("skill-ir-namespaced-resource-development-execution-plan/v1")
  expect(plan.status).toBe("dry-run")
  expect(plan.rows).toHaveLength(16)
  expect(plan.rows.every((row) => row.command[0] === "bun")).toBe(true)
  expect(plan.rows.every((row) => path.isAbsolute(row.workDir))).toBe(true)
  expect(plan.rows.filter((row) => row.system === "optimized").every((row) => row.resourcePackageId !== undefined)).toBe(true)
  expect(plan.rows.every((row) => row.runIndex === 1)).toBe(true)
})
