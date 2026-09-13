import path from "node:path"
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises"
import { z } from "zod"
import { boundedArtifactPathSegment, LOGS_DIR } from "../core/config.ts"
import { DurableRuntimeTrace } from "../core/durable-runtime-trace.ts"
import { ConversationLog } from "../core/conversation-logger.ts"
import { EvalResultSchema, type EvalResult, type RunResult } from "../core/types.ts"
import { InitialWorkdirManifestSchema, snapshotWorkdir } from "../core/workdir-manifest.ts"
import type { LoadedRunTask, LoadedSkill } from "./index.ts"
import { readPreRunInputSnapshot } from "./pre-run-input-snapshot.ts"

const ArtifactStatusSchema = z.enum(["pending", "complete", "partial", "failed"])
const ArtifactReferenceSchema = z.object({
  path: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  bytes: z.number().int().nonnegative().optional(),
}).strict()

const CaptureItemSchema = z.object({
  status: ArtifactStatusSchema,
  finalized: z.boolean().optional(),
  error: z.string().optional(),
}).strict()

const SafeObservedPathSchema = z.string().min(1).refine((value) => {
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes("\\")) return false
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
}, "path must be a safe POSIX relative path")

const ObservedWorkdirFileSchema = z.object({
  path: SafeObservedPathSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().nonnegative(),
  content: z.string().optional(),
}).strict()

export const ObservedWorkdirSnapshotSchema = z.object({
  schemaVersion: z.literal("skvm-observed-workdir-snapshot/v1"),
  files: z.array(ObservedWorkdirFileSchema),
  deleted: z.array(z.object({
    path: SafeObservedPathSchema,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict()),
  contentOmissions: z.array(z.object({
    path: SafeObservedPathSchema,
    reason: z.enum(["binary", "file-too-large", "total-cap-exceeded", "unreadable"]),
  }).strict()),
}).strict().superRefine((value, context) => {
  for (const [label, paths] of [
    ["files", value.files.map((entry) => entry.path)],
    ["deleted", value.deleted.map((entry) => entry.path)],
    ["contentOmissions", value.contentOmissions.map((entry) => entry.path)],
  ] as const) {
    if (new Set(paths).size !== paths.length) {
      context.addIssue({ code: "custom", message: `${label} paths must be unique` })
    }
    const sorted = [...paths].sort((left, right) => left.localeCompare(right, "en"))
    if (paths.some((entry, index) => entry !== sorted[index])) {
      context.addIssue({ code: "custom", message: `${label} paths must be sorted` })
    }
  }
})

export type ObservedWorkdirSnapshot = z.infer<typeof ObservedWorkdirSnapshotSchema>

export const CapturedSourceEvaluationSchema = z.object({
  schemaVersion: z.literal("skvm-captured-source-evaluation/v1"),
  results: z.array(EvalResultSchema),
  skipped: z.array(z.object({ criterionId: z.string(), reason: z.string() }).strict()),
  errors: z.array(z.object({ criterionId: z.string(), error: z.string() }).strict()),
}).strict()

export type CapturedSourceEvaluation = z.infer<typeof CapturedSourceEvaluationSchema>

export const OptimizationSessionStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not-requested") }).strict(),
  z.object({ status: z.literal("pending") }).strict(),
  z.object({
    status: z.literal("optimizer-running"),
    optimizerModel: z.string(),
    startedAt: z.string(),
    evidenceManifestPath: z.string().optional(),
    evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  }).strict(),
  z.object({
    status: z.literal("proposal-ready"),
    optimizerModel: z.string(),
    proposalId: z.string(),
    proposalDir: z.string(),
    evidenceManifestPath: z.string().optional(),
    evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  }).strict(),
  z.object({
    status: z.literal("package-exporting"),
    optimizerModel: z.string(),
    proposalId: z.string(),
    proposalDir: z.string(),
    packageDir: z.string(),
    evidenceManifestPath: z.string().optional(),
    evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  }).strict(),
  z.object({
    status: z.literal("completed"),
    optimizerModel: z.string(),
    proposalId: z.string(),
    proposalDir: z.string(),
    packageDir: z.string(),
    completedAt: z.string(),
    evidenceManifestPath: z.string().optional(),
    evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  }).strict(),
  z.object({
    status: z.literal("no-change"),
    optimizerModel: z.string(),
    proposalId: z.string(),
    proposalDir: z.string(),
    completedAt: z.string(),
    evidenceManifestPath: z.string().optional(),
    evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  }).strict(),
  z.object({
    status: z.literal("failed"),
    phase: z.enum(["optimizer", "package", "capture"]),
    error: z.string(),
    optimizerModel: z.string().optional(),
    proposalId: z.string().optional(),
    proposalDir: z.string().optional(),
    packageDir: z.string().optional(),
    evidenceManifestPath: z.string().optional(),
    evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    failedAt: z.string(),
  }).strict(),
])

