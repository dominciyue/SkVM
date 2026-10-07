import { z } from "zod"
import { InquiryText, type InquiryDiagnostic } from "./inquiry.ts"
import type { SemanticBlock } from "./semantic-flow.ts"
import { predicateDiagnostics, partialEvaluate, FINITE_PREDICATE_GUIDE } from "./control-evaluation.ts"
import { buildPropertyDemand, type PropertyDemand } from "./property-demand.ts"
import type { DependencyQuestion } from "./property-dependencies.ts"
import type { SourceSkeleton, SourceAnchor, SourceFlow } from "../../benchmarks/authorization-dsl/evidence-preparation/source-skeleton.ts"
import type { StructureIndex } from "../../benchmarks/authorization-dsl/evidence-preparation/structure-index.ts"

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
}).strict()
export type SourceInterpretation = z.infer<typeof SourceInterpretationSchema>
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
export const PROPERTY_SOURCE_GUIDE = 'operation-evidence-v4: task.propertyDemand.frontier lists the current missing source fields and affected ORIGINAL questions. Submit changed annotations only; the host retains valid earlier fields at this revision. You may interpret more actually shown necessary anchors in the same transaction. A fallthroughOutcome demand is a field on interpretation, not an annotation on sourceId. Excluded entries are host source-invariant control proofs, not model assertions of irrelevance. Unknown calls, setters, result/parameter relations and potentially changing objects still need explicit meaning or a named unresolved entry. Model context roles stay unreviewed. sourceRead, domainInterpreted and propertyCovered describe this proposed interpretation; none establishes wholeAnswerSufficient or live success. sourceSkeleton.anchors is a current field view; the complete original skeleton remains available through source_structure({symbolId:sourceSkeleton.sourceId,receiverClass?}), and original source through source_read. Do not reconstruct excluded code or resubmit every retained annotation. The original question denominator and policy remain unchanged.'

