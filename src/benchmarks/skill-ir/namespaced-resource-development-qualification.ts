import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { ResourceContractSchema, runResourceProbe, type ResourceContract } from "./resource-contract.ts"
import {
  NamespacedSkillResourceManifestSchema,
  verifyNamespacedSkillResources,
} from "../../skill-ir/resource-namespace.ts"
import { buildNamespacedResourceDevelopmentPlan } from "./namespaced-resource-development-plan.ts"

export type NamespacedResourceDevelopmentQualificationCase = {
  skillId: string
  probe: {
    status: "passed" | "failed"
    command: string
    successMarker: string
    requiredModules: string[]
    detail?: string
  }
  mutationRegression: {
    status: "passed" | "failed"
    resourcePath?: string
    detail?: string
  }
}

export type NamespacedResourceDevelopmentQualification = {
  schemaVersion: "skill-ir-namespaced-resource-development-qualification/v1"
  status: "ready" | "blocked"
  caseCount: number
  probeCount: number
  mutationRegressionPassed: number
  blockers: string[]
  cases: NamespacedResourceDevelopmentQualificationCase[]
  claimBoundary: string
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await lstat(targetPath)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}

async function readJson<T>(targetPath: string): Promise<T> {
  return JSON.parse(await readFile(targetPath, "utf8")) as T
}

async function runContractProbe(contract: ResourceContract, env: NodeJS.ProcessEnv): Promise<NamespacedResourceDevelopmentQualificationCase["probe"]> {
  const command = env[contract.interpreter.env]?.trim() || contract.interpreter.fallbackCommand
  const result = await runResourceProbe(contract, { env })
  const passed = result.status === "ok"
  const detail = passed ? undefined : result.stderrClass
  return {
    status: passed ? "passed" : "failed",
    command,
    successMarker: contract.probe.successMarker,
    requiredModules: [...contract.probe.requiredModules],
    ...(detail ? { detail } : {}),
  }
}

async function runMutationRegression(input: {
  workDir: string
}): Promise<NamespacedResourceDevelopmentQualificationCase["mutationRegression"]> {
  const manifestPath = path.join(input.workDir, ".skvm", "skill-resource-manifest.json")
  if (!(await pathExists(manifestPath))) {
    return { status: "failed", detail: "materialized resource manifest missing" }
  }
  const manifest = NamespacedSkillResourceManifestSchema.parse(await readJson(manifestPath))
  const resource = manifest.resources[0]
  if (!resource) return { status: "failed", detail: "materialized resource manifest is empty" }
  const target = path.join(input.workDir, ...resource.targetPath.split("/"))
  const original = await readFile(target)
  let mutationRejected = false
  try {
    await verifyNamespacedSkillResources({ workDir: input.workDir, manifest })
    await writeFile(target, Buffer.concat([original, Buffer.from("\nnamespace-mutation-canary\n", "utf8")]))
    try {
      await verifyNamespacedSkillResources({ workDir: input.workDir, manifest })
    } catch {
      mutationRejected = true
    }
  } finally {
    await writeFile(target, original)
  }
  try {
    await verifyNamespacedSkillResources({ workDir: input.workDir, manifest })
  } catch {
    return { status: "failed", resourcePath: resource.sourcePath, detail: "restored resource failed integrity verification" }
  }
  return {
    status: mutationRejected ? "passed" : "failed",
    resourcePath: resource.sourcePath,
    ...(mutationRejected ? {} : { detail: "resource mutation was not rejected" }),
  }
}

export async function runNamespacedResourceDevelopmentQualification(opts: {
  rootDir: string
  outPath: string
  env?: NodeJS.ProcessEnv
}): Promise<NamespacedResourceDevelopmentQualification> {
  const rootDir = path.resolve(opts.rootDir)
  const outPath = path.resolve(opts.outPath)
  const materializationRoot = await mkdtemp(path.join(os.tmpdir(), "skvm-namespaced-qualification-"))
  const plan = await buildNamespacedResourceDevelopmentPlan({ rootDir, outDir: materializationRoot })
  const cases: NamespacedResourceDevelopmentQualificationCase[] = []
  try {
    for (const skillId of plan.matrix.skills) {
      const optimizedRows = plan.rows.filter((row) => row.skillId === skillId && row.system === "optimized")
      if (optimizedRows.length !== 2) throw new Error(`qualification requires two optimized rows: ${skillId}`)
      const contractPath = path.join(rootDir, "benchmarks", "skill-ir", "pilots", skillId, "resource-contract.json")
      const contract = ResourceContractSchema.parse(await readJson<unknown>(contractPath))
      const probe = await runContractProbe(contract, opts.env ?? process.env)
      const mutationRegression = await runMutationRegression({
        workDir: path.join(materializationRoot, optimizedRows[0]!.workDir),
      })
      cases.push({ skillId, probe, mutationRegression })
    }
  } finally {
    await rm(materializationRoot, { recursive: true, force: true })
  }

  const blockers = cases.flatMap((entry) => [
    ...(entry.probe.status === "passed" ? [] : [`${entry.skillId}:resource-probe`]),
    ...(entry.mutationRegression.status === "passed" ? [] : [`${entry.skillId}:mutation-regression`]),
  ])
  const result: NamespacedResourceDevelopmentQualification = {
    schemaVersion: "skill-ir-namespaced-resource-development-qualification/v1",
    status: blockers.length === 0 ? "ready" : "blocked",
    caseCount: cases.length,
    probeCount: cases.filter((entry) => entry.probe.status === "passed").length,
    mutationRegressionPassed: cases.filter((entry) => entry.mutationRegression.status === "passed").length,
    blockers,
    cases,
    claimBoundary: "Qualification only: resource probe, materialization isolation, and mutation fail-closed checks; no model, scorer, quality, stability, Token, held-out, or PGO evidence.",
  }
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8")
  return result
}

function parseArgs(argv: string[]): { rootDir: string; outPath: string } {
  const args = {
    rootDir: process.cwd(),
    outPath: path.join(process.cwd(), "results", "skill-ir", "namespaced-resource-development-qualification.json"),
  }
  for (const arg of argv) {
    if (arg.startsWith("--root-dir=")) args.rootDir = arg.slice("--root-dir=".length)
    else if (arg.startsWith("--out=")) args.outPath = arg.slice("--out=".length)
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

if (import.meta.main) {
  const result = await runNamespacedResourceDevelopmentQualification(parseArgs(process.argv.slice(2)))
  console.log(JSON.stringify({
    schemaVersion: result.schemaVersion,
    status: result.status,
    caseCount: result.caseCount,
    probeCount: result.probeCount,
    mutationRegressionPassed: result.mutationRegressionPassed,
    blockers: result.blockers,
    claimBoundary: result.claimBoundary,
  }, null, 2))
}
