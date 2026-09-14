import path from "node:path"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { EvalCriterionSchema, type EvalCriterion } from "../core/types.ts"
import { readPreRunInputSnapshotContents } from "../run/pre-run-input-snapshot.ts"
import type { ImplementationSelection } from "./implementations.ts"
import { selectOptimizationImplementations } from "./implementations.ts"
import {
  resolveActionValidation,
  validateOptimizationProgram,
  type ActionValidationObservation,
  type ActionValidationResolution,
  type OptimizationProgramValidationResult,
  type ProgramValidationCase,
  type ProgramValidationExpectation,
} from "./package-validation.ts"
import type {
  Evidence,
  OptimizationAction,
  OptimizationRoundValidationSummary,
  OptimizationRepairFeedbackItem,
  OptimizationProgramValidationSuggestion,
  OptimizationValidationBasis,
  OptimizationValidationCaseSuggestion,
} from "./types.ts"
import {
  completeValidationSuggestion,
  deriveValidationVariations,
  type ValidationVariationAudit,
  type ValidationVariationCase,
  type ValidationVariationKind,
  type ValidationCompletionDiagnostic,
  type ValidationCompletionProvenance,
  type ValidationCompletionStatus,
} from "./validation-completion.ts"
import type { OperationParameterRule } from "./operation-context.ts"
import { groupEvidencesByTask } from "./workspace.ts"

export const OPTIMIZATION_VALIDATION_REPORT_SCHEMA_VERSION = "jit-optimize-validation-lifecycle/v1"

export type DerivedProgramValidationPlanStatus = "ready" | "not-applicable" | "unresolved"

export interface ProgramValidationPlanDiagnostic {
  code:
    | "implementation-not-executable"
    | "validation-suggestion-missing"
    | "validation-cases-missing"
    | "validation-case-duplicate"
    | "validation-evidence-invalid"
    | "validation-evidence-not-declared"
    | "validation-input-path-invalid"
    | "validation-input-source-mismatch"
    | "validation-input-source-stale"
    | "validation-input-missing"
    | "validation-task-source-unavailable"
    | "validation-pre-run-source-unavailable"
    | "validation-reference-path-invalid"
    | "validation-reference-missing"
    | "validation-reference-required"
    | "validation-task-criterion-missing"
    | "validation-task-criterion-unsupported"
    | "validation-task-criterion-path-invalid"
    | "validation-source-checks-invalid"
    | "validation-source-reference-invalid"
    | "validation-source-reference-missing"
  message: string
  caseId?: string
}

export interface ProgramValidationCaseEvidence {
  id: string
  evidenceId: string
  basis: OptimizationValidationBasis
  sourceRefs: string[]
  referenceDigests: Record<string, string>
  /** Prior passing criteria that establish the observed reference as task-valid. */
  referenceAuthorityCriterionIds: string[]
  /** Bound task criteria that were re-executed against this candidate case. */
  independentCriterionIds: string[]
  executedAssertionIds: string[]
  assertionAuthorities: Array<"task-requirement" | "source-derived" | "self-check">
  applicability: "supported" | "not-applicable"
  inputDigests: Record<string, string>
  expectedAbsentFiles: string[]
  variation?: {
    kind: ValidationVariationKind
    parentCaseId: string
    changedBindings: string[]
    sourceRefs: string[]
  }
}

export interface OptimizationVariationReport {
  generated: Array<{
    id: string
    parentCaseId: string
    kind: ValidationVariationKind
    changedBindings: string[]
    sourceRefs: string[]
    rationale: string
  }>
  covered: Array<{
    kind: "parameter"
    caseIds: string[]
    changedBindings: string[]
    sourceRefs: string[]
    rationale: string
  }>
  skipped: Array<{
    parentCaseId: string
    kind: ValidationVariationKind
    reason: string
    sourceRefs: string[]
  }>
}

export interface OptimizationCapabilityBoundary {
  selectionMeaning: "entry-found-only"
  supportedCaseIds: string[]
  notApplicableCaseIds: string[]
  inputVariationAffectsOutput: boolean
  parameterVariationAffectsOutput: boolean
  rejectedBeforeWriteCaseIds: string[]
  unverifiedInputs: string[]
  unverifiedPreconditions: string[]
  residualAgentDuty: string
}

export interface OptimizationValidationBinding {
  sha256: string
  dependencyAnalysis: "complete-static" | "conservative"
  candidateFiles: Array<{ path: string; sha256: string }>
  evidenceSha256: string
}

export interface DerivedProgramValidationPlan {
  status: DerivedProgramValidationPlanStatus
  actionId: string
  implementation: ImplementationSelection
  help?: ProgramValidationExpectation
  cases: ProgramValidationCase[]
  caseEvidence: ProgramValidationCaseEvidence[]
  independentCaseIds: string[]
  selfCheckCaseIds: string[]
  diagnostics: ProgramValidationPlanDiagnostic[]
  variations?: OptimizationVariationReport
}

export interface DeriveProgramValidationPlanOptions {
  action: OptimizationAction
  implementation: ImplementationSelection
  evidences: readonly Evidence[]
  /** Dedicated, disposable root controlled by the caller. */
  validationRoot: string
  /** Original, pre-edit skill root used only for source-owned checks. */
  sourceSkillDir?: string
  /** Engine-derived ordinary validation cases for path/cwd checks. */
  derivedVariations?: readonly ValidationVariationCase[]
  /** Full audit retained for the machine-readable action report. */
  variationAudit?: ValidationVariationAudit
}

export interface OptimizationActionValidationRecord {
  actionId: string
  kind: OptimizationAction["kind"]
  implementation: ImplementationSelection
  planStatus: DerivedProgramValidationPlanStatus
  planDiagnostics: ProgramValidationPlanDiagnostic[]
  independentCaseIds: string[]
  selfCheckCaseIds: string[]
  programStatus: OptimizationProgramValidationResult["status"] | "not-run"
  program?: OptimizationProgramValidationResult
  /** Deterministic validation metadata completion performed before plan derivation. */
  validationCompletion?: {
    status: ValidationCompletionStatus
    diagnostics: ValidationCompletionDiagnostic[]
    provenance: ValidationCompletionProvenance
  }
  capabilityBoundary?: OptimizationCapabilityBoundary
  validationBinding?: OptimizationValidationBinding
  validationSource?: "executed" | "reused-initial-observation"
  variationChecks?: OptimizationVariationReport
}

/** A concrete validation metadata gap that the single bounded repair may fill. */
export interface OptimizationValidationRepairableFeedback {
  actionId: string
  failureKind: "validation-metadata-missing"
  diagnostics: string[]
  relevantFiles: string[]
  fields: string[]
  suggestion: OptimizationProgramValidationSuggestion
}

export interface OptimizationValidationLifecycleReport {
  schemaVersion: typeof OPTIMIZATION_VALIDATION_REPORT_SCHEMA_VERSION
  createdAt: string
  round: number
  sourceMode: "execution-log-local-validation"
  sourceTaskReplayed: false
  actions: OptimizationActionValidationRecord[]
  resolution: ActionValidationResolution
  repairable?: {
    actionIds: string[]
    feedback: OptimizationValidationRepairableFeedback[]
  }
  execution: {
    programRuns: number
    helpRuns: number
    caseRuns: number
    independentCaseRuns: number
    reusedActionObservations: number
  }
  repair?: {
    attempted: true
    attemptCount: 1
    actionIds: string[]
    changedPaths: string[]
    revalidatedActionIds: string[]
    reusedActionIds: string[]
    feedback: OptimizationRepairFeedbackItem[]
    optimizerRecordPath: string
    initialReportPath: string
    repairReportPath?: string
    costUsd: number | null
    tokens?: { input: number; output: number; cacheRead: number; cacheWrite: number }
    outcome: "passed" | "unresolved" | "rolled-back" | "optimizer-failed" | "scope-violation"
    failure?: string
  }
  rollback?: {
    actionIds: string[]
    changedPaths: string[]
    reason: "repair-still-failed" | "repair-optimizer-failed" | "repair-scope-violation"
  }
}