export type OptimizationSessionState = z.infer<typeof OptimizationSessionStateSchema>

export const OptimizationSessionManifestSchema = z.object({
  schemaVersion: z.literal("skvm-run-optimization-session/v1"),
  runId: z.string(),
  startedAt: z.string(),
  updatedAt: z.string(),
  binding: z.object({
    taskId: z.string(),
    skillId: z.string().optional(),
    selectedSkillPath: z.string(),
    selectedTaskPath: z.string(),
    workDir: z.string(),
    adapter: z.string(),
    model: z.string(),
    skillSha256: z.string().regex(/^[a-f0-9]{64}$/),
    promptSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  artifacts: z.object({
    manifest: ArtifactReferenceSchema,
    skillSnapshot: ArtifactReferenceSchema,
    taskSnapshot: ArtifactReferenceSchema,
    conversationTrace: ArtifactReferenceSchema,
    durableTrace: ArtifactReferenceSchema,
    runResult: ArtifactReferenceSchema,
    initialWorkdirManifest: ArtifactReferenceSchema,
    preRunInputSnapshot: ArtifactReferenceSchema.optional(),
    observedWorkdirSnapshot: ArtifactReferenceSchema.optional(),
    sourceEvaluation: ArtifactReferenceSchema.optional(),
  }).strict(),
  sourceRun: z.object({
    status: z.enum(["running", "completed", "failed", "interrupted"]),
    runStatus: z.enum(["ok", "timeout", "adapter-crashed", "parse-failed", "tainted"]).optional(),
    failureKind: z.enum(["timeout", "adapter-error", "provider-error", "interrupted", "capture-error"]).optional(),
    error: z.string().optional(),
  }).strict(),
  capture: z.object({
    status: ArtifactStatusSchema,
    conversation: CaptureItemSchema,
    durable: CaptureItemSchema,
    runResult: CaptureItemSchema,
    sourceInputs: CaptureItemSchema.optional(),
    observedOutputs: CaptureItemSchema.optional(),
    sourceEvaluation: CaptureItemSchema.optional(),
  }).strict(),
  handoff: z.object({
    status: z.enum(["pending", "ready", "blocked"]),
    reason: z.string().optional(),
  }).strict(),
  optimization: OptimizationSessionStateSchema.optional(),
}).strict()

export type OptimizationSessionManifest = z.infer<typeof OptimizationSessionManifestSchema>

export interface StartOptimizationSessionOptions {
  runId: string
  rootDir?: string
  skill: LoadedSkill
  task: LoadedRunTask
  workDir: string
  adapter: string
  model: string
  optimizationRequested?: boolean
}

export type OptimizationSessionFailureKind = "provider-error" | "interrupted" | "capture-error"

function sha256(value: string | Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
}

async function reference(filePath: string): Promise<z.infer<typeof ArtifactReferenceSchema>> {
  const bytes = await Bun.file(filePath).bytes()
  return { path: filePath, sha256: sha256(bytes), bytes: bytes.byteLength }
}

async function atomicJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${crypto.randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8")
  await rename(temporary, filePath)
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile()
  } catch {
    return false
  }
}

const OBSERVED_OUTPUT_MAX_TOTAL_BYTES = 512 * 1024
const OBSERVED_OUTPUT_MAX_FILE_BYTES = 64 * 1024

async function captureObservedWorkdirSnapshot(input: {
  workDir: string
  initialManifestPath: string
  skillSnapshotPath: string
  outputPath: string
}): Promise<void> {
  const initial = InitialWorkdirManifestSchema.parse(JSON.parse(await Bun.file(input.initialManifestPath).text()))
  const current = await snapshotWorkdir(input.workDir, { excludedPrefixes: [".skvm"] })
  const skillRoot = path.dirname(input.skillSnapshotPath)
  const skillEntries = await snapshotWorkdir(skillRoot)
  const initialByPath = new Map(initial.entries.map((entry) => [entry.path, entry]))
  const currentByPath = new Map(current.map((entry) => [entry.path, entry]))
  const skillByPath = new Map(skillEntries.map((entry) => [entry.path, entry]))
  const files: ObservedWorkdirSnapshot["files"] = []
  const contentOmissions: ObservedWorkdirSnapshot["contentOmissions"] = []
  let capturedBytes = 0

  for (const entry of current) {
    if (entry.type !== "file") continue
    const initialEntry = initialByPath.get(entry.path)
    if (initialEntry?.type === "file" && initialEntry.sha256 === entry.sha256) continue
    const skillEntry = skillByPath.get(entry.path)
    if (!initialEntry && skillEntry?.type === "file" && skillEntry.sha256 === entry.sha256) continue

    const absolute = path.join(input.workDir, ...entry.path.split("/"))
    const file = { path: entry.path, sha256: entry.sha256, bytes: 0, content: undefined as string | undefined }
    try {
      const bytes = await readFile(absolute)
      file.bytes = bytes.byteLength
      if (bytes.byteLength > OBSERVED_OUTPUT_MAX_FILE_BYTES) {
        contentOmissions.push({ path: entry.path, reason: "file-too-large" })
      } else if (capturedBytes + bytes.byteLength > OBSERVED_OUTPUT_MAX_TOTAL_BYTES) {
        contentOmissions.push({ path: entry.path, reason: "total-cap-exceeded" })
      } else {
        try {
          file.content = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
          capturedBytes += bytes.byteLength
        } catch {
          contentOmissions.push({ path: entry.path, reason: "binary" })
        }
      }
    } catch {
      contentOmissions.push({ path: entry.path, reason: "unreadable" })
    }
    files.push(file)
  }

  const deleted = initial.entries
    .filter((entry): entry is Extract<(typeof initial.entries)[number], { type: "file" }> => (
      entry.type === "file" && !currentByPath.has(entry.path)
    ))
    .map((entry) => ({ path: entry.path, sha256: entry.sha256 }))
    .sort((left, right) => left.path.localeCompare(right.path, "en"))
  files.sort((left, right) => left.path.localeCompare(right.path, "en"))
  contentOmissions.sort((left, right) => left.path.localeCompare(right.path, "en"))
  await atomicJson(input.outputPath, ObservedWorkdirSnapshotSchema.parse({
    schemaVersion: "skvm-observed-workdir-snapshot/v1",
    files,
    deleted,
    contentOmissions,
  }))
}

async function copyOptionalDirectory(sourceDir: string, destinationDir: string): Promise<void> {
  let entries
  try {
    entries = await readdir(sourceDir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const source = path.join(sourceDir, entry.name)
    const destination = path.join(destinationDir, entry.name)
    if (entry.isDirectory()) {
      await mkdir(destination, { recursive: true })
      await copyOptionalDirectory(source, destination)
    } else if (entry.isFile()) {
      await mkdir(path.dirname(destination), { recursive: true })
      await copyFile(source, destination)
    }
  }
}

async function snapshotSkill(skill: LoadedSkill, destinationDir: string): Promise<string> {
  await mkdir(destinationDir, { recursive: true })
  await copyFile(skill.skillPath, path.join(destinationDir, "SKILL.md"))
  for (const relative of skill.bundleFiles) {
    const destination = path.join(destinationDir, relative)
    await mkdir(path.dirname(destination), { recursive: true })
    await copyFile(path.join(skill.skillDir, relative), destination)
  }
  const parts: string[] = []
  for (const relative of ["SKILL.md", ...skill.bundleFiles].sort()) {
    const bytes = await Bun.file(path.join(destinationDir, relative)).bytes()
    parts.push(`${relative}\0${sha256(bytes)}`)
  }
  return sha256(parts.join("\n"))
}

async function snapshotTask(task: LoadedRunTask, destinationDir: string): Promise<string> {
  await mkdir(destinationDir, { recursive: true })
  const taskPath = path.join(destinationDir, "task.json")
  await atomicJson(taskPath, {
    id: task.id,
    ...(task.name ? { name: task.name } : {}),
    prompt: task.prompt,
    ...(task.fixtures ? { fixtures: task.fixtures } : {}),
    eval: task.eval,
    timeoutMs: task.timeoutMs,
    maxSteps: task.maxSteps,
    ...(task.category ? { category: task.category } : {}),
    ...(task.gradingType ? { gradingType: task.gradingType } : {}),
    ...(task.gradingWeights ? { gradingWeights: task.gradingWeights } : {}),
  })
  if (task.taskDir) {
    await copyOptionalDirectory(path.join(task.taskDir, "fixtures"), path.join(destinationDir, "fixtures"))
  }
  return taskPath
}

async function inspectConversation(filePath: string): Promise<z.infer<typeof CaptureItemSchema>> {
  if (!await fileExists(filePath)) return { status: "failed", error: "conversation trace is missing or unreadable" }
  try {
    const lines = (await Bun.file(filePath).text()).split(/\r?\n/).filter((line) => line.trim())
    if (lines.length === 0) throw new Error("conversation trace is empty")
    for (const line of lines) JSON.parse(line)
    return { status: "complete" }
  } catch (error) {
    return { status: "failed", error: `conversation trace is unreadable: ${error instanceof Error ? error.message : String(error)}` }
  }
}

async function inspectDurable(filePath: string): Promise<z.infer<typeof CaptureItemSchema>> {
  if (!await fileExists(filePath)) return { status: "failed", finalized: false, error: "durable trace is missing" }
  try {
    const events = (await Bun.file(filePath).text()).split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line))
    const finalized = events.some((event) => event?.event === "finalize")
    return finalized
      ? { status: "complete", finalized: true }
      : { status: "partial", finalized: false, error: "durable trace has no terminal finalize event" }
  } catch (error) {
    return { status: "failed", finalized: false, error: `durable trace is unreadable: ${error instanceof Error ? error.message : String(error)}` }
  }
}

