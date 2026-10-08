import { canonicalControl } from "./control-slice.ts"
import type { BoundSemanticBlock } from "./semantic-flow.ts"
import type { Scalar } from "./control-evaluation.ts"
import { createHash } from "node:crypto"
import type { PropertyKind } from "./property-query.ts"
import type { SourceSkeleton, SourceAnchor } from "../../benchmarks/authorization-dsl/evidence-preparation/source-skeleton.ts"
import type { StructureIndex } from "../../benchmarks/authorization-dsl/evidence-preparation/structure-index.ts"
import { sourceArgumentBindings } from "../../benchmarks/authorization-dsl/evidence-preparation/source-arguments.ts"

type Step = BoundSemanticBlock["blocks"][number]["steps"][number]
export interface ProcedureVariant { kind: "return" | "reject"; value?: Scalar; object?: string; steps?: Step[]; failureKind?: "authorization" | "operation"; condition?: Record<string, unknown>; claims: string[] }
const all = (args: Record<string, unknown>[]) => args.length === 0 ? undefined : args.length === 1 ? args[0] : { op: "all", args }
const any = (args: Record<string, unknown>[]) => args.length === 0 ? undefined : args.length === 1 ? args[0] : { op: "any", args }
/** Finite parameterized helper summaries. Calls/dynamic bodies retain exact expansion. */
export function summarizeProcedure(unit: BoundSemanticBlock, scope?: { questionId: string; kind: PropertyKind; object?: string }) {
  const variants: ProcedureVariant[] = [], gaps: string[] = []
  // Summary conditions precede retained steps. Assignments must keep their source order.
  const requiresExactOrder = unit.blocks.some(b => b.steps.some(s => s.kind === "bind" || s.kind === "transform"))
  const walk = (block: string, conditions: Record<string, unknown>[], claims: string[], stack: string[], retained: Step[] = [], suffix: Step[] = []) => {
    if (stack.includes(block) || stack.length >= 12) { gaps.push("summary-cycle"); return }
    const body = unit.blocks.find(b => b.name === block)
    if (!body) { gaps.push("summary-body-missing"); return }
    const steps = [...body.steps, ...suffix]
    const visit = (index: number, tests: Record<string, unknown>[], seen: string[], trail: Step[]) => {
      if (variants.length > 64) { gaps.push("summary-variant-limit"); return }
      const step = steps[index]
      if (!step) { gaps.push("summary-return-missing"); return }
      const text = [...seen, step.claim]
      const common = { ...(all(tests) ? { condition: all(tests) } : {}), ...(trail.length ? { steps: structuredClone(trail) } : {}), claims: text }
      if (step.kind === "return") variants.push({ kind: "return", ...(Object.hasOwn(step, "value") ? { value: step.value } : {}), ...(step.object ? { object: step.object } : {}), ...common })
      else if (step.kind === "reject") variants.push({ kind: "reject", ...(step.failureKind ? { failureKind: step.failureKind } : {}), ...common })
      else if (step.kind === "guard") {
        if (step.principal || step.resource || !step.condition) visit(index + 1, tests, text, [...trail, step])
        else visit(index + 1, [...tests, step.condition], text, trail)
      } else if (["bind", "effect", "transform", "context"].includes(step.kind)) visit(index + 1, tests, text, [...trail, step])
      else if (step.kind === "choose") {
        const prior: Record<string, unknown>[] = []
        for (const branch of step.cases) {
          const reach = prior.length ? { op: "all", args: [branch.condition, { op: "not", arg: any([...prior]) }] } : branch.condition
          walk(branch.body, [...tests, reach], text, [...stack, block], trail, steps.slice(index + 1)); prior.push(branch.condition)
        }
        if (step.otherwise) walk(step.otherwise, [...tests, { op: "not", arg: any(prior) }], text, [...stack, block], trail, steps.slice(index + 1))
        else gaps.push("summary-choice-uncovered")
      } else gaps.push("summary-needs-exact-expansion")
    }
    visit(0, conditions, claims, retained)
  }
  if (unit.complete) walk(unit.start, [], [], [])
  else gaps.push("summary-source-incomplete")
  const groups = new Map<string, ProcedureVariant[]>()
  for (const v of variants) { const key = canonicalControl([v.kind, Object.hasOwn(v, "value"), v.value, v.object, v.steps, v.failureKind]); groups.set(key, [...(groups.get(key) ?? []), v]) }
  const joined = [...groups.values()].map(list => ({ ...list[0]!, ...(list.every(v => v.condition) ? { condition: any(list.map(v => v.condition!)) } : { condition: undefined }), claims: [...new Set(list.flatMap(v => v.claims))] }))
  const steps = unit.blocks.flatMap(b => b.steps)
  const residuals = scope ? steps.flatMap(s => s.kind === "context" || s.kind === "call" || s.kind === "unresolved" || s.kind === "transform" ? [{ questionId: scope.questionId, property: scope.kind, object: scope.object ?? null, step: s.name, code: s.kind === "context" ? "summary-context-influence-unresolved" : s.kind === "transform" ? "summary-object-mutation" : s.kind === "call" ? "summary-call-influence-unresolved" : "summary-source-unresolved" }] : []) : []
  return { handle: unit.handle, source: unit.source, parameters: unit.parameters, evidenceIds: [...unit.evidenceIds], complete: unit.complete, composable: !requiresExactOrder && gaps.length === 0 && joined.length > 0 && joined.length <= 16, requiresExactOrder, variants: joined, gaps: [...new Set(gaps)], semanticSupport: "unreviewed" as const,
    ...(scope ? { propertyScope: { ...scope, validation: "proposed-unit-structure" as const, semanticReview: "unreviewed" as const, sourceBound: !!unit.source, conditions: joined.map(v => v.condition ?? null), returns: joined.filter(v => v.kind === "return").map(v => ({ value: v.value, object: v.object })), rejections: joined.filter(v => v.kind === "reject").map(v => ({ failureKind: v.failureKind })), effects: steps.filter(s => s.kind === "effect"), mutations: steps.filter(s => s.kind === "transform"), residuals } } : {}) }
}

