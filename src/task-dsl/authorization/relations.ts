import { z } from "zod"
import type { AuthorizationTaskV0 } from "./schema.ts"
import { compileAuthorizationTask } from "./semantics.ts"

const NonEmptyString = z.string().trim().min(1)

export const RequirementKindSchema = z.enum([
  "entry-control",
  "identity-binding",
  "resource-binding",
  "authorization-decision",
  "effect-reachability",
  "external-assumption",
])

function addDuplicateArrayIssues(
  values: string[],
  field: "obligationIds" | "prerequisiteIds",
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>()
  values.forEach((value, index) => {
    if (seen.has(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate ${field} value "${value}" is not allowed.`,
        path: [field, index],
      })
    }
    seen.add(value)
  })
}

export const AnalysisRequirementSchema = z.object({
  id: NonEmptyString,
  kind: RequirementKindSchema,
  obligationIds: z.array(NonEmptyString).min(1),
  question: NonEmptyString,
  applicability: z.enum(["required", "when-present"]),
  prerequisiteIds: z.array(NonEmptyString),
}).strict().superRefine((requirement, context) => {
  addDuplicateArrayIssues(requirement.obligationIds, "obligationIds", context)
  addDuplicateArrayIssues(requirement.prerequisiteIds, "prerequisiteIds", context)
})

export const AnalysisRequirementsSchema = z.array(AnalysisRequirementSchema).min(1)

export type RequirementKind = z.infer<typeof RequirementKindSchema>
export type AnalysisRequirement = z.infer<typeof AnalysisRequirementSchema>

export interface AnalysisDiagnostic {
  code: string
  message: string
  requirementId?: string
  obligationId?: string
}

export interface AnalysisLedgerEntry {
  requirementId: string
  obligationId: string
  kind: RequirementKind
  question: string
  applicability: AnalysisRequirement["applicability"]
  prerequisiteIds: string[]
  status: "pending"
}

export interface AnalysisPlan {
  status: "ready" | "partial" | "blocked"
  requirements: AnalysisRequirement[]
  entries: AnalysisLedgerEntry[]
  diagnostics: AnalysisDiagnostic[]
}

interface CandidateEntry extends AnalysisLedgerEntry {
  dependencyKeys: string[]
}

function entryKey(requirementId: string, obligationId: string): string {
  return JSON.stringify([requirementId, obligationId])
}

function normalizeRequirement(requirement: AnalysisRequirement): AnalysisRequirement {
  return {
    ...requirement,
    obligationIds: [...requirement.obligationIds].sort((left, right) => left.localeCompare(right)),
    prerequisiteIds: [...requirement.prerequisiteIds].sort((left, right) => left.localeCompare(right)),
  }
}

function compareDiagnostics(left: AnalysisDiagnostic, right: AnalysisDiagnostic): number {
  return left.code.localeCompare(right.code)
    || (left.requirementId ?? "").localeCompare(right.requirementId ?? "")
    || (left.obligationId ?? "").localeCompare(right.obligationId ?? "")
    || left.message.localeCompare(right.message)
}

function invalidRequirementDiagnostic(input: unknown, messages: string[]): AnalysisDiagnostic {
  const id = typeof input === "object" && input !== null && "id" in input
    && typeof input.id === "string" && input.id.trim().length > 0
    ? input.id
    : undefined
  return {
    code: "invalid-analysis-requirement",
    message: `Analysis requirement is invalid: ${messages.join("; ")}`,
    ...(id ? { requirementId: id } : {}),
  }
}

function findCycleKeys(candidates: Map<string, CandidateEntry>): Set<string> {
  const state = new Map<string, "visiting" | "visited">()
  const stack: string[] = []
  const cycleKeys = new Set<string>()

  const visit = (key: string): void => {
    state.set(key, "visiting")
    stack.push(key)
    const candidate = candidates.get(key)
    for (const dependencyKey of candidate?.dependencyKeys ?? []) {
      if (!candidates.has(dependencyKey)) continue
      const dependencyState = state.get(dependencyKey)
      if (!dependencyState) {
        visit(dependencyKey)
      } else if (dependencyState === "visiting") {
        const cycleStart = stack.lastIndexOf(dependencyKey)
        stack.slice(cycleStart).forEach(cycleKey => cycleKeys.add(cycleKey))
      }
    }
    stack.pop()
    state.set(key, "visited")
  }

  for (const key of [...candidates.keys()].sort((left, right) => left.localeCompare(right))) {
    if (!state.has(key)) visit(key)
  }
  return cycleKeys
}

export function compileAnalysisRequirements(
  task: AuthorizationTaskV0,
  requirementInputs: AnalysisRequirement[],
): AnalysisPlan {
  const diagnostics: AnalysisDiagnostic[] = []
  const parsedRequirements: AnalysisRequirement[] = []

  requirementInputs.forEach(input => {
    const parsed = AnalysisRequirementSchema.safeParse(input)
    if (parsed.success) {
      parsedRequirements.push(normalizeRequirement(parsed.data))
      return
    }
    diagnostics.push(invalidRequirementDiagnostic(
      input,
      parsed.error.issues.map(issue => `${issue.path.join(".") || "$"}: ${issue.message}`),
    ))
  })

  if (requirementInputs.length === 0) {
    diagnostics.push({
      code: "empty-analysis-requirements",
      message: "At least one analysis requirement is needed to compile a ledger.",
    })
  }

  const requirementCounts = new Map<string, number>()
  parsedRequirements.forEach(requirement => {
    requirementCounts.set(requirement.id, (requirementCounts.get(requirement.id) ?? 0) + 1)
  })
  const duplicateRequirementIds = new Set(
    [...requirementCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([id]) => id),
  )
  for (const requirementId of [...duplicateRequirementIds].sort((left, right) => left.localeCompare(right))) {
    diagnostics.push({
      code: "duplicate-requirement-id",
      message: `Analysis requirement id "${requirementId}" is duplicated and cannot be resolved.`,
      requirementId,
    })
  }

  const requirements = parsedRequirements
    .filter(requirement => !duplicateRequirementIds.has(requirement.id))
    .sort((left, right) => left.id.localeCompare(right.id))
  const requirementsById = new Map(requirements.map(requirement => [requirement.id, requirement]))

  const authoredObligationCounts = new Map<string, number>()
  task.obligations.forEach(obligation => {
    authoredObligationCounts.set(
      obligation.id,
      (authoredObligationCounts.get(obligation.id) ?? 0) + 1,
    )
  })
  const compiledTask = compileAuthorizationTask(task)
  const runnableByAuthoredId = new Map<string, string[]>()
  compiledTask.runnableObligations.forEach(obligation => {
    const existing = runnableByAuthoredId.get(obligation.authorObligationId) ?? []
    existing.push(obligation.id)
    runnableByAuthoredId.set(obligation.authorObligationId, existing)
  })
  runnableByAuthoredId.forEach(ids => ids.sort((left, right) => left.localeCompare(right)))

  const candidates = new Map<string, CandidateEntry>()
  const structurallyInvalidKeys = new Set<string>()

  for (const requirement of requirements) {
    const unknownPrerequisites = requirement.prerequisiteIds.filter(
      prerequisiteId => !requirementsById.has(prerequisiteId),
    )
    for (const prerequisiteId of unknownPrerequisites) {
      diagnostics.push({
        code: duplicateRequirementIds.has(prerequisiteId)
          ? "ambiguous-prerequisite"
          : "unknown-prerequisite",
        message: duplicateRequirementIds.has(prerequisiteId)
          ? `Prerequisite "${prerequisiteId}" is duplicated and cannot be resolved.`
          : `Prerequisite "${prerequisiteId}" does not name an analysis requirement.`,
        requirementId: requirement.id,
      })
    }

    for (const authoredObligationId of requirement.obligationIds) {
      const authoredCount = authoredObligationCounts.get(authoredObligationId) ?? 0
      if (authoredCount === 0) {
        diagnostics.push({
          code: "unknown-obligation",
          message: `Authored obligation "${authoredObligationId}" does not exist.`,
          requirementId: requirement.id,
          obligationId: authoredObligationId,
        })
        continue
      }
      if (authoredCount > 1) {
        diagnostics.push({
          code: "ambiguous-obligation",
          message: `Authored obligation "${authoredObligationId}" is duplicated and cannot be resolved.`,
          requirementId: requirement.id,
          obligationId: authoredObligationId,
        })
        continue
      }

      const expandedObligationIds = runnableByAuthoredId.get(authoredObligationId) ?? []
      if (expandedObligationIds.length === 0) {
        diagnostics.push({
          code: "obligation-not-runnable",
          message: `Authored obligation "${authoredObligationId}" has no runnable expanded obligation.`,
          requirementId: requirement.id,
          obligationId: authoredObligationId,
        })
        continue
      }

      for (const obligationId of expandedObligationIds) {
        const key = entryKey(requirement.id, obligationId)
        const dependencyKeys = requirement.prerequisiteIds.map(
          prerequisiteId => entryKey(prerequisiteId, obligationId),
        )
        candidates.set(key, {
          requirementId: requirement.id,
          obligationId,
          kind: requirement.kind,
          question: requirement.question,
          applicability: requirement.applicability,
          prerequisiteIds: [...requirement.prerequisiteIds],
          status: "pending",
          dependencyKeys,
        })
        if (unknownPrerequisites.length > 0) structurallyInvalidKeys.add(key)
      }
    }
  }

  for (const [key, candidate] of candidates) {
    if (structurallyInvalidKeys.has(key)) continue
    for (let index = 0; index < candidate.prerequisiteIds.length; index += 1) {
      const prerequisiteId = candidate.prerequisiteIds[index]!
      const dependencyKey = candidate.dependencyKeys[index]!
      if (!candidates.has(dependencyKey)) {
        diagnostics.push({
          code: "prerequisite-not-applicable",
          message: `Prerequisite "${prerequisiteId}" does not apply to expanded obligation "${candidate.obligationId}".`,
          requirementId: candidate.requirementId,
          obligationId: candidate.obligationId,
        })
        structurallyInvalidKeys.add(key)
      }
    }
  }

  const cycleCandidates = new Map(
    [...candidates.entries()].filter(([key]) => !structurallyInvalidKeys.has(key)),
  )
  const cycleKeys = findCycleKeys(cycleCandidates)
  for (const key of [...cycleKeys].sort((left, right) => left.localeCompare(right))) {
    const candidate = candidates.get(key)!
    diagnostics.push({
      code: "dependency-cycle",
      message: `Analysis requirement "${candidate.requirementId}" participates in a dependency cycle for "${candidate.obligationId}".`,
      requirementId: candidate.requirementId,
      obligationId: candidate.obligationId,
    })
    structurallyInvalidKeys.add(key)
  }

  let changed = true
  while (changed) {
    changed = false
    for (const [key, candidate] of [...candidates.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      if (structurallyInvalidKeys.has(key)) continue
      const unavailableDependency = candidate.dependencyKeys.find(
        dependencyKey => structurallyInvalidKeys.has(dependencyKey),
      )
      if (!unavailableDependency) continue
      const prerequisiteId = candidates.get(unavailableDependency)?.requirementId
        ?? "unknown prerequisite"
      diagnostics.push({
        code: "prerequisite-unavailable",
        message: `Prerequisite "${prerequisiteId}" is unavailable for expanded obligation "${candidate.obligationId}".`,
        requirementId: candidate.requirementId,
        obligationId: candidate.obligationId,
      })
      structurallyInvalidKeys.add(key)
      changed = true
    }
  }

  const entries = [...candidates.entries()]
    .filter(([key]) => !structurallyInvalidKeys.has(key))
    .map(([, { dependencyKeys: _dependencyKeys, ...entry }]) => entry)
    .sort((left, right) => left.obligationId.localeCompare(right.obligationId)
      || left.requirementId.localeCompare(right.requirementId))
  diagnostics.sort(compareDiagnostics)

  return {
    status: entries.length === 0 ? "blocked" : diagnostics.length > 0 ? "partial" : "ready",
    requirements,
    entries,
    diagnostics,
  }
}
