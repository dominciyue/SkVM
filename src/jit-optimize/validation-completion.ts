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
import { buildOperationContext, type OperationRecord } from "./operation-context.ts"
import type {
  Evidence,
  OptimizationAction,
  OptimizationProgramValidationSuggestion,
  OptimizationValidationCaseSuggestion,
} from "./types.ts"

export type ValidationCompletionStatus = "unchanged" | "completed" | "unresolved" | "not-applicable"

export type ValidationCompletionDiagnosticCode =
  | "validation-completion-evidence-unavailable"
  | "validation-completion-entry-unobserved"
  | "validation-completion-operation-ambiguous"
  | "validation-completion-argv-unresolved"
  | "validation-completion-input-unresolved"
  | "validation-completion-output-unresolved"
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
  diagnostics: ValidationCompletionDiagnostic[]
  provenance: ValidationCompletionProvenance
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
  if (action.validation) {
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
    return noSuggestionResult(action, "unresolved", diagnostics, firstProvenance ?? {
      mode: "deterministic",
      fields: { evidenceId: { source: "action.evidenceIds" } },
    })
  }

  const suggestion: OptimizationProgramValidationSuggestion = { cases: completedCases }
  const completedAction: OptimizationAction = { ...action, validation: suggestion }
  return {
    status: "completed",
    action: completedAction,
    suggestion,
    diagnostics,
    provenance: firstProvenance!,
  }
}
