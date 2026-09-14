/**
 * Deterministic completion of executable validation metadata.
 *
 * This module only wires facts that are already present in Evidence, the
 * selected implementation and digest-bound source resources. It never invents
 * an expected answer, command, input file or semantic assertion. When a
 * required fact is ambiguous, the original action is returned unchanged and a
 * locator-rich diagnostic is emitted for the existing validation lifecycle or
 * a bounded repair pass to handle.
 */

import path from "node:path"
import { readPreRunInputSnapshotContents } from "../run/pre-run-input-snapshot.ts"
import type { AgentStep } from "../core/types.ts"
import type { ImplementationSelection } from "./implementations.ts"
import {
  buildOperationContext,
  type OperationParameterRule,
  type OperationRecord,
} from "./operation-context.ts"
import type {
  Evidence,
  OptimizationAction,
  OptimizationProgramValidationSuggestion,
  OptimizationValidationCaseSuggestion,
} from "./types.ts"

export type ValidationCompletionStatus = "unchanged" | "completed" | "repairable" | "unresolved" | "not-applicable"

export type ValidationCompletionDiagnosticCode =
  | "validation-completion-evidence-unavailable"
  | "validation-completion-entry-unobserved"
  | "validation-completion-operation-ambiguous"
  | "validation-completion-argv-unresolved"
  | "validation-completion-input-unresolved"
  | "validation-completion-output-unresolved"
  | "validation-completion-metadata-missing"
  | "validation-completion-source-check-unavailable"

export interface ValidationCompletionDiagnostic {
  code: ValidationCompletionDiagnosticCode
  severity: "warning" | "error"
  message: string
  actionId: string
  evidenceId?: string
  locator?: string
  field?: string
}

export interface ValidationCompletionFieldProvenance {
  source: string
  locator?: string
  detail?: string
}

export interface ValidationCompletionProvenance {
  mode: "existing" | "deterministic"
  evidenceId?: string
  operationId?: string
  fields: Record<string, ValidationCompletionFieldProvenance>
}

export interface ValidationCompletionResult {
  status: ValidationCompletionStatus
  action: OptimizationAction
  suggestion?: OptimizationProgramValidationSuggestion
  /** A deterministic candidate the bounded repair pass may adopt. */
  repairable?: {
    fields: string[]
    evidenceIds: string[]
    relevantFiles: string[]
    suggestion: OptimizationProgramValidationSuggestion
  }
  diagnostics: ValidationCompletionDiagnostic[]
  provenance: ValidationCompletionProvenance
}

export type ValidationVariationKind = "path" | "cwd" | "parameter"

export interface ValidationVariationInputBinding {
  sourcePath: string
  targetPath: string
}

/**
 * An engine-derived case.  The embedded suggestion is still an ordinary
 * validation case; the extra bindings are kept outside the optimizer-facing
 * action schema so relocation never becomes a user-authored DSL.
 */
export interface ValidationVariationCase {
  id: string
  parentCaseId: string
  kind: ValidationVariationKind
  changedBindings: string[]
  sourceRefs: string[]
  rationale: string
  suggestion: OptimizationValidationCaseSuggestion
  inputBindings: ValidationVariationInputBinding[]
  outputBindings: ValidationVariationInputBinding[]
  cwdRelative?: string
}

export interface ValidationVariationSkip {
  parentCaseId: string
  kind: ValidationVariationKind
  reason: string
  sourceRefs: string[]
}

export interface ValidationVariationCoverage {
  kind: "parameter"
  caseIds: string[]
  changedBindings: string[]
  sourceRefs: string[]
  rationale: string
}

export interface ValidationVariationAudit {
  generated: ValidationVariationCase[]
  covered: ValidationVariationCoverage[]
  skipped: ValidationVariationSkip[]
}

export interface DeriveValidationVariationsOptions {
  action: OptimizationAction
  implementation: ImplementationSelection
  evidences: readonly Evidence[]
  sourceSkillDir?: string
  sourceParameterRules?: readonly OperationParameterRule[]
}

export interface CompleteValidationSuggestionOptions {
  action: OptimizationAction
  implementation: ImplementationSelection
  evidences: readonly Evidence[]
  /** Original source root used only to discover an existing source check. */
  sourceSkillDir?: string
}

interface EvidenceResourceView {
  source: OptimizationValidationCaseSuggestion["inputSource"]
  files: ReadonlySet<string>
}

interface SourceCheckView {
  refs: string[]
  invalid: boolean
}

