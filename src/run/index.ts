import path from "node:path"
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { z } from "zod"
import { getTmpDir } from "../core/config.ts"
import { BenchTaskFileSchema } from "../bench/types.ts"
import type { BenchTask } from "../bench/types.ts"
import { EvalCriterionSchema } from "../core/types.ts"
import type { AdapterConfig, AgentAdapter, EvalCriterion, RunResult, SkillBundle, SkillMode } from "../core/types.ts"
import { loadSkill as loadSkillFromPath, buildSkillBundle } from "../core/skill-loader.ts"
import type { ResolvedSkill } from "../core/skill-loader.ts"
import type { ConversationLog } from "../core/conversation-logger.ts"
import type { DurableRuntimeTrace } from "../core/durable-runtime-trace.ts"
import { createLogger } from "../core/logger.ts"
import {
  writeInitialWorkdirManifest,
  type InitialWorkdirManifestReference,
} from "../core/workdir-manifest.ts"

const log = createLogger("run")

export interface LoadedRunTask extends BenchTask {
  taskPath: string
}

/** Kept as an alias so existing callers don't break. */
export type LoadedSkill = ResolvedSkill

export interface ExecuteRunOptions {
  task: LoadedRunTask
  skill?: LoadedSkill
  adapter: AgentAdapter
  adapterConfig: AdapterConfig
  workDir?: string
  keepWorkDir?: boolean
  skillMode?: SkillMode
  initialWorkdirManifestPath?: string
  convLog?: ConversationLog
  runtimeTrace?: DurableRuntimeTrace
}

export interface ExecuteRunResult {
  task: LoadedRunTask
  skill?: LoadedSkill
  runResult: RunResult
  workDir: string
  initialWorkdirManifest?: InitialWorkdirManifestReference
}

export interface PrepareRunWorkspaceOptions {
  task: LoadedRunTask
  skill?: LoadedSkill
  workDir: string
  initialWorkdirManifestPath?: string
}

const RunTaskFileSchema = BenchTaskFileSchema.omit({ eval: true }).extend({
  eval: z.array(z.any()).optional().default([]),
})

export async function loadRunTask(taskPath: string): Promise<LoadedRunTask> {
  const resolvedTaskPath = path.resolve(taskPath)
  const taskFile = Bun.file(resolvedTaskPath)
  if (!(await taskFile.exists())) {
    throw new Error(`Task file not found: ${resolvedTaskPath}`)
  }

  let raw: unknown
  try {
    raw = JSON.parse(await taskFile.text())
  } catch (err) {
    throw new Error(`Failed to parse task JSON at ${resolvedTaskPath}: ${err}`)
  }

  const parsed = RunTaskFileSchema.parse(raw)
  const eval_ = parsed.eval.map((criterion) => EvalCriterionSchema.parse(criterion)) as EvalCriterion[]

  return {
    id: parsed.id,
    name: parsed.name,
    prompt: parsed.prompt,
    fixtures: parsed.fixtures ? { ...parsed.fixtures } : undefined,
    eval: eval_,
    timeoutMs: parsed.timeoutMs,
    maxSteps: parsed.maxSteps,
    category: parsed.category,
    gradingType: parsed.gradingType,
    gradingWeights: parsed.gradingWeights,
    skill: parsed.skill,
    origin: parsed.origin,
    taskDir: path.dirname(resolvedTaskPath),
    hostReady: parsed.hostReady,
    difficulty: parsed.difficulty,
    taskPath: resolvedTaskPath,
  }
}

export async function loadRunSkill(skillPath: string): Promise<LoadedSkill> {
  return await loadSkillFromPath(skillPath)
}

export async function materializeNaturalRunTask(options: {
  prompt: string
  taskPath: string
}): Promise<LoadedRunTask> {
  const prompt = options.prompt.trim()
  if (!prompt) throw new Error("Natural run prompt must contain non-whitespace text")
  const taskPath = path.resolve(options.taskPath)
  await mkdir(path.dirname(taskPath), { recursive: true })
  await writeFile(taskPath, `${JSON.stringify({
    id: naturalRunTaskId(prompt),
    prompt,
    eval: [],
  }, null, 2)}\n`, "utf8")
  return loadRunTask(taskPath)
}

export function naturalRunTaskId(prompt: string): string {
  const normalized = prompt.trim()
  if (!normalized) throw new Error("Natural run prompt must contain non-whitespace text")
  const promptSha = new Bun.CryptoHasher("sha256").update(normalized).digest("hex")
  return `natural-${promptSha.slice(0, 12)}`
}

export async function prepareRunWorkspace(
  opts: PrepareRunWorkspaceOptions,
): Promise<InitialWorkdirManifestReference | undefined> {
  const workDir = path.resolve(opts.workDir)
  await mkdir(workDir, { recursive: true })
  await copyTaskFixtures(opts.task, workDir)
  const initialWorkdirManifest = opts.initialWorkdirManifestPath
    ? await writeInitialWorkdirManifest({
        workDir,
        manifestPath: opts.initialWorkdirManifestPath,
        excludedPrefixes: [".skvm"],
      })
    : undefined
  // The pre-run source manifest deliberately precedes skill deployment. It
  // describes the user's/task's input bytes, not framework-owned resources.
  // A canonical namespace keeps those resources available even when a legacy
  // relative path collides with a user file.
  if (opts.skill) await deploySkillBundle(opts.skill, workDir)
  return initialWorkdirManifest
}

