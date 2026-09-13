/**
 * JIT-Optimize types.
 *
 * Design: task source × loop × delivery. Evidence is a unified schema fed to
 * the optimizer regardless of source — fields are "fill what you have".
 */

import { z } from "zod"
import type { AdapterConfig, EvalResult, EvalCriterion, TokenUsage, RunStatus, SkillMode } from "../core/types.ts"
import { addTokenUsage, TokenUsageSchema, RunStatusSchema } from "../core/types.ts"
import type { LLMProvider } from "../providers/types.ts"
import type { AgentAdapter } from "../core/types.ts"
import type { AdapterName } from "../adapters/registry.ts"
import type { PreRunInputSnapshotReference } from "../run/pre-run-input-snapshot.ts"

// ---------------------------------------------------------------------------
// Conversation log entry (from ConversationLog JSONL)
// ---------------------------------------------------------------------------

export interface ConversationLogEntry {
  type: "request" | "response" | "tool"
  ts: string
  [key: string]: unknown
}

export const ConversationLogEntrySchema = z
  .object({
    type: z.enum(["request", "response", "tool"]),
    ts: z.string(),
  })
  .passthrough()

export type TraceRepresentation =
  | "conversation-trace"
  | "run-summary"
  | "runtime-event-trace"
  | "simple-report"

export interface TraceDiagnostic {
  code: string
  severity: "warning" | "error"
  message: string
  locator: string
}

export interface TraceUsage {
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  costUsd?: number
  source: string
}

/** Source binding retained when an external execution trace becomes Evidence. */
export interface TraceEvidenceSource {
  format: string
  representation: TraceRepresentation
  sourcePath: string
  inputSha256: string
  recordLocator: string
  taskIdSource: "source" | "file-basename"
  sourceAgent?: string
  adapter?: string
  adapterVersion?: string
  model?: string
  system?: string
  taskPath?: string
  skillPath?: string
  workDirPath?: string
  runIndex?: number
  runStatus?: string
  durationMs?: number
  usage?: TraceUsage
  unknownFields: string[]
  diagnostics: TraceDiagnostic[]
}

export const TraceDiagnosticSchema = z.object({
  code: z.string(),
  severity: z.enum(["warning", "error"]),
  message: z.string(),
  locator: z.string(),
})

export const TraceEvidenceSourceSchema = z.object({
  format: z.string(),
  representation: z.enum(["conversation-trace", "run-summary", "runtime-event-trace", "simple-report"]),
  sourcePath: z.string(),
  inputSha256: z.string(),
  recordLocator: z.string(),
  taskIdSource: z.enum(["source", "file-basename"]),
  sourceAgent: z.string().optional(),
  adapter: z.string().optional(),
  adapterVersion: z.string().optional(),
  model: z.string().optional(),
  system: z.string().optional(),
  taskPath: z.string().optional(),
  skillPath: z.string().optional(),
  workDirPath: z.string().optional(),
  runIndex: z.number().int().optional(),
  runStatus: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  usage: z.object({
    inputTokens: z.number().nonnegative().optional(),
    outputTokens: z.number().nonnegative().optional(),
    cacheReadTokens: z.number().nonnegative().optional(),
    cacheWriteTokens: z.number().nonnegative().optional(),
    costUsd: z.number().nonnegative().optional(),
    source: z.string(),
  }).optional(),
  unknownFields: z.array(z.string()),
  diagnostics: z.array(TraceDiagnosticSchema),
})

/** A digest-bound source resource kept outside the user's live workdir. */
export interface EvidenceInputResources {
  preRun?: {
    source: "pre-run-input-snapshot"
    reference: PreRunInputSnapshotReference
  }
}

const PreRunInputSnapshotReferenceSchema = z.object({
  path: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().nonnegative(),
}).strict()

export const EvidenceInputResourcesSchema = z.object({
  preRun: z.object({
    source: z.literal("pre-run-input-snapshot"),
    reference: PreRunInputSnapshotReferenceSchema,
  }).strict().optional(),
}).strict()

// ---------------------------------------------------------------------------
// Work directory snapshot
// ---------------------------------------------------------------------------

export interface WorkDirSnapshot {
  /** File path (relative to workDir) → content */
  files: Map<string, string>
}

// ---------------------------------------------------------------------------
// Evidence criterion (fully flattened leaf-level criterion)
//
// One EvidenceCriterion per leaf: a custom eval with N sub-records produces N
// entries, an llm-judge with a single rubric produces one, a script/file-check
// produces one. The optimizer consumes this flat list — no nested checkpoints.
// ---------------------------------------------------------------------------