function normalize(value: string): string {
  const portable = value.trim().replaceAll("\\", "/")
  return portable.startsWith("./") ? portable.slice(2) : portable
}

function normalizeEntry(value: string): string {
  return normalize(value).replace(/^\.\//u, "")
}

function safeSegment(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9._-]+/gu, "-").replace(/^[-.]+|[-.]+$/gu, "")
  return safe || "action"
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function evidenceWithSteps(evidence: Evidence): Evidence | (Evidence & { steps: readonly AgentStep[] }) {
  return evidence as Evidence & { steps: readonly AgentStep[] }
}

function operationArgs(operation: OperationRecord, entry: string): { args?: string[]; locator?: string } {
  if (!operation.argv || operation.argv.length === 0) return { locator: operation.sourceLocator }
  const target = normalizeEntry(entry)
  const entryIndex = operation.argv.findIndex((token) => normalizeEntry(token) === target)
  if (entryIndex < 0) return { locator: operation.sourceLocator }
  return { args: operation.argv.slice(entryIndex + 1), locator: operation.sourceLocator }
}

function snapshotPaths(evidence: Evidence): Set<string> {
  return new Set([...((evidence.workDirSnapshot?.files ?? new Map<string, string>()).keys())].map(normalize))
}

async function resourceView(evidence: Evidence, candidates: readonly string[]): Promise<EvidenceResourceView | undefined> {
  const normalizedCandidates = unique(candidates.map(normalize))
  const workdir = snapshotPaths(evidence)
  if (normalizedCandidates.every((item) => workdir.has(item))) {
    return { source: "workdir-snapshot", files: workdir }
  }

  const preRun = evidence.inputResources?.preRun
  if (preRun) {
    try {
      const contents = await readPreRunInputSnapshotContents(preRun.reference)
      const files = new Set(contents.files.map((item) => normalize(item.path)))
      if (normalizedCandidates.every((item) => files.has(item))) {
        return { source: "pre-run-input-snapshot", files }
      }
    } catch {
      // The lifecycle will report the digest/resource failure with its own
      // authority-specific diagnostic. Do not turn it into a guessed fixture.
    }
  }

  const taskPath = evidence.trace?.taskPath
  if (taskPath) {
    try {
      const raw = JSON.parse(await Bun.file(taskPath).text()) as { fixtures?: unknown }
      if (raw.fixtures && typeof raw.fixtures === "object" && !Array.isArray(raw.fixtures)) {
        const files = new Set(Object.keys(raw.fixtures).map(normalize))
        if (normalizedCandidates.every((item) => files.has(item))) {
          return { source: "task-fixtures", files }
        }
      }
    } catch {
      // Missing or malformed task resources remain unresolved below.
    }
  }
  return undefined
}

async function sourceCheckView(
  sourceSkillDir: string | undefined,
  outputFiles: readonly string[],
): Promise<SourceCheckView> {
  if (!sourceSkillDir || outputFiles.length === 0) return { refs: [], invalid: false }
  const manifestPath = path.join(sourceSkillDir, ".skvm-validation.json")
  if (!await Bun.file(manifestPath).exists()) return { refs: [], invalid: false }
  try {
    const raw = JSON.parse(await Bun.file(manifestPath).text()) as {
      schemaVersion?: unknown
      fileChecks?: unknown
    }
    if (raw.schemaVersion !== "skvm-skill-validation/v1" || !Array.isArray(raw.fileChecks)) {
      return { refs: [], invalid: true }
    }
    const expected = new Set(outputFiles.map(normalize))
    const refs: string[] = []
    for (const item of raw.fileChecks) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue
      const check = item as Record<string, unknown>
      if (typeof check.path !== "string" || typeof check.sourceRef !== "string") continue
      if (expected.has(normalize(check.path))) refs.push(check.sourceRef)
    }
    return { refs: unique(refs), invalid: false }
  } catch {
    return { refs: [], invalid: true }
  }
}

