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
import { buildEvidenceCriteria } from "./evidence-criteria.ts"

export { buildEvidenceCriteria } from "./evidence-criteria.ts"

const log = createLogger("jit-optimize-evidence")

/**
 * Capture limits control what persistent Evidence retains. The optimizer view
 * has separate rendering limits in workspace.ts; changing that view must not
 * silently discard captured evidence.
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

/** Read native conversation JSONL; return null for an unreadable or malformed file. */
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

export interface ParsedConvLogFile {
  conversationLog: ConversationLogEntry[]
  taskPrompt?: string
  /** Optional structured criteria if the log format happened to include them */
  criteria?: EvidenceCriterion[]
}

/**
 * Adapt any supported trace format for legacy single-record callers.
 * Diagnostics are logged; if the file contains multiple records, only the
 * first is returned. Use the trace adapter directly to retain all records.
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

// Scores stay internal to the engine; the optimizer receives the criteria.

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
