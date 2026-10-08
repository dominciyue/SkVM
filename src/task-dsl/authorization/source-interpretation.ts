import { z } from "zod"
import { InquiryText, type InquiryDiagnostic } from "./inquiry.ts"
import type { SemanticBlock } from "./semantic-flow.ts"
import { predicateDiagnostics, partialEvaluate, FINITE_PREDICATE_GUIDE } from "./control-evaluation.ts"
import { buildPropertyDemand, type PropertyDemand } from "./property-demand.ts"
import type { DependencyQuestion } from "./property-dependencies.ts"
import type { SourceSkeleton, SourceAnchor, SourceFlow } from "../../benchmarks/authorization-dsl/evidence-preparation/source-skeleton.ts"
import type { StructureIndex, StructureMethodChoice } from "../../benchmarks/authorization-dsl/evidence-preparation/structure-index.ts"
import { structureClassDefinition } from "../../benchmarks/authorization-dsl/evidence-preparation/structure-index.ts"
import { sourceCallableDefinitionName, sourceCallableToken, sourceCallableValueName, sourceCallableValueResult, sourceClassToken, sourceClassValueName, sourceClassValueResult, sourceDirectMethodRead, sourceFieldMethodToken, sourceInstanceToken, sourceMethodCaptureName, sourceMethodCaptureResult, sourceMethodChoiceSentinel, sourceMethodChoiceToken, sourceMethodLookupSelector, sourceMethodLookupSentinel, sourceMethodLookupToken, sourceSuperMethodResult, sourceSyntaxAnchorId } from "../../benchmarks/authorization-dsl/evidence-preparation/source-identities.ts"
import { sourceArgumentBindings } from "../../benchmarks/authorization-dsl/evidence-preparation/source-arguments.ts"
import { PropertyBindingSchema } from "./property-query.ts"
import type { PropertyCallSummary } from "./procedure-summary.ts"

export const SourceAnnotationSchema = z.object({
  anchorId: InquiryText, role: z.enum(["principal", "resource", "permission", "condition", "effect", "context"]), explanation: InquiryText,
  principalAnchorId: InquiryText.optional(), resourceAnchorId: InquiryText.optional(), aliasAnchorId: InquiryText.optional(),
  condition: z.record(z.unknown()).optional(), guardBranch: z.enum(["true", "false"]).optional(),
  failureKind: z.enum(["authorization", "operation"]).optional(), returnOutcome: z.enum(["allow", "deny", "unknown"]).optional(),
  authorizedByAnchorIds: z.array(InquiryText).max(16).optional(),
}).strict()
export const SourceInterpretationSchema = z.object({ schemaVersion: z.literal("source-interpretation/v1"), revision: InquiryText,
  annotations: z.array(SourceAnnotationSchema).max(256), unresolved: z.array(z.object({ anchorId: InquiryText, reason: InquiryText }).strict()).max(128).default([]),
  fallthroughOutcome: z.enum(["allow", "deny", "unknown"]).optional(),
  propertyBindings: z.array(PropertyBindingSchema).max(8).optional(),
}).strict()
export type SourceInterpretation = z.infer<typeof SourceInterpretationSchema>
/** Shared structural restriction; it chooses no source meaning. */
export function sourceAnnotationRoles(anchor: SourceAnchor) {
  return SourceAnnotationSchema.shape.role.options.filter(role => !(["principal", "resource", "permission"].includes(role) && !["parameter", "assignment", "call"].includes(anchor.kind) || role === "effect" && !["call", "assignment"].includes(anchor.kind)))
}
export const PROPERTY_ABSTRACTION_GUIDE = 'operation-evidence-v6: current task properties have kinds authorization-before-effect, authorized-object-matches-effect, effect-reachability, operation-completion. In interpretation.propertyBindings submit [{propertyId,effectAnchorId,guardAnchorId?}]. If no task properties were declared, include proposed:{kind,requirement:<exact span of THIS original question>} in each binding. These are task queries and current source-role bindings, never verdicts. An unbound query retains broad unknown dependencies. Context on a call never proves absence of object/control/exception influence. A host mechanical-source-shape summary may stop independent expansion; its source, actual arguments and applicability are rechecked. Outside-property residuals remain explicit and do not certify whole-task completion. Preserve original source and all original questions. Use current task.sourceEdit.template with changed typed slots. Set field:propertyBindings at the edit root, without anchorId, to submit the bindings above. Empty edits do not complete a source. Native tools take the edit inside controlDelta; the structured operation step takes it at the action root. legacySourceUpdateTemplate remains an explicitly selected compatible alternative; do not combine the two containers. Omit values unless the user explicitly supplies a premise; values never contain source annotations. At answer phase fill the current answerTemplate and use missing for named gaps; behavior mode omits policyAssessment. Templates are schema scaffolds, not source interpretations or conclusions.'
type Annotation = z.infer<typeof SourceAnnotationSchema>
type Step = SemanticBlock["blocks"][number]["steps"][number]

export const SOURCE_INTERPRETATION_GUIDE = [
  'operation-evidence-v2: interpret the CURRENT task.sourceSkeleton using {schemaVersion:"authorization-source-update/v1",kind:"interpret",focusId,interpretation:{schemaVersion:"source-interpretation/v1",revision:<sourceSkeleton.revision>,annotations:[{anchorId,role,explanation,condition?,principalAnchorId?,resourceAnchorId?,aliasAnchorId?,guardBranch?,authorizedByAnchorIds?,failureKind?,returnOutcome?}],unresolved:[{anchorId,reason}],fallthroughOutcome?}}. Do not write blocks, step names, call locations or parameter lists. The host owns source syntax and lowers to the same semantic-flow checker. Explanation alone supplies no executable predicate or permission.',
  'Roles: principal/resource/permission bind the explicit source object; context on parameters is configuration and on calls marks source-irrelevant/contextual behavior; condition on a parameter/assignment declares a finite value, on a branch supplies its predicate, and on a call names a decisive helper; effect names an actual relevant operation. Each call in the generated executable flow must be interpreted or retained unresolved, not silently omitted. Conditions refer to source variable/field names or the offered call.resultBinding using the finite predicate algebra. Condition anchors describe the TRUE test of the actual if; the host keeps its false alternative and early returns. Explicit guardBranch:"true"|"false" plus principal/resource identifies the branch interpreted as an authorization guard; otherwise no authorizing guard is inferred. authorizedByAnchorIds is an explicit claim checked for the same object and source order. Distinct input/output resource anchors stay distinct.',
  'Start with anchors marked interpretationRequired:true: executable branches need condition or unresolved; entry returns use role:"context" with returnOutcome:allow|deny|unknown; raises need failureKind:authorization|operation or an unresolved entry; flow calls need their actual role. Add parameter/field roles needed by those explicit object references. Calls retained only inside an opaque control gap are source facts, not executable flow: do not annotate every child merely to accept the supported outer flow. That whole gap remains unresolved and the unit stays incomplete; such child annotations cannot establish its effects. A literal True does not establish permission. Only the six advertised roles exist; return/unresolved are not roles. Do not add operation, principal, resource or complete fields: use the advertised anchor reference fields. aliasAnchorId asserts an actual same-type object relation; equal names alone do not prove it. Missing user premises stay unknown, never manufacture values from source. Unsupported syntax gaps remain bounded even with a fluent explanation.',
  'Local repair may submit only changed annotations/unresolved entries at the same focus and skeleton revision; earlier valid annotations remain in that transaction. Foreign anchors and stale revisions are rejected. Use existing select/defer/link/review and final contracts for their offered phase. Low-level unit proposals are an explicit fallback, counted separately; do not use them as the normal source-assisted interface.',
  'The source-update root may include values:[{key,value,text,questionId?}] for explicitly supplied USER premises. text must be an exact current user span for that original question; questionId defaults only to the current question and values are never shared implicitly. Use finite scalar/array/map values. Omit unspecified values, including false/null assumptions; source constants belong to source assignments rather than user values. The existing premise validator checks these values before accepting the source body.',
  FINITE_PREDICATE_GUIDE,
].join("\n")
export const PROPERTY_SOURCE_GUIDE = 'operation-evidence-v4/v5: task.propertyDemand.frontier lists the current missing source fields and affected ORIGINAL questions. Submit changed annotations only; the host retains valid earlier fields at this revision. You may interpret more actually shown necessary anchors in the same transaction. A fallthroughOutcome demand is a field on interpretation, not an annotation on sourceId. Excluded entries carry host source/control or bounded dependency proofs; a model role never proves irrelevance. v5 dependencySummary counts describe the retained source graph, while the current frontier/coverage and all original questions remain explicit. Unknown calls, setters, result/parameter relations and potentially changing objects still need explicit meaning or a named unresolved entry. Model context roles stay unreviewed. sourceRead, domainInterpreted and propertyCovered describe this proposed interpretation; none establishes wholeAnswerSufficient or live success. sourceSkeleton.anchors is a current field view; the complete original skeleton remains available through source_structure({symbolId:sourceSkeleton.sourceId,receiverClass?}), and original source through source_read. Do not reconstruct excluded code or resubmit every retained annotation. The original question denominator and policy remain unchanged.'

