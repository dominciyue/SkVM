import type { AuthorizationTaskV0 } from "./schema.ts"
import type { CompiledAuthorizationTask } from "./semantics.ts"
import type { AnalysisPlan } from "./relations.ts"
import type { ConditionAnalysisPlan } from "./conditions.ts"
import type { AuthorizationWireVersion } from "./policy-result.ts"

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
  conditionPlan?: ConditionAnalysisPlan
}

export interface AuthorizationRenderOptions {
  /** Research-only independent instructions; never exposed by the ordinary CLI. */
  researchInstructions?: MarkdownStudyInput
  wireVersion?: AuthorizationWireVersion
  declarationStyle?: "arm-default" | "natural"
  publicAnalysisQuestions?: readonly string[]
}

export interface MarkdownStudyInput {
  instructions: string
  instructionOrigin: "independent-author"
  instructionPath: string
}

export function validMarkdownStudyInput(value: unknown): value is MarkdownStudyInput {
  if (!value || typeof value !== "object") return false
  const input = value as Partial<MarkdownStudyInput>
  return input.instructionOrigin === "independent-author"
    && typeof input.instructions === "string" && input.instructions.trim().length > 0
    && typeof input.instructionPath === "string" && input.instructionPath.trim().length > 0
}

export interface AuthorizationPromptSections {
  declarationLabel?: "Independent Markdown instructions"
  instructions: string
  declaration: string
  publicAnalysis?: string
  analysisLedger?: string
  conditionAnalysis?: string
  outputContract: string
  sourceMarker: "<SOURCE_CONTEXT_INSERTED_BY_HOST>"
}

