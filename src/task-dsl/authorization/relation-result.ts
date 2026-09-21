import { z } from "zod"
import type { AuthorizationResultV0 } from "./schema.ts"
import type {
  AnalysisDiagnostic,
  AnalysisPlan,
} from "./relations.ts"

const NonEmptyString = z.string().trim().min(1)

export const RelationCoverageSchema = z.object({
  requirementId: NonEmptyString,
  obligationId: NonEmptyString,
  status: z.enum(["addressed", "unknown", "not-applicable"]),
  explanation: NonEmptyString,
  factPointers: z.array(NonEmptyString),
}).strict()

export const RelationCoverageListSchema = z.array(RelationCoverageSchema)

export type RelationCoverage = z.infer<typeof RelationCoverageSchema>

export interface CoverageValidation {
  status: "valid" | "invalid"
  declared: number
  addressed: number
  unknown: number
  notApplicable: number
  missing: Array<{ requirementId: string; obligationId: string }>
  semanticSupport: "unreviewed"
  coverage?: RelationCoverage[]
  diagnostics: AnalysisDiagnostic[]
}

const FactPointerPattern = /^\/results\/(0|[1-9]\d*)\/facts\/(entry|binding|control|effect|condition)\/(0|[1-9]\d*)$/

function coverageKey(requirementId: string, obligationId: string): string {
  return JSON.stringify([requirementId, obligationId])
}

function comparePair(
  left: { requirementId: string; obligationId: string },
  right: { requirementId: string; obligationId: string },
): number {
  return left.obligationId.localeCompare(right.obligationId)
    || left.requirementId.localeCompare(right.requirementId)
}

function compareDiagnostics(left: AnalysisDiagnostic, right: AnalysisDiagnostic): number {
  return left.code.localeCompare(right.code)
    || (left.requirementId ?? "").localeCompare(right.requirementId ?? "")
    || (left.obligationId ?? "").localeCompare(right.obligationId ?? "")
    || (left.path ?? "").localeCompare(right.path ?? "")
    || left.message.localeCompare(right.message)
}

function validateFactPointer(
  result: AuthorizationResultV0,
  coverage: RelationCoverage,
  coverageIndex: number,
  pointer: string,
  pointerIndex: number,
): AnalysisDiagnostic | undefined {
  const path = `coverage.${coverageIndex}.factPointers.${pointerIndex}`
  const matched = FactPointerPattern.exec(pointer)
  if (!matched) {
    return {
      code: "dangling-fact-pointer",
      message: `Fact pointer "${pointer}" must identify one fact object under /results/.../facts/... .`,
      requirementId: coverage.requirementId,
      obligationId: coverage.obligationId,
      path,
    }
  }

  const resultIndex = Number(matched[1])
  const group = matched[2] as keyof AuthorizationResultV0["results"][number]["facts"]
  const factIndex = Number(matched[3])
  const obligationResult = result.results[resultIndex]
  const fact = obligationResult?.facts[group]?.[factIndex]
  if (!obligationResult || !fact) {
    return {
      code: "dangling-fact-pointer",
      message: `Fact pointer "${pointer}" does not resolve in this canonical result.`,
      requirementId: coverage.requirementId,
      obligationId: coverage.obligationId,
      path,
    }
  }
  if (obligationResult.obligationId !== coverage.obligationId) {
    return {
      code: "fact-pointer-obligation-mismatch",
      message: `Fact pointer "${pointer}" belongs to obligation "${obligationResult.obligationId}", not "${coverage.obligationId}".`,
      requirementId: coverage.requirementId,
      obligationId: coverage.obligationId,
      path,
    }
  }
  return undefined
}