function overallCapture(items: Array<z.infer<typeof CaptureItemSchema>>): z.infer<typeof ArtifactStatusSchema> {
  if (items.every((item) => item.status === "complete")) return "complete"
  if (items.some((item) => item.status === "complete" || item.status === "partial")) return "partial"
  return "failed"
}

function assertRunId(runId: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.+_-]{0,159}$/.test(runId) || runId === "." || runId === "..") {
    throw new Error(`Invalid optimization run id: ${runId}`)
  }
}

export class OptimizationSession {
  readonly manifestPath: string
  readonly conversationTracePath: string
  readonly durableTracePath: string
  readonly runResultPath: string
  readonly initialWorkdirManifestPath: string
  readonly preRunInputSnapshotPath: string
  readonly observedWorkdirSnapshotPath: string
  readonly sourceEvaluationPath: string
  readonly runtimeTrace: DurableRuntimeTrace
  readonly conversationLog: ConversationLog

  private constructor(
    private manifest: OptimizationSessionManifest,
    runtimeTrace: DurableRuntimeTrace,
  ) {
    this.manifestPath = manifest.artifacts.manifest.path
    this.conversationTracePath = manifest.artifacts.conversationTrace.path
    this.durableTracePath = manifest.artifacts.durableTrace.path
    this.runResultPath = manifest.artifacts.runResult.path
    this.initialWorkdirManifestPath = manifest.artifacts.initialWorkdirManifest.path
    this.preRunInputSnapshotPath = manifest.artifacts.preRunInputSnapshot?.path
      ?? path.join(path.dirname(this.manifestPath), "source-inputs", "manifest.json")
    this.observedWorkdirSnapshotPath = manifest.artifacts.observedWorkdirSnapshot?.path
      ?? path.join(path.dirname(this.manifestPath), "observed-workdir-snapshot.json")
    this.sourceEvaluationPath = manifest.artifacts.sourceEvaluation?.path
      ?? path.join(path.dirname(this.manifestPath), "source-evaluation.json")
    this.runtimeTrace = runtimeTrace
    this.conversationLog = new ConversationLog(this.conversationTracePath)
  }

