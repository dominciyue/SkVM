import type { SourceBundle } from "../../benchmarks/authorization-dsl/inputs.ts"
import {
  parseAuthorizationResult,
  type AuthorizationObligationResult,
  type AuthorizationResultV0,
  type Diagnostic,
} from "./schema.ts"
import type { CompiledAuthorizationTask } from "./semantics.ts"

type EvidencePresenceStatus = "present" | "missing" | "invalid"

export interface AuthorizationDependencySnapshot {
  repository: string
  sourceRef: string
  sourceFiles: Array<{ path: string; sha256: string }>
  policies: Array<{
    id: string
    revision: string
    location: string
    text: string
    acceptanceStatus: string
  }>
  obligations: Array<{
    id: string
    principalId: string
    resourceId: string
    relation: string
    operation: string
    expectation: string
    conditions: Array<{ name: string; basis: string }>
    policySourceId: string
    entryIds: string[]
  }>
}

export interface AuthorizationValidation {
  parsedResult?: AuthorizationResultV0
  structure: {
    status: "valid" | "invalid"
    diagnostics: Diagnostic[]
  }
  declared: {
    total: number
    disposed: number
    pending: number
    blocked: number
    invalid: number
    status: "all-disposed" | "partial" | "needs-input"
    completionPercent: number | null
  }
  discovery: {
    status: "not-tested"
    claimLimit: "declared-obligations-only"
  }
  evidencePresence: Array<{
    obligationId: string
    status: EvidencePresenceStatus
  }>
  evidenceSupport: Array<{
    obligationId: string
    status: "unreviewed"
  }>
  completeness: {
    status: "accepted" | "rejected" | "unavailable"
    kind?: AuthorizationResultV0["scopeClaim"]["kind"]
  }
  dependencySnapshot: AuthorizationDependencySnapshot
  diagnostics: Diagnostic[]
}

function makeDiagnostic(code: string, message: string, path: string): Diagnostic {
  return { code, message, path, severity: "error" }
}