export interface RunOptimizationValidationLifecycleOptions {
  proposalDir: string
  round: number
  skillDir: string
  /** Original, pre-edit skill root used only for source-owned checks. */
  sourceSkillDir?: string
  /** Original, pre-edit skill root used to prove generate-script realization. */
  baselineSkillDir?: string
  actions: readonly OptimizationAction[]
  evidences: readonly Evidence[]
  /** Re-run only these actions and reuse explicit observations for the rest. */
  executeActionIds?: readonly string[]
  /** Actual candidate paths changed since priorReport; unknown dependencies fail closed. */
  changedPathsSincePrior?: readonly string[]
  priorReport?: OptimizationValidationLifecycleReport
  /** Optional structured source parameter declarations used for safe variation audits. */
  sourceParameterRules?: readonly OperationParameterRule[]
}

export interface RunOptimizationValidationLifecycleResult {
  report: OptimizationValidationLifecycleReport
  summary: OptimizationRoundValidationSummary
}

function sha256(value: string | Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
}

function sha256Bytes(value: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
}

function hasVariationReport(audit: ValidationVariationAudit): boolean {
  return audit.generated.length > 0 || audit.covered.length > 0 || audit.skipped.length > 0
}

function summarizeVariationAudit(audit: ValidationVariationAudit): OptimizationVariationReport {
  return {
    generated: audit.generated.map((item) => ({
      id: item.id,
      parentCaseId: item.parentCaseId,
      kind: item.kind,
      changedBindings: [...item.changedBindings],
      sourceRefs: [...item.sourceRefs],
      rationale: item.rationale,
    })),
    covered: audit.covered.map((item) => ({
      kind: item.kind,
      caseIds: [...item.caseIds],
      changedBindings: [...item.changedBindings],
      sourceRefs: [...item.sourceRefs],
      rationale: item.rationale,
    })),
    skipped: audit.skipped.map((item) => ({
      parentCaseId: item.parentCaseId,
      kind: item.kind,
      reason: item.reason,
      sourceRefs: [...item.sourceRefs],
    })),
  }
}

function canonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize)
    if (typeof item !== "object" || item === null) return item
    return Object.fromEntries(Object.entries(item as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, nested]) => [key, normalize(nested)]))
  }
  return JSON.stringify(normalize(value))
}

function safeSegment(value: string, fallback: string): string {
  const safe = value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "")
  return safe || fallback
}

function portableRelative(value: string): string | undefined {
  if (value.includes("\0") || /^[A-Za-z]:[\\/]/.test(value) || path.posix.isAbsolute(value.replaceAll("\\", "/"))) {
    return undefined
  }
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"))
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) return undefined
  return normalized
}

function normalizeValidationPath(value: string): string {
  const normalized = value.trim().replaceAll("\\", "/")
  return normalized.startsWith("./") ? normalized.slice(2) : normalized
}

function rewriteBoundValidationPath(
  value: string,
  bindings: readonly { sourcePath: string; targetPath: string }[],
): string {
  const normalized = normalizeValidationPath(value)
  const binding = bindings.find((item) => normalizeValidationPath(item.sourcePath) === normalized)
  return binding ? normalizeValidationPath(binding.targetPath) : normalized
}

type ValidationInputSource = OptimizationValidationCaseSuggestion["inputSource"]

function projectedInputSource(value: string): ValidationInputSource | undefined {
  const match = /^\.optimize\/tasks\/[^/]+\/run-\d+-(task-fixtures|pre-run-inputs|workdir)\/.+$/u.exec(value.replaceAll("\\", "/"))
  return match?.[1] === "task-fixtures" ? "task-fixtures"
    : match?.[1] === "pre-run-inputs" ? "pre-run-input-snapshot"
      : match?.[1] === "workdir" ? "workdir-snapshot" : undefined
}

/**
 * The optimizer sees evidence files through .optimize/tasks/... projections,
 * while the validator materializes only the selected source-relative files in
 * a disposable cwd. Accept either spelling and preserve the declared source
 * boundary; a workdir locator must never silently resolve against task input.
 */
function sourceRelativeEvidenceLocator(
  value: string,
  expectedSource: ValidationInputSource,
): { relative?: string; diagnostic?: ProgramValidationPlanDiagnostic } {
  const portable = value.replaceAll("\\", "/")
  const projected = /^\.optimize\/tasks\/[^/]+\/run-\d+-(task-fixtures|pre-run-inputs|workdir)\/(.+)$/u.exec(portable)
  if (!projected) return { relative: portableRelative(portable) }
  const projectedSource: ValidationInputSource = projected[1] === "task-fixtures"
    ? "task-fixtures"
    : projected[1] === "pre-run-inputs"
      ? "pre-run-input-snapshot"
      : "workdir-snapshot"
  if (projectedSource !== expectedSource) {
    return {
      diagnostic: {
        code: "validation-input-source-mismatch",
        message: `Validation locator ${value} names ${projectedSource}, but the case declares ${expectedSource}.`,
      },
    }
  }
  return { relative: portableRelative(projected[2]!) }
}

function rewriteProjectedArguments(
  args: readonly string[],
  rewrites: ReadonlyMap<string, string>,
): string[] {
  const ordered = [...rewrites.entries()].sort(([left], [right]) => right.length - left.length)
  return args.map((arg) => {
    let rewritten = arg
    for (const [locator, relative] of ordered) {
      rewritten = rewritten.replaceAll(locator, relative)
      const portable = locator.replaceAll("\\", "/")
      if (portable !== locator) rewritten = rewritten.replaceAll(portable, relative)
    }
    return rewritten
  })
}

function contained(root: string, relative: string): string | undefined {
  const absoluteRoot = path.resolve(root)
  const absolute = path.resolve(absoluteRoot, ...relative.split("/"))
  const fromRoot = path.relative(absoluteRoot, absolute)
  if (fromRoot === "" || fromRoot === ".." || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) {
    return undefined
  }
  return absolute
}

const LOCAL_DEPENDENCY_EXTENSIONS = ["", ".js", ".mjs", ".cjs", ".ts", ".json", ".py"]
const PROGRAM_TEXT_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".py", ".sh", ".ps1"])

async function readableCandidateFile(root: string, relative: string): Promise<{ path: string; bytes: Uint8Array } | undefined> {
  const portable = portableRelative(relative)
  if (!portable) return undefined
  const absolute = contained(root, portable)
  if (!absolute) return undefined
  try {
    return { path: portable, bytes: new Uint8Array(await readFile(absolute)) }
  } catch {
    return undefined
  }
}

