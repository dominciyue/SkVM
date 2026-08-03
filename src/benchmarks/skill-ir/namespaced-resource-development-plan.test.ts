import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { expect, test } from "bun:test"
import { buildNamespacedResourceDevelopmentPlan } from "./namespaced-resource-development-plan.ts"
import { runNamespacedResourceDevelopmentPlan } from "./namespaced-resource-development-plan-run.ts"
import { runNamespacedResourceDevelopmentQualification } from "./namespaced-resource-development-qualification.ts"

test("namespaced development planner emits explicit four-arm rows without changing cold start systems", async () => {
  const rootDir = process.cwd()
  const outDir = await mkdtemp(path.join(os.tmpdir(), "skvm-namespaced-plan-"))
  const plan = await buildNamespacedResourceDevelopmentPlan({ rootDir, outDir })

  expect(plan.schemaVersion).toBe("skill-ir-namespaced-resource-development-plan/v1")
  expect(plan.status).toBe("dry-run")
  expect(plan.matrix.systems).toEqual(["no-skill", "original", "ir-static", "optimized"])
  expect(plan.matrix.expectedRows).toBe(16)
  expect(plan.rows).toHaveLength(16)
  expect(plan.rows.filter((row) => row.system === "optimized")).toHaveLength(4)
  expect(plan.rows.filter((row) => row.system === "original")).toHaveLength(4)
  expect(plan.rows.filter((row) => row.system === "no-skill")).toHaveLength(4)
  expect(plan.rows.filter((row) => row.system === "ir-static")).toHaveLength(4)
  expect(plan.rows.filter((row) => row.system === "optimized").every((row) => row.namespaceRoot !== undefined)).toBe(true)
  expect(plan.rows.every((row) => row.initialWorkdirManifestPath !== undefined)).toBe(true)
  expect(plan.rows.every((row) => row.taskSplit === "development" && row.context === "clean")).toBe(true)
})

test("namespaced development plan runner writes a compact dry-run result", async () => {
  const rootDir = process.cwd()
  const outPath = path.join(
    await mkdtemp(path.join(os.tmpdir(), "skvm-namespaced-plan-result-")),
    "nested",
    "plan.json",
  )
  const result = await runNamespacedResourceDevelopmentPlan({ rootDir, outPath })

  expect(result.status).toBe("dry-run")
  expect(result.expectedRows).toBe(16)
  expect(result.optimizedRows).toBe(4)
  expect(result.uniqueWorkDirs).toBe(16)
  expect(result.materializationRootRemoved).toBe(true)
})

test("namespaced development qualification records probes and mutation regression separately", async () => {
  const rootDir = process.cwd()
  const outPath = path.join(
    await mkdtemp(path.join(os.tmpdir(), "skvm-namespaced-qualification-")),
    "qualification.json",
  )
  const result = await runNamespacedResourceDevelopmentQualification({
    rootDir,
    outPath,
    env: { ...process.env, SKVM_PYTHON: "skvm-python-missing-for-test" },
  })

  expect(result.schemaVersion).toBe("skill-ir-namespaced-resource-development-qualification/v1")
  expect(result.caseCount).toBe(2)
  expect(result.probeCount).toBe(0)
  expect(result.mutationRegressionPassed).toBe(2)
  expect(result.status).toBe("blocked")
  expect(result.blockers).toContain("law-to-markdown:resource-probe")
  expect(result.blockers).toContain("experimental-design:resource-probe")
})