async function matchingTaskCriteria(evidence: Evidence, outputFiles: readonly string[]): Promise<string[]> {
  const expected = new Set(outputFiles.map(normalize))
  const passed = new Set((evidence.criteria ?? [])
    .filter((criterion) => criterion.method === "file-check" && criterion.passed && !criterion.infraError)
    .map((criterion) => criterion.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0))
  if (passed.size === 0 || !evidence.trace?.taskPath) return []
  try {
    const raw = JSON.parse(await Bun.file(evidence.trace.taskPath).text()) as { eval?: unknown }
    if (!Array.isArray(raw.eval)) return []
    const ids: string[] = []
    for (const item of raw.eval) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue
      const criterion = item as Record<string, unknown>
      if (criterion.method !== "file-check" || typeof criterion.path !== "string") continue
      const id = typeof criterion.id === "string" && criterion.id.length > 0
        ? criterion.id
        : `file-check/${typeof criterion.name === "string" && criterion.name.length > 0 ? criterion.name : "criterion"}`
      if (passed.has(id) && expected.has(normalize(criterion.path))) ids.push(`criteria/${id}`)
    }
    return unique(ids)
  } catch {
    return []
  }
}

function portableRelative(value: string): string | undefined {
  if (value.includes("\0") || /^[A-Za-z]:[\\/]/u.test(value) || path.posix.isAbsolute(value.replaceAll("\\", "/"))) {
    return undefined
  }
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"))
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) return undefined
  return normalized
}

function basenamePortable(value: string): string {
  const normalized = normalize(value)
  const last = normalized.lastIndexOf("/")
  return last >= 0 ? normalized.slice(last + 1) : normalized
}

function replaceArgumentPath(args: readonly string[], replacements: ReadonlyMap<string, string>): {
  args: string[]
  replaced: Set<string>
} {
  const ordered = [...replacements.entries()]
    .sort(([left], [right]) => right.length - left.length)
    .map(([source, target]) => [normalize(source), target] as const)
  const replaced = new Set<string>()
  const rewritten = args.map((argument) => {
    const normalizedArgument = normalize(argument)
    for (const [source, target] of ordered) {
      if (normalizedArgument === source) {
        replaced.add(source)
        return target
      }
      const equalIndex = argument.indexOf("=")
      if (equalIndex >= 0 && normalize(argument.slice(equalIndex + 1)) === source) {
        replaced.add(source)
        return `${argument.slice(0, equalIndex + 1)}${target}`
      }
    }
    return argument
  })
  return { args: rewritten, replaced }
}

function variationSourceRefs(
  parent: OptimizationValidationCaseSuggestion,
  operation: OperationRecord | undefined,
  kind: ValidationVariationKind,
): string[] {
  return unique([
    ...parent.sourceRefs,
    `variation:${kind}:parent=${parent.id}`,
    operation?.sourceLocator ?? `validation-case:${parent.id}#args`,
    ...(operation?.parameters ?? [])
      .filter((parameter) => parameter.origin !== "unknown" && parameter.originLocator)
      .map((parameter) => parameter.originLocator!),
  ])
}

function operationForCase(
  evidence: Evidence,
  implementation: ImplementationSelection,
  suggestion: OptimizationValidationCaseSuggestion,
  sourceParameterRules: readonly OperationParameterRule[],
): { operation?: OperationRecord; context: ReturnType<typeof buildOperationContext> } {
  const context = buildOperationContext(evidenceWithSteps(evidence), {
    sourceEntries: implementation.entry ? [implementation.entry] : [],
    sourceParameterRules,
  })
  const operations = context.operations.filter((operation) => (
    operation.kind === "execute"
    && operation.status === "observed"
    && operation.entry !== undefined
    && implementation.entry !== undefined
    && normalizeEntry(operation.entry) === normalizeEntry(implementation.entry)
  ))
  if (operations.length === 0) return { context }
  const exact = operations.find((operation) => {
    const args = operationArgs(operation, implementation.entry!)
    return args.args !== undefined && JSON.stringify(args.args.map(normalize)) === JSON.stringify(suggestion.args.map(normalize))
  })
  return { operation: exact ?? operations[0], context }
}

function hasSnapshotFile(evidence: Evidence, relative: string): boolean {
  const target = normalize(relative)
  return [...(evidence.workDirSnapshot?.files ?? new Map<string, string>())]
    .some(([filePath]) => normalize(filePath) === target)
}

async function hasCheckableVariationRelation(
  suggestion: OptimizationValidationCaseSuggestion,
  evidence: Evidence,
  sourceSkillDir: string | undefined,
): Promise<{ ok: true; outputRefs: string[] } | { ok: false; reason: string }> {
  const expected = suggestion.expectedFiles ?? []
  if (expected.length === 0) return { ok: false, reason: "the parent case declares no output relation" }
  const outputRefs = expected.map((item) => normalize(item.referencePath ?? item.path))
  if (suggestion.basis !== "task-contract" && outputRefs.some((item) => !hasSnapshotFile(evidence, item))) {
    return { ok: false, reason: "the observed output reference is unavailable for a relocated case" }
  }
  const sourceChecks = await sourceCheckView(sourceSkillDir, expected.map((item) => normalize(item.path)))
  if (suggestion.basis !== "task-contract" && sourceChecks.refs.length === 0) {
    return { ok: false, reason: "only one observed fidelity value is available; no source or task relation proves the variation" }
  }
  return { ok: true, outputRefs }
}

