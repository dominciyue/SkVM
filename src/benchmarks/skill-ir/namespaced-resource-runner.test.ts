import { lstat, mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { expect, test } from "bun:test"
import { readAndValidateNamespacedResourceDevelopmentLock } from "../../skill-ir/resource-namespace-lock.ts"
import { materializeNamespacedResourceAgentView } from "./namespaced-resource-runner.ts"

test("namespaced resource runner materializes compiled view without flat skill resources", async () => {
  const rootDir = process.cwd()
  const lockPath = path.join(rootDir, "benchmarks/skill-ir/pilots/namespaced-resource-development-lock.json")
  const validated = await readAndValidateNamespacedResourceDevelopmentLock({ rootDir, lockPath })
  const outDir = await mkdtemp(path.join(os.tmpdir(), "skvm-namespaced-runner-"))
  const first = validated.lock.cases[0]!
  const packageRecord = validated.packages[0]!
  const result = await materializeNamespacedResourceAgentView({
    rootDir,
    outDir,
    caseId: `${first.skillId}:skvm:windows:clean:resource-canary`,
    runIndex: 1,
    sourcePath: first.source.path,
    package: packageRecord,
  })

  expect(await Bun.file(result.skillPath).text()).toContain(packageRecord.namespaceRoot)
  expect(await Bun.file(result.manifestPath).exists()).toBe(true)
  expect(await Bun.file(path.join(result.workDir, "scripts", "run.py")).exists()).toBe(false)
  expect((await lstat(result.workDir)).isDirectory()).toBe(true)
})
