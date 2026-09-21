import type { AuthorizationTaskV0 } from "./schema.ts"
import type { CompiledAuthorizationTask } from "./semantics.ts"
import type { AnalysisPlan } from "./relations.ts"

export type AuthorizationRenderArm = "N" | "B" | "D"

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
  analysisPlan?: AnalysisPlan
}

export interface AuthorizationPromptSections {
  instructions: string
  declaration: string
  analysisLedger?: string
  outputContract: string
  sourceMarker: "<SOURCE_CONTEXT_INSERTED_BY_HOST>"
}

export interface AuthorizationPromptCharacterBreakdown {
  instructions: number
  declaration: number
  analysisLedger?: number
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

function renderSharedResultRequirements(
  compiled: CompiledAuthorizationTask,
  analysisPlan?: AnalysisPlan,
): string {
  const runnableIds = compiled.runnableObligations.map(obligation => obligation.id)
  const renderedIds = runnableIds.length > 0 ? runnableIds.map(value => `- ${value}`).join("\n") : "- (none)"
  const coverageContract = analysisPlan
    ? `
Return exactly one coverage item for every analysis-ledger pair below. Use the exact requirementId and expanded obligationId. Status must be addressed, unknown, or not-applicable. Every item needs a substantive explanation. addressed and not-applicable require one or more factPointers to fact objects in this same answer, using /results/<index>/facts/<group>/<index>. unknown must explain what prevents an answer. not-applicable is allowed only for when-present questions and must explain from source-backed facts why the branch is absent.
Exact analysis coverage pairs (closed list):
${analysisPlan.entries.map(entry => `- ${entry.requirementId} @ ${entry.obligationId} (${entry.applicability})`).join("\n") || "- (none)"}`
    : ""
  return `Return exactly one result for every runnable expanded obligation, with one of: ${AUTHORIZATION_CONCLUSIONS.join(", ")}.
Interpret conclusion labels relative to the declared policy expectation, not as direct synonyms for allow or deny:
- source_supported_failure: the fixed source supports that the declared policy expectation fails under the stated conditions.
- source_refuted: the fixed source supports that the declared policy expectation is enforced under the stated conditions, refuting a policy failure.
- unknown: the fixed source and declared context are insufficient to decide whether the expectation fails or is enforced.
Exact runnable obligation IDs (closed list):
${renderedIds}
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite one sourceId and a closed startLine/endLine range from the numbered exact source catalog. Do not copy paths or quotations; the host binds both from the selected source range. A range cannot cross sources. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.${coverageContract}`
}

function renderBaselineInstructions(hasAnalysisPlan: boolean): string {
  return `# Organized authorization assessment instruction (B)

Analyze each runnable obligation in the canonical declaration. Follow the declared required analysis, constraints, policy authority, and scope assurance. Explain the source-visible decision without assuming repository discovery or deployment facts.${hasAnalysisPlan ? " Address every supplied analysis question and report its coverage without inventing an answer." : ""}`
}

function renderNaturalInstructions(hasAnalysisPlan: boolean): string {
  return `# Natural authorization task (N)

Assess the authorization question described below using only the supplied fixed source. Explain what the visible source establishes, what it refutes, and what remains unknown. Keep the conclusion bounded to the declared entries and source context.${hasAnalysisPlan ? " Answer every public analysis question and report its coverage without inventing missing facts." : ""}`
}

function renderNaturalDeclaration(facts: AuthorizationRenderFacts): string {
  const lines = [
    `This is task ${facts.taskId}, expressed with ${facts.schemaVersion}. ${facts.request}`,
    `Assess repository ${facts.repository} at source ref ${facts.sourceRef} in ${facts.sourceMode} mode. Source discovery status is ${facts.discoveryStatus}.`,
    "",
    "The accepted policy material is:",
    ...facts.policySources.map(policy => [
      `- ${policy.id} is a ${policy.kind} at ${policy.location}, revision ${policy.revision}.`,
      `  Policy text: ${policy.text}`,
      `  Acceptance is ${policy.acceptance.status}; accepting actor role: ${policy.acceptance.actorRole}; reason: ${policy.acceptance.reason}`,
    ].join("\n")),
    "",
    "The principals are:",
    ...facts.principals.map(principal => [
      `- ${principal.id} has role ${principal.role}. ${principal.description}`,
      `  Starting capabilities: ${principal.startingCapabilities.length > 0 ? principal.startingCapabilities.join(", ") : "none declared"}.`,
    ].join("\n")),
    "",
    "The resources are:",
    ...facts.resources.map(resource => `- ${resource.id} is a ${resource.type}. ${resource.description}`),
    "",
    "The declared source entries are:",
    ...facts.entries.map(entry => [
      `- ${entry.id} names ${entry.name}.`,
      ...entry.locations.map(location => `  Source location: ${location.path}, startLine ${location.startLine}, endLine ${location.endLine}.`),
    ].join("\n")),
    "",
    "The authorization obligations are:",
    ...facts.obligations.map(obligation => [
      `- ${obligation.id}: principal ${obligation.principalId}, resource ${obligation.resourceId}, relation ${obligation.relation}, operation ${obligation.operation}, expected policy disposition ${obligation.expectation}.`,
      `  Policy source: ${obligation.policySourceId}. Declared entries: ${obligation.entryIds.join(", ")}.`,
      ...(obligation.conditions.length > 0
        ? obligation.conditions.map(condition => `  Condition ${condition.name}: ${condition.basis}`)
        : ["  Conditions: none declared."]),
    ].join("\n")),
    "",
    `Scope assurance: ${facts.scopeAssurance}`,
    "Required analysis:",
    ...facts.requiredAnalysis.map(value => `- ${value}`),
    "Constraints:",
    ...facts.constraints.map(value => `- ${value}`),
    `Allowed conclusions: ${facts.allowedConclusions.join(", ")}.`,
  ]
  return lines.join("\n")
}

function renderDomainInstructions(compiled: CompiledAuthorizationTask, hasAnalysisPlan: boolean): string {
  const runnable = compiled.runnableObligations.map(obligation => obligation.id)
  const blocked = compiled.blockedObligations.map(obligation => ({ id: obligation.id, blockedBy: obligation.blockedBy }))
  return `# Authorization domain method (D)

For every runnable obligation, trace this causal chain before deciding: declared entry -> principal and resource bindings -> stated relation and conditions -> strongest source-visible authorization control -> protected effect. Compare the observed chain with the accepted policy expectation. Use unknown only when a named missing fact is decisive, and bound scope to the declared fixed context.${hasAnalysisPlan ? " Work through the supplied analysis ledger in prerequisite order for each expanded obligation, then record coverage against facts from that same obligation." : ""}

Method execution state:
${JSON.stringify({ status: compiled.status, runnableObligationIds: runnable, blocked }, null, 2)}`
}

function composeAuthorizationPrompt(sections: AuthorizationPromptSections): string {
  return `${sections.instructions}

## Canonical declaration
${sections.declaration}

${sections.analysisLedger ? `## Analysis requirement ledger\n${sections.analysisLedger}\n\n` : ""}## Result contract
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
    ...(rendered.sections.analysisLedger
      ? { analysisLedger: rendered.sections.analysisLedger.length }
      : {}),
    source: sourceContext.length,
    outputContract: rendered.sections.outputContract.length,
    total: rendered.prompt.replace(rendered.sections.sourceMarker, sourceContext).length,
    tokenMeasurement: "provider-reported-only",
  }
}