export interface EvidenceCriterion {
  /** Unique identifier within a single Evidence; synthesised when the upstream source didn't provide one. */
  id: string
  /** Human-readable label (falls back to id if the source didn't set one). */
  name?: string
  /** Which top-level eval method this leaf came from. */
  method: "script" | "file-check" | "llm-judge" | "custom"
  /** What this criterion tests (authored in grade.py / task.json). */
  description?: string
  /**
   * Effective weight after flattening (outer_weight × inner_weight / total).
   * All EvidenceCriterion.weight values for a single Evidence sum to 1.0.
   */
  weight: number
  /** Normalized score in [0, 1]. */
  score: number
  /** Whether this leaf is considered "passing" by the upstream evaluator. */
  passed: boolean
  /** Why it did not reach 1.0; omitted when score == 1.0. */
  details?: string
  /**
   * Set when this criterion could not actually run because of an infra
   * failure (provider down, auth, headless-agent crash). Downstream
   * aggregators (avgScore, round-abort check) MUST exclude criteria
   * that carry this field — their score/passed are meaningless.
   */
  infraError?: string
}

export const EvidenceCriterionSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  method: z.enum(["script", "file-check", "llm-judge", "custom"]),
  description: z.string().optional(),
  weight: z.number(),
  score: z.number(),
  passed: z.boolean(),
  details: z.string().optional(),
  infraError: z.string().optional(),
})

// ---------------------------------------------------------------------------
// Cost slice (shared shape for every LLM call bucket)
// ---------------------------------------------------------------------------

/**
 * Aggregated token usage and USD cost for a group of LLM calls.
 * Used for per-bucket accounting (target agent, eval judge, optimizer, task gen).
 */
export interface CostSlice {
  tokens: TokenUsage
  /** USD cost. May be 0 if cost was not reported by the backend or if the model is missing from the pricing table. */
  costUsd: number
}

export function emptyCostSlice(): CostSlice {
  return { tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, costUsd: 0 }
}

/**
 * Merge two `CostSlice & { calls: number }` values. The synthetic task
 * generator's retry path accumulates across attempts this way; other
 * callers can use it when they have cost slices from parallel sub-operations.
 */
export function addCostSlice(
  a: CostSlice & { calls: number },
  b: CostSlice & { calls: number },
): CostSlice & { calls: number } {
  return {
    tokens: addTokenUsage(a.tokens, b.tokens),
    costUsd: a.costUsd + b.costUsd,
    calls: a.calls + b.calls,
  }
}

// ---------------------------------------------------------------------------
// Run metadata (agent execution stats)
// ---------------------------------------------------------------------------

export interface RunMeta {
  tokens: TokenUsage
  /** USD cost of this agent run (from RunResult.cost; 0 for adapters that don't report cost). */
  costUsd: number
  durationMs: number
  adapterError?: {
    exitCode: number
    stderr: string
    diagnosis?: { summary: string; hint?: string; source: string }
  }
  skillLoaded?: boolean
  /**
   * Canonical signal for whether this evidence is trustworthy at the skill level.
   * 'ok'     → normal evidence, optimizer may use it to diagnose skill issues.
   * other    → infra-broken evidence; the optimizer should abstain (see
   *            docs/skvm/jit-optimize-abstain-path.md — consumer side). Until
   *            that fix lands the field is plumbed through for visibility only.
   */
  runStatus?: RunStatus
  statusDetail?: string
}

export const RunMetaSchema = z.object({
  tokens: TokenUsageSchema,
  costUsd: z.number(),
  durationMs: z.number(),
  adapterError: z
    .object({
      exitCode: z.number(),
      stderr: z.string(),
      diagnosis: z
        .object({
          summary: z.string(),
          hint: z.string().optional(),
          source: z.string(),
        })
        .optional(),
    })
    .optional(),
  skillLoaded: z.boolean().optional(),
  runStatus: RunStatusSchema.optional(),
  statusDetail: z.string().optional(),
})

// ---------------------------------------------------------------------------
// Evidence (unified — one task execution's data fed to optimizer)
// ---------------------------------------------------------------------------

/**
 * Single piece of execution evidence. Fields are "fill what you have":
 * different task sources populate different subsets.
 *
 * Note: intentionally no `score` field. The engine computes an internal score
 * from `criteria` for convergence/best-round selection, but the optimizer sees
 * the structured per-criterion list, not a bare number.
 */
export interface Evidence {
  /**
   * Stable task identifier this evidence belongs to. Multiple evidences can
   * share the same `taskId` when `runsPerTask > 1`. Used by the engine to
   * group per-task scores in `avgScore`, per-task regression gates in
   * `pickBestRound`, and to render task-first views in the optimizer
   * workspace. For `real-task` / `synthetic-task` sources this is the
   * `RunnableTask.id`; for `execution-log` sources it is derived from the
   * log file path.
   */
  taskId: string
  /** Full agent conversation (always present) */
  conversationLog: ConversationLogEntry[]
  /** What the agent was asked to do (always present) */
  taskPrompt: string
  /**
   * Fully flattened per-criterion eval results. Each entry is a leaf: a custom
   * grade.py with N records contributes N entries; an llm-judge / script /
   * file-check contributes one. Weights within this list sum to 1.0.
   */
  criteria?: EvidenceCriterion[]
  /** Snapshot of agent's work directory (present when task was executed) */
  workDirSnapshot?: WorkDirSnapshot
  /** Digest-bound original inputs captured before the source run mutated the workdir. */
  inputResources?: EvidenceInputResources
  /** Agent run metadata (tokens, duration, errors) */
  runMeta?: RunMeta
  /** Exact external trace binding and its known/unknown representation limits. */
  trace?: TraceEvidenceSource
}

