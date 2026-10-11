import type { StructureIndex } from "./evidence-preparation/structure-index.ts"
import type { SourceSkeleton } from "./evidence-preparation/source-skeleton.ts"
import { sourceArgumentBindings } from "./evidence-preparation/source-arguments.ts"
import { partialEvaluate, finiteValue, type FiniteValue } from "../../task-dsl/authorization/control-evaluation.ts"

export interface SourceReviewScenario { skeletons: SourceSkeleton[]; callReturns?: Record<string, FiniteValue>; locals?: Record<string, FiniteValue> }
interface ReviewValue { known: boolean; value?: FiniteValue; gap?: string; trace: Array<{ expression: string; sourceId?: string; startLine?: number }> }
/** An offline review aid for finite source argument facts, not an authorization
 * interpreter. Scenario inputs are independent review data and never enter the
 * domain runtime. Unsupported, conditional and unread assignments stay unknown. */
export function reviewSourceCallArgument(index: StructureIndex, sourceCallId: string, parameter: string, scenario: SourceReviewScenario) {
  const calls = index.symbols.flatMap(s => index.relatedCalls(s.id)).filter(c => c.id === sourceCallId)
  const unknown = (gap: string): ReviewValue => ({ known: false, gap, trace: [] })
  const call = calls[0], target = call?.candidateIds.length === 1 && index.symbols.find(s => s.id === call.candidateIds[0])
  const identity = { sourceCallId, parameter, source: call && { id: call.ownerId, path: call.path, sha256: call.sha256, startLine: call.startLine, endLine: call.endLine } }
  if (calls.length !== 1 || !target) return { ...identity, ...unknown("review-call-unresolved") }
  const bound = sourceArgumentBindings(index, call!, target), argument = bound.bindings.find(b => b.parameter === parameter)
  if (bound.gap || !argument) return { ...identity, ...unknown(bound.gap ?? "review-parameter-unbound") }
  const owner = scenario.skeletons.find(s => s.sourceId === call!.ownerId && s.source.sha256 === call!.sha256 && s.modelCovered)
  const active = new Set<string>()
  const evaluate = (expression: string): ReviewValue => {
    expression = expression.trim()
    const trace = [{ expression }], known = (value: FiniteValue): ReviewValue => ({ known: true, value, trace })
    if (active.has(expression) || active.size >= 12) return unknown("review-value-cycle")
    if (Object.hasOwn(scenario.locals ?? {}, expression) && finiteValue(scenario.locals![expression])) return known(scenario.locals![expression]!)
    if (Object.hasOwn(scenario.callReturns ?? {}, expression) && finiteValue(scenario.callReturns![expression])) return known(scenario.callReturns![expression]!)
    if (["True", "False", "None"].includes(expression)) return known(expression === "None" ? null : expression === "True")
    const presence = /^(.+?)\s+is\s+(not\s+)?None$/.exec(expression)
    if (presence) {
      active.add(expression); const input = evaluate(presence[1]!); active.delete(expression)
      if (!input.known) return { ...input, trace: [...trace, ...input.trace] }
      const predicate = { op: "is-null", value: { literal: input.value } }, result = partialEvaluate(presence[2] ? { op: "not", arg: predicate } : predicate, {})
      return { known: result.truth !== "unknown", ...(result.truth !== "unknown" ? { value: result.truth === "true" } : { gap: result.diagnostics.join(",") }), trace: [...trace, ...input.trace] }
    }
    const assignment = owner?.anchors.filter(a => a.kind === "assignment" && a.name === expression && a.selector.endLine! < call!.startLine && a.valueExpression)
    // Only top-level assignments have an unconditional source-before relation.
    const topLevel = new Set(owner?.flow.filter(f => f.kind === "step").map(f => f.anchorId))
    if (assignment?.length !== 1 || !topLevel.has(assignment[0]!.id)) return { ...unknown("review-value-unresolved"), trace }
    active.add(expression); const value = evaluate(assignment[0]!.valueExpression!); active.delete(expression)
    return { ...value, trace: [{ expression, sourceId: owner!.sourceId, startLine: assignment[0]!.selector.startLine }, ...value.trace] }
  }
  return { ...identity, expression: argument.expression, ...(argument.literalKnown ? { known: true, value: argument.literalValue, trace: [{ expression: argument.expression }] } : owner ? evaluate(argument.expression) : unknown("review-source-unread")) }
}
export function compareSourceCallArgument(actual: { known: boolean; value?: FiniteValue }, claimed: FiniteValue) {
  return { status: !actual.known ? "unresolved" as const : JSON.stringify(actual.value) === JSON.stringify(claimed) ? "consistent" as const : "contradiction" as const, actual: actual.value, claimed }
}