export interface AuthorizationPromptCharacterBreakdown {
  instructions: number
  declaration: number
  publicAnalysis?: number
  analysisLedger?: number
  conditionAnalysis?: number
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
  conditionPlan?: ConditionAnalysisPlan,
  publicAnalysisQuestions: readonly string[] = [],
  wireVersion: AuthorizationWireVersion = "legacy",
): string {
  const compact = wireVersion === "v4" || wireVersion === "v5"
  const policy = wireVersion === "v5"
  const runnableIds = compiled.runnableObligations.map(obligation => obligation.id)
  const renderedIds = runnableIds.length > 0 ? runnableIds.map(value => `- ${value}`).join("\n") : "- (none)"
  let coverageContract = analysisPlan
    ? `
Return exactly one coverage item for every analysis-ledger pair below. Use the exact requirementId and expanded obligationId. Status must be addressed, unknown, or not-applicable. Every item needs a substantive explanation. addressed and not-applicable require one or more factPointers to fact objects in this same answer, using /results/<index>/facts/<group>/<index>. unknown must explain what prevents an answer. not-applicable is allowed only for when-present questions and must explain from source-backed facts why the branch is absent.
Exact analysis coverage pairs (closed list):
${analysisPlan.entries.map(entry => `- ${entry.requirementId} @ ${entry.obligationId} (${entry.applicability})`).join("\n") || "- (none)"}`
    : ""
  let conditionContract = conditionPlan
    ? `
Return one conditionAnalysis entry for every expanded obligation in the condition plan. Use authorization-condition-analysis-result/v1 and the exact condition IDs. Each branch needs a unique id, explicit assumptions, one reachable/blocked/unknown effect, a causal explanation, same-obligation factPointers for reachable or blocked effects, and decisive missingFacts for an unknown effect or unknown-valued assumption. Analysis assumptions are hypotheses for comparing branches; never present them as source-observed or deployment-observed facts. Every requested condition must appear in at least one branch assumption or exactly once in unexaminedConditionIds. Use completeness bounded only when none are unexamined; otherwise use incomplete and explain limitations. bounded means all requested conditions were considered within the authored branch limit, not that every truth assignment or program path was enumerated.
Exact condition analysis obligations and bounds (closed list):
${conditionPlan.entries.map(entry => [
      `- ${entry.obligationId}; maxBranches=${entry.maxBranches}`,
      ...entry.conditions.map(condition => `  - ${condition.id}: ${condition.name} — ${condition.basis}`),
    ].join("\n")).join("\n") || "- (none)"}`
    : ""
  const publicQuestionContract = !analysisPlan && publicAnalysisQuestions.length > 0
    ? "\nAddress every public analysis question in the explanation and source-backed facts. No separate coverage ledger is required for this plain-method answer."
    : ""
  if (compact) {
    coverageContract = coverageContract.replace("Return exactly one coverage item", "In each result item, return exactly one coverage item").replace("Use the exact requirementId and expanded obligationId.", "Use the exact requirementId; the enclosing result supplies obligationId.").replaceAll("factPointers", "factIds").replace("using /results/<index>/facts/<group>/<index>", "using IDs from this item's facts array")
    conditionContract = conditionContract.replace("Return one conditionAnalysis entry", "Return one item-local condition object").replace("Use authorization-condition-analysis-result/v1 and the exact condition IDs.", "Do not output schemaVersion or analyses wrappers. Use the exact condition IDs.").replaceAll("factPointers", "factIds")
  }
  const labels = policy ? `Return exactly one result for every runnable expanded obligation, with policyStatus: satisfied, violated, or undetermined. Do not output conclusion.
Interpret policyStatus relative to the declared policy expectation, not as direct synonyms for allow or deny:
- satisfied: the fixed source enforces the declared normative expectation under the stated conditions; that expectation may require either allow or deny.
- violated: the fixed source violates the declared normative expectation under the stated conditions.
- undetermined: the fixed source and declared context are insufficient to decide whether the expectation is enforced or violated. Name decisive missing facts and minimum suggested observations.
For conditional expectations, analyze the declared conditions; the expectation field alone does not establish a policyStatus. If authored task text requests legacy conclusion labels, this result contract supersedes that output-format request; use policyStatus only.` : `Return exactly one result for every runnable expanded obligation, with one of: ${AUTHORIZATION_CONCLUSIONS.join(", ")}.
Interpret conclusion labels relative to the declared policy expectation, not as direct synonyms for allow or deny:
- source_supported_failure: the fixed source supports that the declared policy expectation fails under the stated conditions.
- source_refuted: the fixed source supports that the declared policy expectation is enforced under the stated conditions, refuting a policy failure.
- unknown: the fixed source and declared context are insufficient to decide whether the expectation fails or is enforced.`
  return `${compact ? `Use compact wire/${wireVersion}: top-level results only. Each item has obligationId, ${policy ? "policyStatus" : "conclusion"}, explanation, facts as an array of {id, kind, statement, citations}, decisiveMissingFacts and suggestedObservations. Fact IDs must be unique within each obligation. kind is entry/binding/control/effect/condition. The host fills all version/identity/scope metadata and groups facts; never output those fields. Include item-local coverage only when an analysis ledger is supplied, and item-local condition only when a condition request is supplied. Branches do not repeat obligationId.\n` : ""}${labels}
Exact runnable obligation IDs (closed list):
${renderedIds}
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite one sourceId and a closed startLine/endLine range from the numbered exact source catalog. Do not copy paths or quotations; the host binds both from the selected source range. A range cannot cross sources. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.${publicQuestionContract}${coverageContract}${conditionContract}`
}

function renderBaselineInstructions(hasAnalysisPlan: boolean): string {
  return `# Organized authorization assessment instruction (B)

Analyze each runnable obligation in the canonical declaration. Follow the declared required analysis, constraints, policy authority, and scope assurance. Explain the source-visible decision without assuming repository discovery or deployment facts.${hasAnalysisPlan ? " Address every supplied analysis question and report its coverage without inventing an answer." : ""}`
}

function renderNaturalInstructions(hasAnalysisPlan: boolean): string {
  return `# Natural authorization task (N)

Assess the authorization question described below using only the supplied fixed source. Explain what the visible source establishes, what it refutes, and what remains unknown. Keep the conclusion bounded to the declared entries and source context.${hasAnalysisPlan ? " Answer every public analysis question and report its coverage without inventing missing facts." : ""}`
}