/**
 * Schema for the JSON sidecar of a persisted Evidence record. Excludes
 * `conversationLog` (lives next to it as `conversation.jsonl`) and
 * `workDirSnapshot` (the `workdir/` subdirectory carries the files
 * verbatim — Maps don't round-trip through JSON cleanly and inlining
 * large file contents bloats the sidecar past usefulness).
 */
export const EvidenceSidecarSchema = z.object({
  taskId: z.string(),
  taskPrompt: z.string(),
  criteria: z.array(EvidenceCriterionSchema).optional(),
  runMeta: RunMetaSchema.optional(),
  inputResources: EvidenceInputResourcesSchema.optional(),
  trace: TraceEvidenceSourceSchema.optional(),
})

export type EvidenceSidecar = z.infer<typeof EvidenceSidecarSchema>

// ---------------------------------------------------------------------------
// Optimization change + history
// ---------------------------------------------------------------------------

export interface OptimizationChange {
  /** File that was changed (relative to skill root, e.g. "SKILL.md" or "scripts/parse.py") */
  file: string
  /** Section name (free text — "workflow", "params", etc.); empty if whole-file change */
  section?: string
  /** What and why, in one sentence */
  description: string
  /**
   * Why this change generalizes beyond the specific task in the evidence —
   * one sentence naming at least one DIFFERENT plausible task on this skill
   * that would benefit from the same change. If the optimizer cannot
   * articulate generality, it should emit noChanges=true instead of adding
   * this change. Defaults to "" for back-compat with historical entries.
   */
  generality: string
  /**
   * Net line delta (linesAdded - linesRemoved) for this change, self-reported
   * by the optimizer. Used for concise-diff auditing; not enforced.
   */
  linesDelta?: number
}

export const OptimizationChangeSchema = z.object({
  file: z.string(),
  section: z.string().optional(),
  description: z.string(),
  generality: z.string().default(""),
  linesDelta: z.number().optional(),
})

export type OptimizationActionKind =
  | "reuse-script"
  | "domain-backend"
  | "generate-script"
  | "restructure-docs"

export type OptimizationConstraintScope = "skill" | "task" | "environment" | "unknown"

/** A condition with explicit provenance so one observed task cannot narrow the whole skill. */
export interface OptimizationConstraint {
  description: string
  scope: OptimizationConstraintScope
  sourceRef: string
}

export const OptimizationConstraintSchema = z.object({
  description: z.string().min(1),
  scope: z.enum(["skill", "task", "environment", "unknown"]),
  sourceRef: z.string().min(1),
})

export type OptimizationValidationBasis = "reference-output" | "task-contract" | "self-check"

export interface OptimizationValidationExpectationSuggestion {
  args: string[]
  expectedExitCode?: number
  stdoutIncludes?: string[]
  stderrIncludes?: string[]
}

export interface OptimizationValidationExpectedFileSuggestion {
  path: string
  /** Path in the selected evidence's observed workdir snapshot. */
  referencePath?: string
}

export interface OptimizationValidationCaseSuggestion extends OptimizationValidationExpectationSuggestion {
  id: string
  /** Stringified optimizer evidence index, matching action.evidenceIds. */
  evidenceId: string
  inputSource: "task-fixtures" | "pre-run-input-snapshot" | "workdir-snapshot"
  inputFiles: string[]
  expectedFiles?: OptimizationValidationExpectedFileSuggestion[]
  /** Whether the case exercises the admitted boundary or a clean pre-write rejection. */
  applicability?: "supported" | "not-applicable"
  /** Files that must not exist after a not-applicable case. */
  expectedAbsentFiles?: string[]
  basis: OptimizationValidationBasis
  sourceRefs: string[]
}

export interface OptimizationProgramValidationSuggestion {
  help?: OptimizationValidationExpectationSuggestion
  cases: OptimizationValidationCaseSuggestion[]
}

const OptimizationValidationExpectationSuggestionSchema = z.object({
  args: z.array(z.string()),
  expectedExitCode: z.number().int().optional(),
  stdoutIncludes: z.array(z.string()).optional(),
  stderrIncludes: z.array(z.string()).optional(),
})

const OptimizationValidationExpectedFileSuggestionSchema = z.object({
  path: z.string().min(1),
  referencePath: z.string().min(1).optional(),
})

