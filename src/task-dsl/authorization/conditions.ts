import { z } from "zod"
import type { AuthorizationResultV0, AuthorizationTaskV0 } from "./schema.ts"
import { compileAuthorizationTask } from "./semantics.ts"

const NonEmptyString = z.string().trim().min(1)

export const ConditionValueSchema = z.enum(["true", "false", "unknown"])
export type ConditionValue = z.infer<typeof ConditionValueSchema>

export const ConditionBindingSchema = z.object({
  id: NonEmptyString,
  name: NonEmptyString,
}).strict()

export const ConditionAnalysisRequestItemSchema = z.object({
  obligationId: NonEmptyString,
  conditionBindings: z.array(ConditionBindingSchema).min(1),
  maxBranches: z.number().int().min(1).max(12).optional().default(8),
}).strict()

export const AuthorizationConditionAnalysisRequestV1Schema = z.object({
  schemaVersion: z.literal("authorization-condition-analysis-request/v1"),
  requests: z.array(ConditionAnalysisRequestItemSchema).min(1),
}).strict()

export type AuthorizationConditionAnalysisRequestV1 = z.infer<
  typeof AuthorizationConditionAnalysisRequestV1Schema
>

export const ConditionAssumptionSchema = z.object({
  conditionId: NonEmptyString,
  value: ConditionValueSchema,
}).strict()

export const ConditionalOutcomeSchema = z.object({
  id: NonEmptyString,
  obligationId: NonEmptyString,
  assumptions: z.array(ConditionAssumptionSchema).min(1),
  effect: z.enum(["reachable", "blocked", "unknown"]),
  explanation: NonEmptyString,
  factPointers: z.array(NonEmptyString),
  missingFacts: z.array(NonEmptyString),
}).strict()

export const ConditionAnalysisSchema = z.object({
  obligationId: NonEmptyString,
  branches: z.array(ConditionalOutcomeSchema).min(1),
  unexaminedConditionIds: z.array(NonEmptyString),
  completeness: z.enum(["bounded", "incomplete"]),
  limitations: z.array(NonEmptyString),
}).strict()

export const AuthorizationConditionAnalysisResultV1Schema = z.object({
  schemaVersion: z.literal("authorization-condition-analysis-result/v1"),
  analyses: z.array(ConditionAnalysisSchema),
}).strict()

export type ConditionalOutcome = z.infer<typeof ConditionalOutcomeSchema>
export type ConditionAnalysisResult = z.infer<typeof ConditionAnalysisSchema>
export type AuthorizationConditionAnalysisResultV1 = z.infer<
  typeof AuthorizationConditionAnalysisResultV1Schema
>

export interface ConditionDiagnostic {
  code: string
  message: string
  path?: string
  obligationId?: string
  conditionId?: string
  branchId?: string
}

export interface CompiledConditionDefinition {
  id: string
  name: string
  basis: string
}

export interface ConditionAnalysisPlanEntry {
  authorObligationId: string
  obligationId: string
  conditions: CompiledConditionDefinition[]
  maxBranches: number
}

export interface ConditionAnalysisPlan {
  status: "not-requested" | "ready" | "partial" | "blocked"
  request?: AuthorizationConditionAnalysisRequestV1
  entries: ConditionAnalysisPlanEntry[]
  diagnostics: ConditionDiagnostic[]
}

export interface ConditionAnalysisValidation {
  status: "valid" | "invalid"
  declared: number
  bounded: number
  incomplete: number
  missing: string[]
  semanticSupport: "unreviewed"
  result?: AuthorizationConditionAnalysisResultV1
  diagnostics: ConditionDiagnostic[]
}

function formatPath(path: Array<string | number>): string {
  return path.length === 0 ? "$" : path.join(".")
}

function compareDiagnostics(left: ConditionDiagnostic, right: ConditionDiagnostic): number {
  return left.code.localeCompare(right.code)
    || (left.obligationId ?? "").localeCompare(right.obligationId ?? "")
    || (left.conditionId ?? "").localeCompare(right.conditionId ?? "")
    || (left.branchId ?? "").localeCompare(right.branchId ?? "")
    || (left.path ?? "").localeCompare(right.path ?? "")
    || left.message.localeCompare(right.message)
}