/** Inspect one actual source return under explicit offline scenario values. */
export function reviewSourceReturn(skeleton: SourceSkeleton | undefined, line: number, locals: Record<string, FiniteValue>): ReviewValue {
  const candidates = skeleton?.modelCovered ? skeleton.anchors.filter(a => a.kind === "return" && a.selector.startLine === line) : []
  if (candidates?.length !== 1 || !candidates[0]?.valueExpression) return { known: false, gap: "review-return-unresolved", trace: [] }
  const expression = candidates[0].valueExpression, trace = [{ expression, sourceId: skeleton!.sourceId, startLine: line }]
  const alternatives = expression.split(/\s+or\s+/)
  if (!alternatives.every(name => Object.hasOwn(locals, name) && finiteValue(locals[name]))) return { known: false, gap: "review-value-unresolved", trace }
  for (const [i, name] of alternatives.entries()) {
    const value = locals[name]!, truth = partialEvaluate({ op: "truthy", language: "python", value: { literal: value } }, {})
    if (truth.truth === "unknown") return { known: false, gap: "review-value-unresolved", trace }
    if (truth.truth === "true" || i === alternatives.length - 1) return { known: true, value, trace }
  }
  return { known: false, gap: "review-value-unresolved", trace }
}

export interface AnswerFactReview { questionId: string; references?: string[]; facts: Array<{ id: string; status: "consistent" | "contradiction" | "unresolved" }> }
/** Aggregate an independent full-text factual review. A reviewer supplies facts
 * and real cross references; this never derives quality from a model verdict,
 * keyword list, DSL success, or an old answer. Original ratings stay separate. */
export function reviewWholeAnswerFacts(requirements: Record<string, string[]>, answers: AnswerFactReview[]) {
  const ids = Object.keys(requirements), diagnostics: string[] = []
  for (const id of ids) if (answers.filter(a => a.questionId === id).length !== 1) diagnostics.push(`review-question-identity:${id}`)
  for (const answer of answers) {
    if (!ids.includes(answer.questionId)) diagnostics.push(`review-question-unknown:${answer.questionId}`)
    for (const id of answer.references ?? []) if (!ids.includes(id)) diagnostics.push(`review-reference-unknown:${answer.questionId}:${id}`)
  }
  const contradictions = new Set(answers.flatMap(a => a.facts.filter(f => f.status === "contradiction").map(f => f.id)))
  const questions = ids.map(questionId => {
    const visited = new Set<string>(), facts: AnswerFactReview["facts"] = []
    const visit = (id: string) => { if (visited.has(id)) return; visited.add(id); const answer = answers.find(a => a.questionId === id); if (!answer) return; facts.push(...answer.facts); for (const ref of answer.references ?? []) visit(ref) }
    visit(questionId)
    const missing = requirements[questionId]!.filter(id => !facts.some(f => f.id === id && f.status === "consistent")), conflicts = requirements[questionId]!.filter(id => contradictions.has(id))
    return { questionId, equivalent: !missing.length && !conflicts.length, missing, conflicts, readTogether: [...visited] }
  })
  return { equivalent: !diagnostics.length && questions.every(q => q.equivalent), questions, diagnostics, basis: "independent-whole-answer-source-review" as const }
}