export const OptimizationValidationCaseSuggestionSchema = OptimizationValidationExpectationSuggestionSchema.extend({
  id: z.string().min(1),
  evidenceId: z.string().min(1),
  inputSource: z.enum(["task-fixtures", "pre-run-input-snapshot", "workdir-snapshot"]),
  inputFiles: z.array(z.string().min(1)),
  expectedFiles: z.array(OptimizationValidationExpectedFileSuggestionSchema).optional(),
  applicability: z.enum(["supported", "not-applicable"]).optional(),
  expectedAbsentFiles: z.array(z.string().min(1)).optional(),
  basis: z.enum(["reference-output", "task-contract", "self-check"]),
  sourceRefs: z.array(z.string()),
})

export const OptimizationProgramValidationSuggestionSchema = z.object({
  help: OptimizationValidationExpectationSuggestionSchema.optional(),
  cases: z.array(OptimizationValidationCaseSuggestionSchema),
})

export interface OptimizationRoundValidationSummary {
  status: "passed" | "partial" | "failed" | "not-run"
  reportPath: string
  retainedActionIds: string[]
  unvalidatedActionIds: string[]
  rejectedActionIds: string[]
  programRuns: number
  caseRuns: number
  independentCaseRuns: number
}

export const OptimizationRoundValidationSummarySchema = z.object({
  status: z.enum(["passed", "partial", "failed", "not-run"]),
  reportPath: z.string(),
  retainedActionIds: z.array(z.string()),
  unvalidatedActionIds: z.array(z.string()),
  rejectedActionIds: z.array(z.string()),
  programRuns: z.number().int().nonnegative(),
  caseRuns: z.number().int().nonnegative(),
  independentCaseRuns: z.number().int().nonnegative(),
})

/** Evidence-backed, dependency-aware work the optimized skill will expose. */
export interface OptimizationAction {
  id: string
  kind: OptimizationActionKind
  evidenceIds: string[]
  sourceRefs: string[]
  dependsOn: string[]
  inputs: string[]
  outputs: string[]
  preconditions: string[]
  /** Optional for backwards compatibility with actions created before scoped provenance. */
  constraints?: OptimizationConstraint[]
  /** Optional optimizer-authored execution suggestions; the engine resolves all resources and authority. */
  validation?: OptimizationProgramValidationSuggestion
  changedPaths: string[]
  residualDuties: string[]
  verification: string[]
}

export const OptimizationActionSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["reuse-script", "domain-backend", "generate-script", "restructure-docs"]),
  evidenceIds: z.array(z.string()),
  sourceRefs: z.array(z.string()),
  dependsOn: z.array(z.string()),
  inputs: z.array(z.string()),
  outputs: z.array(z.string()),
  preconditions: z.array(z.string()),
  constraints: z.array(OptimizationConstraintSchema).optional(),
  validation: OptimizationProgramValidationSuggestionSchema.optional(),
  changedPaths: z.array(z.string()),
  residualDuties: z.array(z.string()),
  verification: z.array(z.string()),
})

export type OptimizationActionDiagnosticCode =
  | "invalid-action"
  | "duplicate-action-id"
  | "unknown-action-dependency"
  | "action-dependency-cycle"
  | "action-kind-mismatch"

export interface OptimizationActionDiagnostic {
  code: OptimizationActionDiagnosticCode
  severity: "error"
  actionId?: string
  locator: string
  message: string
  /** Semantic field that was declared inconsistently with the local candidate. */
  field?: string
  /** Original serialized value retained for a repair pass. */
  originalValue?: string
  /** Local executable paths that make the declaration repairable. */
  supportedLocalPaths?: string[]
  /** Suggested replacement value, when the engine can derive one. */
  suggestedValue?: string
}

export const OptimizationActionDiagnosticSchema = z.object({
  code: z.enum([
    "invalid-action",
    "duplicate-action-id",
    "unknown-action-dependency",
    "action-dependency-cycle",
    "action-kind-mismatch",
  ]),
  severity: z.literal("error"),
  actionId: z.string().optional(),
  locator: z.string(),
  message: z.string(),
  field: z.string().optional(),
  originalValue: z.string().optional(),
  supportedLocalPaths: z.array(z.string()).optional(),
  suggestedValue: z.string().optional(),
})

/**
 * One round in a skill's optimization history.
 *
 * Per-skill, not per-evidence. Stored in the proposal's history.json and also
 * passed back to the optimizer in subsequent rounds as context for anti-
 * oscillation (don't repeat diagnoses that didn't work).
 */
export interface HistoryEntry {
  timestamp: string
  round: number
  /** The underlying problem the optimizer diagnosed — required */
  rootCause: string
  /** Optimizer's full analysis */
  reasoning: string
  /** Structured per-file change list */
  changes: OptimizationChange[]
  /** Files actually modified (for diff validation) */
  changedFiles: string[]
  /** Validated executable/restructuring actions proposed in this round. */
  actions?: OptimizationAction[]
  /** Rejected action diagnostics retained without invalidating sibling actions. */
  actionDiagnostics?: OptimizationActionDiagnostic[]
  /** Actual program-validation outcome for this snapshot, when the loop ran it. */
  validation?: OptimizationRoundValidationSummary
  /** Optimizer's self-reported confidence (0-1) */
  confidence: number
  /** Engine-internal score on the train set (what the optimizer saw); null if not evaluated */
  trainScore: number | null
  /** Engine-internal score on the held-out test set; null if no test set or not evaluated */
  testScore: number | null
  /** Whether this round improved the primary score vs the previous round; set retroactively */
  improved: boolean | null
  /** True if this round ended in optimizer abstain or all-tainted evidence */
  infraBlocked?: boolean
  /** Evidence ids the optimizer flagged as infra-broken (or the engine's all-tainted list) */
  blockedEvidenceIds?: string[]
  /** Human-readable reason (cites the specific infra signal seen) */
  blockedReason?: string
}