export function validateRelationCoverage(
  plan: AnalysisPlan,
  canonical: AuthorizationResultV0,
  coverageInput: unknown,
): CoverageValidation {
  const diagnostics: AnalysisDiagnostic[] = []
  const expectedByKey = new Map(
    plan.entries.map(entry => [coverageKey(entry.requirementId, entry.obligationId), entry]),
  )
  const requirementsById = new Map(plan.requirements.map(requirement => [requirement.id, requirement]))

  if (plan.status !== "ready") {
    diagnostics.push({
      code: "analysis-plan-not-ready",
      message: `Relation coverage cannot be complete while the analysis plan is ${plan.status}.`,
      path: "analysisPlan.status",
    })
  }

  if (!Array.isArray(coverageInput)) {
    diagnostics.push({
      code: "coverage-schema-invalid",
      message: "Relation coverage must be an array.",
      path: "coverage",
    })
    const missing = plan.entries
      .map(entry => ({ requirementId: entry.requirementId, obligationId: entry.obligationId }))
      .sort(comparePair)
    return {
      status: "invalid",
      declared: plan.entries.length,
      addressed: 0,
      unknown: 0,
      notApplicable: 0,
      missing,
      semanticSupport: "unreviewed",
      diagnostics,
    }
  }

  const parsedCoverage: Array<{ coverage: RelationCoverage; index: number }> = []
  coverageInput.forEach((item, index) => {
    const parsed = RelationCoverageSchema.safeParse(item)
    if (parsed.success) {
      parsedCoverage.push({ coverage: parsed.data, index })
      return
    }
    parsed.error.issues.forEach(issue => diagnostics.push({
      code: "coverage-schema-invalid",
      message: issue.message,
      path: `coverage.${index}${issue.path.length > 0 ? `.${issue.path.join(".")}` : ""}`,
      ...(typeof item === "object" && item !== null
        && "requirementId" in item && typeof item.requirementId === "string"
        ? { requirementId: item.requirementId }
        : {}),
      ...(typeof item === "object" && item !== null
        && "obligationId" in item && typeof item.obligationId === "string"
        ? { obligationId: item.obligationId }
        : {}),
    }))
  })

  const occurrences = new Map<string, Array<{ coverage: RelationCoverage; index: number }>>()
  parsedCoverage.forEach(item => {
    const key = coverageKey(item.coverage.requirementId, item.coverage.obligationId)
    const current = occurrences.get(key) ?? []
    current.push(item)
    occurrences.set(key, current)
  })

  const invalidKeys = new Set<string>()
  for (const [key, items] of occurrences) {
    const first = items[0]!
    if (!requirementsById.has(first.coverage.requirementId)) {
      diagnostics.push({
        code: "foreign-requirement-coverage",
        message: `Coverage names undeclared requirement "${first.coverage.requirementId}".`,
        requirementId: first.coverage.requirementId,
        obligationId: first.coverage.obligationId,
        path: `coverage.${first.index}.requirementId`,
      })
      invalidKeys.add(key)
    } else if (!expectedByKey.has(key)) {
      diagnostics.push({
        code: "foreign-coverage-obligation",
        message: `Requirement "${first.coverage.requirementId}" does not apply to expanded obligation "${first.coverage.obligationId}".`,
        requirementId: first.coverage.requirementId,
        obligationId: first.coverage.obligationId,
        path: `coverage.${first.index}.obligationId`,
      })
      invalidKeys.add(key)
    }
    if (items.length > 1) {
      diagnostics.push({
        code: "duplicate-relation-coverage",
        message: `Coverage repeats requirement "${first.coverage.requirementId}" for "${first.coverage.obligationId}".`,
        requirementId: first.coverage.requirementId,
        obligationId: first.coverage.obligationId,
        path: `coverage.${items[1]!.index}`,
      })
      invalidKeys.add(key)
    }
  }

  const missing = plan.entries
    .filter(entry => !occurrences.has(coverageKey(entry.requirementId, entry.obligationId)))
    .map(entry => ({ requirementId: entry.requirementId, obligationId: entry.obligationId }))
    .sort(comparePair)
  missing.forEach(item => diagnostics.push({
    code: "missing-relation-coverage",
    message: `Coverage is missing requirement "${item.requirementId}" for "${item.obligationId}".`,
    requirementId: item.requirementId,
    obligationId: item.obligationId,
    path: "coverage",
  }))

  for (const [key, items] of occurrences) {
    if (invalidKeys.has(key) || !expectedByKey.has(key) || items.length !== 1) continue
    const { coverage: item, index } = items[0]!
    const expected = expectedByKey.get(key)!
    if (item.status === "not-applicable" && expected.applicability === "required") {
      diagnostics.push({
        code: "required-coverage-not-applicable",
        message: `Required analysis question "${item.requirementId}" cannot be marked not-applicable.`,
        requirementId: item.requirementId,
        obligationId: item.obligationId,
        path: `coverage.${index}.status`,
      })
      invalidKeys.add(key)
    }
    if ((item.status === "addressed" || item.status === "not-applicable") && item.factPointers.length === 0) {
      diagnostics.push({
        code: "coverage-fact-pointer-required",
        message: `${item.status} coverage requires at least one fact pointer from the same obligation.`,
        requirementId: item.requirementId,
        obligationId: item.obligationId,
        path: `coverage.${index}.factPointers`,
      })
      invalidKeys.add(key)
    }
    item.factPointers.forEach((pointer, pointerIndex) => {
      const diagnostic = validateFactPointer(canonical, item, index, pointer, pointerIndex)
      if (diagnostic) {
        diagnostics.push(diagnostic)
        invalidKeys.add(key)
      }
    })
  }

  let addressed = 0
  let unknown = 0
  let notApplicable = 0
  for (const [key, items] of occurrences) {
    if (invalidKeys.has(key) || !expectedByKey.has(key) || items.length !== 1) continue
    if (items[0]!.coverage.status === "addressed") addressed += 1
    else if (items[0]!.coverage.status === "unknown") unknown += 1
    else notApplicable += 1
  }

  diagnostics.sort(compareDiagnostics)
  return {
    status: diagnostics.length === 0 && plan.status === "ready" ? "valid" : "invalid",
    declared: plan.entries.length,
    addressed,
    unknown,
    notApplicable,
    missing,
    semanticSupport: "unreviewed",
    coverage: parsedCoverage.map(item => item.coverage),
    diagnostics,
  }
}