export async function executeRun(opts: ExecuteRunOptions): Promise<ExecuteRunResult> {
  const { task, skill, adapter, adapterConfig } = opts
  const keepWorkDir = opts.keepWorkDir ?? true
  const workDir = opts.workDir
    ? path.resolve(opts.workDir)
    : await mkdtemp(path.join(getTmpDir(), `skvm-run-${task.id}-`))

  const initialWorkdirManifest = await prepareRunWorkspace({
    task,
    skill,
    workDir,
    initialWorkdirManifestPath: opts.initialWorkdirManifestPath,
  })

  log.info(`Run task ${task.id}: adapter=${adapter.name} model=${adapterConfig.model} workDir=${workDir}`)

  await adapter.setup(adapterConfig)

  try {
    const runResult = await adapter.run({
      prompt: task.prompt,
      workDir,
      skill: buildRunSkillBundle(skill, opts.skillMode),
      taskId: task.id,
      convLog: opts.convLog,
      runtimeTrace: opts.runtimeTrace,
      // Use the resolved timeout from adapterConfig (CLI override > task value)
      // rather than reading task.timeoutMs directly — otherwise a CLI
      // --timeoutMs would be silently shadowed by the task file's value.
      timeoutMs: adapterConfig.timeoutMs,
      idleTimeoutMs: adapterConfig.idleTimeoutMs,
    })

    return {
      task,
      skill,
      runResult,
      workDir,
      ...(initialWorkdirManifest ? { initialWorkdirManifest } : {}),
    }
  } finally {
    await adapter.teardown()
    if (!keepWorkDir && !opts.workDir) {
      await rm(workDir, { recursive: true, force: true })
    }
  }
}

async function copyTaskFixtures(task: LoadedRunTask, workDir: string): Promise<void> {
  if (task.fixtures) {
    for (const [name, content] of Object.entries(task.fixtures)) {
      const filePath = path.join(workDir, name)
      await mkdir(path.dirname(filePath), { recursive: true })
      await writeFile(filePath, content)
    }
  }

  if (!task.taskDir) return

  const fixturesDir = path.join(task.taskDir, "fixtures")
  await copyDirectoryContents(fixturesDir, workDir)
}

function safeSkillResourceName(skill: LoadedSkill): string {
  const value = skill.skillId.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+|-+$/g, "")
  return value && value !== "." && value !== ".." ? value : "skill"
}

function skillResourceRelativeDir(skill: LoadedSkill): string {
  return `.skvm/skills/${safeSkillResourceName(skill)}`
}

function buildRunSkillBundle(
  skill: LoadedSkill | undefined,
  mode: SkillMode | undefined,
): SkillBundle | undefined {
  const bundle = buildSkillBundle(skill, mode)
  if (!bundle || !skill) return bundle
  const resourceRoot = skillResourceRelativeDir(skill)
  return {
    ...bundle,
    content: `<runtime-resource-root>${resourceRoot}</runtime-resource-root>\n` +
      `Bundled resources for this skill are installed under ${resourceRoot}. ` +
      "Resolve relative resource paths from that directory; non-conflicting root-level copies are legacy aliases only.\n\n" +
      bundle.content,
  }
}

async function deploySkillBundle(skill: LoadedSkill, workDir: string): Promise<void> {
  const canonicalDir = path.join(workDir, ...skillResourceRelativeDir(skill).split("/"))
  await rm(canonicalDir, { recursive: true, force: true })
  await mkdir(canonicalDir, { recursive: true })
  await copyFile(skill.skillPath, path.join(canonicalDir, "SKILL.md"))
  for (const relative of skill.bundleFiles) {
    const source = path.join(skill.skillDir, relative)
    const canonical = path.join(canonicalDir, relative)
    await mkdir(path.dirname(canonical), { recursive: true })
    await copyFile(source, canonical)

    // Retain the historical root-relative lookup only when it is harmless.
    // Existing user/task bytes are authoritative and are never overwritten.
    const legacy = path.join(workDir, relative)
    if (await Bun.file(legacy).exists()) continue
    await mkdir(path.dirname(legacy), { recursive: true })
    await copyFile(source, legacy)
  }
}

async function copyDirectoryContents(
  sourceDir: string,
  destDir: string,
  excludedPaths?: Set<string>,
): Promise<void> {
  try {
    const entries = await readdir(sourceDir, { withFileTypes: true })
    for (const entry of entries) {
      const src = path.join(sourceDir, entry.name)
      const dest = path.join(destDir, entry.name)
      if (excludedPaths?.has(src)) continue

      if (entry.isDirectory()) {
        await mkdir(dest, { recursive: true })
        await copyDirectoryContents(src, dest, excludedPaths)
      } else if (entry.isFile()) {
        await mkdir(path.dirname(dest), { recursive: true })
        await copyFile(src, dest)
      }
    }
  } catch {
    // Ignore missing optional directories like task fixtures.
  }
}