export const HistoryEntrySchema = z.object({
  timestamp: z.string(),
  round: z.number(),
  rootCause: z.string(),
  reasoning: z.string(),
  changes: z.array(OptimizationChangeSchema),
  changedFiles: z.array(z.string()),
  actions: z.array(OptimizationActionSchema).optional(),
  actionDiagnostics: z.array(OptimizationActionDiagnosticSchema).optional(),
  validation: OptimizationRoundValidationSummarySchema.optional(),
  confidence: z.number(),
  trainScore: z.number().nullable(),
  testScore: z.number().nullable(),
  improved: z.boolean().nullable(),
  infraBlocked: z.boolean().optional(),
  blockedEvidenceIds: z.array(z.string()).optional(),
  blockedReason: z.string().optional(),
})

// ---------------------------------------------------------------------------
// Optimizer input/output (called per round by the loop runner)
// ---------------------------------------------------------------------------

export interface OptimizeInput {
  /** Path to the skill folder (SKILL.md + bundle files) */
  skillDir: string
  /** One or more execution evidences to analyze */
  evidences: Evidence[]
  /** Previous rounds' history, for context / anti-oscillation */
  history?: HistoryEntry[]
  /** One bounded repair pass over a validation-failed candidate. */
  repairFeedback?: OptimizationRepairFeedback
}

export interface OptimizationRepairFeedback {
  attempt: 1
  actionIds: string[]
  feedback: Array<{
    actionId: string
    failureKind: string
    diagnostics: string[]
    relevantFiles: string[]
  }>
  rule: "repair-only-listed-files-and-preserve-validation-expectations"
}

export interface OptimizeConfig {
  /** Optimizer LLM model, shaped as "<provider>/<model-id>" */
  model: string
  /** Timeout for the agent invocation (default: TIMEOUT_DEFAULTS.optimizer) */
  timeoutMs?: number
  /**
   * Per-round optimizer step record directory (e.g. `round-N-optimizer/`). When
   * set, runOptimizer persists prompt.md, the raw submission.json, the computed
   * diff.json, the pre-strip `.optimize/` bundle (as `optimize-context/`), and
   * agent stdout/stderr here — the complete trace of one optimizer pass.
   * Single durable home for everything that used to be scattered between
   * `*-optimizer-logs/` and the always-deleted `.optimize/` bundle.
   */
  recordDir?: string
  /** Headless agent driver to use; defaults to the system default */
  driver?: import("../core/headless-agent/index.ts").HeadlessAgentDriver
}

/**
 * Structured submission the optimizer writes to .optimize/submission.json.
 * Parsed by the engine after the agent completes.
 */
export interface OptimizeSubmission {
  /** The diagnosed underlying problem — required unless noChanges or infraBlocked */
  rootCause: string
  /** Full analysis — required unless noChanges or infraBlocked */
  reasoning: string
  /** Confidence 0-1 — required unless noChanges or infraBlocked */
  confidence: number
  /** Files the optimizer claims to have edited (validated against actual diff) */
  changedFiles: string[]
  /** Structured per-file change summary */
  changes?: OptimizationChange[]
  /** Evidence-backed opportunity audit, including retained residual duties. */
  opportunities?: OptimizationOpportunity[]
  /** Validated implementation actions; invalid siblings are omitted with diagnostics. */
  actions?: OptimizationAction[]
  /** Engine-produced diagnostics for rejected action entries. */
  actionDiagnostics?: OptimizationActionDiagnostic[]
  /**
   * Positive statement about the skill: "I read the evidence, diagnosed no
   * skill defect, and recommend no edit." Mutually exclusive with
   * `infraBlocked`. Terminates the loop as legitimate convergence.
   */
  noChanges?: boolean
  /**
   * Negative statement about the evidence: "I cannot form a skill judgment
   * from this evidence because the runs were infra-broken." Mutually exclusive
   * with `changes[]` and `noChanges`. Triggers graceful loop termination with
   * `meta.json.status = 'infra-blocked'`; the proposal is then skipped by
   * bench's `jit-optimized` condition. Use only when at least one evidence
   * entry has `runStatus !== 'ok'` AND the optimizer cannot find a skill-level
   * root cause supported by the remaining clean evidence.
   */
  infraBlocked?: boolean
  /**
   * Evidence entries the optimizer considers infra-broken, as stringified
   * indices matching `.optimize/evidence-{N}.md` / `.json`. Required when
   * `infraBlocked` is true; engine logs a warning if empty but does not reject.
   */
  blockedEvidenceIds?: string[]
  /**
   * Human-readable justification citing the specific infra signals seen
   * (`runStatus=timeout`, `tokens=0`, etc.). Required when `infraBlocked` is
   * true; engine logs a warning if empty but does not reject.
   */
  blockedReason?: string
}