  static async start(options: StartOptimizationSessionOptions): Promise<OptimizationSession> {
    assertRunId(options.runId)
    const sessionDir = path.join(
      path.resolve(options.rootDir ?? path.join(LOGS_DIR, "run-optimize")),
      boundedArtifactPathSegment(options.runId),
    )
    const manifestPath = path.join(sessionDir, "optimization-session.json")
    if (await fileExists(manifestPath)) throw new Error(`Optimization session already exists: ${options.runId}`)
    await mkdir(sessionDir, { recursive: true })
    const skillSnapshotDir = path.join(sessionDir, "skill")
    const taskSnapshotDir = path.join(sessionDir, "task")
    const skillSha256 = await snapshotSkill(options.skill, skillSnapshotDir)
    const taskSnapshotPath = await snapshotTask(options.task, taskSnapshotDir)
    const conversationTracePath = path.join(sessionDir, "conversation.jsonl")
    const durableTracePath = path.join(sessionDir, "runtime-trace.jsonl")
    const runResultPath = path.join(sessionDir, "run-result.json")
    const initialWorkdirManifestPath = path.join(sessionDir, "initial-workdir-manifest.json")
    const preRunInputSnapshotPath = path.join(sessionDir, "source-inputs", "manifest.json")
    const observedWorkdirSnapshotPath = path.join(sessionDir, "observed-workdir-snapshot.json")
    const sourceEvaluationPath = path.join(sessionDir, "source-evaluation.json")
    const startedAt = new Date().toISOString()
    const runtimeTrace = new DurableRuntimeTrace(durableTracePath)
    const manifest: OptimizationSessionManifest = {
      schemaVersion: "skvm-run-optimization-session/v1",
      runId: options.runId,
      startedAt,
      updatedAt: startedAt,
      binding: {
        taskId: options.task.id,
        skillId: options.skill.skillId,
        selectedSkillPath: options.skill.skillPath,
        selectedTaskPath: options.task.taskPath,
        workDir: path.resolve(options.workDir),
        adapter: options.adapter,
        model: options.model,
        skillSha256,
        promptSha256: sha256(options.task.prompt),
      },
      artifacts: {
        manifest: { path: manifestPath },
        skillSnapshot: { path: path.join(skillSnapshotDir, "SKILL.md"), sha256: skillSha256 },
        taskSnapshot: await reference(taskSnapshotPath),
        conversationTrace: { path: conversationTracePath },
        durableTrace: { path: durableTracePath },
        runResult: { path: runResultPath },
        initialWorkdirManifest: { path: initialWorkdirManifestPath },
        ...(options.optimizationRequested ? { preRunInputSnapshot: { path: preRunInputSnapshotPath } } : {}),
        observedWorkdirSnapshot: { path: observedWorkdirSnapshotPath },
        ...(options.task.eval.length > 0 ? { sourceEvaluation: { path: sourceEvaluationPath } } : {}),
      },
      sourceRun: { status: "running" },
      capture: {
        status: "pending",
        conversation: { status: "pending" },
        durable: { status: "pending", finalized: false },
        runResult: { status: "pending" },
        ...(options.optimizationRequested ? { sourceInputs: { status: "pending" as const } } : {}),
      },
      handoff: { status: "pending" },
      optimization: options.optimizationRequested ? { status: "pending" } : { status: "not-requested" },
    }
    try {
      await atomicJson(manifestPath, manifest)
    } catch (error) {
      runtimeTrace.abandon()
      throw error
    }
    return new OptimizationSession(manifest, runtimeTrace)
  }

