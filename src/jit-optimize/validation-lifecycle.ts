import path from "node:path"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { EvalCriterionSchema, type EvalCriterion } from "../core/types.ts"
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
  OptimizationValidationBasis,
  OptimizationValidationCaseSuggestion,
} from "./types.ts"

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
    | "validation-input-missing"
    | "validation-task-source-unavailable"
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
}

export interface DeriveProgramValidationPlanOptions {
  action: OptimizationAction
  implementation: ImplementationSelection
  evidences: readonly Evidence[]
  /** Dedicated, disposable root controlled by the caller. */
  validationRoot: string
  /** Original, pre-edit skill root used only for source-owned checks. */
  sourceSkillDir?: string
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
  validationSource?: "executed" | "reused-initial-observation"
}

export interface OptimizationValidationLifecycleReport {
  schemaVersion: typeof OPTIMIZATION_VALIDATION_REPORT_SCHEMA_VERSION
  createdAt: string
  round: number
  sourceMode: "execution-log-local-validation"
  sourceTaskReplayed: false
  actions: OptimizationActionValidationRecord[]
  resolution: ActionValidationResolution
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
    feedback: Array<{
      actionId: string
      failureKind: string
      diagnostics: string[]
      relevantFiles: string[]
    }>
    optimizerRecordPath: string
    initialReportPath: string
    repairReportPath?: string
    costUsd: number | null
    tokens?: { input: number; output: number; cacheRead: number; cacheWrite: number }
    outcome: "passed" | "rolled-back" | "optimizer-failed" | "scope-violation"
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
  actions: readonly OptimizationAction[]
  evidences: readonly Evidence[]
  /** Re-run only these actions and reuse explicit observations for the rest. */
  executeActionIds?: readonly string[]
  priorReport?: OptimizationValidationLifecycleReport
}

export interface RunOptimizationValidationLifecycleResult {
  report: OptimizationValidationLifecycleReport
  summary: OptimizationRoundValidationSummary
}

function sha256(value: string): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
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

type ValidationInputSource = OptimizationValidationCaseSuggestion["inputSource"]

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
  const projected = /^\.optimize\/tasks\/[^/]+\/run-\d+-(task-fixtures|workdir)\/(.+)$/u.exec(portable)
  if (!projected) return { relative: portableRelative(portable) }
  const projectedSource: ValidationInputSource = projected[1] === "task-fixtures"
    ? "task-fixtures"
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
    const relative = portableRelative(criterion.path)
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
  const expected = new Set(options.expectedFiles)
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
    const relative = portableRelative(check.path)
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

  const fixtures = suggestion.inputSource === "task-fixtures"
    ? await taskFixtures(options.evidence)
    : undefined
  if (suggestion.inputSource === "task-fixtures" && !fixtures) {
    options.diagnostics.push({
      code: "validation-task-source-unavailable",
      caseId: suggestion.id,
      message: `Evidence ${suggestion.evidenceId} has no readable string-valued task fixtures.`,
    })
    return undefined
  }

  const inputs: Array<{ relative: string; content: string }> = []
  const argumentRewrites = new Map<string, string>()
  for (const inputPath of suggestion.inputFiles) {
    const located = sourceRelativeEvidenceLocator(inputPath, suggestion.inputSource)
    if (located.diagnostic) {
      options.diagnostics.push({ ...located.diagnostic, caseId: suggestion.id })
      return undefined
    }
    const relative = located.relative
    if (!relative) {
      options.diagnostics.push({
        code: "validation-input-path-invalid",
        caseId: suggestion.id,
        message: `Validation input path is not a contained relative path: ${inputPath}`,
      })
      return undefined
    }
    if (inputPath.replaceAll("\\", "/") !== relative) {
      argumentRewrites.set(inputPath, relative)
    }
    const content = suggestion.inputSource === "task-fixtures"
      ? fixtures?.[relative]
      : snapshotContent(options.evidence, relative)
    if (content === undefined) {
      options.diagnostics.push({
        code: "validation-input-missing",
        caseId: suggestion.id,
        message: `Validation input ${relative} is unavailable from ${suggestion.inputSource} for evidence ${suggestion.evidenceId}.`,
      })
      return undefined
    }
    inputs.push({ relative, content })
  }

  const expectedFiles: string[] = []
  const expectedFileSha256: Record<string, string> = {}
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
  }
  if (suggestion.basis === "reference-output" && Object.keys(expectedFileSha256).length === 0) {
    options.diagnostics.push({
      code: "validation-reference-required",
      caseId: suggestion.id,
      message: "A reference-output case must bind at least one expected file to observed reference bytes.",
    })
    return undefined
  }
  const taskAssertions = await taskAssertionBindings(suggestion, options.evidence, options.diagnostics)
  const sourceAssertions = await sourceAssertionBindings({
    sourceSkillDir: options.sourceSkillDir,
    expectedFiles,
    caseId: suggestion.id,
    diagnostics: options.diagnostics,
  })
  const assertions = [...taskAssertions, ...sourceAssertions]

  await rm(caseDir, { recursive: true, force: true })
  await mkdir(caseDir, { recursive: true })
  for (const input of inputs) {
    const target = contained(caseDir, input.relative)!
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, input.content)
  }
  return {
    validationCase: {
      id: suggestion.id,
      cwd: caseDir,
      args: rewriteProjectedArguments(suggestion.args, argumentRewrites),
      ...(suggestion.expectedExitCode === undefined ? {} : { expectedExitCode: suggestion.expectedExitCode }),
      ...(suggestion.stdoutIncludes ? { stdoutIncludes: [...suggestion.stdoutIncludes] } : {}),
      ...(suggestion.stderrIncludes ? { stderrIncludes: [...suggestion.stderrIncludes] } : {}),
      ...(expectedFiles.length > 0 ? { expectedFiles } : {}),
      ...(Object.keys(expectedFileSha256).length > 0 ? { expectedFileSha256 } : {}),
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
    },
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
  for (const [index, item] of suggestion.cases.entries()) {
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
    const materialized = await materializeCase({
      action: options.action,
      suggestion: item,
      evidence,
      validationRoot: options.validationRoot,
      sourceSkillDir: options.sourceSkillDir,
      index,
      diagnostics,
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
  const executeActionIds = options.executeActionIds ? new Set(options.executeActionIds) : undefined

  for (const action of options.actions) {
    const implementation = byActionId.get(action.id)!
    if (executeActionIds && !executeActionIds.has(action.id)) {
      const priorRecord = options.priorReport?.actions.find((item) => item.actionId === action.id)
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
        validationSource: "executed",
      })
      continue
    }

    const plan = await deriveProgramValidationPlan({
      action,
      implementation,
      evidences: options.evidences,
      validationRoot,
      sourceSkillDir: options.sourceSkillDir,
    })
    if (plan.cases.length === 0) {
      observations.push({
        actionId: action.id,
        status: "not-run",
        diagnostics: plan.diagnostics.map((item) => `${item.code}: ${item.message}`),
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
      })
    } else if (program.status === "passed" && plan.status === "ready" && plan.independentCaseIds.length > 0) {
      observations.push({ actionId: action.id, status: "passed", diagnostics })
    } else {
      observations.push({
        actionId: action.id,
        status: "not-run",
        diagnostics: [
          ...diagnostics,
          plan.independentCaseIds.length === 0
            ? "Only self-check, unscored fidelity-reference, or externally-unbound cases ran; no current task/source assertion established task behavior."
            : plan.status !== "ready"
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