export type OptimizationOpportunityCategory =
  | "instruction-clarity"
  | "input-parameterization"
  | "repeated-transformation"
  | "verification"
  | "environment-dependency"
  | "residual-duty"

export interface OptimizationOpportunity {
  category: OptimizationOpportunityCategory
  summary: string
  evidenceIds: string[]
  disposition: "implemented" | "retained" | "not-applicable"
  residualDuty?: string
}

export const OptimizationOpportunitySchema = z.object({
  category: z.enum([
    "instruction-clarity",
    "input-parameterization",
    "repeated-transformation",
    "verification",
    "environment-dependency",
    "residual-duty",
  ]),
  summary: z.string(),
  evidenceIds: z.array(z.string()),
  disposition: z.enum(["implemented", "retained", "not-applicable"]),
  residualDuty: z.string().optional(),
})

export const OptimizeSubmissionSchema = z.object({
  rootCause: z.string().optional(),
  reasoning: z.string().optional(),
  confidence: z.number().optional(),
  changedFiles: z.array(z.string()).optional(),
  changes: z.array(OptimizationChangeSchema).optional(),
  opportunities: z.array(OptimizationOpportunitySchema).optional(),
  // Action entries are deliberately parsed tolerantly here. The engine's
  // validateOptimizationActions pass validates each sibling independently so
  // one malformed action cannot discard the reliable submission and evidence.
  actions: z.array(z.unknown()).transform((items) => items as OptimizationAction[]).optional(),
  noChanges: z.boolean().optional(),
  infraBlocked: z.boolean().optional(),
  blockedEvidenceIds: z.array(z.string()).optional(),
  blockedReason: z.string().optional(),
})

export interface OptimizeResult {
  /** Whether the workspace differs from the original */
  changed: boolean
  /** Path to the workspace directory with the edited skill (caller snapshots it) */
  workspaceDir: string
  /** Parsed submission from the optimizer */
  submission: OptimizeSubmission
  /** Files that actually differ (as computed by engine from filesystem diff) */
  actualChangedFiles: string[]
  /** USD cost of this optimization round */
  cost: number
  /** Optimizer token usage */
  tokens: TokenUsage
}

// ---------------------------------------------------------------------------
// Task source (three kinds, all support multiple inputs)
// ---------------------------------------------------------------------------

/**
 * Synthetic, real, and log sources. For synthetic/real, tasks are split into
 * train and test: the optimizer sees evidence from train tasks only; test
 * tasks give a stable, unbiased score signal for convergence and best-round
 * selection. Synthetic always uses a split. Real uses a split only when the
 * user explicitly provides a test list.
 */
export type TaskSource =
  /** Synthesize train and test tasks by asking the optimizer LLM to generate them from the skill */
  | { kind: "synthetic-task"; trainCount: number; testCount: number }
  /** Run real tasks from the bench registry (task IDs or task.json paths). If testTasks is undefined, trainTasks is reused as the test set. */
  | { kind: "real-task"; trainTasks: string[]; testTasks?: string[] }
  /** Analyze existing conversation logs (no rerun possible, so no train/test distinction) */
  | { kind: "execution-log"; logs: ExecutionLogInput[] }

export interface ExecutionLogInput {
  /** Path to a .jsonl conversation log */
  path: string
  /** Optional JSON file with EvidenceCriterion[] (since logs alone don't carry eval results) */
  criteriaPath?: string
  /** Optional adapter record locators to select from a multi-record source. */
  recordLocators?: string[]
}

// ---------------------------------------------------------------------------
// Loop config (single-shot vs multi-round)
// ---------------------------------------------------------------------------

