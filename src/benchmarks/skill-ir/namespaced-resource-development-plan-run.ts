import { lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  buildNamespacedResourceDevelopmentPlan,
  type NamespacedResourceDevelopmentPlan,
} from "./namespaced-resource-development-plan.ts"

export type NamespacedResourceDevelopmentPlanRunResult = {
  schemaVersion: "skill-ir-namespaced-resource-development-plan-run/v1"
  status: "dry-run"
  outPath: string
  expectedRows: number
  optimizedRows: number
  uniqueWorkDirs: number
  materializationRootRemoved: boolean
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

export async function runNamespacedResourceDevelopmentPlan(opts: {
  rootDir: string
  outPath: string
}): Promise<NamespacedResourceDevelopmentPlanRunResult> {
  const rootDir = path.resolve(opts.rootDir)
  const outPath = path.resolve(opts.outPath)
  const materializationRoot = await mkdtemp(path.join(os.tmpdir(), "skvm-namespaced-development-"))
  let plan: NamespacedResourceDevelopmentPlan
  try {
    plan = await buildNamespacedResourceDevelopmentPlan({ rootDir, outDir: materializationRoot })
  } finally {
    await rm(materializationRoot, { recursive: true, force: true })
  }

  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8")
  const optimizedRows = plan.rows.filter((row) => row.system === "optimized").length
  return {
    schemaVersion: "skill-ir-namespaced-resource-development-plan-run/v1",
    status: plan.status,
    outPath,
    expectedRows: plan.matrix.expectedRows,
    optimizedRows,
    uniqueWorkDirs: new Set(plan.rows.map((row) => row.workDir)).size,
    materializationRootRemoved: !(await pathExists(materializationRoot)),
    claimBoundary: plan.claimBoundary,
  }
}

function parseArgs(argv: string[]): { rootDir: string; outPath: string } {
  const args = {
    rootDir: process.cwd(),
    outPath: path.join(process.cwd(), "results", "skill-ir", "namespaced-resource-development-plan.json"),
  }
  for (const arg of argv) {
    if (arg.startsWith("--root-dir=")) args.rootDir = arg.slice("--root-dir=".length)
    else if (arg.startsWith("--out=")) args.outPath = arg.slice("--out=".length)
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

if (import.meta.main) {
  const result = await runNamespacedResourceDevelopmentPlan(parseArgs(process.argv.slice(2)))
  console.log(JSON.stringify(result, null, 2))
}