function parameterDifference(
  left: OptimizationValidationCaseSuggestion,
  right: OptimizationValidationCaseSuggestion,
  operation: OperationRecord | undefined,
): string[] {
  if (left.inputFiles.map(normalize).join("\0") !== right.inputFiles.map(normalize).join("\0")) return []
  const differences: number[] = []
  const length = Math.max(left.args.length, right.args.length)
  for (let index = 0; index < length; index += 1) {
    if (normalize(left.args[index] ?? "") !== normalize(right.args[index] ?? "")) differences.push(index)
  }
  if (differences.length === 0) return []
  const names = new Set<string>()
  for (const index of differences) {
    const token = left.args[index] ?? right.args[index] ?? ""
    const previous = left.args[index - 1] ?? right.args[index - 1] ?? ""
    const flag = token.startsWith("-") ? token.split("=", 1)[0]! : previous.startsWith("-") ? previous : `arg${index}`
    const normalizedFlag = flag.replace(/^-+/u, "")
    const matched = operation?.parameters.find((parameter) => (
      parameter.binding === "argv" && normalize(parameter.name) === normalize(normalizedFlag)
    ))
    names.add(matched?.name ?? normalizedFlag)
  }
  return [...names].filter(Boolean)
}

/**
 * Derive conservative path/cwd checks from existing validation cases and the
 * F2 operation index.  Parameter values are never guessed: an existing pair
 * of cases is reported as covered, otherwise the audit records why it was
 * skipped.  The returned cases are ordinary suggestions plus engine-only
 * source/target bindings used during materialization.
 */