function renderNaturalDeclaration(facts: AuthorizationRenderFacts, policy = false): string {
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
    policy ? "Allowed policyStatus values: satisfied, violated, undetermined." : `Allowed conclusions: ${facts.allowedConclusions.join(", ")}.`,
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

## ${sections.declarationLabel ?? "Canonical declaration"}
${sections.declaration}

${sections.publicAnalysis ? `## Public analysis questions\n${sections.publicAnalysis}\n\n` : ""}${sections.analysisLedger ? `## Analysis requirement ledger\n${sections.analysisLedger}\n\n` : ""}${sections.conditionAnalysis ? `## Condition analysis request\n${sections.conditionAnalysis}\n\n` : ""}## Result contract
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
    ...(rendered.sections.publicAnalysis
      ? { publicAnalysis: rendered.sections.publicAnalysis.length }
      : {}),
    ...(rendered.sections.analysisLedger
      ? { analysisLedger: rendered.sections.analysisLedger.length }
      : {}),
    ...(rendered.sections.conditionAnalysis
      ? { conditionAnalysis: rendered.sections.conditionAnalysis.length }
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
  conditionPlan?: ConditionAnalysisPlan,
  options: AuthorizationRenderOptions = {},
): RenderedAuthorizationTask {
  if (options.researchInstructions !== undefined && (!validMarkdownStudyInput(options.researchInstructions)
    || analysisPlan || conditionPlan || arm !== "B" || (options.wireVersion !== "v4" && options.wireVersion !== "v5"))) {
    throw new Error("Independent Markdown requires a nonempty independent-author input and plain/v4 or plain/v5 on render arm B.")
  }
  const facts = collectFacts(compiled.task)
  const expandedObligationIds = [
    ...compiled.runnableObligations.map(obligation => obligation.id),
    ...compiled.blockedObligations.map(obligation => obligation.id),
  ]
  const publicAnalysisQuestions = options.publicAnalysisQuestions ?? []
  const hasPublicAnalysis = analysisPlan !== undefined || publicAnalysisQuestions.length > 0
  const instructions = (() => {
    switch (arm) {
      case "N": return renderNaturalInstructions(hasPublicAnalysis)
      case "B": return renderBaselineInstructions(hasPublicAnalysis)
      case "D": return renderDomainInstructions(compiled, hasPublicAnalysis)
    }
  })()
  const naturalDeclaration = options.declarationStyle === "natural" || (
    options.declarationStyle !== "arm-default" && arm === "N"
  )
  const sections: AuthorizationPromptSections = {
    instructions,
    declaration: naturalDeclaration ? renderNaturalDeclaration(facts, options.wireVersion === "v5") : JSON.stringify(options.wireVersion === "v5" ? { ...facts, allowedConclusions: undefined, allowedPolicyStatuses: ["satisfied", "violated", "undetermined"] } : facts, null, 2),
    ...(publicAnalysisQuestions.length > 0
      ? { publicAnalysis: publicAnalysisQuestions.map(question => `- ${question}`).join("\n") }
      : {}),
    ...(analysisPlan
      ? {
          analysisLedger: JSON.stringify({
            status: analysisPlan.status,
            requirements: analysisPlan.requirements,
            entries: analysisPlan.entries,
          }, null, 2),
        }
      : {}),
    ...(conditionPlan
      ? {
          conditionAnalysis: JSON.stringify({
            status: conditionPlan.status,
            entries: conditionPlan.entries,
          }, null, 2),
        }
      : {}),
    outputContract: renderSharedResultRequirements(compiled, analysisPlan, conditionPlan, publicAnalysisQuestions, options.wireVersion),
    sourceMarker: "<SOURCE_CONTEXT_INSERTED_BY_HOST>",
  }
  if (options.researchInstructions) {
    sections.instructions = "# Source-visible authorization assessment\n\nAssess the authored task below using only the supplied fixed source and common result contract."
    sections.declarationLabel = "Independent Markdown instructions"
    sections.declaration = options.researchInstructions.instructions
    delete sections.publicAnalysis
  }
  return {
    arm,
    facts,
    prompt: composeAuthorizationPrompt(sections),
    expandedObligationIds,
    sections,
    ...(analysisPlan ? { analysisPlan } : {}),
    ...(conditionPlan ? { conditionPlan } : {}),
  }
}