export function renderAuthorizationTask(
  compiled: CompiledAuthorizationTask,
  arm: AuthorizationRenderArm,
  analysisPlan?: AnalysisPlan,
): RenderedAuthorizationTask {
  const facts = collectFacts(compiled.task)
  const expandedObligationIds = [
    ...compiled.runnableObligations.map(obligation => obligation.id),
    ...compiled.blockedObligations.map(obligation => obligation.id),
  ]
  const instructions = (() => {
    switch (arm) {
      case "N": return renderNaturalInstructions(analysisPlan !== undefined)
      case "B": return renderBaselineInstructions(analysisPlan !== undefined)
      case "D": return renderDomainInstructions(compiled, analysisPlan !== undefined)
    }
  })()
  const sections: AuthorizationPromptSections = {
    instructions,
    declaration: arm === "N" ? renderNaturalDeclaration(facts) : JSON.stringify(facts, null, 2),
    ...(analysisPlan
      ? {
          analysisLedger: JSON.stringify({
            status: analysisPlan.status,
            requirements: analysisPlan.requirements,
            entries: analysisPlan.entries,
          }, null, 2),
        }
      : {}),
    outputContract: renderSharedResultRequirements(compiled, analysisPlan),
    sourceMarker: "<SOURCE_CONTEXT_INSERTED_BY_HOST>",
  }
  return {
    arm,
    facts,
    prompt: composeAuthorizationPrompt(sections),
    expandedObligationIds,
    sections,
    ...(analysisPlan ? { analysisPlan } : {}),
  }
}
