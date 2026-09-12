/**
 * Evidence construction helpers.
 *
 * Used by the loop runner (when running synthetic or real tasks) and by the
 * execution-log source (when parsing pre-existing conversation logs).
 */

import path from "node:path"
import { readdir } from "node:fs/promises"
import type { EvalResult, RunResult, AgentStep } from "../core/types.ts"
import type {
  EvidenceCriterion,
  WorkDirSnapshot,
  ConversationLogEntry,
  RunMeta,
  Evidence,
} from "./types.ts"
import { createLogger } from "../core/logger.ts"
import { adaptTraceFile } from "./trace-adapters.ts"

const log = createLogger("jit-optimize-evidence")

// ---------------------------------------------------------------------------
// Work directory snapshot
// ---------------------------------------------------------------------------

/**
 * Defaults for `snapshotWorkDir`'s capture caps. Historically these matched the
 * optimizer view's render cap exactly — one constant served both jobs. The
 * durable record now separates them: capture controls what the persistent
 * Evidence holds; the optimizer projection applies its own cap when rendering
 * `.optimize/tasks/*\/run-*-workdir/` (see workspace.ts).
 */
export const SNAPSHOT_CAPTURE_DEFAULTS = {
  maxTotalBytes: 512 * 1024,
  maxFileBytes: 64 * 1024,
} as const

export interface SnapshotCaptureOptions {
  /** Stop adding files once aggregate captured size reaches this. */
  maxTotalBytes?: number
  /** Skip individual files larger than this. */
  maxFileBytes?: number
}

/** Snapshot a work directory, skipping binary/hidden files and enforcing size limits. */
export async function snapshotWorkDir(
  workDir: string,
  opts: SnapshotCaptureOptions = {},
): Promise<WorkDirSnapshot> {
  const maxTotal = opts.maxTotalBytes ?? SNAPSHOT_CAPTURE_DEFAULTS.maxTotalBytes
  const maxFile = opts.maxFileBytes ?? SNAPSHOT_CAPTURE_DEFAULTS.maxFileBytes
  const files = new Map<string, string>()

  try {
    const entries = await readdir(workDir, { withFileTypes: true, recursive: true })
    let totalSize = 0

    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (totalSize >= maxTotal) break

      const fullPath = path.join(entry.parentPath ?? workDir, entry.name)
      const relPath = path.relative(workDir, fullPath)

      if (/\.(png|jpg|jpeg|gif|zip|tar|gz|bin|exe|pdf|wasm)$/i.test(entry.name)) continue
      if (relPath.startsWith(".") || relPath.includes("/.")) continue

      try {
        const content = await Bun.file(fullPath).text()
        if (content.length > maxFile) continue
        files.set(relPath, content)
        totalSize += content.length
      } catch {
        // skip unreadable
      }
    }
  } catch {
    // workDir might not exist
  }

  return { files }
}

// ---------------------------------------------------------------------------
// EvalResult → flattened EvidenceCriterion[]
// ---------------------------------------------------------------------------

/**
 * Flatten EvalResult[] into a per-leaf EvidenceCriterion[]. Rules:
 *
 * - custom/python-grade with N checkpoints → N entries (one per grade record)
 * - llm-judge / script / file-check → one entry (using the top-level result)
 *
 * Weights are computed as (outer_weight × inner_weight) and then normalized so
 * the resulting list sums to 1.0. Outer weights default to 1.0; inner weights
 * come from EvalCheckpoint.weight (enforced by the bridge to sum to 1.0 within
 * one parent). IDs are kept stable across rounds: `${parentId}/${leafId}` when
 * there's a parent id, else `${method}/${leafId}`.
 */
export function buildEvidenceCriteria(evalResults: EvalResult[]): EvidenceCriterion[] {
  interface RawLeaf {
    outerWeight: number
    innerWeight: number
    leaf: Omit<EvidenceCriterion, "weight">
  }
  const raw: RawLeaf[] = []

  for (const r of evalResults) {
    const outerWeight = r.criterion?.weight ?? 1
    const parentId = r.criterion?.id
    const parentName = r.criterion?.name
    const method = r.criterion?.method ?? "custom"

    if (r.checkpoints && r.checkpoints.length > 0) {
      const cpCount = r.checkpoints.length
      const anyInnerWeighted = r.checkpoints.some((cp) => cp.weight != null)
      for (const cp of r.checkpoints) {
        const innerWeight = cp.weight ?? (anyInnerWeighted ? 0 : 1 / cpCount)
        const leafId = parentId ? `${parentId}/${cp.name}` : `${method}/${cp.name}`
        const passed = cp.score >= 0.999
        raw.push({
          outerWeight,
          innerWeight,
          leaf: {
            id: leafId,
            name: cp.name,
            method,
            description: cp.description,
            score: cp.score,
            passed,
            details: passed ? undefined : cp.reason,
          },
        })
      }
    } else {
      const leafId = parentId ?? `${method}/${r.criterion?.name ?? "criterion"}`
      let description: string | undefined
      if (r.criterion?.method === "llm-judge") {
        description = typeof r.criterion.rubric === "string"
          ? r.criterion.rubric
          : JSON.stringify(r.criterion.rubric)
      } else if (r.criterion?.method === "script") {
        description = `script: ${r.criterion.command}`
      } else if (r.criterion?.method === "file-check") {
        description = `file-check ${r.criterion.mode}: ${r.criterion.path}`
      }
      raw.push({
        outerWeight,
        innerWeight: 1,
        leaf: {
          id: leafId,
          name: parentName,
          method,
          description,
          score: r.score,
          passed: r.pass,
          details: r.pass && r.score >= 0.999 ? undefined : r.details,
          infraError: r.infraError,
        },
      })
    }
  }

  const totalRaw = raw.reduce((s, x) => s + x.outerWeight * x.innerWeight, 0)
  if (totalRaw <= 0) return []
  return raw.map((x) => ({
    ...x.leaf,
    weight: (x.outerWeight * x.innerWeight) / totalRaw,
  }))
}

