import { lstat, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { SkillIRSchema, type SkillIR } from "../../skill-ir/schema.ts"
import { readAndValidateNamespacedResourceDevelopmentLock } from "../../skill-ir/resource-namespace-lock.ts"
import type { NamespacedSkillResourcePackage } from "../../skill-ir/resource-namespace.ts"
import {
  buildSkvmTaskJson,
  materializeCaseArtifacts,
  type SkillIRBenchmarkTask,
} from "./real-agent.ts"
import { materializeNamespacedResourceAgentView } from "./namespaced-resource-runner.ts"

export const NAMESPACED_RESOURCE_DEVELOPMENT_SYSTEMS = [
  "no-skill",
  "original",
  "ir-static",
  "optimized",
] as const

export type NamespacedResourceDevelopmentSystem = typeof NAMESPACED_RESOURCE_DEVELOPMENT_SYSTEMS[number]

type PilotSkillEntry = {
  id: string
  status?: string
  sourcePath?: string
  tasksPath?: string
  irPath?: string
  sourceFiles?: Array<{ path: string; sha256: string }>
}

type PilotCorpus = {
  skills: PilotSkillEntry[]
}

type TaskSet = {
  skillId: string
  tasks: SkillIRBenchmarkTask[]
}

export type NamespacedResourceDevelopmentPlanRow = {
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
}

export type NamespacedResourceDevelopmentPlan = {
  schemaVersion: "skill-ir-namespaced-resource-development-plan/v1"
  status: "dry-run"
  experimentId: string
  sourceLockId: string
  matrix: {
    systems: [...typeof NAMESPACED_RESOURCE_DEVELOPMENT_SYSTEMS]
    skills: string[]
    taskIds: string[]
    contexts: ["clean"]
    agents: ["skvm"]
    environments: ["windows"]
    repetitions: 1
    expectedQuartets: number
    expectedRows: number
  }
  rows: NamespacedResourceDevelopmentPlanRow[]
  claimBoundary: string
}

function resolveWithin(rootDir: string, relativePath: string): string {
  const root = path.resolve(rootDir)
  const absolute = path.resolve(root, ...relativePath.replaceAll("\\", "/").split("/"))
  const relative = path.relative(root, absolute)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`namespaced development plan path escapes repository root: ${relativePath}`)
  }
  return absolute
}

function portableRelative(rootDir: string, targetPath: string): string {
  return path.relative(path.resolve(rootDir), path.resolve(targetPath)).replaceAll(path.sep, "/")
}

async function readJson<T>(absolutePath: string): Promise<T> {
  return JSON.parse(await readFile(absolutePath, "utf8")) as T
}