/** Deliberately tiny source proof: a bound parameter or finite local literal
 * returned by an ordinary flat body. No context annotation can grant purity. */
export function summarizeSourceProcedure(skeleton: SourceSkeleton) {
  const parameters = skeleton.anchors.filter(a => a.kind === "parameter").map(a => a.name!).filter(Boolean), residuals: Array<{ anchorId: string; code: string }> = []
  let returnRelation: { parameter?: string; literal?: unknown } | undefined
  for (const node of skeleton.flow) {
    const a = skeleton.anchors.find(a => a.id === node.anchorId)!
    if (node.kind === "step" && a?.kind === "assignment" && a.dependencyFacts?.pureLocal && a.literalKnown && a.name && /^[A-Za-z_]\w*$/.test(a.name) && !parameters.includes(a.name)) { /* finite local store has no external influence */ }
    else if (a?.kind === "return" && (a.literalKnown || a.valueExpression && parameters.includes(a.valueExpression))) returnRelation = a.literalKnown ? { literal: a.literalValue } : { parameter: a.valueExpression }
    else residuals.push({ anchorId: a?.id ?? node.anchorId, code: a?.kind === "call" ? "summary-call-influence-unresolved" : a?.fieldWrite ? "summary-object-mutation" : "summary-source-shape-unresolved" })
  }
  if (!skeleton.modelCovered || skeleton.gaps.length || !skeleton.anchors.find(a => a.id === skeleton.flow.at(-1)?.anchorId && a.kind === "return") || !returnRelation) residuals.push({ anchorId: skeleton.sourceId, code: "summary-source-incomplete" })
  const usable = residuals.length === 0
  const body = { schemaVersion: "authorization-procedure-property-summary/v1" as const, source: structuredClone(skeleton.source), sourceRevision: skeleton.revision, parameters, returnRelation, usable, residuals,
    applicableProperties: usable ? ["authorization-before-effect", "authorized-object-matches-effect", "effect-reachability", "operation-completion"] as PropertyKind[] : [], mutations: [] as unknown[], exceptions: [] as unknown[], validation: "mechanical-source-shape" as const, semanticReview: "unreviewed" as const }
  return { ...body, revision: createHash("sha256").update(JSON.stringify(body)).digest("hex") }
}
export type SourceProcedureSummary = ReturnType<typeof summarizeSourceProcedure>
export interface PropertyCallSummary { anchorId: string; sourceCallId: string; callerRevision: string; receiverClass?: string; targetId: string; targetSha256: string; summary: SourceProcedureSummary; argumentRevision: string }
export function bindSourceProcedureSummary(index: StructureIndex, caller: SourceSkeleton, anchor: SourceAnchor, callee: SourceSkeleton): PropertyCallSummary | undefined {
  const sourceCall = anchor.call && index.relatedCalls(caller.sourceId, anchor.call.receiverClass).find(c => c.id === anchor.call!.sourceCallId), target = index.symbols.find(s => s.id === callee.sourceId), summary = summarizeSourceProcedure(callee)
  if (!sourceCall || !target || sourceCall.gap || sourceCall.sha256 !== caller.source.sha256 || sourceCall.candidateIds.length !== 1 || sourceCall.candidateIds[0] !== target.id || target.sha256 !== callee.source.sha256 || target.className || target.localCallable || target.attributes.async || target.attributes.generator || target.decorators?.length || sourceCall.receiverClass || !summary.usable || anchor.call!.arguments.some(a => a.spread || !a.literalKnown && !/^[A-Za-z_]\w*$/.test(a.expression))) return undefined
  // Returned values need full alias/value composition. This first adoption is
  // restricted to an ordinary body call whose return value is unused.
  if (sourceCall.syntaxRole !== "body" || anchor.call!.resultNames.length) return undefined
  const binding = sourceArgumentBindings(index, sourceCall, target)
  if (binding.gap) return undefined
  return { anchorId: anchor.id, sourceCallId: sourceCall.id, callerRevision: caller.revision, receiverClass: sourceCall.receiverClass, targetId: target.id, targetSha256: target.sha256, summary, argumentRevision: createHash("sha256").update(JSON.stringify(binding)).digest("hex") }
}