export interface LoopConfig {
  /** Max optimization rounds (default: 1) */
  rounds?: number
  /** Runs per task per round, for variance reduction (default: 1) */
  runsPerTask?: number
  /** Engine-internal convergence threshold (default: 0.95); applied to test score when available, else train */
  convergence?: number
  /** Run no-skill / original conditions for comparison (default: false) */
  baseline?: boolean
  /**
   * Max parallel in-flight task runs per round (default: 1). Train and
   * test share the same limiter, so total in-flight never exceeds this
   * bound across both sets.
   */
  taskConcurrency?: number
  /**
   * Minimum primary-score improvement a non-baseline round must exceed to
   * beat round 0 in `pickBestRound`. Non-baseline rounds whose primary does
   * not clear `baseline + minImprovement` are dropped and selection returns
   * round 0. Also gates `HistoryEntry.improved` so the optimizer prompt and
   * the selector use the same signal. Default: 0.02
   * (see `DEFAULT_MIN_IMPROVEMENT` in loop.ts).
   */
  minImprovement?: number
  /**
   * Max per-task drop allowed relative to round 0 before a non-baseline
   * round is excluded from selection. Applied to `perTaskTrainScores` /
   * `perTaskTestScores` and enforced as a hard gate in `pickBestRound`:
   * any task in the intersection whose score fell by more than this
   * value excludes the round, even when its aggregate primary cleared
   * `minImprovement`. Default: 0.2
   * (see `DEFAULT_PER_TASK_REGRESSION_TOLERANCE` in loop.ts).
   */
  perTaskRegressionTolerance?: number
  /**
   * Minimum fractional drop in `targetAgent.costUsd` (per deployment run)
   * that qualifies as a meaningful cost reduction when primary scores are
   * within `scoreEquivalenceBand` of baseline. When a non-baseline round
   * has primary >= baseline - scoreEquivalenceBand AND its target-agent
   * cost is <= baseline * (1 - minCostReductionRatio), it is admitted
   * through the baseline gate even without clearing `minImprovement`.
   * Also used as a tiebreak within the survivor pool: inside the score
   * equivalence band, the lower-cost round wins.
   *
   * Only `targetAgent.costUsd` is considered — optimizer and eval-judge
   * costs are one-time optimization-time spend and irrelevant to which
   * round should ship. Disabled automatically when baseline cost is zero
   * (adapters like jiuwenclaw that don't report cost). Default: 0.15
   * (see `DEFAULT_MIN_COST_REDUCTION_RATIO` in loop.ts).
   */
  minCostReductionRatio?: number
  /**
   * Score delta window inside which two rounds are treated as "equivalent
   * on quality" by `pickBestRound`. Enables the cost-based baseline gate
   * branch (primary within this band of baseline + cost cut >= ratio) and
   * the cost-based tiebreak within the survivor pool. Defaults to
   * `minImprovement` so the equivalence band matches the noise floor.
   */
  scoreEquivalenceBand?: number
}

// ---------------------------------------------------------------------------
// Delivery config (single kind: proposal)
// ---------------------------------------------------------------------------

export interface DeliveryConfig {
  /** Keep every round's skill folder in the proposal (default: true) */
  keepAllRounds?: boolean
  /** After best round is chosen, overwrite original skillDir with it (default: false) */
  autoApply?: boolean
}

// ---------------------------------------------------------------------------
// Public API input
// ---------------------------------------------------------------------------

export interface JitOptimizeConfig {
  /** Path to the skill folder being optimized */
  skillDir: string
  /** Optimizer LLM configuration */
  optimizer: { model: string }
  /** Where the agent executions come from */
  taskSource: TaskSource
  /**
   * Target adapter — model + harness the optimized skill is being tuned for.
   * `model` is always required (it's the proposal's storage key); the
   * adapterConfig is only needed for synthetic-task / real-task sources, where
   * the agent actually runs. The execution-log source still requires the
   * model so the proposal lands under the right tree, even though no agent
   * runs.
   */
  targetAdapter: {
    model: string
    harness: AdapterName
    adapterConfig?: Partial<AdapterConfig>
  }
  /** Multi-round loop settings */
  loop?: LoopConfig
  /** Proposal storage settings */
  delivery?: DeliveryConfig
  /**
   * Optional eval judge LLM provider. Defaults to resolving `optimizer.model`
   * through the provider registry (`createProviderForModel`). When set,
   * `evalJudgeModel` should typically also be set so cost estimation knows
   * what model to price.
   */
  evalProvider?: LLMProvider
  /**
   * Optional model id for eval-judge cost estimation. Defaults to
   * `optimizer.model`. Only used to look up pricing when computing the
   * evalJudge cost slice; does not affect which provider handles judge calls.
   */
  evalJudgeModel?: string
  /** Optional adapter instance override (testing) */
  adapter?: AgentAdapter
  /**
   * CLI timeout ceiling for each per-round optimizer agent run (ms).
   * When omitted, falls back to `TIMEOUT_DEFAULTS.optimizer` (600 000 ms).
   */
  optimizerTimeoutMs?: number
  /**
   * CLI timeout ceiling for the synthetic task-generation agent run (ms).
   * Only used when `taskSource.kind === "synthetic-task"`.
   * When omitted, falls back to `TIMEOUT_DEFAULTS.taskGen` (900 000 ms).
   */
  taskGenTimeoutMs?: number
  /**
   * CLI --timeout-ms value, used as the per-task execution timeout override for
   * tasks synthesized by the synthetic-task source and as the read-back fallback
   * in `loadGeneratedTasks`. When omitted, falls back to
   * `TIMEOUT_DEFAULTS.syntheticTaskExec` (300 000 ms).
   */
  taskExecTimeoutMs?: number
  /**
   * How the optimized skill should be loaded into each per-task adapter
   * run. Defaults to CLI_DEFAULTS.skillMode ("inject") via buildSkillBundle
   * when omitted.
   */
  skillMode?: SkillMode
}

