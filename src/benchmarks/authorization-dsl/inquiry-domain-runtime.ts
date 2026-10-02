import type { AuthorizationInquiryProgram } from "../../task-dsl/authorization/inquiry-program.ts"
import { ControlSliceDeltaSchema, createControlSlice, mergeControlSlice, type ControlSlice } from "../../task-dsl/authorization/control-slice.ts"
import { evaluateControlPaths, checkControlConclusions } from "../../task-dsl/authorization/control-conclusion.ts"
import type { InquiryDiagnostic } from "../../task-dsl/authorization/inquiry.ts"
import type { InquiryTools } from "./inquiry-tools.ts"
import { createInquiryDomainScheduler } from "./inquiry-domain-scheduler.ts"

export type DomainAblation = "scheduler-off" | "checks-off"
export const DOMAIN_EXECUTION_GUIDE = [
  "domain-evidence-v1 runtime: propose local control deltas from ACTUALLY SHOWN original source, never from task expectations. Host binds citations, executes at most two uniquely located dependency reads per response, evaluates finite predicates and checks formal conclusion consistency. Extraction meaning stays unreviewed.",
  'Delta is {schemaVersion:"authorization-control-slice/v1",rules:[],dependencies:[],bindings:[],policyRules:[]}. Arrays may be omitted when unchanged. Local rules: {key,questionId,pathKey,kind:entry|binding|guard|reject|continue|effect,after:[predecessor keys],evidenceIds:[shown source IDs],claim,condition?,principal?,resource?,operation?,bindingKey?,bindingKind:principal|resource|permission|configuration|value,authorizedBy?:[guard keys],complete?:boolean}. Only binding nodes need bindingKey/bindingKind. Reject is terminating deny, effect is protected allow. after is explicit execution precedence, never array order. Each terminal represents one proposed path, complete only when all relevant entry/upstream/binding/control/effect dependencies have actually been examined. Related alternative outcomes use distinct pathKeys matching final branch IDs. condition is node reachability, NOT the proposition that a guard passes. Shared entry/binding nodes can precede multiple paths.',
  "Use different typed identity keys for different objects even if labels/IDs match. authorizedBy asserts that a particular guard controls THIS effect on the same principal/resource; omit the assertion if no such linkage is established, and explain source-visible missing control rather than inventing a guard. Do not assume a checked input object also authorizes an output object.",
  'Predicates support only {op:eq|neq,left:{binding:name}|{literal:scalar},right:{binding:name}|{literal:scalar}}, {op:is-null,value:{binding:name}|{literal:scalar}}, {op:all|any,args:[predicates]}, {op:not,arg:predicate}; scalar is string/number/boolean/null. BOTH operands must be wrapped, for example {op:"eq",left:{binding:"flag"},right:{literal:false}}; bare right:false is invalid. Max depth12/nodes64. No target code, arbitrary operator or natural text is evaluated. Known bindings are only explicit USER premises: {questionId,key,value,origin:user,text:<exact span of current request/premise>}. This mapping is a model interpretation, not source truth; unspecified values stay unknown, distinct from null. Represent source outcomes with rules/conditions, do not invent user binding values from source.',
  "Dependencies: {key,questionId,pathKey,from:<accepted source rule key>,symbol:<name appearing in cited source>,kind:principal-binding|resource-binding|control|effect|exception,decisive:boolean,evidenceIds:[source reference IDs],reason,condition?,after?:[preceding control keys],parent?:dependency key,pathHint?:exact indexed path,candidateId?:shown candidate id}. Host uses a lexical location index, not a semantic call graph. Ambiguous candidates require an explicit pathHint/candidateId revision; missing/outside/dynamic facts stay local gaps. Place a dependency after a reject only if source order actually makes it unreachable. After an automatic read, incorporate the returned original evidence into a linked rule before calling a decisive dependency checked.",
  "Policy mappings are separate candidates: {key,questionId,pathKey,expected:allow|deny,origin:policy,text:<exact policy span>,location:<current independent location>,condition?}. Map only the supplied policy, do not derive it from implementation. Each live path needs a mapping for a determined policy assessment; incomplete mappings remain undetermined while behavior is deliverable. Formal policy mapping is still unreviewed.",
  "Same-key duplicate is idempotent. To correct a conflicting accepted proposal, supply revisionOf:<host-returned digest> and revisionReason; no silent overwrite. Keep gaps local; one irrelevant relationship does not invalidate other questions. Host feedback is formal computation on proposed rules, not a source-semantic or deployment proof. At most64 nodes/question and16 paths/question; overflow remains a named gap.",
].join("\n")