async function exists(absolutePath: string): Promise<boolean> {
  try {
    await lstat(absolutePath)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}

async function assertNoFlatResourceExposure(
  workDir: string,
  resourcePackage: NamespacedSkillResourcePackage,
): Promise<void> {
  const exposed: string[] = []
  for (const resource of resourcePackage.resources) {
    const candidate = path.join(workDir, ...resource.sourcePath.split("/"))
    if (await exists(candidate)) exposed.push(resource.sourcePath)
  }
  if (exposed.length > 0) {
    throw new Error(`optimized workdir exposes flat skill resources: ${exposed.join(", ")}`)
  }
}

async function loadFixture(rootDir: string, entry: PilotSkillEntry): Promise<{
  ir: SkillIR
  tasks: SkillIRBenchmarkTask[]
}> {
  if (entry.status !== "runnable" || !entry.sourcePath || !entry.tasksPath || !entry.irPath || !entry.sourceFiles) {
    throw new Error(`namespaced development skill is not a complete runnable pilot: ${entry.id}`)
  }
  const ir = SkillIRSchema.parse(await readJson(resolveWithin(rootDir, entry.irPath)))
  const taskSet = await readJson<TaskSet>(resolveWithin(rootDir, entry.tasksPath))
  if (ir.id !== entry.id || taskSet.skillId !== entry.id) {
    throw new Error(`namespaced development pilot identity mismatch: ${entry.id}`)
  }
  const tasks = taskSet.tasks.filter((task) => task.split === "development")
  if (tasks.length !== 2) {
    throw new Error(`namespaced development plan requires exactly two development tasks: ${entry.id}`)
  }
  return { ir, tasks }
}

export async function buildNamespacedResourceDevelopmentPlan(opts: {
  rootDir: string
  outDir: string
}): Promise<NamespacedResourceDevelopmentPlan> {
  const rootDir = path.resolve(opts.rootDir)
  const outDir = path.resolve(opts.outDir)
  const validated = await readAndValidateNamespacedResourceDevelopmentLock({
    rootDir,
    lockPath: path.join(rootDir, "benchmarks", "skill-ir", "pilots", "namespaced-resource-development-lock.json"),
  })
  const corpus = await readJson<PilotCorpus>(
    path.join(rootDir, "benchmarks", "skill-ir", "corpus", "corpora", "pilot.json"),
  )
  const rows: NamespacedResourceDevelopmentPlanRow[] = []
  const taskIds: string[] = []

  for (const lockCase of validated.lock.cases) {
    const entry = corpus.skills.find((skill) => skill.id === lockCase.skillId)
    if (!entry) throw new Error(`namespaced development pilot missing from corpus: ${lockCase.skillId}`)
    const resourcePackage = validated.packages.find((candidate) => candidate.skillId === lockCase.packageId)
    if (!resourcePackage) throw new Error(`namespaced development package missing: ${lockCase.packageId}`)
    const { ir, tasks } = await loadFixture(rootDir, entry)

    for (const task of tasks) {
      taskIds.push(task.id)
      const caseId = `${entry.id}:skvm:windows:clean:${task.id}`
      for (const system of NAMESPACED_RESOURCE_DEVELOPMENT_SYSTEMS) {
        if (system === "optimized") {
          const view = await materializeNamespacedResourceAgentView({
            rootDir,
            outDir,
            caseId,
            runIndex: 1,
            sourcePath: entry.sourcePath!,
            package: resourcePackage,
          })
          const taskDir = path.join(view.caseDir, "task")
          const taskPath = path.join(taskDir, "task.json")
          await mkdir(taskDir, { recursive: true })
          await writeFile(taskPath, `${JSON.stringify(buildSkvmTaskJson(task, {
            context: "clean",
            skillId: entry.id,
          }), null, 2)}\n`, "utf8")
          await assertNoFlatResourceExposure(view.workDir, resourcePackage)
          rows.push({
            skillId: entry.id,
            taskId: task.id,
            taskSplit: "development",
            system,
            context: "clean",
            agent: "skvm",
            environment: "windows",
            runIndex: 1,
            caseId,
            taskPath: portableRelative(outDir, taskPath),
            workDir: portableRelative(outDir, view.workDir),
            initialWorkdirManifestPath: portableRelative(
              outDir,
              path.join(view.caseDir, "initial-workdir-manifest.json"),
            ),
            skillPath: portableRelative(outDir, view.skillPath),
            namespaceRoot: view.namespaceRoot,
          })
          continue
        }

        const materialized = await materializeCaseArtifacts({
          outDir,
          rootDir,
          ir,
          task,
          context: "clean",
          system,
          caseId,
          runIndex: 1,
          sourceFiles: entry.sourceFiles,
        })
        rows.push({
          skillId: entry.id,
          taskId: task.id,
          taskSplit: "development",
          system,
          context: "clean",
          agent: "skvm",
          environment: "windows",
          runIndex: 1,
          caseId,
          taskPath: portableRelative(outDir, materialized.taskPath),
          workDir: portableRelative(outDir, materialized.workDir),
          initialWorkdirManifestPath: portableRelative(
            outDir,
            materialized.initialWorkdirManifestPath ??
              path.join(path.dirname(materialized.workDir), "initial-workdir-manifest.json"),
          ),
          ...(materialized.skillPath ? { skillPath: portableRelative(outDir, materialized.skillPath) } : {}),
        })
      }
    }
  }

  const uniqueTaskIds = [...new Set(taskIds)]
  const uniqueWorkDirs = new Set(rows.map((row) => row.workDir))
  if (uniqueTaskIds.length !== taskIds.length || uniqueWorkDirs.size !== rows.length) {
    throw new Error("namespaced development plan task or workdir isolation failure")
  }
  const expectedRows = uniqueTaskIds.length * NAMESPACED_RESOURCE_DEVELOPMENT_SYSTEMS.length
  if (rows.length !== expectedRows) {
    throw new Error(`namespaced development plan row mismatch: expected ${expectedRows}, received ${rows.length}`)
  }

  return {
    schemaVersion: "skill-ir-namespaced-resource-development-plan/v1",
    status: "dry-run",
    experimentId: `${validated.lock.experimentId}-four-arm-plan`,
    sourceLockId: validated.lock.experimentId,
    matrix: {
      systems: [...NAMESPACED_RESOURCE_DEVELOPMENT_SYSTEMS],
      skills: validated.lock.cases.map((entry) => entry.skillId),
      taskIds: uniqueTaskIds,
      contexts: ["clean"],
      agents: ["skvm"],
      environments: ["windows"],
      repetitions: 1,
      expectedQuartets: uniqueTaskIds.length,
      expectedRows,
    },
    rows,
    claimBoundary: "Dry-run planner identity and workdir isolation only; no model, scorer, quality, stability, Token, held-out, or PGO evidence.",
  }
}