// ---------------------------------------------------------------------------
// Conversation log reading
// ---------------------------------------------------------------------------

export async function readConversationLog(
  filePath: string,
): Promise<ConversationLogEntry[] | null> {
  try {
    const content = await Bun.file(filePath).text()
    return content
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as ConversationLogEntry)
  } catch {
    return null
  }
}

/** Build a conversation log from an agent's RunResult.steps (fallback). */
export function buildConversationLogFromSteps(
  steps: AgentStep[],
  taskPrompt?: string,
): ConversationLogEntry[] {
  const entries: ConversationLogEntry[] = []
  if (taskPrompt) {
    entries.push({
      type: "request",
      ts: steps[0] ? new Date(steps[0].timestamp).toISOString() : new Date().toISOString(),
      text: taskPrompt,
    })
  }
  for (const step of steps) {
    entries.push({
      type: step.role === "assistant" ? "response" : "tool",
      ts: new Date(step.timestamp).toISOString(),
      text: step.text,
      toolCalls: step.toolCalls,
    })
  }
  return entries
}

// ---------------------------------------------------------------------------
// Conversation log file parsing (used by execution-log source)
// ---------------------------------------------------------------------------

export interface ParsedConvLogFile {
  conversationLog: ConversationLogEntry[]
  taskPrompt?: string
  /** Optional structured criteria if the log format happened to include them */
  criteria?: EvidenceCriterion[]
}

/**
 * Parse a conversation log file for use as evidence. Accepts:
 *  - JSONL conversation log (ConversationLog output: one object per line with `type`)
 *  - Simple JSON report: { task, outcome, issues, skill_feedback }
 */
export async function parseConvLogFile(filePath: string): Promise<ParsedConvLogFile> {
  const adapted = await adaptTraceFile(filePath)
  for (const item of adapted.diagnostics) {
    log.warn(`parseConvLogFile ${item.locator} [${item.code}]: ${item.message}`)
  }
  if (adapted.records.length > 1) {
    log.warn(`parseConvLogFile: ${filePath} contains ${adapted.records.length} records; returning the first for legacy callers`)
  }
  const first = adapted.records[0]
  return first
    ? { conversationLog: first.conversationLog, taskPrompt: first.taskPrompt, criteria: first.criteria }
    : { conversationLog: [] }
}

// ---------------------------------------------------------------------------
// Run metadata from RunResult
// ---------------------------------------------------------------------------

export function buildRunMeta(result: RunResult): RunMeta {
  return {
    tokens: result.tokens,
    costUsd: result.cost,
    durationMs: result.durationMs,
    adapterError: result.adapterError,
    skillLoaded: result.skillLoaded,
    runStatus: result.runStatus,
    ...(result.statusDetail ? { statusDetail: result.statusDetail } : {}),
  }
}

// ---------------------------------------------------------------------------
// Score helpers (engine-internal, not exposed to optimizer)
// ---------------------------------------------------------------------------

/**
 * Compute a weighted score from an Evidence's flattened criteria list.
 * EvidenceCriterion.weight values already sum to 1.0, so this is just Σ w·s.
 * Returns null if the criteria list is missing / empty.
 */
export function scoreFromCriteria(criteria: EvidenceCriterion[] | undefined): number | null {
  if (!criteria || criteria.length === 0) return null
  let total = 0
  for (const c of criteria) total += c.score * c.weight
  return total
}

/** Count passed and total criteria (engine-internal). */
export function countCriteria(criteria: EvidenceCriterion[] | undefined): { passed: number; total: number } {
  if (!criteria) return { passed: 0, total: 0 }
  return {
    passed: criteria.filter((c) => c.passed).length,
    total: criteria.length,
  }
}

// ---------------------------------------------------------------------------
// Convenience: build a full Evidence from a single task execution
// ---------------------------------------------------------------------------

export function buildEvidenceFromRun(opts: {
  taskId: string
  taskPrompt: string
  conversationLog: ConversationLogEntry[]
  workDirSnapshot: WorkDirSnapshot
  evalResults: EvalResult[]
  runResult: RunResult
}): Evidence {
  const criteria = buildEvidenceCriteria(opts.evalResults)
  return {
    taskId: opts.taskId,
    taskPrompt: opts.taskPrompt,
    conversationLog: opts.conversationLog,
    workDirSnapshot: opts.workDirSnapshot,
    criteria: criteria.length > 0 ? criteria : undefined,
    runMeta: buildRunMeta(opts.runResult),
  }
}
