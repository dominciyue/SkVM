import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { loadSkill } from "../../core/skill-loader.ts"
import {
  materializeNamespacedSkillResources,
  verifyNamespacedSkillResources,
  type NamespacedSkillResourcePackage,
} from "../../skill-ir/resource-namespace.ts"
import { readAndValidateNamespacedResourceDevelopmentLock } from "../../skill-ir/resource-namespace-lock.ts"
import {
  buildSkvmRunCommand,
  type RealAgentRunPlanEntry,
} from "./real-agent.ts"
import { executePlan, type RealAgentRunArgs } from "./real-agent-run.ts"
import { inferModelFamily } from "./promotion-policy.ts"
import { readAndValidateNamespacedResourceDevelopmentQualityLock } from "./namespaced-resource-development-lock.ts"
import {
  buildNamespacedResourceDevelopmentPlan,
  type NamespacedResourceDevelopmentPlanRow,
  type NamespacedResourceDevelopmentSystem,
} from "./namespaced-resource-development-plan.ts"

export type NamespacedResourceDevelopmentExecutionRow = {
  skillId: string
  taskId: string
  taskSplit: "development"
  system: NamespacedResourceDevelopmentSystem
  context: "clean"
  agent: "skvm"
  environment: "windows"
  runIndex: 1
  caseId: string
  taskPath: string
  workDir: string
  initialWorkdirManifestPath: string
  skillPath?: string
  namespaceRoot?: string
  resourcePackageId?: string
  command: string[]
  model: string
  modelFamily: string
  adapter: string
  adapterVersion: string
  panelConfigId: string
}

export type NamespacedResourceDevelopmentExecutionPlan = {
  schemaVersion: "skill-ir-namespaced-resource-development-execution-plan/v1"
  status: "dry-run"
  experimentId: string
  plannerSchemaVersion: "skill-ir-namespaced-resource-development-plan/v1"
  model: string
  modelFamily: string
  adapter: string
  adapterVersion: string
  panelConfigId: string
  rows: NamespacedResourceDevelopmentExecutionRow[]
  claimBoundary: string
}

function absoluteFromOutDir(outDir: string, relativePath: string): string {
  return path.resolve(outDir, ...relativePath.replaceAll("\\", "/").split("/"))
}

function toExecutionRow(opts: {
  row: NamespacedResourceDevelopmentPlanRow
  outDir: string
  model: string
  modelFamily: string
  adapter: string
  adapterVersion: string
  panelConfigId: string
  resourcePackageId?: string
}): NamespacedResourceDevelopmentExecutionRow {
  const taskPath = absoluteFromOutDir(opts.outDir, opts.row.taskPath)
  const workDir = absoluteFromOutDir(opts.outDir, opts.row.workDir)
  const initialWorkdirManifestPath = absoluteFromOutDir(opts.outDir, opts.row.initialWorkdirManifestPath)
  const skillPath = opts.row.skillPath ? absoluteFromOutDir(opts.outDir, opts.row.skillPath) : undefined
  return {
    ...opts.row,
    taskPath,
    workDir,
    initialWorkdirManifestPath,
    ...(skillPath ? { skillPath } : {}),
    ...(opts.resourcePackageId ? { resourcePackageId: opts.resourcePackageId } : {}),
    command: buildSkvmRunCommand({
      taskPath,
      ...(skillPath ? { skillPath } : {}),
      model: opts.model,
      adapter: opts.adapter,
      workdir: workDir,
      initialWorkdirManifestPath,
    }),
    model: opts.model,
    modelFamily: opts.modelFamily,
    adapter: opts.adapter,
    adapterVersion: opts.adapterVersion,
    panelConfigId: opts.panelConfigId,
  }
}