  async complete(
    result: RunResult,
    options?: { sourceEvaluation?: CapturedSourceEvaluation },
  ): Promise<OptimizationSessionManifest> {
    await atomicJson(this.runResultPath, result)
    if (options?.sourceEvaluation) {
      await atomicJson(
        this.sourceEvaluationPath,
        CapturedSourceEvaluationSchema.parse(options.sourceEvaluation),
      )
    }
    const conversation = await inspectConversation(this.conversationTracePath)
    const durable = await inspectDurable(this.durableTracePath)
    const runResult = { status: "complete" as const }
    let sourceInputs: z.infer<typeof CaptureItemSchema> | undefined
    let observedOutputs: z.infer<typeof CaptureItemSchema> | undefined
    let sourceEvaluation: z.infer<typeof CaptureItemSchema> | undefined
    if (this.manifest.optimization?.status !== "not-requested") {
      try {
        InitialWorkdirManifestSchema.parse(JSON.parse(await Bun.file(this.initialWorkdirManifestPath).text()))
        const preRunInputSnapshotReference = await reference(this.preRunInputSnapshotPath)
        await readPreRunInputSnapshot({
          path: preRunInputSnapshotReference.path,
          sha256: preRunInputSnapshotReference.sha256!,
          bytes: preRunInputSnapshotReference.bytes!,
        })
        sourceInputs = { status: "complete" }
      } catch (error) {
        sourceInputs = { status: "failed", error: `initial source-input manifest or pre-run content snapshot is missing or unreadable: ${error instanceof Error ? error.message : String(error)}` }
      }
      try {
        await captureObservedWorkdirSnapshot({
          workDir: this.manifest.binding.workDir,
          initialManifestPath: this.initialWorkdirManifestPath,
          skillSnapshotPath: this.manifest.artifacts.skillSnapshot.path,
          outputPath: this.observedWorkdirSnapshotPath,
        })
        observedOutputs = { status: "complete" }
      } catch (error) {
        observedOutputs = { status: "failed", error: `observed output snapshot failed: ${error instanceof Error ? error.message : String(error)}` }
      }
      if (options?.sourceEvaluation) {
        sourceEvaluation = options.sourceEvaluation.errors.length > 0 || options.sourceEvaluation.skipped.length > 0
          ? {
              status: "partial",
              error: `${options.sourceEvaluation.errors.length} local evaluation error(s), ${options.sourceEvaluation.skipped.length} skipped criterion/criteria`,
            }
          : { status: "complete" }
      }
    }
    const captureStatus = overallCapture([
      conversation,
      durable,
      runResult,
      ...(sourceInputs ? [sourceInputs] : []),
      ...(observedOutputs ? [observedOutputs] : []),
    ])
    const sourceCompleted = result.runStatus === "ok"
    const reason = !sourceCompleted
      ? `source run ended with ${result.runStatus}`
      : captureStatus !== "complete"
        ? `automatic optimization requires complete source inputs, observed outputs, conversation and durable trace; sourceInputs=${sourceInputs?.status ?? "not-required"}, observedOutputs=${observedOutputs?.status ?? "not-required"}, conversation=${conversation.status}, durable=${durable.status}`
        : undefined
    const optimization = reason && this.manifest.optimization?.status === "pending"
      ? {
          status: "failed" as const,
          phase: "capture" as const,
          error: reason,
          failedAt: new Date().toISOString(),
        }
      : this.manifest.optimization
    this.manifest = {
      ...this.manifest,
      updatedAt: new Date().toISOString(),
      artifacts: {
        ...this.manifest.artifacts,
        conversationTrace: await fileExists(this.conversationTracePath)
          ? await reference(this.conversationTracePath)
          : this.manifest.artifacts.conversationTrace,
        durableTrace: await reference(this.durableTracePath),
        runResult: await reference(this.runResultPath),
        initialWorkdirManifest: await fileExists(this.initialWorkdirManifestPath)
          ? await reference(this.initialWorkdirManifestPath)
          : this.manifest.artifacts.initialWorkdirManifest,
        preRunInputSnapshot: await fileExists(this.preRunInputSnapshotPath)
          ? await reference(this.preRunInputSnapshotPath)
          : this.manifest.artifacts.preRunInputSnapshot,
        observedWorkdirSnapshot: await fileExists(this.observedWorkdirSnapshotPath)
          ? await reference(this.observedWorkdirSnapshotPath)
          : this.manifest.artifacts.observedWorkdirSnapshot,
        sourceEvaluation: await fileExists(this.sourceEvaluationPath)
          ? await reference(this.sourceEvaluationPath)
          : this.manifest.artifacts.sourceEvaluation,
      },
      sourceRun: sourceCompleted
        ? { status: "completed", runStatus: result.runStatus }
        : {
            status: "failed",
            runStatus: result.runStatus,
            failureKind: result.runStatus === "timeout" ? "timeout" : "adapter-error",
            ...(result.statusDetail ? { error: result.statusDetail } : {}),
          },
      capture: {
        status: captureStatus,
        conversation,
        durable,
        runResult,
        ...(sourceInputs ? { sourceInputs } : {}),
        ...(observedOutputs ? { observedOutputs } : {}),
        ...(sourceEvaluation ? { sourceEvaluation } : {}),
      },
      handoff: reason ? { status: "blocked", reason } : { status: "ready" },
      ...(optimization ? { optimization } : {}),
    }
    await atomicJson(this.manifestPath, this.manifest)
    return this.manifest
  }