function createDependencySnapshot(
  compiled: CompiledAuthorizationTask,
  sourceBundle: SourceBundle,
): AuthorizationDependencySnapshot {
  return {
    repository: compiled.task.repository,
    sourceRef: compiled.task.sourceRef,
    sourceFiles: sourceBundle.files
      .map(file => ({ path: file.relativePath, sha256: file.sha256 }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    policies: compiled.task.policySources
      .map(policy => ({
        id: policy.id,
        revision: policy.revision,
        location: policy.location,
        text: policy.text,
        acceptanceStatus: policy.acceptance.status,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    obligations: compiled.task.obligations
      .map(obligation => ({
        id: obligation.id,
        principalId: obligation.principalId,
        resourceId: obligation.resourceId,
        relation: obligation.relation,
        operation: obligation.operation,
        expectation: obligation.expectation,
        conditions: obligation.conditions.map(condition => ({ ...condition })),
        policySourceId: obligation.policySourceId,
        entryIds: [...new Set(obligation.entryIds)].sort(),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  }
}

function validateMetadata(
  compiled: CompiledAuthorizationTask,
  result: AuthorizationResultV0,
  sourceBundle: SourceBundle,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  if (result.taskId !== compiled.task.taskId) {
    diagnostics.push(makeDiagnostic(
      "task-id-mismatch",
      `Result taskId ${result.taskId} does not match ${compiled.task.taskId}.`,
      "taskId",
    ))
  }
  if (result.repository !== compiled.task.repository || result.repository !== sourceBundle.repository) {
    diagnostics.push(makeDiagnostic(
      "repository-mismatch",
      "Result, declaration, and source bundle must identify the same repository.",
      "repository",
    ))
  }
  if (result.sourceRef !== compiled.task.sourceRef || result.sourceRef !== sourceBundle.sourceRef) {
    diagnostics.push(makeDiagnostic(
      "source-ref-mismatch",
      "Result, declaration, and source bundle must identify the same source ref.",
      "sourceRef",
    ))
  }
  return diagnostics
}

function citationSegment(content: string, startLine: number, endLine: number): string {
  return content.split(/\r?\n/).slice(startLine - 1, endLine).join("\n")
}

function validateEvidence(
  result: AuthorizationObligationResult,
  resultIndex: number,
  sourceBundle: SourceBundle,
  diagnostics: Diagnostic[],
): EvidencePresenceStatus {
  const files = new Map(sourceBundle.files.map(file => [file.relativePath, file]))
  const groups = Object.entries(result.facts) as Array<[
    keyof AuthorizationObligationResult["facts"],
    AuthorizationObligationResult["facts"][keyof AuthorizationObligationResult["facts"]],
  ]>
  let citationCount = 0
  let invalid = false
  for (const [groupName, facts] of groups) {
    facts.forEach((fact, factIndex) => {
      fact.citations.forEach((citation, citationIndex) => {
        citationCount += 1
        const path = `results.${resultIndex}.facts.${groupName}.${factIndex}.citations.${citationIndex}`
        const file = files.get(citation.path)
        if (!file) {
          invalid = true
          diagnostics.push(makeDiagnostic(
            "citation-file-not-allowed",
            `Citation path is not an exact source-bundle member: ${citation.path}`,
            `${path}.path`,
          ))
          return
        }
        if (
          citation.startLine < file.cropRange.startLine
          || citation.endLine > file.cropRange.endLine
          || citation.endLine < citation.startLine
        ) {
          invalid = true
          diagnostics.push(makeDiagnostic(
            "citation-out-of-range",
            `Citation ${citation.startLine}-${citation.endLine} is outside ${citation.path} crop ${file.cropRange.startLine}-${file.cropRange.endLine}.`,
            path,
          ))
          return
        }
        const segment = citationSegment(file.content, citation.startLine, citation.endLine)
        if (!segment.includes(citation.quote)) {
          invalid = true
          diagnostics.push(makeDiagnostic(
            "citation-text-mismatch",
            "Retained citation text does not occur within the cited crop range.",
            `${path}.quote`,
          ))
        }
      })
    })
  }
  if (citationCount === 0) return "missing"
  return invalid ? "invalid" : "present"
}

function validateFactGroups(
  result: AuthorizationObligationResult,
  resultIndex: number,
  requiresCondition: boolean,
  diagnostics: Diagnostic[],
): void {
  const requiredGroups: Array<keyof AuthorizationObligationResult["facts"]> = [
    "entry",
    "binding",
    "control",
    "effect",
  ]
  if (requiresCondition) requiredGroups.push("condition")
  for (const group of requiredGroups) {
    if (result.facts[group].length === 0) {
      diagnostics.push(makeDiagnostic(
        "missing-fact-group",
        `Result must provide at least one ${group} fact for semantic review.`,
        `results.${resultIndex}.facts.${group}`,
      ))
    }
  }
}

export function validateAuthorizationResult(
  compiled: CompiledAuthorizationTask,
  input: unknown,
  sourceBundle: SourceBundle,
): AuthorizationValidation {
  const dependencySnapshot = createDependencySnapshot(compiled, sourceBundle)
  const parsed = parseAuthorizationResult(input)
  const schemaDiagnostics = parsed.success ? [] : parsed.diagnostics
  const diagnostics: Diagnostic[] = [...schemaDiagnostics]
  const expected = compiled.runnableObligations
  const blocked = compiled.blockedObligations.length

  if (!parsed.success) {
    const total = expected.length + blocked
    return {
      structure: { status: "invalid", diagnostics: schemaDiagnostics },
      declared: {
        total,
        disposed: 0,
        pending: expected.length,
        blocked,
        invalid: 0,
        status: total === 0 ? "needs-input" : "partial",
        completionPercent: total === 0 ? null : 0,
      },
      discovery: { status: "not-tested", claimLimit: "declared-obligations-only" },
      evidencePresence: [],
      evidenceSupport: [],
      completeness: { status: "unavailable" },
      dependencySnapshot,
      diagnostics,
    }
  }

  const result = parsed.result
  const metadataDiagnostics = validateMetadata(compiled, result, sourceBundle)
  diagnostics.push(...metadataDiagnostics)
  const resultsById = new Map<string, Array<{ result: AuthorizationObligationResult; index: number }>>()
  result.results.forEach((obligationResult, index) => {
    const current = resultsById.get(obligationResult.obligationId) ?? []
    current.push({ result: obligationResult, index })
    resultsById.set(obligationResult.obligationId, current)
  })

  const expectedById = new Map(expected.map(obligation => [obligation.id, obligation]))
  for (const [obligationId, occurrences] of resultsById) {
    if (!expectedById.has(obligationId)) {
      diagnostics.push(makeDiagnostic(
        "foreign-obligation-result",
        `Result names undeclared or non-runnable obligation ${obligationId}.`,
        `results.${occurrences[0]!.index}.obligationId`,
      ))
    }
    if (occurrences.length > 1) {
      for (const duplicate of occurrences.slice(1)) {
        diagnostics.push(makeDiagnostic(
          "duplicate-obligation-result",
          `Obligation ${obligationId} appears more than once.`,
          `results.${duplicate.index}.obligationId`,
        ))
      }
    }
  }

  let disposed = 0
  let pending = 0
  let invalid = 0
  const evidencePresence: AuthorizationValidation["evidencePresence"] = []
  const evidenceSupport: AuthorizationValidation["evidenceSupport"] = []
  for (const obligation of expected) {
    const occurrences = resultsById.get(obligation.id) ?? []
    if (occurrences.length === 0) {
      pending += 1
      diagnostics.push(makeDiagnostic(
        "missing-obligation-result",
        `No result was returned for obligation ${obligation.id}.`,
        "results",
      ))
      continue
    }
    if (occurrences.length > 1) invalid += 1
    else disposed += 1

    const selected = occurrences[0]!
    const presence = validateEvidence(selected.result, selected.index, sourceBundle, diagnostics)
    evidencePresence.push({ obligationId: obligation.id, status: presence })
    evidenceSupport.push({ obligationId: obligation.id, status: "unreviewed" })
    validateFactGroups(
      selected.result,
      selected.index,
      obligation.obligation.conditions.length > 0,
      diagnostics,
    )
    if (
      selected.result.conclusion === "unknown"
      && (selected.result.decisiveMissingFacts.length === 0 || selected.result.suggestedObservations.length === 0)
    ) {
      diagnostics.push(makeDiagnostic(
        "uninformative-unknown",
        "Unknown requires at least one decisive missing fact and one suggested observation.",
        `results.${selected.index}`,
      ))
    }
  }

  const total = expected.length + blocked
  const completionPercent = total === 0 ? null : (disposed / total) * 100
  const declaredStatus = total === 0
    ? "needs-input"
    : (pending === 0 && invalid === 0 && blocked === 0 ? "all-disposed" : "partial")
  let completeness: AuthorizationValidation["completeness"] = {
    status: "accepted",
    kind: result.scopeClaim.kind,
  }
  if (result.scopeClaim.kind === "repository-all-entries") {
    completeness = { status: "rejected", kind: result.scopeClaim.kind }
    diagnostics.push(makeDiagnostic(
      "unsupported-completeness",
      "Fixed-context execution has discovery=not-tested and cannot support a repository/all-entry completeness claim.",
      "scopeClaim.kind",
    ))
  }

  const structureDiagnostics = [...schemaDiagnostics, ...metadataDiagnostics]
  return {
    parsedResult: result,
    structure: {
      status: structureDiagnostics.length === 0 ? "valid" : "invalid",
      diagnostics: structureDiagnostics,
    },
    declared: {
      total,
      disposed,
      pending,
      blocked,
      invalid,
      status: declaredStatus,
      completionPercent,
    },
    discovery: { status: "not-tested", claimLimit: "declared-obligations-only" },
    evidencePresence,
    evidenceSupport,
    completeness,
    dependencySnapshot,
    diagnostics,
  }
}

export interface AuthorizationReuseBasis {
  relevantEntryUniverseUnchanged: true
  reason: string
}

export interface AuthorizationChangeAssessment {
  status: "current" | "reusable" | "needs-review"
  reasons: string[]
  previousSourceRef: string
  nextSourceRef: string
  reuseBasis?: AuthorizationReuseBasis
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function assessAuthorizationResultChange(
  previous: AuthorizationDependencySnapshot,
  nextCompiled: CompiledAuthorizationTask,
  nextSourceBundle: SourceBundle,
  reuseBasis?: AuthorizationReuseBasis,
): AuthorizationChangeAssessment {
  const next = createDependencySnapshot(nextCompiled, nextSourceBundle)
  const reasons: string[] = []
  if (previous.repository !== next.repository) reasons.push("repository-changed")
  if (!sameJson(previous.sourceFiles, next.sourceFiles)) reasons.push("relevant-source-changed")
  if (!sameJson(previous.policies, next.policies)) reasons.push("policy-changed")
  if (!sameJson(previous.obligations, next.obligations)) reasons.push("obligation-scope-changed")
  const refChanged = previous.sourceRef !== next.sourceRef

  if (reasons.length > 0) {
    return {
      status: "needs-review",
      reasons,
      previousSourceRef: previous.sourceRef,
      nextSourceRef: next.sourceRef,
    }
  }

  if (refChanged) {
    if (reuseBasis?.relevantEntryUniverseUnchanged && reuseBasis.reason.trim().length > 0) {
      return {
        status: "reusable",
        reasons: [],
        previousSourceRef: previous.sourceRef,
        nextSourceRef: next.sourceRef,
        reuseBasis,
      }
    }
    return {
      status: "needs-review",
      reasons: ["source-ref-changed"],
      previousSourceRef: previous.sourceRef,
      nextSourceRef: next.sourceRef,
    }
  }

  return {
    status: "current",
    reasons: [],
    previousSourceRef: previous.sourceRef,
    nextSourceRef: next.sourceRef,
  }
}