export async function buildNamespacedResourceDevelopmentExecutionPlan(opts: {
  rootDir: string
  outDir: string
  model: string
  modelFamily?: string
  adapter: string
  adapterVersion: string
  panelConfigId: string
}): Promise<NamespacedResourceDevelopmentExecutionPlan> {
  const rootDir = path.resolve(opts.rootDir)
  const outDir = path.resolve(opts.outDir)
  const artifactsDir = path.join(outDir, "artifacts")
  await mkdir(outDir, { recursive: true })
  const planner = await buildNamespacedResourceDevelopmentPlan({ rootDir, outDir: artifactsDir })
  const lock = await readAndValidateNamespacedResourceDevelopmentLock({
    rootDir,
    lockPath: path.join(rootDir, "benchmarks", "skill-ir", "pilots", "namespaced-resource-development-lock.json"),
  })
  const packageBySkill = new Map(lock.lock.cases.map((entry) => [
    entry.skillId,
    lock.packages.find((resourcePackage) => resourcePackage.skillId === entry.packageId)!,
  ]))
  const rows = planner.rows.map((row) => toExecutionRow({
    row,
    outDir: artifactsDir,
    model: opts.model,
    modelFamily: opts.modelFamily ?? "gpt",
    adapter: opts.adapter,
    adapterVersion: opts.adapterVersion,
    panelConfigId: opts.panelConfigId,
    ...(row.system === "optimized" ? { resourcePackageId: packageBySkill.get(row.skillId)?.skillId } : {}),
  }))
  if (rows.some((row) => row.system === "optimized" && !row.resourcePackageId)) {
    throw new Error("optimized execution row is missing a resource package identity")
  }
  return {
    schemaVersion: "skill-ir-namespaced-resource-development-execution-plan/v1",
    status: "dry-run",
    experimentId: `${planner.experimentId}-execution`,
    plannerSchemaVersion: "skill-ir-namespaced-resource-development-plan/v1",
    model: opts.model,
    modelFamily: opts.modelFamily ?? "gpt",
    adapter: opts.adapter,
    adapterVersion: opts.adapterVersion,
    panelConfigId: opts.panelConfigId,
    rows,
    claimBoundary: "Executable dry-run identity only; no model, scorer, quality, stability, Token, held-out, or PGO evidence.",
  }
}

function asRealAgentPlanEntry(row: NamespacedResourceDevelopmentExecutionRow): RealAgentRunPlanEntry {
  return row as unknown as RealAgentRunPlanEntry
}

function runtimeArgs(plan: NamespacedResourceDevelopmentExecutionPlan, outDir: string, rootDir: string): RealAgentRunArgs {
  return {
    corpus: "pilot",
    model: plan.model,
    modelFamily: plan.modelFamily,
    adapter: plan.adapter,
    adapterVersion: plan.adapterVersion,
    repetitions: 1,
    panelConfigId: plan.panelConfigId,
    outDir,
    limit: plan.rows.length,
    execute: true,
    retries: 0,
    retryDelayMs: 0,
    rootDir,
    systems: new Set(),
    contexts: new Set(["clean"]),
    agents: new Set(["skvm"]),
    environments: new Set(["windows"]),
  }
}