export async function deriveValidationVariations(
  options: DeriveValidationVariationsOptions,
): Promise<ValidationVariationAudit> {
  const generated: ValidationVariationCase[] = []
  const covered: ValidationVariationCoverage[] = []
  const skipped: ValidationVariationSkip[] = []
  const coveredPairKeys = new Set<string>()
  const suggestion = options.action.validation
  if (!suggestion || suggestion.cases.length === 0 || options.implementation.status !== "selected" || !options.implementation.entry) {
    return { generated, covered, skipped }
  }

  const contexts = new Map<string, { evidence: Evidence; operation?: OperationRecord; context: ReturnType<typeof buildOperationContext> }>()
  for (const item of suggestion.cases) {
    const index = /^\d+$/u.test(item.evidenceId) ? Number(item.evidenceId) : -1
    const evidence = index >= 0 ? options.evidences[index] : undefined
    if (!evidence) {
      for (const kind of ["path", "cwd", "parameter"] as const) {
        skipped.push({ parentCaseId: item.id, kind, reason: `evidence ${item.evidenceId} is unavailable`, sourceRefs: [...item.sourceRefs] })
      }
      continue
    }
    const key = item.evidenceId
    const existing = contexts.get(key)
    if (existing) continue
    const located = operationForCase(evidence, options.implementation, item, options.sourceParameterRules ?? [])
    contexts.set(key, { evidence, operation: located.operation, context: located.context })
  }

  for (const item of suggestion.cases) {
    const context = contexts.get(item.evidenceId)
    if (!context) {
      for (const kind of ["path", "cwd"] as const) {
        skipped.push({ parentCaseId: item.id, kind, reason: "no bound evidence is available", sourceRefs: [...item.sourceRefs] })
      }
      skipped.push({ parentCaseId: item.id, kind: "parameter", reason: "no observed parameter binding is available", sourceRefs: [...item.sourceRefs] })
      continue
    }
    const relation = await hasCheckableVariationRelation(item, context.evidence, options.sourceSkillDir)
    if (!relation.ok) {
      for (const kind of ["path", "cwd"] as const) {
        skipped.push({ parentCaseId: item.id, kind, reason: relation.reason, sourceRefs: variationSourceRefs(item, context.operation, kind) })
      }
    } else {
      const inputPaths = item.inputFiles.map(normalize)
      const outputPaths = (item.expectedFiles ?? []).map((expected) => normalize(expected.path))
      const allPaths = [...inputPaths, ...outputPaths]
      const relativePaths = allPaths.every((value) => portableRelative(value) !== undefined)
      if (!relativePaths) {
        for (const kind of ["path", "cwd"] as const) {
          skipped.push({ parentCaseId: item.id, kind, reason: "absolute or escaping paths cannot be relocated safely", sourceRefs: variationSourceRefs(item, context.operation, kind) })
        }
      } else {
        const root = `__skvm_variations/${safeSegment(item.id)}`
        const inputBindings = inputPaths.map((sourcePath, index) => ({
          sourcePath,
          targetPath: `${root}/path/input-${index + 1}/${basenamePortable(sourcePath)}`,
        }))
        const outputBindings = outputPaths.map((sourcePath, index) => ({
          sourcePath,
          targetPath: `${root}/path/output-${index + 1}/${basenamePortable(sourcePath)}`,
        }))
        const replacements = new Map<string, string>([
          ...inputBindings.map((binding) => [binding.sourcePath, binding.targetPath] as const),
          ...outputBindings.map((binding) => [binding.sourcePath, binding.targetPath] as const),
        ])
        const rewritten = replaceArgumentPath(item.args, replacements)
        const requiredPaths = [...new Set([...inputPaths, ...outputPaths])]
        if (requiredPaths.some((value) => !rewritten.replaced.has(value))) {
          skipped.push({
            parentCaseId: item.id,
            kind: "path",
            reason: "input or output path is not an explicit argv binding; refusing to rewrite implicit behavior",
            sourceRefs: variationSourceRefs(item, context.operation, "path"),
          })
        } else {
          const pathId = `variation-path-${safeSegment(item.id)}`
          generated.push({
            id: pathId,
            parentCaseId: item.id,
            kind: "path",
            changedBindings: [
              ...inputBindings.map((binding) => `${binding.sourcePath}->${binding.targetPath}`),
              ...outputBindings.map((binding) => `${binding.sourcePath}->${binding.targetPath}`),
            ],
            sourceRefs: variationSourceRefs(item, context.operation, "path"),
            rationale: "Relocate explicit input/output argv paths while preserving the source-backed output relation.",
            suggestion: {
              ...item,
              id: pathId,
              inputFiles: inputBindings.map((binding) => binding.targetPath),
              args: rewritten.args,
              expectedFiles: (item.expectedFiles ?? []).map((expected, index) => ({
                ...expected,
                path: outputBindings[index]?.targetPath ?? expected.path,
                ...(expected.referencePath ? {} : item.basis === "task-contract" ? {} : { referencePath: expected.path }),
              })),
              sourceRefs: variationSourceRefs(item, context.operation, "path"),
            },
            inputBindings,
            outputBindings,
          })
        }

        const cwdId = `variation-cwd-${safeSegment(item.id)}`
        generated.push({
          id: cwdId,
          parentCaseId: item.id,
          kind: "cwd",
          changedBindings: [`cwd->${root}/cwd`],
          sourceRefs: variationSourceRefs(item, context.operation, "cwd"),
          rationale: "Run the same relative interface from a fresh nested working directory.",
          suggestion: {
            ...item,
            id: cwdId,
            sourceRefs: variationSourceRefs(item, context.operation, "cwd"),
          },
          inputBindings: inputPaths.map((sourcePath) => ({ sourcePath, targetPath: sourcePath })),
          outputBindings: outputPaths.map((sourcePath) => ({ sourcePath, targetPath: sourcePath })),
          cwdRelative: `${root}/cwd`,
        })
      }
    }

    const sameEvidenceCases = suggestion.cases.filter((candidate) => candidate.evidenceId === item.evidenceId && candidate.id !== item.id)
    const paired = sameEvidenceCases
      .map((candidate) => ({ candidate, names: parameterDifference(item, candidate, context.operation) }))
      .find((pair) => pair.names.length > 0)
    if (paired) {
      const caseIds = [item.id, paired.candidate.id].sort()
      const pairKey = caseIds.join("|")
      if (!coveredPairKeys.has(pairKey)) {
        coveredPairKeys.add(pairKey)
        covered.push({
          kind: "parameter",
          caseIds,
          changedBindings: paired.names,
          sourceRefs: unique([
            ...item.sourceRefs,
            ...paired.candidate.sourceRefs,
            ...variationSourceRefs(item, context.operation, "parameter"),
          ]),
          rationale: "A same-input pair already exercises a distinct argv value; no duplicate case is generated.",
        })
      }
    } else {
      skipped.push({
        parentCaseId: item.id,
        kind: "parameter",
        reason: "only one observed value is available or no independently checkable relation exists",
        sourceRefs: variationSourceRefs(item, context.operation, "parameter"),
      })
    }
  }

  return { generated, covered, skipped }
}