  async fail(kind: OptimizationSessionFailureKind, message: string): Promise<OptimizationSessionManifest> {
    this.runtimeTrace.abandon()
    const conversation = await inspectConversation(this.conversationTracePath)
    const durable = await inspectDurable(this.durableTracePath)
    const runResult = { status: "failed" as const, error: "source run did not return a RunResult" }
    const sourceInputs = this.manifest.optimization?.status !== "not-requested"
      ? { status: "failed" as const, error: "source run did not complete input capture" }
      : undefined
    const observedOutputs = this.manifest.optimization?.status !== "not-requested"
      ? { status: "failed" as const, error: "source run did not complete output capture" }
      : undefined
    const optimization = this.manifest.optimization?.status === "pending"
      ? {
          status: "failed" as const,
          phase: "capture" as const,
          error: `${kind}: ${message}`,
          failedAt: new Date().toISOString(),
        }
      : this.manifest.optimization
    this.manifest = {
      ...this.manifest,
      updatedAt: new Date().toISOString(),
      artifacts: {
        ...this.manifest.artifacts,
        conversationTrace: await fileExists(this.conversationTracePath)
          ? await reference(this.conversationTracePath)
          : this.manifest.artifacts.conversationTrace,
        durableTrace: await reference(this.durableTracePath),
      },
      sourceRun: {
        status: kind === "interrupted" ? "interrupted" : "failed",
        failureKind: kind,
        error: message,
      },
      capture: {
        status: overallCapture([
          conversation,
          durable,
          runResult,
          ...(sourceInputs ? [sourceInputs] : []),
          ...(observedOutputs ? [observedOutputs] : []),
        ]),
        conversation,
        durable,
        runResult,
        ...(sourceInputs ? { sourceInputs } : {}),
        ...(observedOutputs ? { observedOutputs } : {}),
      },
      handoff: { status: "blocked", reason: `${kind}: ${message}` },
      ...(optimization ? { optimization } : {}),
    }
    await atomicJson(this.manifestPath, this.manifest)
    return this.manifest
  }
}