/** Compile syntax that the model saw; model roles/predicates are still unreviewed. */
export function lowerSourceInterpretation(skeleton: SourceSkeleton, raw: unknown, options: { index?: StructureIndex; itemId: string; handle: string; questionId: string; role: "entry" | "helper"; previous?: SourceInterpretation; propertyDirected?: boolean; affectedQuestionIds?: string[]; question?: DependencyQuestion; propertyAbstraction?: boolean; callSummaries?: PropertyCallSummary[] }): { diagnostics: InquiryDiagnostic[]; interpretation?: SourceInterpretation; unit?: SemanticBlock; demand?: PropertyDemand } {
  const diagnostics: InquiryDiagnostic[] = []
  const fault = (code: string, path: string, message: string) => diagnostics.push({ code: `source-interpretation-${code}`, path, message, questionId: options.questionId, severity: "error" })
  let parsed = SourceInterpretationSchema.safeParse(raw)
  if (!parsed.success) {
    for (const i of parsed.error.issues) fault("schema", i.path.join("."), i.message)
    const input = raw && typeof raw === "object" ? raw as Record<string, unknown> : undefined
    if (!input || input.revision !== skeleton.revision || !Array.isArray(input.annotations)) return { diagnostics, interpretation: options.previous }
    // Retain schema-valid local changes, but do not compile this failed transaction.
    parsed = SourceInterpretationSchema.safeParse({ ...input, annotations: input.annotations.filter(a => SourceAnnotationSchema.safeParse(a).success) })
    if (!parsed.success) return { diagnostics, interpretation: options.previous }
  }
  if (!skeleton.modelCovered) fault("source-unread", skeleton.sourceId, "The whole current original function must be shown before annotations are accepted.")
  if (parsed.data.revision !== skeleton.revision) fault("stale", "revision", "Use the current source skeleton revision; old roles cannot be rebound by position.")
  const previous = options.previous?.revision === skeleton.revision ? options.previous : undefined
  const annotations = new Map((previous?.annotations ?? []).map(a => [a.anchorId, a])), unresolved = new Map((previous?.unresolved ?? []).map(a => [a.anchorId, a]))
  if (new Set(parsed.data.annotations.map(a => a.anchorId)).size !== parsed.data.annotations.length) fault("duplicate", "annotations", "Each changed anchor appears at most once.")
  for (const a of parsed.data.annotations) { annotations.set(a.anchorId, a); unresolved.delete(a.anchorId) }
  for (const u of parsed.data.unresolved) { unresolved.set(u.anchorId, u); annotations.delete(u.anchorId) }
  const propertyBindings = new Map((previous?.propertyBindings ?? []).map(b => [b.propertyId, b]))
  for (const b of parsed.data.propertyBindings ?? []) propertyBindings.set(b.propertyId, b)
  if (parsed.data.propertyBindings && new Set(parsed.data.propertyBindings.map(b => b.propertyId)).size !== parsed.data.propertyBindings.length) fault("property-binding-identity", "propertyBindings", "Each changed property binding appears once.")
  const interpretation: SourceInterpretation = { ...previous, ...parsed.data, ...(propertyBindings.size ? { propertyBindings: [...propertyBindings.values()] } : {}), annotations: [...annotations.values()], unresolved: [...unresolved.values()], ...(parsed.data.fallthroughOutcome ?? previous?.fallthroughOutcome ? { fallthroughOutcome: parsed.data.fallthroughOutcome ?? previous?.fallthroughOutcome } : {}) }
  const anchors = new Map(skeleton.anchors.map(a => [a.id, a])), at = (id?: string) => id ? anchors.get(id) : undefined
  const methodCalls = new Map(skeleton.propertySemantics === "question-control/v1" && options.index ? skeleton.anchors.flatMap(a => {
    const actual = a.call && options.index!.relatedCalls(skeleton.sourceId, a.call.receiverClass).find(c => c.id === a.call!.sourceCallId)
    return actual?.methodChoices && actual.sha256 === skeleton.source.sha256 && actual.receiver === a.call!.receiver && JSON.stringify(actual.candidateIds) === JSON.stringify(a.call!.candidateIds) ? [[a.id, actual.methodChoices] as const] : []
  }) : [])
  const methodProofs = new Map<string, StructureMethodChoice>([...methodCalls.values()].map(p => [p.name, p]))
  const fieldCalls = new Map(skeleton.propertySemantics === "question-control/v1" && options.index ? skeleton.anchors.flatMap(a => {
    const actual = a.call && options.index!.relatedCalls(skeleton.sourceId, a.call.receiverClass).find(c => c.id === a.call!.sourceCallId)
    return actual?.methodField && actual.sha256 === skeleton.source.sha256 && actual.receiver === a.call!.receiver && JSON.stringify(actual.candidateIds) === JSON.stringify(a.call!.candidateIds) ? [[a.id, actual.methodField] as const] : []
  }) : [])
  const fieldStores = new Map(skeleton.propertySemantics === "question-control/v1" && options.index ? skeleton.anchors.flatMap(a => {
    const proof = a.methodStore, actual = proof && options.index!.methodStores(skeleton.sourceId, proof.receiverClass).find(s => s.anchorId === a.id)
    return actual && JSON.stringify(actual) === JSON.stringify(proof) && a.fieldWrite?.object === proof!.receiver && a.fieldWrite.field === proof!.field && a.valueExpression === `${proof!.receiver}.${proof!.method}` ? [[a.id, actual] as const] : []
  }) : [])
  const earlyCaptures = new Map(skeleton.propertySemantics === "question-control/v1" && options.index ? skeleton.anchors.flatMap(a => {
    const proof = a.methodCapture, actual = proof && options.index!.relatedCalls(skeleton.sourceId, proof.receiverClass).find(c => c.id === proof.sourceCallId)?.methodCapture
    return actual && JSON.stringify(actual) === JSON.stringify(proof) && a.name === sourceMethodCaptureResult(actual.sourceCallId) && a.valueExpression === `${actual.receiver}.${actual.method}` ? [[a.id, actual] as const] : []
  }) : [])
  const superReads = new Map(skeleton.propertySemantics === "question-control/v1" && options.index ? skeleton.anchors.flatMap(a => {
    const proof = a.superMethod, actual = proof && options.index!.relatedCalls(skeleton.sourceId).find(c => c.id === proof.sourceCallId)?.superMethod
    return actual && JSON.stringify(actual) === JSON.stringify(proof) && actual.source.sha256 === skeleton.source.sha256 && a.name === sourceSuperMethodResult(actual.sourceCallId) && a.id === sourceSyntaxAnchorId(skeleton.sourceId, actual.source.startIndex, actual.source.endIndex, "assignment", a.name) ? [[a.id, actual] as const] : []
  }) : [])
  const lookupCalls = new Map(skeleton.propertySemantics === "question-control/v1" && options.index ? skeleton.anchors.flatMap(a => {
    const actual = a.call && options.index!.relatedCalls(skeleton.sourceId, a.call.receiverClass).find(c => c.id === a.call!.sourceCallId)
    return actual?.methodLookup && actual.sha256 === skeleton.source.sha256 && actual.receiver === a.call!.receiver && JSON.stringify(actual.candidateIds) === JSON.stringify(a.call!.candidateIds) ? [[a.id, actual.methodLookup] as const] : []
  }) : [])
  const lookupCreations = new Map([...lookupCalls.values()].map(p => [p.creationCallId, p]))
  const methodAliases = new Map(skeleton.propertySemantics === "question-control/v1" && options.index ? skeleton.anchors.flatMap(a => {
    const actual = a.call && options.index!.relatedCalls(skeleton.sourceId, a.call.receiverClass).find(c => c.id === a.call!.sourceCallId), proof = actual?.methodBinding
    return proof && actual.sha256 === skeleton.source.sha256 && actual.receiver === a.call!.receiver && JSON.stringify(actual.candidateIds) === JSON.stringify(a.call!.candidateIds) ? [[sourceSyntaxAnchorId(skeleton.sourceId, proof.source.startIndex, proof.source.endIndex, "assignment", proof.name), proof] as const] : []
  }) : [])
  const callableCalls = new Map(skeleton.propertySemantics === "question-control/v1" && options.index ? skeleton.anchors.flatMap(a => {
    const actual = a.call && options.index!.relatedCalls(skeleton.sourceId, a.call.receiverClass).find(c => c.id === a.call!.sourceCallId)
    const proof = actual?.superMethod ?? actual?.callableParameter
    return proof && actual!.sha256 === skeleton.source.sha256 && actual!.expression === a.call!.expression && JSON.stringify(actual!.candidateIds) === JSON.stringify(a.call!.candidateIds) ? [[a.id, proof] as const] : []
  }) : [])
  const callableValues = new Map(skeleton.propertySemantics === "question-control/v1" && options.index ? skeleton.anchors.flatMap(a => {
    const actual = a.callableValue && options.index!.relatedCalls(skeleton.sourceId).flatMap(c => c.argumentFacts?.flatMap(v => v.callableValue ? [v.callableValue] : []) ?? []).find(p => p.kind === "module" && a.id === sourceCallableValueName(skeleton.sourceId, p).slice("callable-value-".length) && a.name === sourceCallableValueResult(skeleton.sourceId, p) && a.valueExpression === p.expression && JSON.stringify(a.callableValue) === JSON.stringify(p))
    return actual ? [[a.id, actual] as const] : []
  }) : [])
  const callableDefinitions = new Map(skeleton.propertySemantics === "question-control/v1" && options.index ? skeleton.anchors.flatMap(a => {
    const actual = a.callableDefinition && options.index!.symbols.find(s => s.id === a.callableDefinition!.targetId && s.sha256 === a.callableDefinition!.targetSha256), moduleDefinition = actual && options.index!.symbols.find(s => s.id === skeleton.sourceId)?.moduleInitialization?.functions.find(f => f.targetId === actual.id && f.targetSha256 === actual.sha256), proof = actual?.valueCallable ?? moduleDefinition?.definition
    return actual && proof && !proof.gap && proof.ownerId === skeleton.sourceId && proof.ownerSha256 === skeleton.source.sha256 && proof.anchorId === a.id && actual.name === a.name && JSON.stringify(proof) === JSON.stringify(a.callableDefinition!.definition) ? [[a.id, { symbol: actual, definition: proof, module: !!moduleDefinition }] as const] : []
  }) : [])
  const classValues = new Map(skeleton.propertySemantics === "question-control/v1" && options.index ? skeleton.anchors.flatMap(a => {
    const actual = a.classValue && options.index!.relatedCalls(skeleton.sourceId).flatMap(c => c.argumentFacts?.flatMap(v => v.classValue ? [v.classValue] : []) ?? []).find(p => a.id === sourceClassValueName(skeleton.sourceId, p).slice("class-value-".length) && a.name === sourceClassValueResult(skeleton.sourceId, p) && a.valueExpression === p.expression && JSON.stringify(a.classValue) === JSON.stringify(p))
    return actual ? [[a.id, actual] as const] : []
  }) : [])
  const classDefinitions = new Map(skeleton.propertySemantics === "question-control/v1" && options.index ? skeleton.anchors.flatMap(a => {
    const proof = a.classDefinition, actual = proof && options.index!.symbols.find(s => { const current = structureClassDefinition(s); return s.id === proof.targetId && s.sha256 === proof.targetSha256 && current?.ownerId === skeleton.sourceId && current.ownerSha256 === skeleton.source.sha256 && current.anchorId === a.id && s.name === a.name && JSON.stringify(current) === JSON.stringify(proof.definition) })
    return actual && !structureClassDefinition(actual)!.gap ? [[a.id, actual] as const] : []
  }) : [])
  const classConstructors = new Map(skeleton.propertySemantics === "question-control/v1" && options.index ? skeleton.anchors.flatMap(a => {
    const actual = a.call?.classConstructor && options.index!.relatedCalls(skeleton.sourceId).find(c => c.id === a.call!.sourceCallId), proof = actual && actual.classConstructor
    return proof && actual.sha256 === skeleton.source.sha256 && actual.expression === a.call!.expression && proof.result === a.call!.resultBinding && JSON.stringify(actual.candidateIds) === JSON.stringify(a.call!.candidateIds) && JSON.stringify(proof) === JSON.stringify(a.call!.classConstructor) ? [[a.id, proof] as const] : []
  }) : [])
  const classDecoratorValues = new Map(skeleton.anchors.flatMap(a => {
    const proof = a.classDecoratorValue, definition = proof && structureClassDefinition(classDefinitions.get(proof.definitionAnchorId)), decorator = definition?.decorators.find(d => d.id === proof!.decoratorId && !d.factoryCallId)
    return decorator && a.id === sourceSyntaxAnchorId(skeleton.sourceId, decorator.source.startIndex, decorator.source.endIndex, "assignment", decorator.valueResult) && a.name === decorator.valueResult && a.valueExpression === decorator.expression ? [[a.id, decorator] as const] : []
  }))
  const objectName = (id?: string) => { const a = at(id); return a?.name ?? (a?.call?.resultNames[0]?.includes(".") ? a.call.resultBinding : a?.call?.resultNames[0]) ?? (a ? `object-${a.id}` : undefined) }
  const bindingType = (a?: Annotation) => a && ["principal", "resource", "permission"].includes(a.role) ? a.role as "principal" | "resource" | "permission" : a?.role === "context" ? "configuration" : "value"
  const allFlowIds = new Set<string>(), collect = (flow: SourceFlow[]) => { for (const f of flow) { allFlowIds.add(f.anchorId); for (const part of [f.then, f.otherwise, f.body, f.enter, f.finally]) collect(part ?? []); for (const h of f.handlers ?? []) collect(h.body) } }; collect(skeleton.flow)
  for (const a of interpretation.annotations) {
    const anchor = at(a.anchorId)
    if (!anchor) { fault("anchor-unshown", a.anchorId, "Anchor is absent from this complete displayed source skeleton."); annotations.delete(a.anchorId); continue }
    if (!sourceAnnotationRoles(anchor).includes(a.role)) fault("role", a.anchorId, `This role does not match this source anchor. Allowed structural roles: ${sourceAnnotationRoles(anchor).join(", ")}.`)
    if (a.condition) for (const code of predicateDiagnostics(a.condition)) fault(code, a.anchorId, `Use a supported finite predicate; explanation text is not executable. ${FINITE_PREDICATE_GUIDE}`)
    if (options.propertyDirected && anchor.kind === "condition" && anchor.literalKnown && typeof anchor.literalValue === "boolean" && a.condition && partialEvaluate(a.condition, {}).truth !== String(anchor.literalValue)) fault("literal-condition-conflict", a.anchorId, "This source boolean is mechanically fixed. Omit the model condition or express the same intrinsic truth; a model predicate cannot override the exclusion proof.")
    for (const [ref, expected] of [[a.principalAnchorId, "principal"], [a.resourceAnchorId, "resource"]] as const) if (ref && (!at(ref) || annotations.get(ref)?.role !== expected)) fault("object-reference", a.anchorId, `Reference ${ref} needs a shown ${expected} role, not equal text.`)
    if (a.aliasAnchorId && (!at(a.aliasAnchorId) || bindingType(annotations.get(a.aliasAnchorId)) !== bindingType(a))) fault("alias", a.anchorId, "Alias requires a shown same-type source object interpretation.")
    if (anchor.fieldWrite && a.aliasAnchorId && objectName(a.aliasAnchorId) !== anchor.valueExpression && at(a.aliasAnchorId)?.text !== anchor.valueExpression) fault("field-alias-mismatch", a.anchorId, "This field store must preserve its actual current source right hand side, not another same-type object.")
    if ([...methodProofs.values()].some(p => p.choices.some(c => c.anchorId === a.anchorId)) && (a.aliasAnchorId || !["condition", "context"].includes(a.role))) fault("method-choice-role", a.anchorId, "A proved ordinary method reference keeps its actual finite source value; it cannot be replaced with a domain object alias.")
    if (methodAliases.has(a.anchorId) && (a.aliasAnchorId || !["condition", "context"].includes(a.role))) fault("method-alias-role", a.anchorId, "A current ordinary method alias keeps its actual source value and receiver read.")
    if (fieldStores.has(a.anchorId) && (a.aliasAnchorId || !["condition", "context", "effect"].includes(a.role))) fault("field-method-role", a.anchorId, "A current ordinary bound method store keeps its actual source value and receiver capture.")
    if (earlyCaptures.has(a.anchorId) && (a.aliasAnchorId || !["condition", "context"].includes(a.role))) fault("method-capture-role", a.anchorId, "An ordinary function read keeps its source identity and receiver before argument evaluation.")
    if ((callableValues.has(a.anchorId) || callableDefinitions.has(a.anchorId)) && (a.aliasAnchorId || !["condition", "context"].includes(a.role))) fault("callable-value-role", a.anchorId, "A current function value retains its actual source identity and captured environment.")
    if (classValues.has(a.anchorId) && (a.aliasAnchorId || !["condition", "context"].includes(a.role))) fault("class-value-role", a.anchorId, "A current class reference retains its actual source identity; a role cannot replace it with another object.")
    if ((anchor.classDefinition || anchor.classDecoratorValue || anchor.classBinding) && (a.aliasAnchorId || !["condition", "context"].includes(a.role))) fault("class-definition-role", a.anchorId, "Class creation, decorator values and final binding retain their actual source objects.")
    if (anchor.superMethod && (a.aliasAnchorId || !["condition", "context"].includes(a.role))) fault("super-method-role", a.anchorId, "The actual super namespace read retains its original class cell and receiver.")
    if (anchor.call?.classConstructor && (a.aliasAnchorId || !["condition", "context"].includes(a.role))) fault("class-constructor-role", a.anchorId, "Ordinary construction retains its actual source class and distinct instance identity.")
    if (anchor.syntax === "source_class_decorator_application" && a.role !== "condition") fault("class-decorator-role", a.anchorId, "The implicit class decorator must execute as its actual source helper; context/effect cannot replace the application or its returned object.")
    if (anchor.call?.sourceCallId && lookupCreations.has(anchor.call.sourceCallId) && (a.aliasAnchorId || !["condition", "context"].includes(a.role))) fault("method-lookup-role", a.anchorId, "An ordinary getattr reference keeps its current selector; its creation cannot become an authorization object or effect.")
    if ([...lookupCreations.values()].some(p => p.alternatives.some(c => c.anchorId === a.anchorId)) && (a.aliasAnchorId || !["condition", "context"].includes(a.role))) fault("method-lookup-role", a.anchorId, "A current alternate method reference keeps its actual ordinary source value.")
    if (a.guardBranch && (anchor.kind !== "condition" || !a.principalAnchorId || !a.resourceAnchorId)) fault("guard", a.anchorId, "A branch guard needs its actual condition and explicit principal/resource roles.")
    for (const ref of a.authorizedByAnchorIds ?? []) if (!at(ref) || !annotations.get(ref)?.guardBranch) fault("authorization-reference", a.anchorId, "Claimed authorizing anchor needs an explicit current branch guard.")
  }
  for (const u of interpretation.unresolved) if (!at(u.anchorId)) { fault("anchor-unshown", u.anchorId, "Unresolved must name a current shown anchor."); unresolved.delete(u.anchorId) }
  const demand = options.propertyDirected ? buildPropertyDemand(skeleton, { ...options, interpretation: { ...interpretation, annotations: [...annotations.values()], unresolved: [...unresolved.values()] } }) : undefined
  if (options.propertyAbstraction) for (const d of demand?.dependencies?.propertyQueries?.diagnostics.filter(d => d.code === "property-binding-identity") ?? []) fault("property-binding-identity", d.propertyId ?? "propertyBindings", d.message)
  if (demand) for (const r of demand.frontier) fault(r.field === "role" ? r.expectedRole ? "object-reference" : "role-required" : r.field === "condition" ? "condition-required" : r.field === "returnOutcome" ? "return-outcome-required" : r.field === "failureKind" ? "failure-kind-required" : r.field === "guardBranch" ? "authorization-reference" : "fallthrough-outcome-required", r.anchorId, `${r.field}${r.expectedRole ? `:${r.expectedRole}` : ""}: ${r.reason} Other valid annotations remain in this source transaction.`)
  for (const a of skeleton.anchors) if (!demand && allFlowIds.has(a.id) && !unresolved.has(a.id)) {
    const annotation = annotations.get(a.id)
    if (a.kind === "condition" && !annotation?.condition) fault("condition-required", a.id, "Supply condition at this anchor, or mark this branch unresolved; other annotations remain in the same transaction.")
    if (a.kind === "return" && options.role === "entry" && !annotation?.returnOutcome) fault("return-outcome-required", a.id, "Supply returnOutcome at this source return, or retain it unresolved; literal return values never imply permission.")
    if (a.kind === "raise" && !annotation?.failureKind) fault("failure-kind-required", a.id, "Distinguish authorization rejection from operation failure, or mark this source raise unresolved.")
    if (a.kind === "call" && !annotation) fault("role-required", a.id, "Interpret this actual call as decisive/context/effect, or retain it unresolved.")
  }
  if (diagnostics.length) return { diagnostics, interpretation: parsed.data.revision === skeleton.revision ? { ...interpretation, annotations: [...annotations.values()], unresolved: [...unresolved.values()] } : previous, ...(demand ? { demand } : {}) }
  const finite = skeleton.controlSemantics === "finite-control/v1"
  const questionDirected = skeleton.propertySemantics === "question-control/v1"
  const excludedMeaning = !questionDirected && demand?.excluded.some(e => { const a = at(e.anchorId), annotation = annotations.get(e.anchorId); return a?.interpretationRequired && !annotation && !unresolved.has(e.anchorId) })
  const callableParameterNames = new Set(options.index?.callableParameters(skeleton.sourceId).map(p => p.name) ?? [])
  const unit: SemanticBlock = { itemId: options.itemId, handle: options.handle, op: previous ? "replace" : "add", role: options.role, start: "source-main", ...(finite ? { coverage: "path" } : {}), complete: skeleton.modelCovered && !(demand?.sourceGaps ?? skeleton.gaps).length && ![...unresolved.keys()].some(id => !questionDirected || demand?.reachableAnchorIds.includes(id)) && !excludedMeaning, fallthrough: interpretation.fallthroughOutcome === "unknown" ? "unresolved" : interpretation.fallthroughOutcome ?? "unresolved", parameters: skeleton.anchors.filter(a => a.kind === "parameter" && a.name).map(a => ({ name: a.name!, type: a.syntax === "source_class_cell" || questionDirected && callableParameterNames.has(a.name!) ? "value" : bindingType(annotations.get(a.id)) })), blocks: [] }
  const bind = (a: SourceAnchor): Step => ({ kind: "bind", name: `bind-${a.id}`, bindingName: objectName(a.id)!, claim: annotations.get(a.id)?.explanation ?? "Source assignment fact", type: a.literalKnown ? "value" : bindingType(annotations.get(a.id)), ...(a.literalKnown ? { value: a.literalValue! } : annotations.get(a.id)?.aliasAnchorId ? { aliasOf: objectName(annotations.get(a.id)!.aliasAnchorId)! } : {}) })
  const prologue = skeleton.anchors.filter(a => a.kind === "assignment" && !allFlowIds.has(a.id) && annotations.has(a.id) && ["principal", "resource", "permission"].includes(annotations.get(a.id)!.role)).map(bind)
  for (const proof of methodProofs.values()) prologue.unshift({ kind: "assign-value", name: `method-choice-init-${proof.name}`, claim: "A source local method value is uncreated before its actual assignment", result: proof.name, value: { literal: sourceMethodChoiceSentinel(proof) } })
  for (const proof of lookupCreations.values()) prologue.unshift({ kind: "assign-value", name: `method-lookup-init-${proof.name}`, claim: "A source local getattr method value is uncreated before its actual assignment", result: proof.name, value: { literal: sourceMethodLookupSentinel(proof) } })
  if (questionDirected && options.index) {
    const receivers = new Map<string, Step>(), identities = new Map<string, string>()
    for (const a of skeleton.anchors) {
      const call = a.call, proof = call?.receiverBinding, actual = proof && options.index.calls.find(c => c.id === call.sourceCallId && c.ownerId === skeleton.sourceId)
      const target = call?.candidateIds.length === 1 && options.index.symbols.find(s => s.id === call.candidateIds[0])
      if (!call?.receiver || !proof || !actual?.receiverBinding || actual.receiver !== call.receiver || actual.receiverClass !== call.receiverClass || actual.candidateIds.length !== 1 || actual.candidateIds[0] !== call.candidateIds[0] || JSON.stringify(actual.receiverBinding) !== JSON.stringify(proof) || !target || target.attributes.methodBinding === "static" || !allFlowIds.has(a.id) || unresolved.has(a.id) || demand && !demand.reachableAnchorIds.includes(a.id) || !annotations.has(a.id) || ["context", "effect"].includes(annotations.get(a.id)!.role)) continue
      if (!receivers.has(call.receiver)) {
        const identity = JSON.stringify(proof), aliasOf = identities.get(identity)
        receivers.set(call.receiver, { kind: "bind", name: `receiver-${a.id}`, bindingName: call.receiver, type: "value", ...(aliasOf ? { aliasOf } : {}), claim: `Actual source module instance ${proof.name} at ${proof.source.path}:${proof.source.startLine}-${proof.source.endLine}; ordinary receiver value only` })
        identities.set(identity, aliasOf ?? call.receiver)
      }
    }
    prologue.unshift(...receivers.values())
  }
  let serial = 0
  const sourceValue = (expression?: string, literal?: { value: unknown }, valueAnchorId?: string): Record<string, unknown> => {
    if (literal) return { literal: literal.value }
    const exact = at(valueAnchorId), matches = skeleton.anchors.filter(a => a.kind === "control" && a.valueExpression === expression || a.kind === "call" && a.text === expression)
    const selected = exact ?? (matches.length === 1 ? matches[0] : undefined), generated = selected?.call?.resultBinding ?? (selected?.kind === "control" ? selected.name : undefined)
    return { binding: generated ?? expression ?? "$source-value-unknown" }
  }
  const argumentResult = (expression: string, sourceCallId?: string) => {
    const matches = skeleton.anchors.filter(a => a.call && (sourceCallId ? a.call.sourceCallId === sourceCallId : a.text === expression))
    return matches.length === 1 ? matches[0]!.call!.resultBinding : undefined
  }
  const compile = (flow: SourceFlow[], name: string, prefix: Step[] = []) => {
    const block: SemanticBlock["blocks"][number] = { name, steps: [...prefix] }; unit.blocks.push(block)
    for (const node of flow) {
      const a = anchors.get(node.anchorId)!, annotation = annotations.get(a.id), claim = annotation?.explanation ?? "Original source syntax", objects = { principal: objectName(annotation?.principalAnchorId), resource: objectName(annotation?.resourceAnchorId) }
      if (demand && !demand.reachableAnchorIds.includes(a.id)) { if (!questionDirected) block.steps.push({ kind: "unresolved", name: `excluded-${a.id}`, claim: "Located source-invariant exclusion; original remains in the host skeleton", reason: `source-excluded:${demand.excluded.find(e => e.anchorId === a.id)?.reason ?? "unreached-source"}` }); continue }
      if (node.kind === "gap" || unresolved.has(a.id)) { block.steps.push({ kind: "unresolved", name: `gap-${a.id}`, claim, reason: unresolved.get(a.id)?.reason ?? skeleton.gaps.find(g => g.selector.startLine === a.selector.startLine)?.code ?? "source-syntax-unsupported" }); continue }
      if (options.propertyAbstraction && a.kind === "call" && demand?.dependencies?.callScopes?.some(s => s.anchorId === a.id && s.state === "summary")) {
        block.steps.push({ kind: "context", name: `summary-${a.id}`, claim: "Current source-bound flat helper has no mutation, call or exceptional branch; its actual arguments bind and its return is unused", relationship: "dispatch-binding", mayRaise: false }); continue
      }
      if (options.propertyAbstraction && (node.kind === "branch" && !annotation?.condition && !a.literalKnown || a.kind === "raise" && !annotation?.failureKind || a.kind === "call" && annotation?.role === "context" && !options.callSummaries?.some(s => s.anchorId === a.id && s.callerRevision === skeleton.revision))) {
        block.steps.push({ kind: "unresolved", name: `property-residual-${a.id}`, claim, reason: "property-source-influence-unresolved" }); unit.complete = false; continue
      }
      if (node.kind === "branch") {
        const yes = `source-true-${serial}`, no = `source-false-${serial++}`, condition = demand && a.literalKnown && typeof a.literalValue === "boolean" ? { op: "eq", left: { literal: a.literalValue }, right: { literal: true } } : annotation!.condition!
        const guardName = `guard-${a.id}`, guard = (branch: "true" | "false"): Step[] => annotation?.guardBranch === branch ? [{ kind: "guard", name: guardName, claim, ...objects, condition: branch === "true" ? condition : { op: "not", arg: condition } }] : []
        block.steps.push({ kind: "choose", name: `choose-${a.id}`, claim, cases: [{ condition, body: yes }], otherwise: no })
        compile(node.then ?? [], yes, guard("true")); compile(node.otherwise ?? [], no, guard("false")); continue
      }
      if (node.kind === "try") {
        const region = serial++, body = `source-try-${region}`, otherwise = `source-else-${region}`, final = `source-finally-${region}`
        const handlers = (node.handlers ?? []).map((h, i) => ({ exceptionTypes: h.exceptionTypes, catchesAll: h.catchesAll, body: `source-handler-${region}-${i}`, ...(h.unknownType ? { unknownType: true } : {}) }))
        block.steps.push({ kind: "try", name: `try-${a.id}`, claim, body, handlers, otherwise, finally: final })
        compile(node.body ?? [], body); compile(node.otherwise ?? [], otherwise); compile(node.finally ?? [], final)
        for (const [i, h] of (node.handlers ?? []).entries()) compile(h.body, handlers[i]!.body)
        continue
      }
      if (node.kind === "short-circuit") {
        const body = `source-rhs-${serial++}`
        block.steps.push({ kind: "short-circuit", name: `short-${a.id}`, claim, operator: node.operator!, language: node.language!, left: sourceValue(node.leftExpression, Object.hasOwn(node, "leftLiteral") ? { value: node.leftLiteral } : undefined, node.leftValueAnchorId), right: sourceValue(node.rightExpression, Object.hasOwn(node, "rightLiteral") ? { value: node.rightLiteral } : undefined, node.rightValueAnchorId), result: node.resultBinding!, body })
        compile(node.body ?? [], body); continue
      }
      if (node.kind === "with") {
        const region = serial++, enter = `source-enter-${region}`, body = `source-with-${region}`
        block.steps.push({ kind: "with", name: `with-${a.id}`, claim, enter, body, exitUnknown: node.exitUnknown !== false })
        compile(node.enter ?? [], enter); compile(node.body ?? [], body); continue
      }
      if (node.kind === "loop") {
        const region = serial++, body = `source-loop-${region}`, otherwise = `source-exhausted-${region}`
        block.steps.push({ kind: "loop", name: `loop-${a.id}`, claim, ...(node.targetName ? { target: node.targetName } : {}), ...(Object.hasOwn(node, "iterableValue") ? { iterable: node.iterableValue } : node.iterableExpression ? { iterableFrom: sourceValue(node.iterableExpression, undefined, node.iterableValueAnchorId) } : {}), ...(node.conditionExpression ? { condition: { op: "truthy", language: "python", value: sourceValue(node.conditionExpression) } } : {}), body, otherwise })
        compile(node.body ?? [], body); compile(node.otherwise ?? [], otherwise); continue
      }
      if (node.kind === "break" || node.kind === "continue") { block.steps.push({ kind: node.kind, name: `${node.kind}-${a.id}`, claim }); continue }
      if (a.kind === "return") block.steps.push({ kind: "return", name: `return-${a.id}`, claim, ...(a.literalKnown && (a.literalValue === null || typeof a.literalValue !== "object") ? { value: a.literalValue } : finite && a.valueExpression ? { valueFrom: sourceValue(a.valueExpression, undefined, a.valueAnchorId).binding as string } : {}), ...(annotation?.returnOutcome ? { outcome: annotation.returnOutcome } : {}), ...(a.valueExpression && skeleton.anchors.some(s => s.name === a.valueExpression && ["resource", "principal", "permission"].includes(annotations.get(s.id)?.role ?? "")) ? { object: a.valueExpression } : {}) })
      else if (a.kind === "raise") block.steps.push(finite ? { kind: "raise", name: `raise-${a.id}`, claim, exceptionType: a.exceptionType, failureKind: annotation!.failureKind, ...(!a.valueExpression ? { rethrow: true } : {}) } : { kind: "reject", name: `raise-${a.id}`, claim, failureKind: annotation!.failureKind })
      else if (a.kind === "call") {
        if (a.call!.bindingGap && /^(?:source-class-(?:super|constructor|instance)-|source-module-)/.test(a.call!.bindingGap)) {
          block.steps.push({ kind: "unresolved", name: `call-${a.id}`, claim, reason: a.call!.bindingGap }); unit.complete = false; continue
        }
        if (a.call!.classConstructor) {
          const proof = classConstructors.get(a.id)
          if (!proof || !finite) { block.steps.push({ kind: "unresolved", name: `call-${a.id}`, claim, reason: "source-class-constructor-unresolved" }); unit.complete = false }
          else block.steps.push({ kind: "assign-value", name: `call-${a.id}`, claim: "Construct a distinct ordinary instance from the actual current namespace class", result: proof.result, value: { literal: sourceInstanceToken({ targetId: proof.classId, targetSha256: proof.classSha256 }) }, sourceInstance: { classObject: proof.classObject, targetId: proof.classId, targetSha256: proof.classSha256 } })
          continue
        }
        const lookupCreation = a.call!.sourceCallId && lookupCreations.get(a.call!.sourceCallId)
        if (lookupCreation && finite) {
          if (!lookupCreation.choices.some(c => c.lookup)) { block.steps.push({ kind: "unresolved", name: `method-lookup-${lookupCreation.creationCallId}`, claim: "No current ordinary method matches the source selector; actual fallback selection remains unproved", reason: "source-method-lookup-attribute-unmodeled" }); continue }
          const cases = lookupCreation.choices.flatMap((choice, i) => {
            if (!choice.lookup) return []
            const body = `source-lookup-create-${serial++}`
            unit.blocks.push({ name: body, steps: [{ kind: "assign-value", name: `lookup-assign-${lookupCreation.creationCallId}-${i}`, claim: "The actual finite selector chooses this ordinary current source method", result: lookupCreation.name, value: { literal: sourceMethodLookupToken(lookupCreation, choice) }, methodRead: { receiver: lookupCreation.receiver, method: choice.method, ...(lookupCreation.fallbackExpression ? { defaultMethod: lookupCreation.fallbackExpression.slice(lookupCreation.receiver.length + 1) } : {}) } }] })
            return [{ condition: { op: "eq", left: sourceMethodLookupSelector(lookupCreation), right: { literal: choice.method } }, body }]
          })
          const otherwise = `source-lookup-unknown-${serial++}`
          unit.blocks.push({ name: otherwise, steps: [{ kind: "unresolved", name: `lookup-unknown-${lookupCreation.creationCallId}`, claim: "Other attributes and actual fallback selection remain unproved", reason: "source-method-lookup-attribute-unmodeled" }] })
          block.steps.push({ kind: "choose", name: `method-lookup-${lookupCreation.creationCallId}`, claim, cases, otherwise }); continue
        }
        if (annotation?.role === "effect") block.steps.push({ kind: "effect", name: `effect-${a.id}`, claim, operation: a.call!.expression, ...objects, ...(finite ? { mayRaise: true } : {}), ...(annotation.authorizedByAnchorIds ? { authorizedBy: annotation.authorizedByAnchorIds.map(id => `guard-${id}`) } : {}) })
        else if (annotation?.role === "context") block.steps.push({ kind: "context", name: `context-${a.id}`, claim, relationship: "dispatch-binding", ...(finite ? { mayRaise: true } : {}) })
        else {
          const emitCall = (destination: Step[], targetId?: string, suffix = "") => {
            const target = targetId ? options.index?.symbols.find(s => s.id === targetId && s.kind === "function") : undefined
            const args = a.call!.arguments, positional = args.filter(arg => !arg.parameterName), mapped: Array<{ parameter: string; object: string }> = []
            const actual = target && options.index?.relatedCalls(skeleton.sourceId, a.call!.receiverClass).find(c => c.id === a.call!.sourceCallId)
            const currentArguments = actual && target && questionDirected ? sourceArgumentBindings(options.index!, actual, target) : undefined
            const bindingGap = currentArguments?.gap ?? a.call!.bindingGap
            if (bindingGap) {
              destination.push({ kind: "unresolved", name: `arguments-${a.id}${suffix}`, claim: `Current source call binding: ${bindingGap}`, reason: bindingGap })
              unit.complete = false
            }
            let position = 0
            const captures = actual?.superMethod || actual?.callableParameter || actual?.callableBinding || actual?.capturedCallable ? [] : target?.localCallable && !target.localCallable.gap ? target.localCallable.captures.map(c => ({ name: c.name })) : []
            const parameters: NonNullable<typeof target>["parameters"] = [...target?.parameters ?? [], ...questionDirected ? captures : []]
            for (const [i, parameter] of parameters.entries()) {
              if (currentArguments) {
                const argument = currentArguments.bindings.find(b => b.parameter === parameter.name)
                if (!argument || !argument.literalKnown && !argument.captureOwnerId && !args.some(p => (p.spread ? p.expression.replace(/^\*+/, "").trim() : p.expression) === argument.expression) && argument.expression !== a.call!.receiver && !/^super\(\)\./.test(a.call!.expression)) continue
                const nestedResult = argumentResult(argument.expression, argument.sourceCallId)
                const object = argument.literalKnown ? `literal-${a.id}-${parameter.name}${suffix}` : argument.classValue ? sourceClassValueResult(skeleton.sourceId, argument.classValue) : argument.callableValue?.kind === "module" ? sourceCallableValueResult(skeleton.sourceId, argument.callableValue) : nestedResult ?? sourceValue(argument.expression).binding as string
                if (argument.literalKnown) destination.push({ kind: "bind", name: object, claim: "Actual source literal argument/default/empty pack", type: "value", value: argument.literalValue! })
                mapped.push({ parameter: parameter.name, object }); continue
              }
              const receiver = i === 0 && target?.className && target.attributes.methodBinding !== "static" && a.call!.receiver
              const supplied = receiver ? undefined : args.find(arg => arg.parameterName === parameter.name) ?? positional[position++], value = (receiver || supplied?.expression) ?? parameter.defaultExpression
              if (value) {
                const literalKnown = supplied?.literalKnown || !supplied && !receiver && parameter.defaultLiteralKnown
                if (!supplied && !receiver && !literalKnown) continue
                const nestedResult = supplied && argumentResult(supplied.expression, supplied.sourceCallId)
                const object = literalKnown ? `literal-${a.id}-${parameter.name}${suffix}` : nestedResult ?? sourceValue(value).binding as string
                if (literalKnown) destination.push({ kind: "bind", name: object, claim: supplied ? "Actual literal source argument" : "Actual literal source default", type: "value", value: supplied ? supplied.literalValue! : parameter.defaultLiteralValue! })
                mapped.push({ parameter: parameter.name, object })
              }
            }
            const methodRead = questionDirected && actual && !actual.methodCapture && target ? sourceDirectMethodRead(actual, target) : undefined
            const fieldMethodRead = questionDirected && actual && target ? actual.methodCapture ? { object: sourceMethodCaptureResult(actual.id), receiver: actual.methodCapture.receiver, targetId: target.id, targetSha256: target.sha256 } : actual.methodField ? { object: actual.expression, receiver: actual.methodField.receiver, targetId: target.id, targetSha256: target.sha256 } : undefined : undefined
            destination.push({ kind: "call", name: `call-${a.id}${suffix}`, claim, symbol: a.call!.expression, ...(finite && a.call!.sourceCallId ? { sourceCallId: a.call!.sourceCallId } : {}), arguments: mapped, result: a.call!.resultBinding, ...objects, ...(target ? { pathHint: `${target.path}:${target.startLine}-${target.endLine}`, candidateId: target.id } : {}), ...(methodRead ? { methodRead } : {}), ...(fieldMethodRead ? { fieldMethodRead } : {}), ...((actual?.superMethod || actual?.callableParameter || actual?.callableBinding || actual?.capturedCallable || actual?.moduleCallable || actual?.implicitClassDecorator || actual?.classNamespaceCall || actual?.classInstanceCall) && target ? { callableRead: { object: actual.superMethod ? sourceSuperMethodResult(actual.id) : actual.expression, targetId: target.id, targetSha256: target.sha256, ...(actual.superMethod ? { receiver: actual.superMethod.receiver } : actual.classInstanceCall ? { receiver: actual.classInstanceCall.receiver } : {}) } } : {}) })
          }
          const proof = methodCalls.get(a.id)
          if (callableCalls.has(a.id) && finite) {
            const proof = callableCalls.get(a.id)!, cases = proof.choices.map((choice, i) => {
              const body = `source-function-call-${serial++}`, variant: SemanticBlock["blocks"][number] = { name: body, steps: [] }; unit.blocks.push(variant)
              emitCall(variant.steps, choice.targetId, `-callable-${i}`)
              const selector = "schemaVersion" in proof && proof.schemaVersion === "source-super-method/v1" ? sourceSuperMethodResult(proof.sourceCallId) : proof.name
              return { condition: { op: "eq", left: { binding: selector }, right: { literal: sourceCallableToken(choice) } }, body }
            }), otherwise = `source-function-unknown-${serial++}`
            unit.blocks.push({ name: otherwise, steps: [{ kind: "unresolved", name: `function-unknown-${a.id}`, claim: "The actual function has no supported current source target", reason: "schemaVersion" in proof && proof.schemaVersion === "source-super-method/v1" ? "source-class-super-target-unmodeled" : "source-callable-value-unresolved" }] })
            block.steps.push({ kind: "choose", name: `function-call-${a.id}`, claim, cases, otherwise })
          } else if (fieldCalls.has(a.id) && finite) {
            const field = fieldCalls.get(a.id)!, cases = field.choices.map((choice, i) => {
              const body = `source-field-method-${serial++}`, variant: SemanticBlock["blocks"][number] = { name: body, steps: [] }; unit.blocks.push(variant)
              emitCall(variant.steps, choice.targetId, `-field-${i}`)
              return { condition: { op: "eq", left: { binding: `${field.receiver}.${field.field}` }, right: { literal: sourceFieldMethodToken(choice) } }, body }
            }), otherwise = `source-field-method-unknown-${serial++}`
            unit.blocks.push({ name: otherwise, steps: [{ kind: "unresolved", name: `field-method-unknown-${a.id}`, claim: "The actual field does not contain a supported captured source method", reason: "source-field-method-value-unresolved" }] })
            block.steps.push({ kind: "choose", name: `field-method-call-${a.id}`, claim, cases, otherwise })
          } else if (proof && finite) {
            const cases = proof.choices.map((choice, i) => {
              const body = `source-method-${serial++}`, variant: SemanticBlock["blocks"][number] = { name: body, steps: [] }; unit.blocks.push(variant)
              emitCall(variant.steps, choice.targetId, `-method-${i}`)
              return { condition: { op: "eq", left: { binding: proof.name }, right: { literal: sourceMethodChoiceToken(proof, choice) } }, body }
            })
            const otherwise = `source-method-uncreated-${serial++}`
            unit.blocks.push({ name: otherwise, steps: [{ kind: "raise", name: `uncreated-${a.id}`, claim: "The local method has not been created on this original source path", exceptionType: "UnboundLocalError", failureKind: "operation" }] })
            block.steps.push({ kind: "choose", name: `method-choice-${a.id}`, claim, cases, otherwise })
          } else if (lookupCalls.has(a.id) && finite) {
            const lookup = lookupCalls.get(a.id)!, cases = lookup.choices.map((choice, i) => {
              const body = `source-lookup-call-${serial++}`, variant: SemanticBlock["blocks"][number] = { name: body, steps: [] }; unit.blocks.push(variant)
              emitCall(variant.steps, choice.targetId, `-lookup-${i}`)
              return { condition: { op: "eq", left: { binding: lookup.name }, right: { literal: sourceMethodLookupToken(lookup, choice) } }, body }
            })
            const unknown = `source-lookup-call-unknown-${serial++}`, uncreated = `source-lookup-uncreated-${serial++}`, otherwise = `source-lookup-uncreated-check-${serial++}`
            unit.blocks.push({ name: unknown, steps: [{ kind: "unresolved", name: `lookup-call-unknown-${a.id}`, claim: "The current ordinary getattr method value is unavailable", reason: "source-method-lookup-value-unresolved" }] }, { name: uncreated, steps: [{ kind: "raise", name: `lookup-uncreated-${a.id}`, claim: "The local method has not been created on this original source path", exceptionType: "UnboundLocalError", failureKind: "operation" }] })
            const check = { kind: "choose" as const, name: `lookup-uncreated-check-${a.id}`, claim, cases: [{ condition: { op: "eq", left: { binding: lookup.name }, right: { literal: sourceMethodLookupSentinel(lookup) } }, body: uncreated }], otherwise: unknown }
            if (cases.length) { unit.blocks.push({ name: otherwise, steps: [check] }); block.steps.push({ kind: "choose", name: `method-lookup-call-${a.id}`, claim, cases, otherwise }) }
            else block.steps.push({ ...check, name: `method-lookup-call-${a.id}` })
          } else emitCall(block.steps, a.call!.candidateIds.length === 1 ? a.call!.candidateIds[0] : undefined)
        }
      } else if (a.kind === "assignment" && a.name) {
        const superMethod = superReads.get(a.id)
        if (superMethod) {
          block.steps.push({ kind: "assign-value", name: `call-${superMethod.creationAnchorId}`, claim: "Read the actual successor namespace function before original argument evaluation", result: a.name, value: { literal: null }, superRead: { receiver: superMethod.receiver, classCell: superMethod.classCell, classId: superMethod.classId, classSha256: superMethod.classSha256, method: superMethod.method } }); continue
        }
        if (a.superMethod) { block.steps.push({ kind: "unresolved", name: `super-${a.id}`, claim, reason: "source-class-super-read-unresolved" }); unit.complete = false; continue }
        const definition = classDefinitions.get(a.id)
        if (definition) {
          const proof = structureClassDefinition(definition)!, result = `class-original-${proof.anchorId}`
          block.steps.push({ kind: "assign-value", name: `class-definition-${proof.anchorId}`, claim: "Execute this original class definition without binding its public name before decorators finish", result, value: { literal: sourceClassToken({ targetId: definition.id, targetSha256: definition.sha256 }) }, sourceClass: { targetId: definition.id, targetSha256: definition.sha256, scope: "definition", namespace: true, bases: proof.bases.map(base => base.expression) } })
          for (const entry of proof.namespace) {
            if (entry.kind === "field") { const field = proof.fields.find(f => f.anchorId === entry.anchorId)!; block.steps.push({ kind: "transform", name: `class-field-${field.anchorId}`, claim: "Original finite class namespace attribute", object: result, field: field.name, value: field.value }) }
            else {
              const method = proof.methods.find(m => m.anchorId === entry.anchorId)!, reference = `class-function-${method.anchorId}`, target = { targetId: method.targetId, targetSha256: method.targetSha256 }
              block.steps.push({ kind: "assign-value", name: `class-method-${method.anchorId}`, claim: "Create the original ordinary namespace function with its stable outer objects and actual class cell", result: reference, value: { literal: sourceCallableToken(target) }, sourceCallable: { ...target, captures: [...method.captures.map(capture => ({ parameter: capture.name, object: capture.name })), ...method.classCell ? [{ parameter: "__class__", object: result }] : []] } }, { kind: "transform", name: `class-method-field-${method.anchorId}`, claim: "Retain the actual function object in its original class namespace", object: result, field: method.name, source: reference })
            }
          }
          continue
        }
        const decorator = classDecoratorValues.get(a.id)
        if (decorator) { block.steps.push({ kind: "assign-value", name: `class-decorator-value-${decorator.id}`, claim: "Evaluate the current ordinary decorator function before class creation", result: decorator.valueResult, value: { literal: sourceCallableToken({ targetId: decorator.targetId!, targetSha256: decorator.targetSha256! }) }, sourceCallable: { targetId: decorator.targetId!, targetSha256: decorator.targetSha256!, scope: "module", captures: [] } }); continue }
        if (a.classBinding) {
          const definition = structureClassDefinition(classDefinitions.get(a.classBinding)), result = definition?.decorators[0] ? `class-applied-${definition.decorators[0].id}` : `class-original-${a.classBinding}`
          if (definition && a.name === definition.name && a.valueExpression === result) block.steps.push({ kind: "assign-value", name: `class-bind-${a.classBinding}`, claim: "Bind the actual final decorator return value to the source class name", result: a.name, value: { binding: result } })
          else { block.steps.push({ kind: "unresolved", name: `class-bind-${a.id}`, claim, reason: "source-class-definition-binding-unresolved" }); unit.complete = false }
          continue
        }
        if (a.classDefinition || a.classDecoratorValue) { block.steps.push({ kind: "unresolved", name: `class-definition-${a.id}`, claim, reason: "source-class-definition-unresolved" }); unit.complete = false; continue }
        const cls = classValues.get(a.id)
        if (cls) { block.steps.push({ kind: "assign-value", name: sourceClassValueName(skeleton.sourceId, cls), claim: "Read the actual current source class object without resetting prior transformations", result: a.name, value: { literal: sourceClassToken(cls) }, sourceClass: { targetId: cls.targetId, targetSha256: cls.targetSha256 } }); continue }
        if (a.classValue) { block.steps.push({ kind: "unresolved", name: `class-value-${a.id}`, claim, reason: "source-class-reference-unresolved" }); unit.complete = false; continue }
        const callableValue = callableValues.get(a.id), callableDefinition = callableDefinitions.get(a.id)
        if (callableValue || callableDefinition) {
          const target = callableValue ?? { targetId: callableDefinition!.symbol.id, targetSha256: callableDefinition!.symbol.sha256 }, captures = callableDefinition?.definition.captures.map(c => ({ parameter: c.name, object: c.name })) ?? []
          block.steps.push({ kind: "assign-value", name: callableValue ? sourceCallableValueName(skeleton.sourceId, callableValue) : sourceCallableDefinitionName(a.id), claim: "Create or read the actual current source callable with its original stable captured objects", result: a.name, value: { literal: sourceCallableToken(target) }, sourceCallable: { targetId: target.targetId, targetSha256: target.targetSha256, ...(callableValue || callableDefinition?.module ? { scope: "module" } : {}), captures } })
          continue
        }
        if (a.callableValue || a.callableDefinition) { block.steps.push({ kind: "unresolved", name: `function-value-${a.id}`, claim, reason: "source-callable-creation-unresolved" }); unit.complete = false; continue }
        const earlyCapture = earlyCaptures.get(a.id)
        if (earlyCapture) {
          block.steps.push({ kind: "assign-value", name: sourceMethodCaptureName(earlyCapture.sourceCallId), claim: "Capture the actual ordinary source method before evaluating its arguments", result: sourceMethodCaptureResult(earlyCapture.sourceCallId), value: { literal: sourceFieldMethodToken(earlyCapture) }, methodRead: { receiver: earlyCapture.receiver, method: earlyCapture.method }, boundMethod: { receiver: earlyCapture.receiver, targetId: earlyCapture.targetId, targetSha256: earlyCapture.targetSha256 } })
          continue
        }
        const fieldMethod = fieldStores.get(a.id)
        if (fieldMethod) {
          if (annotation?.role === "effect") block.steps.push({ kind: "effect", name: `field-effect-${a.id}`, claim, operation: a.name, ...objects, mayRaise: true, ...(annotation.authorizedByAnchorIds ? { authorizedBy: annotation.authorizedByAnchorIds.map(id => `guard-${id}`) } : {}) })
          const result = `field-method-object-${a.id}`
          block.steps.push({ kind: "assign-value", name: `field-method-value-${a.id}`, claim: "Capture an ordinary source method and this actual receiver at the original field store", result, value: { literal: sourceFieldMethodToken(fieldMethod) }, methodRead: { receiver: fieldMethod.receiver, method: fieldMethod.method }, boundMethod: { receiver: fieldMethod.receiver, targetId: fieldMethod.targetId, targetSha256: fieldMethod.targetSha256 } }, { kind: "transform", name: `field-${a.id}`, claim, object: fieldMethod.receiver, field: fieldMethod.field, source: result })
          continue
        }
        const lookup = [...lookupCreations.values()].find(p => p.alternatives.some(c => c.anchorId === a.id)), alternate = lookup?.alternatives.find(c => c.anchorId === a.id)
        if (lookup && alternate) {
          const choice = lookup.choices.find(c => c.targetId === alternate.targetId)!
          block.steps.push({ kind: "assign-value", name: `assign-${a.id}`, claim, result: lookup.name, value: { literal: sourceMethodLookupToken(lookup, choice) }, methodRead: { receiver: lookup.receiver, method: alternate.method } })
          continue
        }
        const method = [...methodProofs.values()].flatMap(proof => proof.choices.filter(c => c.anchorId === a.id).map(choice => ({ proof, choice })))[0]
        if (method) {
          block.steps.push({ kind: "assign-value", name: `assign-${a.id}`, claim, result: method.proof.name, value: { literal: sourceMethodChoiceToken(method.proof, method.choice) }, methodRead: { receiver: method.proof.receiver, method: method.choice.method } })
          continue
        }
        const alias = methodAliases.get(a.id)
        if (alias) { block.steps.push({ kind: "assign-value", name: `assign-${a.id}`, claim, result: alias.name, value: { binding: `${alias.receiver}.${alias.method}` }, methodRead: { receiver: alias.receiver, method: alias.method } }); continue }
        if (questionDirected && a.fieldWrite) {
          if (annotation?.role === "effect") block.steps.push({ kind: "effect", name: `field-effect-${a.id}`, claim, operation: a.name, ...objects, mayRaise: true, ...(annotation.authorizedByAnchorIds ? { authorizedBy: annotation.authorizedByAnchorIds.map(id => `guard-${id}`) } : {}) })
          const value = sourceValue(a.valueExpression, undefined, a.valueAnchorId), source = value.binding as string
          block.steps.push({ kind: "transform", name: `field-${a.id}`, claim, ...a.fieldWrite, ...(a.literalKnown ? { value: a.literalValue! } : { source }) })
          continue
        }
        if (finite && flow.some(n => n.kind === "short-circuit" && n.resultBinding === a.name)) continue
        const fromCall = skeleton.anchors.some(c => c.call?.resultNames.includes(a.name!) && c.call.expression + "(" === a.valueExpression?.slice(0, c.call.expression.length + 1))
        if (!fromCall || annotation?.aliasAnchorId) block.steps.push(finite && !annotation?.aliasAnchorId && bindingType(annotation) === "value" && !a.literalKnown ? { kind: "assign-value", name: `assign-${a.id}`, claim, result: a.name, value: sourceValue(a.valueExpression, undefined, a.valueAnchorId) } : bind(a))
      }
    }
  }
  compile(skeleton.flow, unit.start, prologue)
  if (questionDirected) {
    // Empty source regions have no actions or exits. Sharing their continuation
    // preserves each caller's condition/order without spending a block per arm.
    const empty = unit.blocks.filter(b => b.steps.length === 0), canonical = empty[0]?.name
    if (canonical && empty.length > 1) {
      const aliases = new Map(empty.slice(1).map(b => [b.name, canonical]))
      const body = (name: string) => aliases.get(name) ?? name
      for (const block of unit.blocks) for (const step of block.steps) {
        if (step.kind === "choose") { for (const alternative of step.cases) alternative.body = body(alternative.body); if (step.otherwise) step.otherwise = body(step.otherwise) }
        else if (step.kind === "try") { step.body = body(step.body); for (const handler of step.handlers) handler.body = body(handler.body); if (step.otherwise) step.otherwise = body(step.otherwise); if (step.finally) step.finally = body(step.finally) }
        else if (step.kind === "with") { step.enter = body(step.enter); step.body = body(step.body) }
        else if (step.kind === "short-circuit") step.body = body(step.body)
        else if (step.kind === "loop") { step.body = body(step.body); if (step.otherwise) step.otherwise = body(step.otherwise) }
      }
      unit.start = body(unit.start)
      unit.blocks = unit.blocks.filter(b => !aliases.has(b.name))
    }
  }
  return { diagnostics, interpretation, unit, ...(demand ? { demand } : {}) }
}
