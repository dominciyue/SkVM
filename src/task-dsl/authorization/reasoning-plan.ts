import type { CompiledAuthorizationTask } from "./semantics.ts"

export type AuthorizationReasoningStrategy = "standard" | "control-binding-v1"

export function validAuthorizationReasoningStrategy(value: unknown): value is AuthorizationReasoningStrategy {
  return value === "standard" || value === "control-binding-v1"
}

export type ReasoningFocus =
  | "checked-object-versus-effect-target"
  | "control-applicability-and-bypass"
  | "role-and-relation-exceptions"
  | "decisive-external-facts"

export interface AuthorizationReasoningPlan {
  strategy: AuthorizationReasoningStrategy
  entries: Array<{
    obligationId: string
    principalId: string
    resourceId: string
    entryId: string
    questions: Array<{ focus: ReasoningFocus; question: string }>
  }>
}

export function compileAuthorizationReasoningPlan(
  compiled: CompiledAuthorizationTask,
  strategy: AuthorizationReasoningStrategy,
): AuthorizationReasoningPlan {
  if (!validAuthorizationReasoningStrategy(strategy)) throw new Error(`Unknown authorization reasoning strategy: ${String(strategy)}`)
  if (strategy === "standard") return { strategy, entries: [] }

  const entries = compiled.runnableObligations.map(item => {
    const { principalId, resourceId, operation, relation, conditions } = item.obligation
    const conditionDescription = conditions.length > 0
      ? `declared conditions ${conditions.map(condition => condition.name).join(", ")}`
      : "no declared conditions"
    return {
      obligationId: item.id,
      principalId,
      resourceId,
      entryId: item.entryId,
      questions: [
        {
          focus: "checked-object-versus-effect-target" as const,
          question: `For principal ${principalId} at entry ${item.entryId}, which object is checked by each claimed control, and is that same object the ${resourceId} affected by ${operation}? If different, identify the source-backed link or gap without treating ownership of one object as permission on another.`,
        },
        {
          focus: "control-applicability-and-bypass" as const,
          question: `For entry ${item.entryId} and ${operation} on ${resourceId}, does each claimed upstream route, middleware, or helper gate apply to the assessed path before the effect? Describe applicable conditions and any visible bypass branch with source support.`,
        },
        {
          focus: "role-and-relation-exceptions" as const,
          question: `For ${principalId} with relation ${relation} to ${resourceId} under ${conditionDescription}, which owner, grantee, staff, or administrator exception actually applies to ${operation}? Distinguish an applicable exception from an exception present elsewhere or one that does not cover this target.`,
        },
        {
          focus: "decisive-external-facts" as const,
          question: `For this bounded ${operation} decision on ${resourceId}, which missing source-external fact, if any, would change the outcome? State the conditional outcomes and minimum observation; do not turn unrelated unknown facts into an unknown decision.`,
        },
      ],
    }
  }).sort((left, right) => left.obligationId.localeCompare(right.obligationId))

  return { strategy, entries }
}

export function renderAuthorizationReasoningPlan(plan: AuthorizationReasoningPlan): string {
  if (plan.strategy === "standard" || plan.entries.length === 0) return ""
  return [
    "For each listed runnable obligation, answer these source-grounded comparison questions concisely in the existing facts and explanation. They are questions, not assertions about source behavior.",
    ...plan.entries.flatMap(entry => [
      `- ${entry.obligationId} (principal ${entry.principalId}; target ${entry.resourceId}; entry ${entry.entryId}):`,
      ...entry.questions.map(question => `  - ${question.question}`),
    ]),
  ].join("\n")
}