/** One shared state machine used by structured inquiry and ordinary native tools. */
export function createInquiryDomainRuntime(options: { program: AuthorizationInquiryProgram; tools: InquiryTools; remainingActions?: () => number; ablation?: DomainAblation; suppliedUserText?: string[] }) {
  let slice: ControlSlice = createControlSlice(), check: ReturnType<typeof checkControlConclusions> | undefined, closed = false
  const scheduler = createInquiryDomainScheduler({ ...options, evaluateConditions: options.ablation !== "checks-off" }), proposals: Array<{ delta: unknown; diagnostics: InquiryDiagnostic[]; revision: number }> = []
  let lastPaths: ReturnType<typeof evaluateControlPaths>["paths"] = []
  const issues = new Map<string, InquiryDiagnostic[]>(), computation = { merges: 0, pathEvaluations: 0, conclusionChecks: 0, predicateEvaluations: 0, durationMs: 0 }
  const checkHistory: Array<{ revision: number; slice: ControlSlice; result: unknown; check: ReturnType<typeof checkControlConclusions> }> = []
  const evidenceContext = () => ({ questionIds: options.program.questions.map(q => q.id), shownEvidenceIds: options.tools.evidence.map(e => e.id), suppliedUserText: options.suppliedUserText })
  const calculate = <T>(fn: () => T): T => { const started = performance.now(); try { return fn() } finally { computation.durationMs += performance.now() - started } }
  const sync = async (execute = true) => {
    if (closed) throw new Error("session-closed: domain runtime cannot continue")
    const actions = await scheduler.run(slice, execute && options.ablation !== "scheduler-off" ? 2 : 0)
    const evaluated = options.ablation === "checks-off" ? { paths: [], diagnostics: [], calculationCount: 0 } : calculate(() => evaluateControlPaths(slice))
    lastPaths = evaluated.paths
    if (options.ablation !== "checks-off") { computation.pathEvaluations++; computation.predicateEvaluations += evaluated.calculationCount }
    return { actions, evaluated }
  }
  const propose = async (delta: unknown) => {
    if (closed) throw new Error("session-closed: domain runtime cannot continue")
    const parsed = ControlSliceDeltaSchema.safeParse(delta)
    const merged = calculate(() => mergeControlSlice(slice, delta, options.program, evidenceContext())); computation.merges++
    slice = merged.state; check = undefined
    if (parsed.success) {
      issues.delete("$schema")
      for (const group of ["rules", "dependencies", "bindings", "policyRules"] as const) for (const p of parsed.data[group]) issues.delete(`${group}.${p.key}`)
    } else issues.set("$schema", merged.diagnostics)
    for (const d of merged.diagnostics) if (parsed.success) issues.set(d.path, [...(issues.get(d.path) ?? []), d])
    proposals.push({ delta: structuredClone(delta), diagnostics: merged.diagnostics, revision: slice.revision })
    const { actions, evaluated } = await sync()
    return { diagnostics: merged.diagnostics, actions, evaluated }
  }
  const validate = async (result: unknown) => {
    await sync(false)
    if (options.ablation === "checks-off") check = { structureValid: true, sourceBound: slice.rules.length > 0 && slice.rules.every(r => r.sourceBound), semanticSupport: "unreviewed", ruleConsistency: true, taskResolution: "partial", paths: [], diagnostics: [...issues.values()].flat(), policyComparisons: [], calculationCount: 0 }
    else { check = calculate(() => checkControlConclusions(options.program, slice, result, scheduler.snapshot())); computation.conclusionChecks++; computation.predicateEvaluations += check.calculationCount; check = { ...check, diagnostics: [...issues.values()].flat().concat(check.diagnostics) } }
    checkHistory.push({ revision: slice.revision, slice: structuredClone(slice), result: structuredClone(result), check: structuredClone(check) })
    return check
  }
  const feedback = () => ({ revision: slice.revision,
    rules: slice.rules.map(({ key, questionId, pathKey, kind, after, condition, bindingKey, bindingKind, principal, resource, digest }) => ({ key, questionId, pathKey, kind, after, condition, bindingKey, bindingKind, principal, resource, digest })),
    bindings: slice.bindings, policyRules: slice.policyRules, dependencies: scheduler.snapshot(), paths: lastPaths,
    diagnostics: [...issues.values()].flat().concat(check?.diagnostics ?? []), semanticSupport: "unreviewed", ...(options.ablation ? { mechanismDisabled: options.ablation } : {}) })
  return { propose, sync, validate, feedback, close: () => { closed = true },
    report: () => ({ slice: structuredClone(slice), proposals: structuredClone(proposals), dependencies: scheduler.snapshot(), schedulerActions: structuredClone(scheduler.actions), check, checkHistory: structuredClone(checkHistory), computation: { ...computation }, ablation: options.ablation, closed }) }
}