export async function readOptimizationSession(manifestPath: string): Promise<OptimizationSessionManifest> {
  const parsed = JSON.parse(await Bun.file(path.resolve(manifestPath)).text())
  return OptimizationSessionManifestSchema.parse(parsed)
}

export async function transitionOptimizationSession(
  manifestPath: string,
  expectedStatuses: readonly OptimizationSessionState["status"][],
  next: OptimizationSessionState,
): Promise<OptimizationSessionManifest> {
  const resolved = path.resolve(manifestPath)
  const current = await readOptimizationSession(resolved)
  const status = current.optimization?.status ?? "not-requested"
  if (!expectedStatuses.includes(status)) {
    throw new Error(`Optimization session transition expected ${expectedStatuses.join("|")}, got ${status}`)
  }
  const updated: OptimizationSessionManifest = {
    ...current,
    updatedAt: new Date().toISOString(),
    optimization: OptimizationSessionStateSchema.parse(next),
  }
  await atomicJson(resolved, updated)
  return updated
}

export async function freezeOptimizationEvidenceManifest(manifestPath: string): Promise<{
  path: string
  sha256: string
}> {
  const sourcePath = path.resolve(manifestPath)
  const destination = path.join(path.dirname(sourcePath), "optimization-evidence.json")
  if (await fileExists(destination)) {
    const frozen = await readOptimizationSession(destination)
    const current = await readOptimizationSession(sourcePath)
    if (frozen.runId !== current.runId || path.resolve(frozen.artifacts.manifest.path) !== destination) {
      throw new Error("Existing optimization evidence manifest does not belong to this run")
    }
    return { path: destination, sha256: (await reference(destination)).sha256! }
  }
  const current = await readOptimizationSession(sourcePath)
  if (current.handoff.status !== "ready") {
    throw new Error(`Cannot freeze optimizer evidence while handoff is ${current.handoff.status}`)
  }
  const frozen: OptimizationSessionManifest = {
    ...current,
    artifacts: {
      ...current.artifacts,
      manifest: { path: destination },
    },
  }
  await atomicJson(destination, frozen)
  return { path: destination, sha256: (await reference(destination)).sha256! }
}
