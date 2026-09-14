import path from "node:path"
import { copyFile, cp, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { gzipSync } from "node:zlib"
import type { AgentStep, RunExecutionObservation } from "../core/types.ts"
import {
  runHeadlessAgent,
  type HeadlessAgentRunOptions,
  type HeadlessAgentRunResult,
} from "../core/headless-agent/index.ts"
import { observePiExecution, piEventsToRunRecord, type PiEvent } from "../core/pi-runtime.ts"
import {
  snapshotWorkdir,
  writeInitialWorkdirManifest,
  type InitialWorkdirManifestReference,
} from "../core/workdir-manifest.ts"
import { analyzeSkillConsumption, type SkillConsumptionAnalysis } from "./consumption.ts"
import {
  OPTIMIZED_SKILL_PACKAGE_MANIFEST,
  OptimizedSkillPackageManifestSchema,
  type OptimizedSkillPackageManifest,
} from "./package.ts"

export interface GeneralSkillResource {
  sourcePath: string
  workPath: string
  protected?: boolean
}

export interface GeneralSkillExpectedFile {
  path: string
  includes?: string[]
}

export interface GeneralSkillAgentExecution {
  result: HeadlessAgentRunResult
  steps: AgentStep[]
  executionObservation?: RunExecutionObservation
}

export type GeneralSkillAgentRunner = (options: HeadlessAgentRunOptions) => Promise<GeneralSkillAgentExecution>

export interface RunGeneralSkillDevelopmentOptions {
  skillDir: string
  runDir: string
  task: string
  resources: GeneralSkillResource[]
  /** Inline public task fixtures, useful for task.json inputs without a separate fixture directory. */
  fixtures?: Record<string, string>
  protectedFixturePaths?: string[]
  expectedFiles: GeneralSkillExpectedFile[]
  residualEvidenceFiles?: string[]
  model: string
  timeoutMs?: number
  agentRunner?: GeneralSkillAgentRunner
}

export interface GeneralSkillDevelopmentReport {
  schemaVersion: "skill-ir-general-skill-development/v1"
  status: "passed" | "failed"
  exposure: "development"
  prompt: string
  package: {
    kind: "optimized" | "source"
    path: string
    manifestIdentity: string
    selectedEntrypoints: string[]
  }
  runtime: {
    runDir: string
    workDir: string
    model: string
    driver: string
    exitCode: number
    timedOut: boolean
    durationMs: number
    tokens: HeadlessAgentRunResult["tokens"]
    executionObservation: RunExecutionObservation | null
    agentEvents: {
      path: "agent-events.json.gz"
      format: "gzip"
      bytes: number
      sha256: string
      rawBytes: number
      rawSha256: string
    }
    initialWorkdirManifest: InitialWorkdirManifestReference
    reportedCostUsd: number
    actualCostUsd: null
    actualCostMissingReason: string
  }
  consumption: SkillConsumptionAnalysis
  verification: {
    taskPassed: boolean
    skillPackagePreserved: boolean
    protectedResourcesPreserved: boolean
    expectedFiles: Array<{
      path: string
      exists: boolean
      includesPassed: boolean
      bytes?: number
      sha256?: string
    }>
    residualEvidenceFiles: Array<{ path: string; exists: boolean }>
  }
  claimBoundary: string
}

export interface BuildGeneralSkillTaskPromptOptions {
  task: string
  resourcePaths: string[]
  expectedOutputPaths: string[]
}

export function buildGeneralSkillTaskPrompt(options: BuildGeneralSkillTaskPromptOptions): string {
  const resources = options.resourcePaths.length > 0
    ? options.resourcePaths.map((item) => `- ./${item}`).join("\n")
    : "- none"
  const outputs = options.expectedOutputPaths.length > 0
    ? options.expectedOutputPaths.map((item) => `- ./${item}`).join("\n")
    : "- follow the task's explicit output request"
  return `First read ./skill/SKILL.md and use it as the task method. Complete this normal task in the current directory:

${options.task}

Available task resources:
${resources}

Expected task outputs:
${outputs}

Treat ./skill as immutable. When invoking Python code from it, suppress bytecode writes (for example, use python -B) so caches do not modify the package. Use the package instructions to decide whether a bundled program applies. If it explicitly reports not-applicable, continue the package's original workflow. If it fails, preserve the error and do not claim that invocation completed the task. Complete all remaining review or communication duties required by the task, check the final outputs, and do not ask a question.`
}

function sha256(bytes: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function contained(root: string, relative: string): string {
  const target = path.resolve(root, relative)
  if (!isWithin(root, target)) throw new Error(`General skill work path escapes run directory: ${relative}`)
  return target
}

async function ensureEmptyDirectory(directory: string): Promise<void> {
  try {
    const item = await lstat(directory)
    if (!item.isDirectory() || item.isSymbolicLink() || (await readdir(directory)).length > 0) {
      throw new Error(`Run directory must be a new empty non-symlink directory: ${directory}`)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    await mkdir(directory, { recursive: true })
  }
}

async function defaultAgentRunner(options: HeadlessAgentRunOptions): Promise<GeneralSkillAgentExecution> {
  const result = await runHeadlessAgent({ ...options, driver: "pi", throwOnError: false })
  const parsed = JSON.parse(result.rawStdout) as PiEvent[]
  if (!Array.isArray(parsed)) throw new Error("Pi headless output is not an event array")
  const record = piEventsToRunRecord(parsed).finish({
    workDir: options.cwd,
    durationMs: result.durationMs,
    ...(result.timedOut
      ? { runStatus: "timeout" as const }
      : result.exitCode === 0
        ? {}
        : { runStatus: "adapter-crashed" as const }),
  })
  const executionObservation = observePiExecution(parsed, {
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    timedOut: result.timedOut,
  })
  return { result, steps: record.steps, executionObservation }
}

async function readManifest(skillDir: string): Promise<OptimizedSkillPackageManifest | undefined> {
  try {
    const raw = await readFile(path.join(skillDir, OPTIMIZED_SKILL_PACKAGE_MANIFEST), "utf8")
    return OptimizedSkillPackageManifestSchema.parse(JSON.parse(raw))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  }
}

/** Run one natural development task against an exported package without naming its internal helper. */
export async function runGeneralSkillDevelopment(
  options: RunGeneralSkillDevelopmentOptions,
): Promise<GeneralSkillDevelopmentReport> {
  const skillDir = path.resolve(options.skillDir)
  const runDir = path.resolve(options.runDir)
  if (isWithin(skillDir, runDir) || isWithin(runDir, skillDir) || skillDir === runDir) {
    throw new Error("Skill package and development run directories must not overlap")
  }
  await ensureEmptyDirectory(runDir)
  const workDir = path.join(runDir, "work")
  await mkdir(workDir)
  const skillWorkDir = path.join(workDir, "skill")
  await cp(skillDir, skillWorkDir, { recursive: true, errorOnExist: true })
  const skillPackageBefore = await snapshotWorkdir(skillWorkDir)
  const manifest = await readManifest(skillDir)

  const protectedBefore = new Map<string, string>()
  const taskResourcePaths = new Set<string>()
  const protectedFixturePaths = new Set(options.protectedFixturePaths ?? [])
  for (const relative of protectedFixturePaths) {
    if (!(relative in (options.fixtures ?? {}))) {
      throw new Error(`Protected fixture path is not present in fixtures: ${relative}`)
    }
  }
  for (const [relative, content] of Object.entries(options.fixtures ?? {}).sort(([left], [right]) => left.localeCompare(right, "en"))) {
    if (relative === "skill" || relative.startsWith("skill/") || relative.startsWith("skill\\")) {
      throw new Error(`Task fixture must not overlap the skill package: ${relative}`)
    }
    const target = contained(workDir, relative)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content, { encoding: "utf8", flag: "wx" })
    taskResourcePaths.add(relative)
    if (protectedFixturePaths.has(relative)) {
      protectedBefore.set(relative, sha256(new Uint8Array(await Bun.file(target).arrayBuffer())))
    }
  }
  for (const resource of options.resources) {
    if (resource.workPath === "skill" || resource.workPath.startsWith("skill/") || resource.workPath.startsWith("skill\\")) {
      throw new Error(`Task resource must not overlap the skill package: ${resource.workPath}`)
    }
    if (taskResourcePaths.has(resource.workPath)) throw new Error(`Duplicate task resource path: ${resource.workPath}`)
    const target = contained(workDir, resource.workPath)
    await mkdir(path.dirname(target), { recursive: true })
    await copyFile(path.resolve(resource.sourcePath), target)
    taskResourcePaths.add(resource.workPath)
    if (resource.protected) {
      protectedBefore.set(resource.workPath, sha256(new Uint8Array(await Bun.file(target).arrayBuffer())))
    }
  }
  const initialWorkdirManifest = await writeInitialWorkdirManifest({
    workDir,
    manifestPath: path.join(runDir, "initial-workdir-manifest.json"),
  })
  const prompt = buildGeneralSkillTaskPrompt({
    task: options.task,
    resourcePaths: [...taskResourcePaths],
    expectedOutputPaths: options.expectedFiles.map((item) => item.path),
  })
  const runner = options.agentRunner ?? defaultAgentRunner
  const execution = await runner({
    cwd: workDir,
    prompt,
    model: options.model,
    driver: "pi",
    timeoutMs: options.timeoutMs ?? 600_000,
    throwOnError: false,
  })
  const agentEventsBytes = new TextEncoder().encode(execution.result.rawStdout)
  const compressedAgentEvents = gzipSync(agentEventsBytes, { level: 9 })
  await Bun.write(path.join(runDir, "agent-events.json.gz"), compressedAgentEvents)

  const expectedFiles: GeneralSkillDevelopmentReport["verification"]["expectedFiles"] = []
  for (const expected of options.expectedFiles) {
    const target = contained(workDir, expected.path)
    let bytes: Uint8Array | undefined
    try { bytes = new Uint8Array(await Bun.file(target).arrayBuffer()) } catch { /* missing is recorded below */ }
    const text = bytes ? new TextDecoder().decode(bytes) : ""
    expectedFiles.push({
      path: expected.path,
      exists: bytes !== undefined,
      includesPassed: bytes !== undefined && (expected.includes ?? []).every((fragment) => text.includes(fragment)),
      ...(bytes ? { bytes: bytes.byteLength, sha256: sha256(bytes) } : {}),
    })
  }
  const residualEvidenceFiles = await Promise.all((options.residualEvidenceFiles ?? []).map(async (relative) => ({
    path: relative,
    exists: await Bun.file(contained(workDir, relative)).exists(),
  })))
  let protectedResourcesPreserved = true
  for (const [relative, before] of protectedBefore) {
    try {
      const after = sha256(new Uint8Array(await Bun.file(contained(workDir, relative)).arrayBuffer()))
      if (after !== before) protectedResourcesPreserved = false
    } catch {
      protectedResourcesPreserved = false
    }
  }
  let skillPackagePreserved = false
  try {
    skillPackagePreserved = JSON.stringify(await snapshotWorkdir(skillWorkDir)) === JSON.stringify(skillPackageBefore)
  } catch {
    skillPackagePreserved = false
  }
  const taskPassed = execution.result.exitCode === 0
    && !execution.result.timedOut
    && skillPackagePreserved
    && protectedResourcesPreserved
    && expectedFiles.every((item) => item.exists && item.includesPassed)
  const selectedEntrypoints = (manifest?.implementations ?? [])
    .filter((item) => item.status === "selected" && item.entry)
    .map((item) => item.entry!)
  const documentationOnly = selectedEntrypoints.length === 0
  const residualWorkRequired = (manifest?.implementations ?? []).some((item) => item.residualDuties.length > 0)
  const residualWorkCompleted = !residualWorkRequired
    || (residualEvidenceFiles.length > 0 && residualEvidenceFiles.every((item) => item.exists))
  const consumption = analyzeSkillConsumption(execution.steps, {
    skillPaths: ["skill/SKILL.md", path.join(skillWorkDir, "SKILL.md")],
    executableEntries: selectedEntrypoints,
    documentationOnly,
    residualWorkRequired,
    residualWorkCompleted,
    taskOutcome: taskPassed ? "passed" : "failed",
  })
  const status = taskPassed && consumption.consumptionComplete ? "passed" : "failed"
  const report: GeneralSkillDevelopmentReport = {
    schemaVersion: "skill-ir-general-skill-development/v1",
    status,
    exposure: "development",
    prompt,
    package: {
      kind: manifest ? "optimized" : "source",
      path: skillDir,
      manifestIdentity: manifest?.identity
        ?? `source:${sha256(new TextEncoder().encode(JSON.stringify(skillPackageBefore)))}`,
      selectedEntrypoints,
    },
    runtime: {
      runDir,
      workDir,
      model: options.model,
      driver: execution.result.driver,
      exitCode: execution.result.exitCode,
      timedOut: execution.result.timedOut,
      durationMs: execution.result.durationMs,
      tokens: execution.result.tokens,
      executionObservation: execution.executionObservation ?? null,
      agentEvents: {
        path: "agent-events.json.gz",
        format: "gzip",
        bytes: compressedAgentEvents.byteLength,
        sha256: sha256(compressedAgentEvents),
        rawBytes: agentEventsBytes.byteLength,
        rawSha256: sha256(agentEventsBytes),
      },
      initialWorkdirManifest,
      reportedCostUsd: execution.result.cost,
      actualCostUsd: null,
      actualCostMissingReason: "No provider invoice or route-specific price binding was supplied to this development runner.",
    },
    consumption,
    verification: { taskPassed, skillPackagePreserved, protectedResourcesPreserved, expectedFiles, residualEvidenceFiles },
    claimBoundary: "One natural development task. Helper execution, final task checks and residual work are separate; this is not held-out, readiness, broad generalization or human-savings evidence.",
  }
  await Bun.write(path.join(runDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`)
  return report
}