/** Compile syntax that the model saw; model roles/predicates are still unreviewed. */
export function lowerSourceInterpretation(skeleton: SourceSkeleton, raw: unknown, options: { index?: StructureIndex; itemId: string; handle: string; questionId: string; role: "entry" | "helper"; previous?: SourceInterpretation; propertyDirected?: boolean; affectedQuestionIds?: string[]; question?: DependencyQuestion }): { diagnostics: InquiryDiagnostic[]; interpretation?: SourceInterpretation; unit?: SemanticBlock; demand?: PropertyDemand } {
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
  const interpretation: SourceInterpretation = { ...previous, ...parsed.data, annotations: [...annotations.values()], unresolved: [...unresolved.values()], ...(parsed.data.fallthroughOutcome ?? previous?.fallthroughOutcome ? { fallthroughOutcome: parsed.data.fallthroughOutcome ?? previous?.fallthroughOutcome } : {}) }
  const anchors = new Map(skeleton.anchors.map(a => [a.id, a])), at = (id?: string) => id ? anchors.get(id) : undefined
  const objectName = (id?: string) => { const a = at(id); return a?.name ?? a?.call?.resultNames[0] ?? (a ? `object-${a.id}` : undefined) }
  const bindingType = (a?: Annotation) => a && ["principal", "resource", "permission"].includes(a.role) ? a.role as "principal" | "resource" | "permission" : a?.role === "context" ? "configuration" : "value"
  const allFlowIds = new Set<string>(), collect = (flow: SourceFlow[]) => { for (const f of flow) { allFlowIds.add(f.anchorId); for (const part of [f.then, f.otherwise, f.body, f.enter, f.finally]) collect(part ?? []); for (const h of f.handlers ?? []) collect(h.body) } }; collect(skeleton.flow)
  for (const a of interpretation.annotations) {
    const anchor = at(a.anchorId)
    if (!anchor) { fault("anchor-unshown", a.anchorId, "Anchor is absent from this complete displayed source skeleton."); annotations.delete(a.anchorId); continue }
    if (["principal", "resource", "permission"].includes(a.role) && !["parameter", "assignment", "call"].includes(anchor.kind) || a.role === "effect" && !["call", "assignment"].includes(anchor.kind)) fault("role", a.anchorId, "This role does not match a source object or relevant operation anchor.")
    if (a.condition) for (const code of predicateDiagnostics(a.condition)) fault(code, a.anchorId, `Use a supported finite predicate; explanation text is not executable. ${FINITE_PREDICATE_GUIDE}`)
    if (options.propertyDirected && anchor.kind === "condition" && anchor.literalKnown && typeof anchor.literalValue === "boolean" && a.condition && partialEvaluate(a.condition, {}).truth !== String(anchor.literalValue)) fault("literal-condition-conflict", a.anchorId, "This source boolean is mechanically fixed. Omit the model condition or express the same intrinsic truth; a model predicate cannot override the exclusion proof.")
    for (const [ref, expected] of [[a.principalAnchorId, "principal"], [a.resourceAnchorId, "resource"]] as const) if (ref && (!at(ref) || annotations.get(ref)?.role !== expected)) fault("object-reference", a.anchorId, `Reference ${ref} needs a shown ${expected} role, not equal text.`)
    if (a.aliasAnchorId && (!at(a.aliasAnchorId) || bindingType(annotations.get(a.aliasAnchorId)) !== bindingType(a))) fault("alias", a.anchorId, "Alias requires a shown same-type source object interpretation.")
    if (a.guardBranch && (anchor.kind !== "condition" || !a.principalAnchorId || !a.resourceAnchorId)) fault("guard", a.anchorId, "A branch guard needs its actual condition and explicit principal/resource roles.")
    for (const ref of a.authorizedByAnchorIds ?? []) if (!at(ref) || !annotations.get(ref)?.guardBranch) fault("authorization-reference", a.anchorId, "Claimed authorizing anchor needs an explicit current branch guard.")
  }
  for (const u of interpretation.unresolved) if (!at(u.anchorId)) { fault("anchor-unshown", u.anchorId, "Unresolved must name a current shown anchor."); unresolved.delete(u.anchorId) }
  const demand = options.propertyDirected ? buildPropertyDemand(skeleton, { ...options, interpretation: { ...interpretation, annotations: [...annotations.values()], unresolved: [...unresolved.values()] } }) : undefined
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
  const unit: SemanticBlock = { itemId: options.itemId, handle: options.handle, op: previous ? "replace" : "add", role: options.role, start: "source-main", ...(finite ? { coverage: "path" } : {}), complete: skeleton.modelCovered && !(demand?.sourceGaps ?? skeleton.gaps).length && ![...unresolved.keys()].some(id => !questionDirected || demand?.reachableAnchorIds.includes(id)) && !excludedMeaning, fallthrough: interpretation.fallthroughOutcome === "unknown" ? "unresolved" : interpretation.fallthroughOutcome ?? "unresolved", parameters: skeleton.anchors.filter(a => a.kind === "parameter" && a.name).map(a => ({ name: a.name!, type: bindingType(annotations.get(a.id)) })), blocks: [] }
  const bind = (a: SourceAnchor): Step => ({ kind: "bind", name: `bind-${a.id}`, bindingName: objectName(a.id)!, claim: annotations.get(a.id)?.explanation ?? "Source assignment fact", type: a.literalKnown ? "value" : bindingType(annotations.get(a.id)), ...(a.literalKnown ? { value: a.literalValue! } : annotations.get(a.id)?.aliasAnchorId ? { aliasOf: objectName(annotations.get(a.id)!.aliasAnchorId)! } : {}) })
  const prologue = skeleton.anchors.filter(a => a.kind === "assignment" && !allFlowIds.has(a.id) && annotations.has(a.id) && ["principal", "resource", "permission"].includes(annotations.get(a.id)!.role)).map(bind)
  let serial = 0
  const sourceValue = (expression?: string, literal?: { value: unknown }): Record<string, unknown> => {
    if (literal) return { literal: literal.value }
    const generated = skeleton.anchors.find(a => a.kind === "control" && a.valueExpression === expression)?.name ?? skeleton.anchors.find(a => a.kind === "call" && a.text === expression)?.call?.resultBinding
    return { binding: generated ?? expression ?? "$source-value-unknown" }
  }
  const compile = (flow: SourceFlow[], name: string, prefix: Step[] = []) => {
    const block: SemanticBlock["blocks"][number] = { name, steps: [...prefix] }; unit.blocks.push(block)
    for (const node of flow) {
      const a = anchors.get(node.anchorId)!, annotation = annotations.get(a.id), claim = annotation?.explanation ?? "Original source syntax", objects = { principal: objectName(annotation?.principalAnchorId), resource: objectName(annotation?.resourceAnchorId) }
      if (demand && !demand.reachableAnchorIds.includes(a.id)) { if (!questionDirected) block.steps.push({ kind: "unresolved", name: `excluded-${a.id}`, claim: "Located source-invariant exclusion; original remains in the host skeleton", reason: `source-excluded:${demand.excluded.find(e => e.anchorId === a.id)?.reason ?? "unreached-source"}` }); continue }
      if (node.kind === "gap" || unresolved.has(a.id)) { block.steps.push({ kind: "unresolved", name: `gap-${a.id}`, claim, reason: unresolved.get(a.id)?.reason ?? skeleton.gaps.find(g => g.selector.startLine === a.selector.startLine)?.code ?? "source-syntax-unsupported" }); continue }
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
        block.steps.push({ kind: "short-circuit", name: `short-${a.id}`, claim, operator: node.operator!, language: node.language!, left: sourceValue(node.leftExpression, Object.hasOwn(node, "leftLiteral") ? { value: node.leftLiteral } : undefined), right: sourceValue(node.rightExpression, Object.hasOwn(node, "rightLiteral") ? { value: node.rightLiteral } : undefined), result: node.resultBinding!, body })
        compile(node.body ?? [], body); continue
      }
      if (node.kind === "with") {
        const region = serial++, enter = `source-enter-${region}`, body = `source-with-${region}`
        block.steps.push({ kind: "with", name: `with-${a.id}`, claim, enter, body, exitUnknown: node.exitUnknown !== false })
        compile(node.enter ?? [], enter); compile(node.body ?? [], body); continue
      }
      if (node.kind === "loop") {
        const region = serial++, body = `source-loop-${region}`, otherwise = `source-exhausted-${region}`
        block.steps.push({ kind: "loop", name: `loop-${a.id}`, claim, ...(node.targetName ? { target: node.targetName } : {}), ...(Object.hasOwn(node, "iterableValue") ? { iterable: node.iterableValue } : node.iterableExpression ? { iterableFrom: sourceValue(node.iterableExpression) } : {}), ...(node.conditionExpression ? { condition: { op: "truthy", language: "python", value: sourceValue(node.conditionExpression) } } : {}), body, otherwise })
        compile(node.body ?? [], body); compile(node.otherwise ?? [], otherwise); continue
      }
      if (node.kind === "break" || node.kind === "continue") { block.steps.push({ kind: node.kind, name: `${node.kind}-${a.id}`, claim }); continue }
      if (a.kind === "return") block.steps.push({ kind: "return", name: `return-${a.id}`, claim, ...(a.literalKnown && (a.literalValue === null || typeof a.literalValue !== "object") ? { value: a.literalValue } : finite && a.valueExpression ? { valueFrom: sourceValue(a.valueExpression).binding as string } : {}), ...(annotation?.returnOutcome ? { outcome: annotation.returnOutcome } : {}), ...(a.valueExpression && skeleton.anchors.some(s => s.name === a.valueExpression && ["resource", "principal", "permission"].includes(annotations.get(s.id)?.role ?? "")) ? { object: a.valueExpression } : {}) })
      else if (a.kind === "raise") block.steps.push(finite ? { kind: "raise", name: `raise-${a.id}`, claim, exceptionType: a.exceptionType, failureKind: annotation!.failureKind, ...(!a.valueExpression ? { rethrow: true } : {}) } : { kind: "reject", name: `raise-${a.id}`, claim, failureKind: annotation!.failureKind })
      else if (a.kind === "call") {
        if (annotation?.role === "effect") block.steps.push({ kind: "effect", name: `effect-${a.id}`, claim, operation: a.call!.expression, ...objects, ...(finite ? { mayRaise: true } : {}), ...(annotation.authorizedByAnchorIds ? { authorizedBy: annotation.authorizedByAnchorIds.map(id => `guard-${id}`) } : {}) })
        else if (annotation?.role === "context") block.steps.push({ kind: "context", name: `context-${a.id}`, claim, relationship: "dispatch-binding", ...(finite ? { mayRaise: true } : {}) })
        else {
          const target = a.call!.candidateIds.length === 1 ? options.index?.symbols.find(s => s.id === a.call!.candidateIds[0] && s.kind === "function") : undefined
          const args = a.call!.arguments, positional = args.filter(arg => !arg.parameterName), mapped: Array<{ parameter: string; object: string }> = []
          let position = 0
          for (const [i, parameter] of (target?.parameters ?? []).entries()) {
            const receiver = i === 0 && target?.className && target.attributes.methodBinding !== "static" && a.call!.receiver
            const supplied = receiver ? undefined : args.find(arg => arg.parameterName === parameter.name) ?? positional[position++], value = (receiver || supplied?.expression) ?? parameter.defaultExpression
            if (value) {
              const literalKnown = supplied?.literalKnown || !supplied && !receiver && parameter.defaultLiteralKnown
              if (!supplied && !receiver && !literalKnown) continue
              const nestedResult = supplied && skeleton.anchors.find(c => c.kind === "call" && c.id !== a.id && c.text === supplied.expression)?.call?.resultBinding
              const object = literalKnown ? `literal-${a.id}-${parameter.name}` : nestedResult ?? sourceValue(value).binding as string
              if (literalKnown) block.steps.push({ kind: "bind", name: object, claim: supplied ? "Actual literal source argument" : "Actual literal source default", type: "value", value: supplied ? supplied.literalValue! : parameter.defaultLiteralValue! })
              mapped.push({ parameter: parameter.name, object })
            }
          }
          block.steps.push({ kind: "call", name: `call-${a.id}`, claim, symbol: a.call!.expression, ...(finite && a.call!.sourceCallId ? { sourceCallId: a.call!.sourceCallId } : {}), arguments: mapped, result: a.call!.resultBinding, ...objects, ...(target ? { pathHint: `${target.path}:${target.startLine}-${target.endLine}`, candidateId: target.id } : {}) })
        }
      } else if (a.kind === "assignment" && a.name) {
        if (finite && flow.some(n => n.kind === "short-circuit" && n.resultBinding === a.name)) continue
        const fromCall = skeleton.anchors.some(c => c.call?.resultNames.includes(a.name!) && c.call.expression + "(" === a.valueExpression?.slice(0, c.call.expression.length + 1))
        if (!fromCall || annotation?.aliasAnchorId) block.steps.push(finite && !annotation?.aliasAnchorId && bindingType(annotation) === "value" && !a.literalKnown ? { kind: "assign-value", name: `assign-${a.id}`, claim, result: a.name, value: sourceValue(a.valueExpression) } : bind(a))
      }
    }
  }
  compile(skeleton.flow, unit.start, prologue)
  return { diagnostics, interpretation, unit, ...(demand ? { demand } : {}) }
}