// ---------------------------------------------------------------------------
// Final result returned by jitOptimize()
// ---------------------------------------------------------------------------

export interface JitOptimizeResult {
  proposalId: string
  proposalDir: string
  bestRound: number
  bestRoundReason: string
  rounds: RoundResult[]
  /**
   * Cost of synthesizing tasks once at the start of the session (synthetic-task
   * source only). Empty slice for real/log sources. Not attributed to any round.
   */
  setupCost: CostSlice & { calls: number }
  /**
   * Grand total across setupCost + every round's targetAgent + evalJudge + optimizer.
   */
  totalCost: CostSlice
  /** Present when an execution-log candidate went through local program validation. */
  validation?: OptimizationRoundValidationSummary
}

export interface RoundResult {
  round: number
  /** Round 0 = baseline (no optimization applied) */
  isBaseline: boolean
  /** Score on the train task set (what the optimizer saw). null if not evaluated. */
  trainScore: number | null
  /** Score on the held-out test set. null if no test set (log source, or real with no --test-tasks and trainTasks reused). */
  testScore: number | null
  /** Tasks that passed all criteria / total train tasks this round. */
  trainPassed: number
  trainTotal: number
  /** Tasks that passed all criteria / total test tasks this round. */
  testPassed: number
  testTotal: number
  /**
   * Per-task mean scores on the train set (one entry per distinct taskId,
   * averaged across its runs after dropping infra-tainted ones). Consumed
   * by `pickBestRound`'s per-task regression gate and by analysis tooling.
   * Empty when the round was never evaluated (abstain / infra-blocked /
   * unscored no-edit placeholders).
   */
  perTaskTrainScores: Record<string, number>
  /**
   * Per-task mean scores on the held-out test set. When `testIsSeparate`
   * is false (no explicit --test-tasks split) this is identical to
   * `perTaskTrainScores` — same evidence, degenerate "test == train"
   * semantics. Empty on unscored rounds.
   */
  perTaskTestScores: Record<string, number>
  /**
   * Target-agent (the model being optimized for) running tasks. Summed across
   * all train + test runs this round. Cost comes from RunResult.cost, which
   * each adapter populates from its own source (NDJSON, estimation, session data).
   */
  targetAgent: CostSlice & { runs: number; durationMs: number }
  /**
   * LLM-judge evaluation calls made during eval this round. Cost is estimated
   * via estimateCost(judgeModel, tokens).
   */
  evalJudge: CostSlice & { calls: number }
  /**
   * Optimizer agent (headless agent that rewrites the skill). Null for round 0
   * (baseline does not call the optimizer). Cost comes from the opencode
   * NDJSON stream via eventsToRunResult.
   */
  optimizer: CostSlice | null
  /** History entry for this round (null for baseline) */
  historyEntry: HistoryEntry | null
  /** Actual local program-validation summary for this round, when available. */
  validation?: OptimizationRoundValidationSummary
}

// ---------------------------------------------------------------------------
// Schemas for persisted RoundResult (history.json replay)
// ---------------------------------------------------------------------------

export const CostSliceSchema = z.object({
  tokens: TokenUsageSchema,
  costUsd: z.number(),
})

const TargetAgentSliceSchema = CostSliceSchema.extend({
  runs: z.number(),
  durationMs: z.number(),
})

const EvalJudgeSliceSchema = CostSliceSchema.extend({
  calls: z.number(),
})

/**
 * Zod schema for a persisted `RoundResult`. `historyEntry` is stored as
 * `null` on disk — the canonical copy lives in `history.entries`, and
 * duplicating it would bloat the file and risk drift. Replay consumers
 * that need historyEntry merge it back by round number.
 */
export const RoundResultSchema = z.object({
  round: z.number(),
  isBaseline: z.boolean(),
  trainScore: z.number().nullable(),
  testScore: z.number().nullable(),
  trainPassed: z.number(),
  trainTotal: z.number(),
  testPassed: z.number(),
  testTotal: z.number(),
  // Optional on read for backward compat with rounds arrays written
  // before Layer 2 landed. Writers always emit these (possibly empty
  // objects for unscored rounds). Default to `{}` so consumers can
  // treat absence as "no per-task data available" without null checks.
  perTaskTrainScores: z.record(z.string(), z.number()).default({}),
  perTaskTestScores: z.record(z.string(), z.number()).default({}),
  targetAgent: TargetAgentSliceSchema,
  evalJudge: EvalJudgeSliceSchema,
  optimizer: CostSliceSchema.nullable(),
  // Accept both null (post-hardening writer) and any value on read
  // (defensive — unknown structure if a future writer emits it). The
  // runtime code never consumes `historyEntry` from a deserialized
  // history.json; it comes from `history.entries` by round number.
  historyEntry: z.any().nullable(),
  validation: OptimizationRoundValidationSummarySchema.optional(),
})
