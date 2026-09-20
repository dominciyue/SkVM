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
  sections: AuthorizationPromptSections
}

export interface AuthorizationPromptSections {
  instructions: string
  declaration: string
  outputContract: string
  sourceMarker: "<SOURCE_CONTEXT_INSERTED_BY_HOST>"
}

export interface AuthorizationPromptCharacterBreakdown {
  instructions: number
  declaration: number
  source: number
  outputContract: number
  total: number
  tokenMeasurement: "provider-reported-only"
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

function renderSharedResultRequirements(compiled: CompiledAuthorizationTask): string {
  const runnableIds = compiled.runnableObligations.map(obligation => obligation.id)
  const renderedIds = runnableIds.length > 0 ? runnableIds.map(value => `- ${value}`).join("\n") : "- (none)"
  return `Return exactly one result for every runnable expanded obligation, with one of: ${AUTHORIZATION_CONCLUSIONS.join(", ")}.
Exact runnable obligation IDs (closed list):
${renderedIds}
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite one sourceId and a closed startLine/endLine range from the numbered exact source catalog. Do not copy paths or quotations; the host binds both from the selected source range. A range cannot cross sources. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.`
}

function renderBaselineInstructions(): string {
  return `# Organized authorization assessment instruction (B)

Analyze each runnable obligation in the canonical declaration. Follow the declared required analysis, constraints, policy authority, and scope assurance. Explain the source-visible decision without assuming repository discovery or deployment facts.`
}

function renderDomainInstructions(compiled: CompiledAuthorizationTask): string {
  const runnable = compiled.runnableObligations.map(obligation => obligation.id)
  const blocked = compiled.blockedObligations.map(obligation => ({ id: obligation.id, blockedBy: obligation.blockedBy }))
  return `# Authorization domain method (D)

For every runnable obligation, trace this causal chain before deciding: declared entry -> principal and resource bindings -> stated relation and conditions -> strongest source-visible authorization control -> protected effect. Compare the observed chain with the accepted policy expectation. Use unknown only when a named missing fact is decisive, and bound scope to the declared fixed context.

Method execution state:
${JSON.stringify({ status: compiled.status, runnableObligationIds: runnable, blocked }, null, 2)}`
}

function composeAuthorizationPrompt(sections: AuthorizationPromptSections): string {
  return `${sections.instructions}

## Canonical declaration
${sections.declaration}

## Result contract
${sections.outputContract}

## Fixed source context
${sections.sourceMarker}`
}

export function measureAuthorizationPromptCharacters(
  rendered: RenderedAuthorizationTask,
  sourceContext: string,
): AuthorizationPromptCharacterBreakdown {
  return {
    instructions: rendered.sections.instructions.length,
    declaration: rendered.sections.declaration.length,
    source: sourceContext.length,
    outputContract: rendered.sections.outputContract.length,
    total: rendered.prompt.replace(rendered.sections.sourceMarker, sourceContext).length,
    tokenMeasurement: "provider-reported-only",
  }
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
  const sections: AuthorizationPromptSections = {
    instructions: arm === "B" ? renderBaselineInstructions() : renderDomainInstructions(compiled),
    declaration: JSON.stringify(facts, null, 2),
    outputContract: renderSharedResultRequirements(compiled),
    sourceMarker: "<SOURCE_CONTEXT_INSERTED_BY_HOST>",
  }
  return {
    arm,
    facts,
    prompt: composeAuthorizationPrompt(sections),
    expandedObligationIds,
    sections,
  }
}