async function resolveLiteralDependency(
  root: string,
  fromPath: string,
  literal: string,
): Promise<{ path: string; bytes: Uint8Array } | undefined> {
  const clean = literal.replace(/[?#].*$/u, "")
  if (!clean || clean.startsWith("node:") || clean.startsWith("bun:") || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(clean)) {
    return undefined
  }
  if (!clean.startsWith(".") && !path.posix.extname(clean)) return undefined
  const bases = clean.startsWith(".")
    ? [path.posix.join(path.posix.dirname(fromPath), clean)]
    : [path.posix.join(path.posix.dirname(fromPath), clean), clean]
  for (const base of bases) {
    for (const extension of LOCAL_DEPENDENCY_EXTENSIONS) {
      const found = await readableCandidateFile(root, `${base}${extension}`)
      if (found) return found
    }
  }
  return undefined
}

async function programDependencyBinding(options: {
  skillDir: string
  action: OptimizationAction
  implementation: ImplementationSelection
}): Promise<{ dependencyAnalysis: OptimizationValidationBinding["dependencyAnalysis"]; files: Array<{ path: string; sha256: string }> }> {
  const queued = new Map<string, Uint8Array>()
  const enqueue = async (relative: string): Promise<void> => {
    const found = await readableCandidateFile(options.skillDir, relative)
    if (found && !queued.has(found.path)) queued.set(found.path, found.bytes)
  }
  if (options.implementation.entry) await enqueue(options.implementation.entry)
  for (const candidate of [
    ...options.action.inputs,
    ...options.action.sourceRefs.map((item) => item.split("#", 1)[0]!),
  ]) {
    await enqueue(candidate)
  }

  let dependencyAnalysis: OptimizationValidationBinding["dependencyAnalysis"] = options.implementation.entry
    && ["node", "python"].includes(options.implementation.runtime ?? "")
    ? "complete-static"
    : "conservative"
  const visited = new Set<string>()
  while (true) {
    const current = [...queued.entries()].find(([filePath]) => !visited.has(filePath))
    if (!current) break
    const [filePath, bytes] = current
    visited.add(filePath)
    if (!PROGRAM_TEXT_EXTENSIONS.has(path.posix.extname(filePath).toLowerCase())) continue
    const source = new TextDecoder("utf-8").decode(bytes)
    const literals = [...source.matchAll(/(["'`])([^"'`\r\n]+)\1/gu)].map((match) => match[2]!)
    const resolvedOnLine = new Set<string>()
    for (const literal of literals) {
      const resolved = await resolveLiteralDependency(options.skillDir, filePath, literal)
      if (!resolved) continue
      resolvedOnLine.add(literal)
      if (!queued.has(resolved.path)) queued.set(resolved.path, resolved.bytes)
    }
    for (const match of source.matchAll(/\b(?:readFile|readFileSync|open|require|import)\s*\(([^\r\n;]*)/gu)) {
      const expression = match[1] ?? ""
      const hasResolvedLiteral = [...resolvedOnLine].some((literal) => expression.includes(literal))
      const usesRuntimeInput = /\b(?:args|argv|input|filePath|pathArg)\b/u.test(expression)
      const usesBuiltIn = /["'](?:node|bun):/u.test(expression)
      if (!hasResolvedLiteral && !usesBuiltIn && !usesRuntimeInput) dependencyAnalysis = "conservative"
    }
  }
  return {
    dependencyAnalysis,
    files: [...queued.entries()]
      .map(([filePath, bytes]) => ({ path: filePath, sha256: sha256Bytes(bytes) }))
      .sort((left, right) => left.path.localeCompare(right.path, "en")),
  }
}

async function evidenceBinding(action: OptimizationAction, evidences: readonly Evidence[]): Promise<string> {
  const selected: unknown[] = []
  for (const evidenceId of action.evidenceIds) {
    if (!/^\d+$/u.test(evidenceId)) continue
    const evidence = evidences[Number(evidenceId)]
    if (!evidence) continue
    let taskSha256: string | null = null
    let preRunIntegrity: "verified" | "unavailable" | null = null
    if (evidence.inputResources?.preRun) {
      try {
        await preRunInputs(evidence)
        preRunIntegrity = "verified"
      } catch {
        preRunIntegrity = "unavailable"
      }
    }
    if (evidence.trace?.taskPath) {
      try {
        const taskPath = path.isAbsolute(evidence.trace.taskPath)
          ? evidence.trace.taskPath
          : path.resolve(path.dirname(evidence.trace.sourcePath), evidence.trace.taskPath)
        taskSha256 = sha256Bytes(new Uint8Array(await readFile(taskPath)))
      } catch {
        taskSha256 = null
      }
    }
    selected.push({
      evidenceId,
      taskId: evidence.taskId,
      taskPrompt: evidence.taskPrompt,
      criteria: evidence.criteria ?? [],
      trace: evidence.trace ?? null,
      taskSha256,
      inputResources: evidence.inputResources ?? null,
      preRunIntegrity,
      workDirSnapshot: [...(evidence.workDirSnapshot?.files ?? new Map<string, string>())]
        .map(([filePath, content]) => ({ path: filePath.replaceAll("\\", "/"), sha256: sha256(content) }))
        .sort((left, right) => left.path.localeCompare(right.path, "en")),
    })
  }
  return sha256(canonicalJson(selected))
}

async function deriveValidationBinding(options: {
  skillDir: string
  action: OptimizationAction
  implementation: ImplementationSelection
  evidences: readonly Evidence[]
}): Promise<OptimizationValidationBinding> {
  const dependencies = await programDependencyBinding(options)
  const evidenceSha256 = await evidenceBinding(options.action, options.evidences)
  const material = {
    action: options.action,
    implementation: options.implementation,
    dependencyAnalysis: dependencies.dependencyAnalysis,
    candidateFiles: dependencies.files,
    evidenceSha256,
  }
  return {
    sha256: sha256(canonicalJson(material)),
    dependencyAnalysis: dependencies.dependencyAnalysis,
    candidateFiles: dependencies.files,
    evidenceSha256,
  }
}

async function taskFixtures(evidence: Evidence): Promise<Record<string, string> | undefined> {
  const taskPath = evidence.trace?.taskPath
  if (!taskPath) return undefined
  try {
    const value = JSON.parse(await readFile(taskPath, "utf8")) as { fixtures?: unknown }
    if (typeof value.fixtures !== "object" || value.fixtures === null || Array.isArray(value.fixtures)) return undefined
    const fixtures: Record<string, string> = {}
    for (const [key, item] of Object.entries(value.fixtures as Record<string, unknown>)) {
      if (typeof item === "string") fixtures[key.replaceAll("\\", "/")] = item
    }
    return fixtures
  } catch {
    return undefined
  }
}

interface PreRunInputLookup {
  files: Map<string, Uint8Array>
  omitted: Set<string>
}

async function preRunInputs(evidence: Evidence): Promise<PreRunInputLookup | undefined> {
  const resource = evidence.inputResources?.preRun
  if (!resource) return undefined
  const loaded = await readPreRunInputSnapshotContents(resource.reference)
  return {
    files: new Map(loaded.files.map((file) => [file.path, file.content] as const)),
    omitted: new Set(loaded.snapshot.entries
      .filter((entry) => entry.status === "omitted")
      .map((entry) => entry.path)),
  }
}

function snapshotContent(evidence: Evidence, portablePath: string): string | undefined {
  const files = evidence.workDirSnapshot?.files
  if (!files) return undefined
  const direct = files.get(portablePath) ?? files.get(portablePath.replaceAll("/", path.sep))
  if (direct !== undefined) return direct
  for (const [filePath, content] of files) {
    if (filePath.replaceAll("\\", "/") === portablePath) return content
  }
  return undefined
}

function evidenceAt(
  suggestion: OptimizationValidationCaseSuggestion,
  action: OptimizationAction,
  evidences: readonly Evidence[],
  diagnostics: ProgramValidationPlanDiagnostic[],
): Evidence | undefined {
  if (!action.evidenceIds.includes(suggestion.evidenceId)) {
    diagnostics.push({
      code: "validation-evidence-not-declared",
      caseId: suggestion.id,
      message: `Validation evidence ${suggestion.evidenceId} is not declared by action ${action.id}.`,
    })
    return undefined
  }
  if (!/^\d+$/.test(suggestion.evidenceId)) {
    diagnostics.push({
      code: "validation-evidence-invalid",
      caseId: suggestion.id,
      message: `Validation evidence id must be a stringified evidence index: ${suggestion.evidenceId}`,
    })
    return undefined
  }
  const evidence = evidences[Number(suggestion.evidenceId)]
  if (!evidence) {
    diagnostics.push({
      code: "validation-evidence-invalid",
      caseId: suggestion.id,
      message: `Validation evidence index is unavailable: ${suggestion.evidenceId}`,
    })
  }
  return evidence
}

function taskCriterionId(criterion: EvalCriterion): string {
  return criterion.id ?? `${criterion.method}/${criterion.name ?? "criterion"}`
}

function passedCriterionBindings(
  suggestion: OptimizationValidationCaseSuggestion,
  evidence: Evidence,
): string[] {
  const prefix = `evidence:${suggestion.evidenceId}#criteria/`
  const declared = new Set(suggestion.sourceRefs
    .filter((sourceRef) => sourceRef.startsWith(prefix))
    .map((sourceRef) => sourceRef.slice(prefix.length))
    .filter(Boolean))
  const criteria = new Map((evidence.criteria ?? []).map((criterion) => [criterion.id, criterion]))
  return [...declared]
    .filter((criterionId) => criteria.get(criterionId)?.passed === true)
    .sort((left, right) => left.localeCompare(right, "en"))
}

async function taskAssertionBindings(
  suggestion: OptimizationValidationCaseSuggestion,
  evidence: Evidence,
  diagnostics: ProgramValidationPlanDiagnostic[],
  outputBindings: readonly { sourcePath: string; targetPath: string }[] = [],
): Promise<NonNullable<ProgramValidationCase["assertions"]>> {
  if (suggestion.basis !== "task-contract") return []
  const prefix = `evidence:${suggestion.evidenceId}#criteria/`
  const requested = [...new Set(suggestion.sourceRefs
    .filter((sourceRef) => sourceRef.startsWith(prefix))
    .map((sourceRef) => sourceRef.slice(prefix.length))
    .filter(Boolean))]
  if (requested.length === 0) return []
  const taskPath = evidence.trace?.taskPath
  let rawCriteria: unknown[] = []
  if (taskPath) {
    try {
      const raw = JSON.parse(await readFile(taskPath, "utf8")) as { eval?: unknown }
      if (Array.isArray(raw.eval)) rawCriteria = raw.eval
    } catch {
      // A located missing criterion below is more useful than a parse exception.
    }
  }
  const criteria = new Map<string, EvalCriterion>()
  for (const raw of rawCriteria) {
    const parsed = EvalCriterionSchema.safeParse(raw)
    if (parsed.success) criteria.set(taskCriterionId(parsed.data), parsed.data)
  }
  const assertions: NonNullable<ProgramValidationCase["assertions"]> = []
  for (const criterionId of requested) {
    const criterion = criteria.get(criterionId)
    if (!criterion) {
      diagnostics.push({
        code: "validation-task-criterion-missing",
        caseId: suggestion.id,
        message: `Task criterion ${criterionId} is not readable from the bound task source. A prior pass label is not an executable assertion.`,
      })
      continue
    }
    if (criterion.method !== "file-check" || criterion.glob) {
      diagnostics.push({
        code: "validation-task-criterion-unsupported",
        caseId: suggestion.id,
        message: `Task criterion ${criterionId} uses ${criterion.method}${criterion.method === "file-check" && criterion.glob ? " with glob" : ""}; bounded automatic validation currently executes contained file-check criteria only.`,
      })
      continue
    }
    const relative = portableRelative(rewriteBoundValidationPath(criterion.path, outputBindings))
    if (!relative) {
      diagnostics.push({
        code: "validation-task-criterion-path-invalid",
        caseId: suggestion.id,
        message: `Task criterion ${criterionId} checks a path outside the validation case: ${criterion.path}`,
      })
      continue
    }
    assertions.push({
      id: criterionId,
      authority: "task-requirement",
      sourceRef: `${prefix}${criterionId}`,
      criterion: { ...criterion, path: relative },
    })
  }
  return assertions
}

async function sourceAssertionBindings(options: {
  sourceSkillDir?: string
  expectedFiles: readonly string[]
  caseId: string
  diagnostics: ProgramValidationPlanDiagnostic[]
  outputBindings?: readonly { sourcePath: string; targetPath: string }[]
}): Promise<NonNullable<ProgramValidationCase["assertions"]>> {
  if (!options.sourceSkillDir || options.expectedFiles.length === 0) return []
  const manifestPath = path.join(options.sourceSkillDir, ".skvm-validation.json")
  if (!await Bun.file(manifestPath).exists()) return []
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(manifestPath, "utf8"))
  } catch (error) {
    options.diagnostics.push({
      code: "validation-source-checks-invalid",
      caseId: options.caseId,
      message: `Source validation manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    })
    return []
  }
  if (
    typeof raw !== "object" || raw === null || Array.isArray(raw)
    || (raw as { schemaVersion?: unknown }).schemaVersion !== "skvm-skill-validation/v1"
    || !Array.isArray((raw as { fileChecks?: unknown }).fileChecks)
  ) {
    options.diagnostics.push({
      code: "validation-source-checks-invalid",
      caseId: options.caseId,
      message: "Source validation manifest must use skvm-skill-validation/v1 with a fileChecks array.",
    })
    return []
  }
  const expected = new Set(options.expectedFiles.map((item) => normalizeValidationPath(item)))
  const outputBindings = options.outputBindings ?? []
  const assertions: NonNullable<ProgramValidationCase["assertions"]> = []
  const seenIds = new Set<string>()
  for (const item of (raw as { fileChecks: unknown[] }).fileChecks) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      options.diagnostics.push({
        code: "validation-source-checks-invalid",
        caseId: options.caseId,
        message: "Every source file check must be an object.",
      })
      continue
    }
    const check = item as Record<string, unknown>
    if (
      typeof check.id !== "string" || check.id.length === 0
      || typeof check.path !== "string"
      || !["exact", "contains", "regex", "json-schema"].includes(String(check.mode))
      || typeof check.expected !== "string"
      || typeof check.sourceRef !== "string" || check.sourceRef.length === 0
    ) {
      options.diagnostics.push({
        code: "validation-source-checks-invalid",
        caseId: options.caseId,
        message: "A source file check requires id, contained path, supported mode, expected text and sourceRef.",
      })
      continue
    }
    if (seenIds.has(check.id)) {
      options.diagnostics.push({
        code: "validation-source-checks-invalid",
        caseId: options.caseId,
        message: `Source file check id is duplicated: ${check.id}`,
      })
      continue
    }
    seenIds.add(check.id)
    const relative = portableRelative(rewriteBoundValidationPath(check.path, outputBindings))
    if (!relative) {
      options.diagnostics.push({
        code: "validation-source-checks-invalid",
        caseId: options.caseId,
        message: `Source file check ${check.id} has a path outside the validation case: ${check.path}`,
      })
      continue
    }
    if (!expected.has(relative)) continue
    const referenceRelative = portableRelative(check.sourceRef.split("#", 1)[0]!)
    if (!referenceRelative) {
      options.diagnostics.push({
        code: "validation-source-reference-invalid",
        caseId: options.caseId,
        message: `Source check ${check.id} has an invalid sourceRef: ${check.sourceRef}`,
      })
      continue
    }
    const referencePath = contained(options.sourceSkillDir, referenceRelative)
    if (!referencePath || !await Bun.file(referencePath).exists()) {
      options.diagnostics.push({
        code: "validation-source-reference-missing",
        caseId: options.caseId,
        message: `Source check ${check.id} references a missing source file: ${referenceRelative}`,
      })
      continue
    }
    assertions.push({
      id: check.id,
      authority: "source-derived",
      sourceRef: check.sourceRef,
      criterion: {
        id: check.id,
        method: "file-check",
        path: relative,
        mode: check.mode as "exact" | "contains" | "regex" | "json-schema",
        expected: check.expected,
      },
    })
  }
  return assertions
}

async function materializeCase(options: {
  action: OptimizationAction
  suggestion: OptimizationValidationCaseSuggestion
  evidence: Evidence
  validationRoot: string
  sourceSkillDir?: string
  index: number
  diagnostics: ProgramValidationPlanDiagnostic[]
  variation?: ValidationVariationCase
}): Promise<{ validationCase: ProgramValidationCase; evidence: ProgramValidationCaseEvidence } | undefined> {
  const { suggestion } = options
  const caseDirRelative = `${safeSegment(options.action.id, "action")}/${String(options.index + 1).padStart(2, "0")}-${safeSegment(suggestion.id, "case")}`
  const caseDir = contained(options.validationRoot, caseDirRelative)
  if (!caseDir) {
    options.diagnostics.push({
      code: "validation-input-path-invalid",
      caseId: suggestion.id,
      message: `Could not allocate a contained validation directory for case ${suggestion.id}.`,
    })
    return undefined
  }

  const sourcePaths = suggestion.inputFiles.map((inputPath) => (
    options.variation?.inputBindings.find((binding) => normalizeValidationPath(binding.targetPath) === normalizeValidationPath(inputPath))?.sourcePath ?? inputPath
  ))
  const projectedSources = sourcePaths.map(projectedInputSource)
  // Mixed sources are unambiguous only with explicit locators for every input.
  // Keep their projection directories so before/after files cannot overwrite.
  const mixedProjections = projectedSources.every(Boolean) && new Set(projectedSources).size > 1
  const inputSources = mixedProjections ? projectedSources as ValidationInputSource[] : sourcePaths.map(() => suggestion.inputSource)
  const preserveProjections = mixedProjections && suggestion.args.some((arg) => normalizeValidationPath(arg).includes(".optimize/tasks/"))
  if (mixedProjections && !preserveProjections) {
    const relativePaths = sourcePaths.map((value, index) => sourceRelativeEvidenceLocator(value, inputSources[index]!).relative?.toLowerCase())
    if (new Set(relativePaths).size !== relativePaths.length) {
      options.diagnostics.push({
        code: "validation-input-source-mismatch", caseId: suggestion.id,
        message: "Mixed input sources contain same-named files but argv declares no separate projection roots; explicit before/after arguments are required.",
      })
      return undefined
    }
  }
  const fixtures = inputSources.includes("task-fixtures")
    ? await taskFixtures(options.evidence)
    : undefined
  if (inputSources.includes("task-fixtures") && !fixtures) {
    options.diagnostics.push({
      code: "validation-task-source-unavailable",
      caseId: suggestion.id,
      message: `Evidence ${suggestion.evidenceId} has no readable string-valued task fixtures.`,
    })
    return undefined
  }

  let savedPreRunInputs: PreRunInputLookup | undefined
  if (inputSources.includes("pre-run-input-snapshot")) {
    if (!options.evidence.inputResources?.preRun) {
      options.diagnostics.push({
        code: "validation-pre-run-source-unavailable",
        caseId: suggestion.id,
        message: `Evidence ${suggestion.evidenceId} has no digest-bound pre-run input snapshot.`,
      })
      return undefined
    }
    try {
      savedPreRunInputs = await preRunInputs(options.evidence)
    } catch (error) {
      options.diagnostics.push({
        code: "validation-pre-run-source-unavailable",
        caseId: suggestion.id,
        message: `Evidence ${suggestion.evidenceId} pre-run input snapshot is unreadable: ${String(error)}`,
      })
      return undefined
    }
  }

  if (inputSources.includes("task-fixtures") && options.evidence.inputResources?.preRun) {
    try {
      const saved = await preRunInputs(options.evidence)
      const requested = sourcePaths
        .filter((_, index) => inputSources[index] === "task-fixtures")
        .map((inputPath) => sourceRelativeEvidenceLocator(inputPath, "task-fixtures").relative)
        .filter((relative): relative is string => relative !== undefined)
      const stale = requested.filter((relative) => {
        if (saved?.omitted.has(relative)) return true
        const current = saved?.files.get(relative)
        const declared = fixtures?.[relative]
        if (!current || declared === undefined) return false
        return sha256Bytes(current) !== sha256(declared)
      })
      if (stale.length > 0) {
        options.diagnostics.push({
          code: "validation-input-source-stale",
          caseId: suggestion.id,
          message: `Task-fixture inputs are stale or omitted for the captured pre-run state: ${stale.join(", ")}. Use inputSource pre-run-input-snapshot instead of silently validating against the declared fixture.` ,
        })
        return undefined
      }
    } catch (error) {
      options.diagnostics.push({
        code: "validation-pre-run-source-unavailable",
        caseId: suggestion.id,
        message: `Could not compare task fixtures with the captured pre-run input snapshot: ${String(error)}`,
      })
      return undefined
    }
  }

  const executionRoot = options.variation?.cwdRelative
    ? contained(caseDir, options.variation.cwdRelative)
    : caseDir
  if (!executionRoot) {
    options.diagnostics.push({
      code: "validation-input-path-invalid",
      caseId: suggestion.id,
      message: `Variation cwd escapes the validation case: ${options.variation?.cwdRelative ?? "unknown"}`,
    })
    return undefined
  }
  await mkdir(executionRoot, { recursive: true })
  const inputs: Array<{ relative: string; content: Uint8Array }> = []
  const argumentRewrites = new Map<string, string>()
  for (const [inputIndex, inputPath] of suggestion.inputFiles.entries()) {
    const sourceInputPath = sourcePaths[inputIndex]!
    const inputSource = inputSources[inputIndex]!
    const located = sourceRelativeEvidenceLocator(sourceInputPath, inputSource)
    if (located.diagnostic) {
      options.diagnostics.push({ ...located.diagnostic, caseId: suggestion.id })
      return undefined
    }
    const relative = options.variation || preserveProjections ? portableRelative(inputPath) : located.relative
    if (!relative) {
      options.diagnostics.push({
        code: "validation-input-path-invalid",
        caseId: suggestion.id,
        message: `Validation input path is not a contained relative path: ${inputPath}`,
      })
      return undefined
    }
    if (!options.variation && inputPath.replaceAll("\\", "/") !== relative) {
      argumentRewrites.set(inputPath, relative)
    }
    const textContent = inputSource === "task-fixtures"
      ? fixtures?.[located.relative ?? sourceInputPath.replaceAll("\\", "/")]
      : inputSource === "workdir-snapshot"
        ? snapshotContent(options.evidence, located.relative ?? sourceInputPath.replaceAll("\\", "/"))
        : undefined
    const content = inputSource === "pre-run-input-snapshot"
      ? savedPreRunInputs?.files.get(located.relative ?? sourceInputPath.replaceAll("\\", "/"))
      : textContent === undefined ? undefined : new TextEncoder().encode(textContent)
    if (content === undefined) {
      options.diagnostics.push({
        code: "validation-input-missing",
        caseId: suggestion.id,
        message: `Validation input ${relative} is unavailable from ${inputSource} for evidence ${suggestion.evidenceId}.`,
      })
      return undefined
    }
    inputs.push({ relative, content })
  }

  const expectedFiles: string[] = []
  const expectedFileSha256: Record<string, string> = {}
  const expectedFileJson: Record<string, unknown> = {}
  for (const expected of suggestion.expectedFiles ?? []) {
    const outputPath = portableRelative(expected.path)
    if (!outputPath) {
      options.diagnostics.push({
        code: "validation-reference-path-invalid",
        caseId: suggestion.id,
        message: `Expected output path is not a contained relative path: ${expected.path}`,
      })
      return undefined
    }
    expectedFiles.push(outputPath)
    if (!expected.referencePath) continue
    const locatedReference = sourceRelativeEvidenceLocator(expected.referencePath, "workdir-snapshot")
    if (locatedReference.diagnostic) {
      options.diagnostics.push({ ...locatedReference.diagnostic, caseId: suggestion.id })
      return undefined
    }
    const referencePath = locatedReference.relative
    if (!referencePath) {
      options.diagnostics.push({
        code: "validation-reference-path-invalid",
        caseId: suggestion.id,
        message: `Reference output path is not a contained relative path: ${expected.referencePath}`,
      })
      return undefined
    }
    const reference = snapshotContent(options.evidence, referencePath)
    if (reference === undefined) {
      options.diagnostics.push({
        code: "validation-reference-missing",
        caseId: suggestion.id,
        message: `Reference output ${referencePath} is unavailable in evidence ${suggestion.evidenceId}.`,
      })
      return undefined
    }
    expectedFileSha256[outputPath] = sha256(reference)
    if (path.posix.extname(outputPath).toLowerCase() === ".json") {
      try {
        expectedFileJson[outputPath] = JSON.parse(reference)
      } catch {
        // Non-JSON references retain the existing byte comparison.
      }
    }
  }
  if (suggestion.basis === "reference-output" && Object.keys(expectedFileSha256).length === 0) {
    options.diagnostics.push({
      code: "validation-reference-required",
      caseId: suggestion.id,
      message: "A reference-output case must bind at least one expected file to observed reference bytes.",
    })
    return undefined
  }
  const expectedAbsentFiles: string[] = []
  for (const absentPath of suggestion.expectedAbsentFiles ?? []) {
    const relative = portableRelative(absentPath)
    if (!relative) {
      options.diagnostics.push({
        code: "validation-reference-path-invalid",
        caseId: suggestion.id,
        message: `Expected-absent path is not a contained relative path: ${absentPath}`,
      })
      return undefined
    }
    expectedAbsentFiles.push(relative)
  }
  const outputBindings = options.variation?.outputBindings ?? []
  const taskAssertions = await taskAssertionBindings(suggestion, options.evidence, options.diagnostics, outputBindings)
  const sourceAssertions = await sourceAssertionBindings({
    sourceSkillDir: options.sourceSkillDir,
    expectedFiles,
    caseId: suggestion.id,
    diagnostics: options.diagnostics,
    outputBindings,
  })
  const assertions = [...taskAssertions, ...sourceAssertions]

  await rm(caseDir, { recursive: true, force: true })
  await mkdir(caseDir, { recursive: true })
  await mkdir(executionRoot, { recursive: true })
  for (const input of inputs) {
    const target = contained(executionRoot, input.relative)!
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, input.content)
  }
  // A root-level output originally had an existing parent (the case cwd).
  // Relocation must preserve that condition, not require new mkdir behavior.
  for (const binding of outputBindings) {
    if (path.posix.dirname(binding.sourcePath.replaceAll("\\", "/")) !== ".") continue
    const target = contained(executionRoot, binding.targetPath)
    if (target) await mkdir(path.dirname(target), { recursive: true })
  }
  return {
    validationCase: {
      id: suggestion.id,
      cwd: executionRoot,
      args: rewriteProjectedArguments(suggestion.args, argumentRewrites),
      ...(suggestion.expectedExitCode === undefined ? {} : { expectedExitCode: suggestion.expectedExitCode }),
      ...(suggestion.stdoutIncludes ? { stdoutIncludes: [...suggestion.stdoutIncludes] } : {}),
      ...(suggestion.stderrIncludes ? { stderrIncludes: [...suggestion.stderrIncludes] } : {}),
      ...(expectedFiles.length > 0 ? { expectedFiles } : {}),
      ...(expectedAbsentFiles.length > 0 ? { expectedAbsentFiles } : {}),
      ...(Object.keys(expectedFileSha256).length > 0 ? { expectedFileSha256 } : {}),
      ...(Object.keys(expectedFileJson).length > 0 ? { expectedFileJson } : {}),
      ...(assertions.length > 0 ? { assertions } : {}),
    },
    evidence: {
      id: suggestion.id,
      evidenceId: suggestion.evidenceId,
      basis: suggestion.basis,
      sourceRefs: [...suggestion.sourceRefs],
      referenceDigests: expectedFileSha256,
      referenceAuthorityCriterionIds: suggestion.basis === "reference-output"
        ? passedCriterionBindings(suggestion, options.evidence)
        : [],
      independentCriterionIds: taskAssertions.map((item) => item.id),
      executedAssertionIds: assertions.map((item) => item.id),
      assertionAuthorities: assertions.map((item) => item.authority),
      applicability: suggestion.applicability ?? "supported",
      inputDigests: Object.fromEntries(inputs.map((item) => [item.relative, sha256Bytes(item.content)])),
      expectedAbsentFiles,
      ...(options.variation ? {
        variation: {
          kind: options.variation.kind,
          parentCaseId: options.variation.parentCaseId,
          changedBindings: [...options.variation.changedBindings],
          sourceRefs: [...options.variation.sourceRefs],
        },
      } : {}),
    },
  }
}

function stableRecord(value: Record<string, string>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right, "en"))))
}

function normalizedCaseArgs(
  validationCase: ProgramValidationCase,
  evidence: ProgramValidationCaseEvidence,
): string {
  const paths = Object.keys(evidence.inputDigests).sort((left, right) => right.length - left.length)
  return JSON.stringify(validationCase.args.map((arg) => {
    let normalized = arg
    for (const [index, inputPath] of paths.entries()) {
      normalized = normalized.replaceAll(inputPath, `<input:${index}>`)
    }
    return normalized
  }))
}

function outputSignature(run: OptimizationProgramValidationResult["cases"][number]): string {
  return stableRecord(Object.fromEntries(run.outputFiles.map((file) => [file.path, file.sha256])))
}

function deriveCapabilityBoundary(
  action: OptimizationAction,
  plan: DerivedProgramValidationPlan,
  program: OptimizationProgramValidationResult,
): OptimizationCapabilityBoundary {
  const planCaseById = new Map(plan.cases.map((item) => [item.id, item]))
  const evidenceById = new Map(plan.caseEvidence.map((item) => [item.id, item]))
  const runById = new Map(program.cases.map((item) => [item.id, item]))
  const supported = plan.caseEvidence.filter((item) => item.applicability === "supported")
  const notApplicable = plan.caseEvidence.filter((item) => item.applicability === "not-applicable")
  let inputVariationAffectsOutput = false
  let parameterVariationAffectsOutput = false
  for (let leftIndex = 0; leftIndex < supported.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < supported.length; rightIndex += 1) {
      const leftEvidence = supported[leftIndex]!
      const rightEvidence = supported[rightIndex]!
      const leftCase = planCaseById.get(leftEvidence.id)
      const rightCase = planCaseById.get(rightEvidence.id)
      const leftRun = runById.get(leftEvidence.id)
      const rightRun = runById.get(rightEvidence.id)
      if (!leftCase || !rightCase || leftRun?.status !== "passed" || rightRun?.status !== "passed") continue
      const inputsSame = stableRecord(leftEvidence.inputDigests) === stableRecord(rightEvidence.inputDigests)
      const argsSame = normalizedCaseArgs(leftCase, leftEvidence) === normalizedCaseArgs(rightCase, rightEvidence)
      const outputsDiffer = outputSignature(leftRun) !== outputSignature(rightRun)
      if (!inputsSame && argsSame && outputsDiffer) inputVariationAffectsOutput = true
      if (inputsSame && !argsSame && outputsDiffer) parameterVariationAffectsOutput = true
    }
  }
  return {
    selectionMeaning: "entry-found-only",
    supportedCaseIds: supported.map((item) => item.id),
    notApplicableCaseIds: notApplicable.map((item) => item.id),
    inputVariationAffectsOutput,
    parameterVariationAffectsOutput,
    rejectedBeforeWriteCaseIds: notApplicable
      .filter((item) => item.expectedAbsentFiles.length > 0 && runById.get(item.id)?.status === "passed")
      .map((item) => item.id),
    unverifiedInputs: [...action.inputs],
    unverifiedPreconditions: [...action.preconditions],
    residualAgentDuty: "Declared inputs and preconditions outside the executed cases remain unverified and must be handled by the agent.",
  }
}

/** Resolve optimizer suggestions against real evidence without inventing files or assertions. */
export async function deriveProgramValidationPlan(
  options: DeriveProgramValidationPlanOptions,
): Promise<DerivedProgramValidationPlan> {
  const common = {
    actionId: options.action.id,
    implementation: options.implementation,
    cases: [] as ProgramValidationCase[],
    caseEvidence: [] as ProgramValidationCaseEvidence[],
    independentCaseIds: [] as string[],
    selfCheckCaseIds: [] as string[],
  }
  if (options.implementation.status !== "selected" || !options.implementation.entry) {
    return {
      ...common,
      status: "not-applicable",
      diagnostics: [{
        code: "implementation-not-executable",
        message: options.implementation.reason ?? "The selected action has no executable program entry.",
      }],
    }
  }
  const suggestion = options.action.validation
  if (!suggestion) {
    return {
      ...common,
      status: "not-applicable",
      diagnostics: [{
        code: "validation-suggestion-missing",
        message: "The action has no optimizer-authored validation suggestion.",
      }],
    }
  }
  if (suggestion.cases.length === 0) {
    return {
      ...common,
      status: "not-applicable",
      ...(suggestion.help ? { help: { ...suggestion.help } } : {}),
      diagnostics: [{
        code: "validation-cases-missing",
        message: "The action has no task-behavior validation case; help alone is insufficient.",
      }],
    }
  }

  const diagnostics: ProgramValidationPlanDiagnostic[] = []
  const seenIds = new Set<string>()
  const cases: ProgramValidationCase[] = []
  const caseEvidence: ProgramValidationCaseEvidence[] = []
  const variations = options.derivedVariations ?? []
  const projectionPrefixes = new Map(groupEvidencesByTask(options.evidences).flatMap((group) => (
    group.runs.map((run) => [String(run.globalIndex), `.optimize/tasks/${group.safeId}/run-${run.localIndex}`] as const)
  )))
  const variationById = new Map(variations.map((item) => [item.id, item]))
  const suggestions = [
    ...suggestion.cases,
    ...variations.map((item) => item.suggestion),
  ]
  for (const [index, item] of suggestions.entries()) {
    if (seenIds.has(item.id)) {
      diagnostics.push({
        code: "validation-case-duplicate",
        caseId: item.id,
        message: `Validation case id is duplicated: ${item.id}`,
      })
      continue
    }
    seenIds.add(item.id)
    const evidence = evidenceAt(item, options.action, options.evidences, diagnostics)
    if (!evidence) continue
    const variation = variationById.get(item.id)
    const locators = [
      ...item.inputFiles.map((inputPath) => variation?.inputBindings.find((binding) => binding.targetPath === inputPath)?.sourcePath ?? inputPath),
      ...(item.expectedFiles ?? []).flatMap((file) => file.referencePath ? [file.referencePath] : []),
    ]
    const wrongProjection = locators.find((locator) => {
      const match = /^(\.optimize\/tasks\/[^/]+\/run-\d+)-(?:task-fixtures|pre-run-inputs|workdir)\//u.exec(normalizeValidationPath(locator))
      return match && match[1] !== projectionPrefixes.get(item.evidenceId)
    })
    if (wrongProjection) {
      diagnostics.push({
        code: "validation-evidence-invalid", caseId: item.id,
        message: `Validation locator ${wrongProjection} does not belong to declared evidence ${item.evidenceId}.`,
      })
      continue
    }
    const materialized = await materializeCase({
      action: options.action,
      suggestion: item,
      evidence,
      validationRoot: options.validationRoot,
      sourceSkillDir: options.sourceSkillDir,
      index,
      diagnostics,
      variation,
    })
    if (!materialized) continue
    cases.push(materialized.validationCase)
    caseEvidence.push(materialized.evidence)
  }
  const independentCaseIds = caseEvidence
    .filter((item) => (
      item.basis === "reference-output"
      && Object.keys(item.referenceDigests).length > 0
      && item.referenceAuthorityCriterionIds.length > 0
    ) || (
      item.basis === "task-contract" && item.assertionAuthorities.some((authority) => authority !== "self-check")
    ))
    .map((item) => item.id)
  const selfCheckCaseIds = caseEvidence
    .filter((item) => !independentCaseIds.includes(item.id))
    .map((item) => item.id)
  return {
    ...common,
    status: diagnostics.length > 0 ? "unresolved" : "ready",
    ...(suggestion.help ? { help: { ...suggestion.help } } : {}),
    cases,
    caseEvidence,
    independentCaseIds,
    selfCheckCaseIds,
    diagnostics,
    ...(options.variationAudit ? {
      variations: {
        generated: options.variationAudit.generated.map((item) => ({
          id: item.id,
          parentCaseId: item.parentCaseId,
          kind: item.kind,
          changedBindings: [...item.changedBindings],
          sourceRefs: [...item.sourceRefs],
          rationale: item.rationale,
        })),
        covered: options.variationAudit.covered.map((item) => ({
          kind: item.kind,
          caseIds: [...item.caseIds],
          changedBindings: [...item.changedBindings],
          sourceRefs: [...item.sourceRefs],
          rationale: item.rationale,
        })),
        skipped: options.variationAudit.skipped.map((item) => ({
          parentCaseId: item.parentCaseId,
          kind: item.kind,
          reason: item.reason,
          sourceRefs: [...item.sourceRefs],
        })),
      },
    } : {}),
  }
}

/** Select, materialize, execute, resolve and persist validation for one candidate snapshot. */
export async function runOptimizationValidationLifecycle(
  options: RunOptimizationValidationLifecycleOptions,
): Promise<RunOptimizationValidationLifecycleResult> {
  const relativeReportPath = `round-${options.round}-validation/report.json`
  const reportDir = path.join(options.proposalDir, `round-${options.round}-validation`)
  const validationRoot = path.join(reportDir, "cases")
  await mkdir(validationRoot, { recursive: true })
  const implementations = await selectOptimizationImplementations({
    skillDir: options.skillDir,
    baselineSkillDir: options.baselineSkillDir,
    actions: options.actions,
  })
  const byActionId = new Map(implementations.map((item) => [item.actionId, item]))
  const observations: ActionValidationObservation[] = []
  const records: OptimizationActionValidationRecord[] = []
  let programRuns = 0
  let helpRuns = 0
  let caseRuns = 0
  let independentCaseRuns = 0
  let reusedActionObservations = 0
  const repairableFeedback: OptimizationValidationRepairableFeedback[] = []
  const executeActionIds = options.executeActionIds ? new Set(options.executeActionIds) : undefined

  for (const action of options.actions) {
    const implementation = byActionId.get(action.id)!
    const completion = await completeValidationSuggestion({
      action,
      implementation,
      evidences: options.evidences,
      sourceSkillDir: options.sourceSkillDir,
    })
    const effectiveAction = completion.action
    // F5 variations are derived from an optimizer-declared executable case.
    // A F3 auto-wired baseline remains a single conservative check; callers
    // can submit the case explicitly when they want relocation coverage.
    const variationAction = action.validation?.cases.length && effectiveAction.validation?.cases.length
      ? effectiveAction
      : { ...effectiveAction, validation: undefined }
    const variationAudit = await deriveValidationVariations({
      action: variationAction,
      implementation,
      evidences: options.evidences,
      sourceSkillDir: options.sourceSkillDir,
      sourceParameterRules: options.sourceParameterRules,
    })
    if (completion.status === "repairable" && completion.repairable) {
      repairableFeedback.push({
        actionId: action.id,
        failureKind: "validation-metadata-missing",
        diagnostics: completion.diagnostics.map((item) => `${item.code}: ${item.message}`),
        relevantFiles: [...completion.repairable.relevantFiles].sort(),
        fields: [...completion.repairable.fields],
        suggestion: completion.repairable.suggestion,
      })
    }
    const bindingAction = variationAudit.generated.length > 0
      ? {
          ...effectiveAction,
          validation: effectiveAction.validation
            ? { ...effectiveAction.validation, cases: [...effectiveAction.validation.cases, ...variationAudit.generated.map((item) => item.suggestion)] }
            : undefined,
        }
      : effectiveAction
    const validationBinding = await deriveValidationBinding({
      skillDir: options.skillDir,
      action: bindingAction,
      implementation,
      evidences: options.evidences,
    })
    const priorRecord = options.priorReport?.actions.find((item) => item.actionId === action.id)
    const changedPathsKnown = options.changedPathsSincePrior !== undefined
    const dependencyReuseSafe = options.changedPathsSincePrior?.length === 0
      || validationBinding.dependencyAnalysis === "complete-static"
    const bindingMatches = priorRecord?.validationBinding?.sha256 === validationBinding.sha256
    if (
      executeActionIds
      && !executeActionIds.has(action.id)
      && changedPathsKnown
      && dependencyReuseSafe
      && bindingMatches
    ) {
      if (priorRecord && options.priorReport?.resolution.retainedActionIds.includes(action.id)) {
        observations.push({ actionId: action.id, status: "passed", diagnostics: [] })
      } else if (priorRecord && options.priorReport?.resolution.unvalidatedActionIds.includes(action.id)) {
        observations.push({ actionId: action.id, status: "not-run", diagnostics: ["Reused prior unvalidated observation."] })
      } else {
        const rejected = options.priorReport?.resolution.rejected.find((item) => item.actionId === action.id)
        observations.push({
          actionId: action.id,
          status: rejected?.failureKind === "not-applicable" ? "not-applicable" : "failed",
          diagnostics: rejected?.diagnostics ?? ["No reusable prior validation observation was available."],
        })
      }
      reusedActionObservations += 1
      records.push({
        ...(priorRecord ?? {
          actionId: action.id,
          kind: action.kind,
          implementation,
          planStatus: "not-applicable" as const,
          planDiagnostics: [],
          independentCaseIds: [],
          selfCheckCaseIds: [],
          programStatus: "not-run" as const,
        }),
        ...(completion.status === "unchanged" ? {} : {
          validationCompletion: {
            status: completion.status,
            diagnostics: completion.diagnostics,
            provenance: completion.provenance,
          },
        }),
        ...(hasVariationReport(variationAudit) ? { variationChecks: summarizeVariationAudit(variationAudit) } : {}),
        validationBinding,
        validationSource: "reused-initial-observation",
      })
      continue
    }
    if (action.kind === "restructure-docs") {
      const dependencyCovered = implementation.status === "selected" && action.dependsOn.length > 0
      observations.push({
        actionId: action.id,
        status: dependencyCovered ? "passed" : "not-run",
        diagnostics: [dependencyCovered
          ? "Selected documentation route has no independent program behavior; retention is conditional on validation closure for its declared dependencies."
          : "Documentation-only action has no program behavior to execute and no declared validated dependency."],
      })
      records.push({
        actionId: action.id,
        kind: action.kind,
        implementation,
        planStatus: "not-applicable",
        planDiagnostics: [{
          code: "implementation-not-executable",
          message: dependencyCovered
            ? "Documentation route is statically selected and validated only through its declared dependency closure."
            : "Documentation-only action has no program behavior to execute and no declared validated dependency.",
        }],
        independentCaseIds: [],
        selfCheckCaseIds: [],
        programStatus: "not-run",
        ...(completion.status === "unchanged" ? {} : {
          validationCompletion: {
            status: completion.status,
            diagnostics: completion.diagnostics,
            provenance: completion.provenance,
          },
        }),
        ...(hasVariationReport(variationAudit) ? { variationChecks: summarizeVariationAudit(variationAudit) } : {}),
        validationBinding,
        validationSource: "executed",
      })
      continue
    }
    if (implementation.status !== "selected") {
      observations.push({
        actionId: action.id,
        status: implementation.status === "failed" ? "failed" : "not-applicable",
        ...(implementation.status === "failed" ? { failureKind: "entry-unclear" as const } : {}),
        diagnostics: [implementation.reason ?? "No executable implementation was selected."],
      })
      records.push({
        actionId: action.id,
        kind: action.kind,
        implementation,
        planStatus: "not-applicable",
        planDiagnostics: [{
          code: "implementation-not-executable",
          message: implementation.reason ?? "No executable implementation was selected.",
        }],
        independentCaseIds: [],
        selfCheckCaseIds: [],
        programStatus: "not-run",
        ...(completion.status === "unchanged" ? {} : {
          validationCompletion: {
            status: completion.status,
            diagnostics: completion.diagnostics,
            provenance: completion.provenance,
          },
        }),
        ...(hasVariationReport(variationAudit) ? { variationChecks: summarizeVariationAudit(variationAudit) } : {}),
        validationBinding,
        validationSource: "executed",
      })
      continue
    }

    const plan = await deriveProgramValidationPlan({
      action: effectiveAction,
      implementation,
      evidences: options.evidences,
      validationRoot,
      sourceSkillDir: options.sourceSkillDir,
      derivedVariations: variationAudit.generated,
      variationAudit,
    })
    if (plan.cases.length === 0) {
      observations.push({
        actionId: action.id,
        status: "not-run",
        diagnostics: [
          ...completion.diagnostics.map((item) => `${item.code}: ${item.message}`),
          ...plan.diagnostics.map((item) => `${item.code}: ${item.message}`),
        ],
      })
      records.push({
        actionId: action.id,
        kind: action.kind,
        implementation,
        planStatus: plan.status,
        planDiagnostics: plan.diagnostics,
        independentCaseIds: plan.independentCaseIds,
        selfCheckCaseIds: plan.selfCheckCaseIds,
        programStatus: "not-run",
        ...(completion.status === "unchanged" ? {} : {
          validationCompletion: {
            status: completion.status,
            diagnostics: completion.diagnostics,
            provenance: completion.provenance,
          },
        }),
        ...(hasVariationReport(variationAudit) ? { variationChecks: summarizeVariationAudit(variationAudit) } : {}),
        validationBinding,
        validationSource: "executed",
      })
      continue
    }

    const program = await validateOptimizationProgram({
      packageDir: options.skillDir,
      implementation,
      help: plan.help,
      cases: plan.cases,
    })
    programRuns += 1
    helpRuns += program.help ? 1 : 0
    caseRuns += program.cases.length
    independentCaseRuns += program.cases.filter((item) => plan.independentCaseIds.includes(item.id)).length
    const diagnostics = [
      ...program.diagnostics.map((item) => `${item.code}: ${item.message}`),
      ...[program.help, ...program.cases].flatMap((item) => item?.diagnostics ?? []),
    ]
    if (program.status === "failed") {
      observations.push({
        actionId: action.id,
        status: "failed",
        ...(program.failureKind ? { failureKind: program.failureKind } : {}),
        diagnostics,
        ...(program.nextAction ? { nextAction: program.nextAction } : {}),
      })
    } else if (program.status === "passed" && plan.status === "ready") {
      observations.push({
        actionId: action.id,
        status: "passed",
        diagnostics: [
          ...diagnostics,
          ...(plan.independentCaseIds.length === 0
            ? ["Executed cases passed; independent task quality remains unverified."]
            : []),
        ],
      })
    } else {
      observations.push({
        actionId: action.id,
        status: "not-run",
        diagnostics: [
          ...diagnostics,
          plan.status !== "ready"
              ? "Some task-behavior cases ran, but unresolved case obligations remain and the full declared action scope is unassessed."
              : "No applicable task-behavior case completed.",
        ],
      })
    }
    records.push({
      actionId: action.id,
      kind: action.kind,
      implementation,
      planStatus: plan.status,
      planDiagnostics: plan.diagnostics,
      independentCaseIds: plan.independentCaseIds,
      selfCheckCaseIds: plan.selfCheckCaseIds,
      programStatus: program.status,
      program,
      ...(completion.status === "unchanged" ? {} : {
        validationCompletion: {
          status: completion.status,
          diagnostics: completion.diagnostics,
          provenance: completion.provenance,
        },
      }),
      ...(hasVariationReport(variationAudit) ? { variationChecks: summarizeVariationAudit(variationAudit) } : {}),
      capabilityBoundary: deriveCapabilityBoundary(effectiveAction, plan, program),
      validationBinding,
      validationSource: "executed",
    })
  }

  const resolution = resolveActionValidation({ actions: options.actions, observations })
  const report: OptimizationValidationLifecycleReport = {
    schemaVersion: OPTIMIZATION_VALIDATION_REPORT_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    round: options.round,
    sourceMode: "execution-log-local-validation",
    sourceTaskReplayed: false,
    actions: records,
    resolution,
    ...(repairableFeedback.length > 0 ? {
      repairable: {
        actionIds: [...new Set(repairableFeedback.map((item) => item.actionId))],
        feedback: repairableFeedback,
      },
    } : {}),
    execution: { programRuns, helpRuns, caseRuns, independentCaseRuns, reusedActionObservations },
  }
  await Bun.write(path.join(reportDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`)
  const summary: OptimizationRoundValidationSummary = {
    status: resolution.status,
    reportPath: relativeReportPath,
    retainedActionIds: [...resolution.retainedActionIds],
    unvalidatedActionIds: [...resolution.unvalidatedActionIds],
    rejectedActionIds: resolution.rejected.map((item) => item.actionId),
    programRuns,
    caseRuns,
    independentCaseRuns,
  }
  return { report, summary }
}