export async function executeNamespacedResourceDevelopmentPlan(opts: {
  rootDir: string
  outDir: string
  model: string
  modelFamily?: string
  adapter: string
  adapterVersion: string
  panelConfigId: string
  env?: Record<string, string | undefined>
}): Promise<{ rawRunsPath: string; rows: number }> {
  const rootDir = path.resolve(opts.rootDir)
  const outDir = path.resolve(opts.outDir)
  const plan = await buildNamespacedResourceDevelopmentExecutionPlan(opts)
  const planPath = path.join(outDir, "plan.json")
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8")
  const compatibility = await readAndValidateNamespacedResourceDevelopmentLock({
    rootDir,
    lockPath: path.join(rootDir, "benchmarks", "skill-ir", "pilots", "namespaced-resource-development-lock.json"),
  })
  const quality = await readAndValidateNamespacedResourceDevelopmentQualityLock({
    rootDir,
    lockPath: path.join(rootDir, "benchmarks", "skill-ir", "pilots", "namespaced-resource-quality-development-lock.json"),
  })
  if (
    opts.model !== quality.lock.model.route
    || opts.adapter !== quality.lock.adapter.id
    || opts.adapterVersion !== quality.lock.adapter.version
    || opts.panelConfigId !== quality.lock.experimentId
  ) {
    throw new Error("namespaced quality execution identity does not match frozen lock")
  }
  const packageById = new Map(compatibility.packages.map((resourcePackage) => [resourcePackage.skillId, resourcePackage]))
  const sourceBySkill = new Map(quality.compatibility.lock.cases.map((entry) => [entry.skillId, entry.source.path]))
  const realPlan = plan.rows.map(asRealAgentPlanEntry)
  await executePlan(realPlan, runtimeArgs(plan, outDir, rootDir), opts.env ?? process.env, {
    beforeGenericRun: async (item) => {
      if (item.system !== ("optimized" as unknown as RealAgentRunPlanEntry["system"])) return
      const row = plan.rows.find((candidate) =>
        candidate.caseId === item.caseId
        && candidate.system === "optimized"
        && candidate.runIndex === item.runIndex,
      )
      if (!row?.resourcePackageId) throw new Error(`optimized execution row missing package: ${item.caseId}`)
      const resourcePackage = packageById.get(row.resourcePackageId)
      const sourcePath = sourceBySkill.get(row.skillId)
      if (!resourcePackage || !sourcePath) throw new Error(`optimized execution package/source missing: ${row.skillId}`)
      const skill = await loadSkill(path.resolve(rootDir, sourcePath))
      const manifest = await materializeNamespacedSkillResources({ package: resourcePackage, skill, workDir: item.workDir })
      await verifyNamespacedSkillResources({ workDir: item.workDir, manifest })
    },
  })
  return { rawRunsPath: path.join(outDir, "raw-runs.jsonl"), rows: plan.rows.length }
}

function parseArgs(argv: string[]): {
  rootDir: string
  outDir: string
  execute: boolean
  model: string
  adapter: string
  adapterVersion: string
  panelConfigId: string
} {
  const args = {
    rootDir: process.cwd(),
    outDir: path.join(process.cwd(), "results", "skill-ir", "namespaced-resource-quality-development-v1"),
    execute: false,
    model: "xty/gpt-5.6-sol",
    adapter: "pi",
    adapterVersion: "0.67.68",
    panelConfigId: "namespaced-resource-quality-development-v1",
  }
  for (const arg of argv) {
    if (arg === "--execute") args.execute = true
    else if (arg.startsWith("--root-dir=")) args.rootDir = arg.slice("--root-dir=".length)
    else if (arg.startsWith("--out-dir=")) args.outDir = arg.slice("--out-dir=".length)
    else if (arg.startsWith("--model=")) args.model = arg.slice("--model=".length)
    else if (arg.startsWith("--adapter=")) args.adapter = arg.slice("--adapter=".length)
    else if (arg.startsWith("--adapter-version=")) args.adapterVersion = arg.slice("--adapter-version=".length)
    else if (arg.startsWith("--panel-config-id=")) args.panelConfigId = arg.slice("--panel-config-id=".length)
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

if (import.meta.main) {
  const args = parseArgs(process.argv.slice(2))
  const env = process.env
  if (args.execute && (!env.SKVM_XTY_API_KEY || env.SKVM_XTY_API_KEY.trim().length === 0)) {
    throw new Error("SKVM_XTY_API_KEY is required for --execute")
  }
  const result = args.execute
    ? await executeNamespacedResourceDevelopmentPlan(args)
    : await buildNamespacedResourceDevelopmentExecutionPlan({
        ...args,
        modelFamily: inferModelFamily(args.model),
      }).then(async (plan) => {
        const planPath = path.join(path.resolve(args.outDir), "plan.json")
        await mkdir(path.dirname(planPath), { recursive: true })
        await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8")
        return { planPath, rows: plan.rows.length, status: plan.status }
      })
  console.log(JSON.stringify(result, null, 2))
}
