import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { readAndValidateNamespacedResourceDevelopmentLock } from "../../skill-ir/resource-namespace-lock.ts"
import { materializeNamespacedResourceAgentView } from "./namespaced-resource-runner.ts"

function arg(argv: string[], name: string, fallback: string): string {
  const value = argv.find((entry) => entry.startsWith(`--${name}=`))?.slice(name.length + 3)
  return value || fallback
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath)
    return true
  } catch {
    return false
  }
}

export async function runNamespacedResourceRunnerDryRun(argv = process.argv.slice(2)) {
  const rootDir = path.resolve(arg(argv, "root-dir", process.cwd()))
  const lockPath = path.resolve(rootDir, arg(
    argv,
    "lock",
    "benchmarks/skill-ir/pilots/namespaced-resource-development-lock.json",
  ))
  const outPath = path.resolve(rootDir, arg(
    argv,
    "out",
    "results/skill-ir/namespaced-resource-runner-dry-run.json",
  ))
  const validated = await readAndValidateNamespacedResourceDevelopmentLock({ rootDir, lockPath })
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "skvm-namespaced-runner-dry-run-"))
  try {
    const cases = [] as Array<Record<string, unknown>>
    for (const [index, entry] of validated.lock.cases.entries()) {
      const materialized = await materializeNamespacedResourceAgentView({
        rootDir,
        outDir: temporaryRoot,
        caseId: `${entry.skillId}:skvm:windows:clean:resource-canary`,
        runIndex: 1,
        sourcePath: entry.source.path,
        package: validated.packages[index]!,
      })
      const flatRoots = ["scripts", "references", "agents", "LICENSE.txt", "LICENSE.upstream", "LICENSE.upstream.md"]
      const rootResourcePathsPresent = [] as string[]
      for (const rootName of flatRoots) {
        if (await exists(path.join(materialized.workDir, rootName))) rootResourcePathsPresent.push(rootName)
      }
      cases.push({
        skillId: entry.skillId,
        status: rootResourcePathsPresent.length === 0 ? "passed" : "failed",
        skillPathMaterialized: true,
        manifestVerified: true,
        namespaceRoot: materialized.namespaceRoot,
        rootResourcePathsPresent,
        compiledSkillContainsNamespace: (await readFile(materialized.skillPath, "utf8")).includes(materialized.namespaceRoot),
      })
    }
    const result = {
      schemaVersion: "skill-ir-namespaced-resource-runner-dry-run/v1",
      status: cases.every((entry) => entry.status === "passed" && entry.compiledSkillContainsNamespace === true)
        ? "passed"
        : "failed",
      experimentId: validated.lock.experimentId,
      phase: "materialization-only",
      cases,
      claimBoundary: "Runner materialization only; no agent execution, scorer result, quality, stability, or Token claim.",
    }
    await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8")
    return { outputPath: path.relative(rootDir, outPath).replaceAll(path.sep, "/"), ...result }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  try {
    console.log(JSON.stringify(await runNamespacedResourceRunnerDryRun(), null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
