import { readFile } from "node:fs/promises"
import path from "node:path"
import { expect, test } from "bun:test"
import {
  readAndValidateNamespacedResourceDevelopmentQualityLock,
  validateNamespacedResourceDevelopmentQualityLock,
} from "./namespaced-resource-development-lock.ts"

const rootDir = process.cwd()
const lockPath = path.join(
  rootDir,
  "benchmarks",
  "skill-ir",
  "pilots",
  "namespaced-resource-quality-development-lock.json",
)

test("namespaced quality development lock validates frozen identity", async () => {
  const result = await readAndValidateNamespacedResourceDevelopmentQualityLock({ rootDir, lockPath })
  expect(result.lock.matrix.systems).toEqual(["no-skill", "original", "ir-static", "optimized"])
  expect(result.lock.matrix.expectedRows).toBe(16)
  expect(result.lock.runtime.retries).toBe(0)
  expect(result.compatibility.lock.experimentId).toBe("namespaced-resource-compatibility-v1")
})

test("namespaced quality lock rejects digest and promotion drift", async () => {
  const input = JSON.parse(await readFile(lockPath, "utf8")) as Record<string, unknown>
  const frozen = input.frozenImplementations as Record<string, { path: string; sha256: string }>
  frozen.execution!.sha256 = "0".repeat(64)
  await expect(validateNamespacedResourceDevelopmentQualityLock(input, rootDir)).rejects.toThrow(/digest mismatch/)

  const promotion = input.promotionBoundary as Record<string, unknown>
  promotion.permitsHeldOutExecution = true
  await expect(validateNamespacedResourceDevelopmentQualityLock(input, rootDir)).rejects.toThrow()
})