function sourceRefsFor(
  evidenceId: string,
  operation: OperationRecord,
  implementation: ImplementationSelection,
  sourceChecks: SourceCheckView,
  taskCriteria: readonly string[],
): string[] {
  return unique([
    operation.sourceLocator,
    `implementation:${normalizeEntry(implementation.entry ?? "")}`,
    ...sourceChecks.refs,
    ...taskCriteria.map((item) => `evidence:${evidenceId}#${item}`),
  ])
}

function makeDiagnostic(
  action: OptimizationAction,
  code: ValidationCompletionDiagnosticCode,
  message: string,
  extra: Partial<ValidationCompletionDiagnostic> = {},
): ValidationCompletionDiagnostic {
  return { actionId: action.id, code, severity: "warning", message, ...extra }
}

function noSuggestionResult(
  action: OptimizationAction,
  status: ValidationCompletionStatus,
  diagnostics: ValidationCompletionDiagnostic[],
  provenance: ValidationCompletionProvenance,
): ValidationCompletionResult {
  return { status, action, diagnostics, provenance }
}

/**
 * Fill only the validation fields that can be derived from an observed
 * executable operation and already captured resources. Existing model
 * suggestions are authoritative and are never duplicated or rewritten here.
 */
export async function completeValidationSuggestion(
  options: CompleteValidationSuggestionOptions,
): Promise<ValidationCompletionResult> {
  const { action, implementation } = options
  const existingValidation = action.validation
  const existingValidationIsIncomplete = existingValidation !== undefined && existingValidation.cases.length === 0
  if (existingValidation && !existingValidationIsIncomplete) {
    return {
      status: "unchanged",
      action,
      suggestion: action.validation,
      diagnostics: [],
      provenance: { mode: "existing", fields: { suggestion: { source: "optimizer-submission" } } },
    }
  }
  if (implementation.status !== "selected" || !implementation.entry) {
    return noSuggestionResult(action, "not-applicable", [], {
      mode: "deterministic",
      fields: { implementation: { source: "implementation-selection" } },
    })
  }

  const diagnostics: ValidationCompletionDiagnostic[] = []
  const candidateEvidence = action.evidenceIds
    .map((evidenceId) => ({ evidenceId, index: /^\d+$/u.test(evidenceId) ? Number(evidenceId) : -1 }))
    .filter((item) => item.index >= 0 && item.index < options.evidences.length)
  for (const evidenceId of action.evidenceIds) {
    if (!/^\d+$/u.test(evidenceId) || Number(evidenceId) >= options.evidences.length) {
      diagnostics.push(makeDiagnostic(action, "validation-completion-evidence-unavailable", `Evidence ${evidenceId} is not available for deterministic validation completion.`, {
        evidenceId,
        field: "evidenceId",
      }))
    }
  }
  if (candidateEvidence.length === 0) {
    return noSuggestionResult(action, "unresolved", diagnostics, {
      mode: "deterministic",
      fields: { evidenceId: { source: "action.evidenceIds" } },
    })
  }

  const completedCases: OptimizationValidationCaseSuggestion[] = []
  const unwiredCases: OptimizationValidationCaseSuggestion[] = []
  let unwiredProvenance: ValidationCompletionProvenance | undefined
  let firstProvenance: ValidationCompletionProvenance | undefined
  for (const { evidenceId, index } of candidateEvidence) {
    const evidence = options.evidences[index]!
    const context = buildOperationContext(evidenceWithSteps(evidence), {
      sourceEntries: [implementation.entry],
    })
    const matching = context.operations.filter((operation) => (
      operation.kind === "execute"
      && operation.status === "observed"
      && operation.entry !== undefined
      && normalizeEntry(operation.entry) === normalizeEntry(implementation.entry!)
    ))
    const ambiguous = context.operations.filter((operation) => operation.kind === "execute" && operation.status === "unknown")
    if (matching.length === 0) {
      if (ambiguous.length > 0) {
        diagnostics.push(makeDiagnostic(action, "validation-completion-operation-ambiguous", `No unambiguous invocation of ${implementation.entry} was observed; ambiguous operation(s) remain unresolved.`, {
          evidenceId,
          locator: ambiguous[0]!.sourceLocator,
          field: "argv",
        }))
      } else {
        diagnostics.push(makeDiagnostic(action, "validation-completion-entry-unobserved", `The selected entry ${implementation.entry} was not observed in evidence ${evidenceId}.`, {
          evidenceId,
          field: "entry",
        }))
        const capturedFiles = snapshotPaths(evidence)
        const writes = context.operations.filter((item) => item.kind === "write" && item.status === "observed")
        const reads = context.operations.filter((item) => item.kind === "read" && item.status === "observed")
        const outputFiles = unique(writes.flatMap((item) => item.writeFiles.map(normalize)))
          .filter((item) => capturedFiles.has(item) && item !== normalizeEntry(implementation.entry!))
        const inputFiles = unique(reads.flatMap((item) => item.readFiles.map(normalize)))
          .filter((item) => !outputFiles.includes(item) && item !== normalizeEntry(implementation.entry!))
        const resources = inputFiles.length > 0 ? await resourceView(evidence, inputFiles) : undefined
        if (resources && outputFiles.length > 0) {
          // Empty argv is a repair placeholder, never an executable default.
          unwiredCases.push({
            id: `repair-${safeSegment(action.id)}-${evidenceId}`,
            evidenceId,
            inputSource: resources.source,
            inputFiles,
            args: [],
            expectedFiles: outputFiles.map((filePath) => ({ path: filePath, referencePath: filePath })),
            basis: "reference-output",
            sourceRefs: unique([...reads, ...writes].map((item) => item.sourceLocator)),
          })
          unwiredProvenance ??= {
            mode: "deterministic",
            evidenceId,
            fields: {
              inputFiles: { source: "observed-operation.readFiles" },
              inputSource: { source: "digest-bound-resource", detail: resources.source },
              expectedFiles: { source: "observed-operation.writeFiles" },
              args: { source: "unresolved-requires-repair" },
              basis: { source: "observed-output-fidelity" },
            },
          }
        }
      }
      continue
    }

    for (const [operationIndex, operation] of matching.entries()) {
      const argsResult = operationArgs(operation, implementation.entry)
      if (!argsResult.args) {
        diagnostics.push(makeDiagnostic(action, "validation-completion-argv-unresolved", `Could not locate the confirmed executable entry inside argv for ${implementation.entry}.`, {
          evidenceId,
          locator: argsResult.locator,
          field: "args",
        }))
        continue
      }

      const observedPostRunFiles = snapshotPaths(evidence)
      const allWrites = unique(context.operations.flatMap((item) => item.writeFiles.map(normalize)))
        .filter((item) => observedPostRunFiles.has(item))
      const allReads = unique([
        ...operation.readFiles.map(normalize),
        ...context.operations.filter((item) => item.kind === "read").flatMap((item) => item.readFiles.map(normalize)),
      ])
      const outputFiles = allWrites.filter((item) => item !== normalizeEntry(implementation.entry!))
      if (outputFiles.length === 0) {
        diagnostics.push(makeDiagnostic(action, "validation-completion-output-unresolved", `No observed output write is available for operation ${operation.sourceLocator}; semantic output rules will not be invented.`, {
          evidenceId,
          locator: operation.sourceLocator,
          field: "expectedFiles",
        }))
        continue
      }
      const inputFiles = allReads.filter((item) => (
        item !== normalizeEntry(implementation.entry!) && !outputFiles.includes(item)
      ))
      if (inputFiles.length === 0) {
        diagnostics.push(makeDiagnostic(action, "validation-completion-input-unresolved", `No observed input file is available for operation ${operation.sourceLocator}.`, {
          evidenceId,
          locator: operation.sourceLocator,
          field: "inputFiles",
        }))
        continue
      }

      const resources = await resourceView(evidence, inputFiles)
      if (!resources) {
        diagnostics.push(makeDiagnostic(action, "validation-completion-input-unresolved", `Observed inputs for evidence ${evidenceId} are not available from a digest-bound task, pre-run or workdir resource.`, {
          evidenceId,
          locator: operation.sourceLocator,
          field: "inputSource",
        }))
        continue
      }
      const sourceChecks = await sourceCheckView(options.sourceSkillDir, outputFiles)
      if (sourceChecks.invalid) {
        diagnostics.push(makeDiagnostic(action, "validation-completion-source-check-unavailable", "The source validation manifest is unreadable or malformed; output fidelity remains available but source-derived authority is not inferred.", {
          evidenceId,
          field: "sourceRefs",
        }))
      }
      const taskCriteria = await matchingTaskCriteria(evidence, outputFiles)
      const basis: OptimizationValidationCaseSuggestion["basis"] = sourceChecks.refs.length > 0 || taskCriteria.length > 0
        ? "task-contract"
        : "reference-output"
      const sourceRefs = sourceRefsFor(evidenceId, operation, implementation, sourceChecks, taskCriteria)
      const caseId = `auto-${safeSegment(action.id)}-${evidenceId}-${operationIndex + 1}`
      const expectedFiles = outputFiles.map((filePath) => ({ path: filePath, referencePath: filePath }))
      const suggestionCase: OptimizationValidationCaseSuggestion = {
        id: caseId,
        evidenceId,
        inputSource: resources.source,
        inputFiles,
        args: argsResult.args,
        ...(operation.exitCode === undefined ? {} : { expectedExitCode: operation.exitCode }),
        expectedFiles,
        basis,
        sourceRefs,
      }
      completedCases.push(suggestionCase)
      firstProvenance ??= {
        mode: "deterministic",
        evidenceId,
        operationId: operation.toolCallId ?? operation.id,
        fields: {
          evidenceId: { source: "action.evidenceIds", locator: `evidence:${evidenceId}` },
          inputFiles: { source: "observed-operation.readFiles", locator: operation.sourceLocator },
          inputSource: { source: "digest-bound-resource", detail: resources.source },
          args: { source: "observed-operation.argv", locator: operation.sourceLocator },
          expectedFiles: { source: "observed-operation.writeFiles", locator: operation.sourceLocator },
          sourceRefs: { source: sourceChecks.refs.length > 0 ? "source-validation-manifest" : "operation-and-evidence-locators" },
          basis: { source: sourceChecks.refs.length > 0 || taskCriteria.length > 0 ? "source-or-task-check" : "observed-output-fidelity" },
        },
      }
    }
  }

  if (completedCases.length === 0) {
    if (unwiredCases.length > 0) {
      const suggestion = { cases: unwiredCases }
      return {
        status: "repairable",
        action,
        suggestion,
        repairable: {
          fields: ["validation.cases.args"],
          evidenceIds: unique(unwiredCases.map((item) => item.evidenceId)),
          relevantFiles: unique([normalizeEntry(implementation.entry), ...action.changedPaths.map(normalize)]),
          suggestion,
        },
        diagnostics: [...diagnostics, makeDiagnostic(
          action,
          "validation-completion-argv-unresolved",
          "Captured reads and writes support a fidelity candidate, but the selected entry has no observed invocation. Resolve argv from the candidate interface in the existing bounded repair; empty args are not a confirmed command.",
          { field: "validation.cases.args" },
        )],
        provenance: unwiredProvenance!,
      }
    }
    return noSuggestionResult(action, "unresolved", diagnostics, firstProvenance ?? {
      mode: "deterministic",
      fields: { evidenceId: { source: "action.evidenceIds" } },
    })
  }

  const suggestion: OptimizationProgramValidationSuggestion = {
    ...(existingValidation?.help ? { help: existingValidation.help } : {}),
    cases: completedCases,
  }
  if (existingValidationIsIncomplete) {
    const metadataDiagnostic = makeDiagnostic(
      action,
      "validation-completion-metadata-missing",
      "The action declared validation metadata but supplied no executable cases; a bounded repair may connect the deterministic candidate without changing the action intent.",
      { field: "validation.cases" },
    )
    const repairDiagnostics = [metadataDiagnostic, ...diagnostics]
    const relevantFiles = unique([
      normalizeEntry(implementation.entry!),
      ...action.changedPaths.map(normalize),
      ...action.sourceRefs.map(normalize).filter((item) => !item.startsWith("evidence:")),
    ])
    return {
      status: "repairable",
      action,
      suggestion,
      repairable: {
        fields: ["validation.cases"],
        evidenceIds: unique(completedCases.map((item) => item.evidenceId)),
        relevantFiles,
        suggestion,
      },
      diagnostics: repairDiagnostics,
      provenance: firstProvenance!,
    }
  }
  const completedAction: OptimizationAction = { ...action, validation: suggestion }
  return {
    status: "completed",
    action: completedAction,
    suggestion,
    diagnostics,
    provenance: firstProvenance!,
  }
}