function countValues(values: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return counts
}

export function compileConditionAnalysisRequest(
  task: AuthorizationTaskV0,
  requestInput: unknown | undefined,
): ConditionAnalysisPlan {
  if (requestInput === undefined) {
    return { status: "not-requested", entries: [], diagnostics: [] }
  }

  const parsed = AuthorizationConditionAnalysisRequestV1Schema.safeParse(requestInput)
  if (!parsed.success) {
    return {
      status: "blocked",
      entries: [],
      diagnostics: parsed.error.issues.map(issue => ({
        code: "condition-request-schema-invalid",
        message: issue.message,
        path: formatPath(issue.path),
      })).sort(compareDiagnostics),
    }
  }

  const request = parsed.data
  const diagnostics: ConditionDiagnostic[] = []
  const compiledTask = compileAuthorizationTask(task)
  const authoredCounts = countValues(task.obligations.map(obligation => obligation.id))
  const authoredById = new Map(task.obligations.map(obligation => [obligation.id, obligation]))
  const runnableByAuthoredId = new Map<string, string[]>()
  for (const obligation of compiledTask.runnableObligations) {
    const ids = runnableByAuthoredId.get(obligation.authorObligationId) ?? []
    ids.push(obligation.id)
    runnableByAuthoredId.set(obligation.authorObligationId, ids)
  }
  runnableByAuthoredId.forEach(ids => ids.sort((left, right) => left.localeCompare(right)))

  const requestCounts = countValues(request.requests.map(item => item.obligationId))
  const bindingIdCounts = countValues(
    request.requests.flatMap(item => item.conditionBindings.map(binding => binding.id)),
  )
  for (const [conditionId, count] of [...bindingIdCounts.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (count <= 1) continue
    diagnostics.push({
      code: "duplicate-condition-id",
      message: `Condition id "${conditionId}" is duplicated across the request and cannot be resolved.`,
      conditionId,
    })
  }

  const entries: ConditionAnalysisPlanEntry[] = []
  request.requests.forEach((item, requestIndex) => {
    if ((requestCounts.get(item.obligationId) ?? 0) > 1) {
      diagnostics.push({
        code: "duplicate-condition-request",
        message: `Condition analysis request repeats authored obligation "${item.obligationId}".`,
        obligationId: item.obligationId,
        path: `requests.${requestIndex}.obligationId`,
      })
      return
    }

    const authoredCount = authoredCounts.get(item.obligationId) ?? 0
    if (authoredCount === 0) {
      diagnostics.push({
        code: "unknown-condition-obligation",
        message: `Authored obligation "${item.obligationId}" does not exist.`,
        obligationId: item.obligationId,
        path: `requests.${requestIndex}.obligationId`,
      })
      return
    }
    if (authoredCount > 1) {
      diagnostics.push({
        code: "ambiguous-condition-obligation",
        message: `Authored obligation "${item.obligationId}" is duplicated and cannot be resolved.`,
        obligationId: item.obligationId,
        path: `requests.${requestIndex}.obligationId`,
      })
      return
    }

    const authored = authoredById.get(item.obligationId)!
    const conditionNameCounts = countValues(authored.conditions.map(condition => condition.name))
    const bindingNameCounts = countValues(item.conditionBindings.map(binding => binding.name))
    const compiledConditions: CompiledConditionDefinition[] = []
    let requestInvalid = false

    item.conditionBindings.forEach((binding, bindingIndex) => {
      const path = `requests.${requestIndex}.conditionBindings.${bindingIndex}`
      let valid = true
      if ((bindingIdCounts.get(binding.id) ?? 0) > 1) valid = false
      if ((bindingNameCounts.get(binding.name) ?? 0) > 1) {
        diagnostics.push({
          code: "duplicate-condition-binding-name",
          message: `Authored condition name "${binding.name}" is bound more than once for "${item.obligationId}".`,
          obligationId: item.obligationId,
          conditionId: binding.id,
          path: `${path}.name`,
        })
        valid = false
      }
      const nameCount = conditionNameCounts.get(binding.name) ?? 0
      if (nameCount === 0) {
        diagnostics.push({
          code: "unknown-condition-name",
          message: `Condition name "${binding.name}" does not exist on authored obligation "${item.obligationId}".`,
          obligationId: item.obligationId,
          conditionId: binding.id,
          path: `${path}.name`,
        })
        valid = false
      } else if (nameCount > 1) {
        diagnostics.push({
          code: "duplicate-condition-name",
          message: `Condition name "${binding.name}" is duplicated on authored obligation "${item.obligationId}" and cannot be bound by position.`,
          obligationId: item.obligationId,
          conditionId: binding.id,
          path: `${path}.name`,
        })
        valid = false
      }
      if (!valid) {
        requestInvalid = true
        return
      }
      const condition = authored.conditions.find(candidate => candidate.name === binding.name)!
      compiledConditions.push({ id: binding.id, name: condition.name, basis: condition.basis })
    })

    if (requestInvalid || compiledConditions.length === 0) return
    compiledConditions.sort((left, right) => left.id.localeCompare(right.id))
    const expandedIds = runnableByAuthoredId.get(item.obligationId) ?? []
    if (expandedIds.length === 0) {
      diagnostics.push({
        code: "condition-obligation-not-runnable",
        message: `Authored obligation "${item.obligationId}" has no runnable expanded obligation.`,
        obligationId: item.obligationId,
        path: `requests.${requestIndex}.obligationId`,
      })
      return
    }
    for (const obligationId of expandedIds) {
      entries.push({
        authorObligationId: item.obligationId,
        obligationId,
        conditions: compiledConditions.map(condition => ({ ...condition })),
        maxBranches: item.maxBranches,
      })
    }
  })

  entries.sort((left, right) => left.obligationId.localeCompare(right.obligationId))
  diagnostics.sort(compareDiagnostics)
  return {
    status: entries.length === 0 ? "blocked" : diagnostics.length > 0 ? "partial" : "ready",
    request,
    entries,
    diagnostics,
  }
}

const FactPointerPattern = /^\/results\/(0|[1-9]\d*)\/facts\/(entry|binding|control|effect|condition)\/(0|[1-9]\d*)$/

function validateFactPointer(input: {
  canonical: AuthorizationResultV0
  pointer: string
  path: string
  obligationId: string
  branchId: string
}): ConditionDiagnostic | undefined {
  const matched = FactPointerPattern.exec(input.pointer)
  if (!matched) {
    return {
      code: "dangling-condition-fact-pointer",
      message: `Fact pointer "${input.pointer}" must identify one canonical fact under /results/.../facts/... .`,
      obligationId: input.obligationId,
      branchId: input.branchId,
      path: input.path,
    }
  }
  const resultIndex = Number(matched[1])
  const group = matched[2] as keyof AuthorizationResultV0["results"][number]["facts"]
  const factIndex = Number(matched[3])
  const result = input.canonical.results[resultIndex]
  const fact = result?.facts[group]?.[factIndex]
  if (!result || !fact) {
    return {
      code: "dangling-condition-fact-pointer",
      message: `Fact pointer "${input.pointer}" does not resolve in this canonical result.`,
      obligationId: input.obligationId,
      branchId: input.branchId,
      path: input.path,
    }
  }
  if (result.obligationId !== input.obligationId) {
    return {
      code: "condition-fact-pointer-obligation-mismatch",
      message: `Fact pointer "${input.pointer}" belongs to obligation "${result.obligationId}", not "${input.obligationId}".`,
      obligationId: input.obligationId,
      branchId: input.branchId,
      path: input.path,
    }
  }
  return undefined
}

function assumptionKey(branch: ConditionalOutcome): string {
  return JSON.stringify(
    branch.assumptions
      .map(assumption => [assumption.conditionId, assumption.value])
      .sort(([leftId, leftValue], [rightId, rightValue]) => String(leftId).localeCompare(String(rightId))
        || String(leftValue).localeCompare(String(rightValue))),
  )
}

export function validateConditionAnalysisResult(
  plan: ConditionAnalysisPlan,
  canonical: AuthorizationResultV0,
  resultInput: unknown,
): ConditionAnalysisValidation {
  const diagnostics: ConditionDiagnostic[] = []
  const expectedByObligation = new Map(plan.entries.map(entry => [entry.obligationId, entry]))
  const conditionScopes = new Map<string, Set<string>>()
  for (const entry of plan.entries) {
    for (const condition of entry.conditions) {
      const scopes = conditionScopes.get(condition.id) ?? new Set<string>()
      scopes.add(entry.obligationId)
      conditionScopes.set(condition.id, scopes)
    }
  }

  if (plan.status !== "ready") {
    diagnostics.push({
      code: "condition-plan-not-ready",
      message: `Condition analysis cannot be complete while its plan is ${plan.status}.`,
      path: "conditionPlan.status",
    })
  }

  const parsed = AuthorizationConditionAnalysisResultV1Schema.safeParse(resultInput)
  if (!parsed.success) {
    diagnostics.push(...parsed.error.issues.map(issue => ({
      code: "condition-result-schema-invalid",
      message: issue.message,
      path: formatPath(issue.path),
    })))
    diagnostics.sort(compareDiagnostics)
    return {
      status: "invalid",
      declared: plan.entries.length,
      bounded: 0,
      incomplete: 0,
      missing: plan.entries.map(entry => entry.obligationId),
      semanticSupport: "unreviewed",
      diagnostics,
    }
  }

  const result = parsed.data
  const occurrences = new Map<string, Array<{ analysis: ConditionAnalysisResult; index: number }>>()
  result.analyses.forEach((analysis, index) => {
    const values = occurrences.get(analysis.obligationId) ?? []
    values.push({ analysis, index })
    occurrences.set(analysis.obligationId, values)
  })

  const invalidObligations = new Set<string>()
  for (const [obligationId, analyses] of occurrences) {
    if (!expectedByObligation.has(obligationId)) {
      diagnostics.push({
        code: "foreign-condition-analysis",
        message: `Condition result names unrequested expanded obligation "${obligationId}".`,
        obligationId,
        path: `analyses.${analyses[0]!.index}.obligationId`,
      })
      invalidObligations.add(obligationId)
    }
    if (analyses.length > 1) {
      diagnostics.push({
        code: "duplicate-condition-analysis",
        message: `Condition result repeats expanded obligation "${obligationId}".`,
        obligationId,
        path: `analyses.${analyses[1]!.index}`,
      })
      invalidObligations.add(obligationId)
    }
  }

  const missing = plan.entries
    .filter(entry => !occurrences.has(entry.obligationId))
    .map(entry => entry.obligationId)
    .sort((left, right) => left.localeCompare(right))
  for (const obligationId of missing) {
    diagnostics.push({
      code: "missing-condition-analysis",
      message: `Condition result is missing expanded obligation "${obligationId}".`,
      obligationId,
      path: "analyses",
    })
  }

  let bounded = 0
  let incomplete = 0
  for (const entry of plan.entries) {
    const occurrence = occurrences.get(entry.obligationId)
    if (!occurrence || occurrence.length !== 1 || invalidObligations.has(entry.obligationId)) continue
    const { analysis, index: analysisIndex } = occurrence[0]!
    const diagnosticsBefore = diagnostics.length
    const expectedConditionIds = new Set(entry.conditions.map(condition => condition.id))
    const examinedConditionIds = new Set<string>()

    if (analysis.branches.length > entry.maxBranches) {
      diagnostics.push({
        code: "condition-branch-limit-exceeded",
        message: `Condition analysis returns ${analysis.branches.length} branches but the authored bound is ${entry.maxBranches}.`,
        obligationId: entry.obligationId,
        path: `analyses.${analysisIndex}.branches`,
      })
    }

    const branchIds = new Map<string, number>()
    const branchesByAssumptions = new Map<string, ConditionalOutcome>()
    analysis.branches.forEach((branch, branchIndex) => {
      const branchPath = `analyses.${analysisIndex}.branches.${branchIndex}`
      const previousBranchIndex = branchIds.get(branch.id)
      if (previousBranchIndex !== undefined) {
        diagnostics.push({
          code: "duplicate-condition-branch-id",
          message: `Condition branch id "${branch.id}" is duplicated in one analysis.`,
          obligationId: entry.obligationId,
          branchId: branch.id,
          path: branchPath,
        })
      } else {
        branchIds.set(branch.id, branchIndex)
      }
      if (branch.obligationId !== analysis.obligationId) {
        diagnostics.push({
          code: "condition-branch-obligation-mismatch",
          message: `Branch obligation "${branch.obligationId}" does not match analysis obligation "${analysis.obligationId}".`,
          obligationId: entry.obligationId,
          branchId: branch.id,
          path: `${branchPath}.obligationId`,
        })
      }

      const valuesByCondition = new Map<string, ConditionValue>()
      branch.assumptions.forEach((assumption, assumptionIndex) => {
        const assumptionPath = `${branchPath}.assumptions.${assumptionIndex}.conditionId`
        const scopes = conditionScopes.get(assumption.conditionId)
        if (!scopes) {
          diagnostics.push({
            code: "unknown-condition-id",
            message: `Condition id "${assumption.conditionId}" was not requested.`,
            obligationId: entry.obligationId,
            conditionId: assumption.conditionId,
            branchId: branch.id,
            path: assumptionPath,
          })
        } else if (!expectedConditionIds.has(assumption.conditionId)) {
          diagnostics.push({
            code: "condition-obligation-mismatch",
            message: `Condition id "${assumption.conditionId}" belongs to a different requested obligation.`,
            obligationId: entry.obligationId,
            conditionId: assumption.conditionId,
            branchId: branch.id,
            path: assumptionPath,
          })
        } else {
          examinedConditionIds.add(assumption.conditionId)
        }

        const previous = valuesByCondition.get(assumption.conditionId)
        if (previous !== undefined) {
          diagnostics.push({
            code: previous === assumption.value
              ? "duplicate-condition-assignment"
              : "conflicting-condition-assignment",
            message: previous === assumption.value
              ? `Condition "${assumption.conditionId}" is assigned ${assumption.value} more than once in branch "${branch.id}".`
              : `Condition "${assumption.conditionId}" has conflicting ${previous} and ${assumption.value} assignments in branch "${branch.id}".`,
            obligationId: entry.obligationId,
            conditionId: assumption.conditionId,
            branchId: branch.id,
            path: assumptionPath,
          })
        } else {
          valuesByCondition.set(assumption.conditionId, assumption.value)
        }
      })

      const key = assumptionKey(branch)
      const previousBranch = branchesByAssumptions.get(key)
      if (previousBranch) {
        diagnostics.push({
          code: previousBranch.effect === branch.effect
            ? "duplicate-condition-branch"
            : "conflicting-condition-branch-effect",
          message: previousBranch.effect === branch.effect
            ? `Branch "${branch.id}" repeats the assumptions and effect of "${previousBranch.id}".`
            : `Branch "${branch.id}" gives the same assumptions a different effect from "${previousBranch.id}".`,
          obligationId: entry.obligationId,
          branchId: branch.id,
          path: branchPath,
        })
      } else {
        branchesByAssumptions.set(key, branch)
      }

      const needsMissingFact = branch.effect === "unknown"
        || branch.assumptions.some(assumption => assumption.value === "unknown")
      if (needsMissingFact && branch.missingFacts.length === 0) {
        diagnostics.push({
          code: "unknown-condition-missing-fact",
          message: `Unknown branch "${branch.id}" requires at least one decisive missing fact.`,
          obligationId: entry.obligationId,
          branchId: branch.id,
          path: `${branchPath}.missingFacts`,
        })
      }
      if (branch.effect !== "unknown" && branch.factPointers.length === 0) {
        diagnostics.push({
          code: "condition-fact-pointer-required",
          message: `${branch.effect} branch "${branch.id}" requires at least one fact pointer.`,
          obligationId: entry.obligationId,
          branchId: branch.id,
          path: `${branchPath}.factPointers`,
        })
      }
      branch.factPointers.forEach((pointer, pointerIndex) => {
        const diagnostic = validateFactPointer({
          canonical,
          pointer,
          path: `${branchPath}.factPointers.${pointerIndex}`,
          obligationId: entry.obligationId,
          branchId: branch.id,
        })
        if (diagnostic) diagnostics.push(diagnostic)
      })
    })

    const unexaminedCounts = countValues(analysis.unexaminedConditionIds)
    for (const [conditionId, count] of unexaminedCounts) {
      const unexaminedIndex = analysis.unexaminedConditionIds.indexOf(conditionId)
      const path = `analyses.${analysisIndex}.unexaminedConditionIds.${unexaminedIndex}`
      if (count > 1) {
        diagnostics.push({
          code: "duplicate-unexamined-condition",
          message: `Unexamined condition id "${conditionId}" is repeated.`,
          obligationId: entry.obligationId,
          conditionId,
          path,
        })
      }
      const scopes = conditionScopes.get(conditionId)
      if (!scopes) {
        diagnostics.push({
          code: "unknown-condition-id",
          message: `Unexamined condition id "${conditionId}" was not requested.`,
          obligationId: entry.obligationId,
          conditionId,
          path,
        })
      } else if (!expectedConditionIds.has(conditionId)) {
        diagnostics.push({
          code: "condition-obligation-mismatch",
          message: `Unexamined condition id "${conditionId}" belongs to a different requested obligation.`,
          obligationId: entry.obligationId,
          conditionId,
          path,
        })
      }
      if (examinedConditionIds.has(conditionId)) {
        diagnostics.push({
          code: "condition-both-examined-and-unexamined",
          message: `Condition id "${conditionId}" appears in a branch and in unexaminedConditionIds.`,
          obligationId: entry.obligationId,
          conditionId,
          path,
        })
      }
    }

    for (const conditionId of expectedConditionIds) {
      if (examinedConditionIds.has(conditionId) || unexaminedCounts.has(conditionId)) continue
      diagnostics.push({
        code: "missing-condition-coverage",
        message: `Condition id "${conditionId}" is neither examined in a branch nor explicitly unexamined.`,
        obligationId: entry.obligationId,
        conditionId,
        path: `analyses.${analysisIndex}`,
      })
    }

    if (analysis.completeness === "bounded" && analysis.unexaminedConditionIds.length > 0) {
      diagnostics.push({
        code: "bounded-condition-analysis-has-unexamined",
        message: "Bounded condition analysis cannot list an unexamined requested condition.",
        obligationId: entry.obligationId,
        path: `analyses.${analysisIndex}.completeness`,
      })
    }
    if (analysis.completeness === "incomplete") {
      if (analysis.unexaminedConditionIds.length === 0) {
        diagnostics.push({
          code: "incomplete-condition-analysis-has-no-unexamined",
          message: "Incomplete condition analysis must identify at least one unexamined requested condition.",
          obligationId: entry.obligationId,
          path: `analyses.${analysisIndex}.unexaminedConditionIds`,
        })
      }
      if (analysis.limitations.length === 0) {
        diagnostics.push({
          code: "incomplete-condition-analysis-missing-limitation",
          message: "Incomplete condition analysis must explain its limitation.",
          obligationId: entry.obligationId,
          path: `analyses.${analysisIndex}.limitations`,
        })
      }
    }

    if (diagnostics.length === diagnosticsBefore) {
      if (analysis.completeness === "bounded") bounded += 1
      else incomplete += 1
    }
  }

  diagnostics.sort(compareDiagnostics)
  return {
    status: diagnostics.length === 0 ? "valid" : "invalid",
    declared: plan.entries.length,
    bounded,
    incomplete,
    missing,
    semanticSupport: "unreviewed",
    result,
    diagnostics,
  }
}
