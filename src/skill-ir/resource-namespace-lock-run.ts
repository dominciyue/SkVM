import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { readAndValidateNamespacedResourceDevelopmentLock } from "./resource-namespace-lock.ts"

function arg(argv: string[], name: string, fallback: string): string {
  const value = argv.find((entry) => entry.startsWith(`--${name}=`))?.slice(name.length + 3)
  return value || fallback
}

export async function runNamespacedResourceDevelopmentLock(argv = process.argv.slice(2)) {
  const rootDir = path.resolve(arg(argv, "root-dir", process.cwd()))
  const lockPath = path.resolve(rootDir, arg(
    argv,
    "lock",
    "benchmarks/skill-ir/pilots/namespaced-resource-development-lock.json",
  ))
  const outPath = path.resolve(rootDir, arg(
    argv,
    "out",
    "results/skill-ir/namespaced-resource-development-lock-validation.json",
  ))
  const validated = await readAndValidateNamespacedResourceDevelopmentLock({ rootDir, lockPath })
  const result = {
    schemaVersion: "skill-ir-namespaced-resource-development-lock-validation/v1",
    status: "passed",
    experimentId: validated.lock.experimentId,
    phase: validated.lock.phase,
    cases: validated.packages.map((compiled) => ({
      skillId: compiled.skillId,
      packageStatus: compiled.status,
      sourceDigest: compiled.sourceDigest,
      closureDigest: compiled.closureDigest,
      namespaceRoot: compiled.namespaceRoot,
      resourceFiles: compiled.resources.length,
      rewriteCount: compiled.rewrites.reduce((sum, rewrite) => sum + rewrite.occurrences, 0),
      unresolvedReferences: compiled.unresolvedReferences,
    })),
    claimBoundary: "Lock and source/package identity only; no model quality, optimization, held-out, or Token claim.",
  }
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8")
  return { outputPath: path.relative(rootDir, outPath).replaceAll(path.sep, "/"), ...result }
}

if (import.meta.main) {
  try {
    console.log(JSON.stringify(await runNamespacedResourceDevelopmentLock(), null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
