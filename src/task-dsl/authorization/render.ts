import type { AuthorizationTaskV0 } from "./schema.ts"
import type { CompiledAuthorizationTask } from "./semantics.ts"

export type AuthorizationRenderArm = "B" | "D"

export const AUTHORIZATION_CONCLUSIONS = [
  "source_supported_failure",
  "source_refuted",
  "unknown",
] as const

export interface AuthorizationRenderFacts {
  schemaVersion: AuthorizationTaskV0["schemaVersion"]
  taskId: string
  request: string
  repository: string
  sourceRef: string
  sourceMode: AuthorizationTaskV0["sourceMode"]
  policySources: AuthorizationTaskV0["policySources"]
  principals: AuthorizationTaskV0["principals"]
  resources: AuthorizationTaskV0["resources"]
  entries: AuthorizationTaskV0["entries"]
  obligations: AuthorizationTaskV0["obligations"]
  scopeAssurance: string
  requiredAnalysis: string[]
  constraints: string[]
  allowedConclusions: typeof AUTHORIZATION_CONCLUSIONS
  discoveryStatus: "not-tested"
}

export interface RenderedAuthorizationTask {
  arm: AuthorizationRenderArm
  facts: AuthorizationRenderFacts
  prompt: string
  expandedObligationIds: string[]
}

function collectFacts(task: AuthorizationTaskV0): AuthorizationRenderFacts {
  return {
    schemaVersion: task.schemaVersion,
    taskId: task.taskId,
    request: task.request,
    repository: task.repository,
    sourceRef: task.sourceRef,
    sourceMode: task.sourceMode,
    policySources: task.policySources,
    principals: task.principals,
    resources: task.resources,
    entries: task.entries,
    obligations: task.obligations,
    scopeAssurance: task.scopeAssurance,
    requiredAnalysis: task.requiredAnalysis,
    constraints: task.constraints,
    allowedConclusions: AUTHORIZATION_CONCLUSIONS,
    discoveryStatus: "not-tested",
  }
}

function bulletLines(values: string[]): string {
  return values.map(value => `- ${value}`).join("\n")
}

function renderPolicies(task: AuthorizationTaskV0): string {
  return task.policySources.map(policy => [
    `- ${policy.id} (${policy.kind}, ${policy.acceptance.status})`,
    `  Rule: ${policy.text}`,
    `  Source: ${policy.location} @ ${policy.revision}`,
    `  Accepted/resolved by: ${policy.acceptance.actorRole}`,
    `  Reason: ${policy.acceptance.reason}`,
  ].join("\n")).join("\n")
}

function renderPrincipals(task: AuthorizationTaskV0): string {
  return task.principals.map(principal => [
    `- ${principal.id}: ${principal.role}`,
    `  Description: ${principal.description}`,
    `  Starting capabilities: ${principal.startingCapabilities.length > 0 ? principal.startingCapabilities.join(", ") : "(none declared)"}`,
  ].join("\n")).join("\n")
}

function renderResources(task: AuthorizationTaskV0): string {
  return task.resources.map(resource =>
    `- ${resource.id} (${resource.type}): ${resource.description}`,
  ).join("\n")
}

function renderEntries(task: AuthorizationTaskV0): string {
  return task.entries.map(entry => {
    const locations = entry.locations
      .map(location => `${location.path}:${location.startLine}-${location.endLine}`)
      .join(", ")
    return `- ${entry.id}: ${entry.name}\n  Allowed source locations: ${locations}`
  }).join("\n")
}

function renderObligations(task: AuthorizationTaskV0): string {
  return task.obligations.map(obligation => {
    const conditions = obligation.conditions.length === 0
      ? "(none declared)"
      : obligation.conditions.map(condition => `${condition.name}: ${condition.basis}`).join("; ")
    return [
      `- ${obligation.id}`,
      `  Principal/resource: ${obligation.principalId} -> ${obligation.resourceId}`,
      `  Relation/operation/expectation: ${obligation.relation} / ${obligation.operation} / ${obligation.expectation}`,
      `  Conditions: ${conditions}`,
      `  Policy: ${obligation.policySourceId}`,
      `  Declared entries: ${obligation.entryIds.join(", ")}`,
    ].join("\n")
  }).join("\n")
}

function renderSharedResultRequirements(compiled: CompiledAuthorizationTask): string {
  const runnableIds = compiled.runnableObligations.map(obligation => obligation.id)
  const renderedIds = runnableIds.length > 0 ? bulletLines(runnableIds) : "- (none)"
  return `Return exactly one result for every runnable expanded obligation, with one of: ${AUTHORIZATION_CONCLUSIONS.join(", ")}.
Exact runnable obligation IDs (closed list):
${renderedIds}
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite an allowed input path, line range, and retained quotation. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.`
}

function renderBaseline(compiled: CompiledAuthorizationTask): string {
  const task = compiled.task
  return `# Organized authorization assessment instruction (B)

Task ID: ${task.taskId}
Request: ${task.request}
Repository: ${task.repository}
Source ref: ${task.sourceRef}
Source mode: ${task.sourceMode}

## Governing policy sources
${renderPolicies(task)}

## Principals
${renderPrincipals(task)}

## Resources
${renderResources(task)}

## Declared entries and allowed locations
${renderEntries(task)}

## Authorization questions
${renderObligations(task)}

## Scope assurance
${task.scopeAssurance}

## Required analysis
${bulletLines(task.requiredAnalysis)}

## Constraints
${bulletLines(task.constraints)}

## Result contract
${renderSharedResultRequirements(compiled)}

## Fixed source context
<SOURCE_CONTEXT_INSERTED_BY_HOST>`
}

function renderDomain(compiled: CompiledAuthorizationTask, facts: AuthorizationRenderFacts): string {
  const expanded = [
    ...compiled.runnableObligations.map(obligation => ({
      id: obligation.id,
      status: "runnable",
      authorObligationId: obligation.authorObligationId,
      entryId: obligation.entryId,
    })),
    ...compiled.blockedObligations.map(obligation => ({
      id: obligation.id,
      status: "blocked",
      blockedBy: obligation.blockedBy,
      authorObligationId: obligation.authorObligationId,
      entryId: obligation.entryId,
    })),
  ]

  return `# Authorization domain plan (D)

Use the canonical authorization facts and deterministic obligation expansion below. The declaration organizes the work; you still must understand the source control path and justify the conclusion.

## Canonical facts
${JSON.stringify(facts, null, 2)}

## Compiled obligation plan
${JSON.stringify({
    status: compiled.status,
    expanded,
    dependencies: compiled.dependencies,
    diagnostics: compiled.diagnostics,
  }, null, 2)}

## Result contract
${renderSharedResultRequirements(compiled)}

## Fixed source context
<SOURCE_CONTEXT_INSERTED_BY_HOST>`
}

export function renderAuthorizationTask(
  compiled: CompiledAuthorizationTask,
  arm: AuthorizationRenderArm,
): RenderedAuthorizationTask {
  const facts = collectFacts(compiled.task)
  const expandedObligationIds = [
    ...compiled.runnableObligations.map(obligation => obligation.id),
    ...compiled.blockedObligations.map(obligation => obligation.id),
  ]
  return {
    arm,
    facts,
    prompt: arm === "B" ? renderBaseline(compiled) : renderDomain(compiled, facts),
    expandedObligationIds,
  }
}
