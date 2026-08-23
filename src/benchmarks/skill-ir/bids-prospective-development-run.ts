import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  validateBidsProspectiveDevelopmentLock,
} from "./bids-prospective-development"
import { buildProspectiveDevelopmentPlan } from "./prospective-development"
import { runProspectiveDevelopmentQualification } from "./prospective-development-run"

type Phase = "plan" | "qualification"

function parseArgs(argv: string[]) {
  let phase: Phase | undefined
  let outDir = "results/skill-ir/bids-prospective-development-v1"
  for (const argument of argv) {
    if (argument.startsWith("--phase=")) {
      const value = argument.slice("--phase=".length)
      if (value !== "plan" && value !== "qualification") throw new Error("invalid BIDS prospective phase")
      phase = value
    } else if (argument.startsWith("--out-dir=")) {
      outDir = argument.slice("--out-dir=".length)
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }
  if (!phase) throw new Error("--phase is required")
  return { phase, outDir }
}

function assertOutputRoot(rootDir: string, outDir: string): void {
  const resultsRoot = path.resolve(rootDir, "results/skill-ir")
  const relative = path.relative(resultsRoot, outDir)
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("BIDS prospective output must be a child of results/skill-ir")
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const rootDir = path.resolve(process.cwd())
  const outDir = path.resolve(rootDir, args.outDir)
  assertOutputRoot(rootDir, outDir)
  const lockPath = path.join(rootDir, "benchmarks/skill-ir/pilots/bids/prospective-development-lock.json")
  const lock = await validateBidsProspectiveDevelopmentLock(
    JSON.parse(await readFile(lockPath, "utf8")), rootDir,
  )
  const planRoot = args.phase === "qualification" ? path.join(outDir, "qualification") : outDir
  const plan = await buildProspectiveDevelopmentPlan({
    rootDir,
    lock,
    outDir: path.relative(rootDir, path.join(planRoot, "run")),
  })
  await mkdir(planRoot, { recursive: true })
  await writeFile(path.join(planRoot, "plan.json"), `${JSON.stringify({
    ...plan,
    runArgs: Object.fromEntries(Object.entries(plan.runArgs).map(([key, value]) => [
      key, value instanceof Set ? [...value] : value,
    ])),
  }, null, 2)}\n`, "utf8")
  if (args.phase === "plan") return { phase: args.phase, rows: plan.plan.length }
  const qualification = await runProspectiveDevelopmentQualification({
    rootDir,
    lockPath,
    outDir: path.join(outDir, "qualification"),
    lock,
    plan,
  })
  if (qualification.status !== "passed") {
    throw new Error(`BIDS prospective qualification failed: ${JSON.stringify(qualification.checks)}`)
  }
  return { phase: args.phase, qualification }
}

if (import.meta.main) {
  main().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
