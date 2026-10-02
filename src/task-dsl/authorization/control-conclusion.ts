import type { AuthorizationInquiryProgram } from "./inquiry-program.ts"
import { AuthorizationInquiryResultSchema } from "./inquiry-result.ts"
import type { InquiryDiagnostic } from "./inquiry.ts"
import { controlBindings, canonicalControl, type ControlSlice, type BoundControlRule } from "./control-slice.ts"
import { partialEvaluate, type PartialPredicate } from "./control-evaluation.ts"

export interface DependencyCheckState { key: string; questionId: string; pathKey: string; state: string; decisive: boolean; symbol: string }
const diag = (code: string, path: string, message: string): InquiryDiagnostic => ({ code, path, message, severity: "error" })
/** Explicit predecessor closure, independent of array ordering. No lexical call is accepted as control proof. */
export function controlRuleReach(slice: ControlSlice, rule: BoundControlRule, evaluateConditions = true) {
  const ancestors: BoundControlRule[] = [], gaps: string[] = [], active = new Set<string>(), done = new Set<string>()
  const visit = (node: BoundControlRule): void => {
    if (active.has(node.key)) { gaps.push(`cycle:${node.key}`); return }
    if (done.has(node.key)) return
    active.add(node.key)
    for (const key of node.after) {
      const parent = slice.rules.find(r => r.questionId === rule.questionId && r.key === key)
      if (!parent) gaps.push(`predecessor-missing:${key}`); else visit(parent)
    }
    active.delete(node.key); done.add(node.key); ancestors.push(node)
  }
  visit(rule)
  const condition = { op: "all", args: ancestors.flatMap(r => r.condition ? [r.condition] : []) }
  const predicate: PartialPredicate = evaluateConditions ? partialEvaluate(condition, controlBindings(slice, rule.questionId)) : { truth: "unknown", residual: condition, missingBindings: [], trace: [], diagnostics: [] }
  const stoppedBy = ancestors.filter(r => r.key !== rule.key && r.kind === "reject").map(r => r.key)
  return { ancestors, gaps, predicate, condition, stoppedBy }
}
export interface ControlPathEvaluation {
  questionId: string; pathKey: string; state: "checked" | "inapplicable" | "blocked"; disposition: "allow" | "deny" | "unknown";
  complete: boolean; predicate: PartialPredicate; condition: unknown; nodeKeys: string[]; terminalKeys: string[]; gaps: string[]; sourceBound: boolean
}
export function evaluateControlPaths(slice: ControlSlice): { paths: ControlPathEvaluation[]; diagnostics: InquiryDiagnostic[]; calculationCount: number } {
  const paths: ControlPathEvaluation[] = [], diagnostics: InquiryDiagnostic[] = []
  let calculationCount = 0
  for (const questionId of new Set(slice.rules.map(r => r.questionId))) {
    const rules = slice.rules.filter(r => r.questionId === questionId), terminals = rules.filter(r => r.kind === "effect" || r.kind === "reject")
    const groups = new Map<string, BoundControlRule[]>()
    for (const terminal of terminals.length ? terminals : rules) groups.set(terminal.pathKey, [...(groups.get(terminal.pathKey) ?? []), terminal])
    if (groups.size > 16) diagnostics.push(diag("control-path-limit", questionId, `${groups.size} proposed paths exceed 16; additional paths remain explicit residuals, task is not closed.`))
    for (const [pathKey, nodes] of groups) {
      const reaches = nodes.map(n => { calculationCount++; return { node: n, ...controlRuleReach(slice, n) } })
      const live = reaches.filter(r => r.predicate.truth !== "false" && !r.stoppedBy.length)
      for (const r of reaches) if (r.node.kind === "effect" && r.stoppedBy.length && r.predicate.truth !== "false") diagnostics.push(diag("effect-after-reject", `${questionId}.${pathKey}.${r.node.key}`, `Effect follows terminating rejection ${r.stoppedBy.join(", ")}.`))
      const outcomes = new Set(live.filter(r => r.node.kind === "effect" || r.node.kind === "reject").map(r => r.node.kind === "reject" ? "deny" : "allow"))
      if (outcomes.size > 1) diagnostics.push(diag("path-outcome-conflict", `${questionId}.${pathKey}`, "The same proposed feasible path has conflicting terminal outcomes. Split genuine alternatives with explicit predicates and distinct path keys."))
      const gaps = [...new Set(live.flatMap(r => [...r.gaps, ...(!r.ancestors.some(n => n.kind === "entry") ? ["entry-missing"] : []), ...(!r.node.complete ? ["closure-not-proposed"] : []), ...r.predicate.diagnostics]))]
      const complete = live.length > 0 && outcomes.size === 1 && !gaps.length && groups.size <= 16
      const predicates = live.map(r => r.condition)
      const condition = predicates.length === 1 ? predicates[0] : { op: "any", args: predicates }
      const predicate = partialEvaluate(condition, controlBindings(slice, questionId)); calculationCount++
      paths.push({ questionId, pathKey, state: !live.length ? "inapplicable" : complete ? "checked" : "blocked", disposition: complete ? [...outcomes][0]! as "allow" | "deny" : "unknown", complete, predicate, condition, nodeKeys: [...new Set(live.flatMap(r => r.ancestors.map(n => n.key)))], terminalKeys: live.map(r => r.node.key), gaps, sourceBound: reaches.every(r => r.ancestors.every(n => n.sourceBound)) })
    }
  }
  return { paths, diagnostics, calculationCount }
}
export function checkControlConclusions(program: AuthorizationInquiryProgram, slice: ControlSlice, input: unknown, dependencies: DependencyCheckState[]) {
  const parsed = AuthorizationInquiryResultSchema.safeParse(input), evaluated = evaluateControlPaths(slice), diagnostics = [...evaluated.diagnostics]
  const policyComparisons: Array<{ questionId: string; status: "satisfied" | "violated" | "undetermined"; origin: "host-derived-from-proposed-policy"; semanticSupport: "unreviewed" }> = []
  if (!parsed.success) return { ...evaluated, structureValid: false, sourceBound: false, ruleConsistency: false, semanticSupport: "unreviewed" as const, taskResolution: "partial" as const, diagnostics: [diag("control-result-schema", "$", "Result has no valid structured behavior to compare.")], policyComparisons }
  for (const conflict of slice.conflicts.filter(c => !c.resolved)) diagnostics.push(diag("control-conflict", conflict.id, "Unresolved conflicting extraction remains; explicit correction is needed."))
  for (const rule of slice.rules) {
    const reach = controlRuleReach(slice, rule)
    if (reach.predicate.truth === "false" || reach.stoppedBy.length) continue
    for (const field of ["principal", "resource"] as const) {
      if (!rule[field] || (rule.kind === "binding" && rule.bindingKind === field && rule.bindingKey === rule[field])) continue
      const declared = slice.rules.filter(r => r.questionId === rule.questionId && r.kind === "binding" && r.bindingKey === rule[field] && r.bindingKind === field)
      const preceding = declared.filter(r => r.key !== rule.key && reach.ancestors.some(a => a.id === r.id))
      if (!declared.length) diagnostics.push(diag("object-binding-missing", rule.key, `Typed ${field} ${rule[field]} is not bound in this question.`))
      else if (!preceding.length) diagnostics.push(diag("object-binding-unreachable", rule.key, `Typed ${field} ${rule[field]} has no binding among this rule's reachable explicit predecessors.`))
      else if (preceding.length > 1) diagnostics.push(diag("object-binding-conflict", rule.key, `Typed ${field} ${rule[field]} resolves to multiple distinct predecessor bindings (${preceding.map(r => r.key).join(", ")}); use separate identity keys or explicitly revise the mistaken binding.`))
    }
    for (const key of rule.authorizedBy ?? []) {
      const guard = slice.rules.find(r => r.questionId === rule.questionId && r.key === key && r.kind === "guard")
      if (!guard) diagnostics.push(diag("authorization-edge-missing", rule.key, `Claimed authorizing guard ${key} is absent.`))
      else {
        if (!guard.resource || !rule.resource || !guard.principal || !rule.principal || guard.resource !== rule.resource || guard.principal !== rule.principal) diagnostics.push(diag("control-object-mismatch", rule.key, "Claimed authorizing control and protected effect lack the same explicit principal/resource identity. Equal labels or identifiers do not establish it."))
        if (!reach.ancestors.some(r => r.key === key && r.key !== rule.key)) diagnostics.push(diag("control-order-missing", rule.key, "Claimed guard is not an explicit predecessor of this effect."))
      }
    }
  }
  for (const answer of parsed.data.questions) {
    const paths = evaluated.paths.filter(p => p.questionId === answer.questionId), live = paths.filter(p => p.state !== "inapplicable")
    const relevant = dependencies.filter(d => d.questionId === answer.questionId && d.state !== "inapplicable")
    const open = relevant.filter(d => d.decisive && d.state !== "checked")
    const unacknowledged = open.filter(d => !answer.missing.some(m => (m.kind === "source-gap" || d.state === "external-unknown" && m.kind === "dependency-out-of-scope") && [d.key, d.symbol].some(key => `${m.detail} ${m.nextRead ?? ""}`.includes(key))))
    if (unacknowledged.length) diagnostics.push(diag("decisive-dependency-open", answer.questionId, `Decisive source dependencies remain without a corresponding source gap: ${unacknowledged.map(d => `${d.key}:${d.state}`).join(", ")}. An unspecified user premise or deployment fact cannot conceal them.`))
    if (answer.behavior.disposition !== "unknown" && (!live.length || live.some(p => !p.complete))) diagnostics.push(diag("path-not-closed", answer.questionId, "Current rule slice has no fully linked entry-to-terminal description of every proposed active path; preserve a local gap."))
    for (const branch of answer.branches) {
      const path = paths.find(p => p.pathKey === branch.id)
      if (path?.state === "inapplicable") diagnostics.push(diag("inapplicable-branch", `${answer.questionId}.${branch.id}`, "Explicit current premises or an earlier rejection exclude this branch."))
      else if (path?.complete && branch.disposition !== path.disposition) diagnostics.push(diag("branch-rule-conflict", `${answer.questionId}.${branch.id}`, `Proposed rules derive ${path.disposition}, raw branch claims ${branch.disposition}.`))
    }
    const outcomes = new Set(live.filter(p => p.complete).map(p => p.disposition))
    if (["allow", "deny"].includes(answer.behavior.disposition) && live.length && live.every(p => p.complete) && (outcomes.size !== 1 || !outcomes.has(answer.behavior.disposition as "allow" | "deny"))) diagnostics.push(diag("behavior-rule-conflict", answer.questionId, `Proposed active rules derive ${[...outcomes].join("/")}, raw behavior claims ${answer.behavior.disposition}.`))
    if (answer.behavior.disposition === "conditional") for (const path of live.filter(p => p.complete)) if (!answer.branches.some(b => b.id === path.pathKey)) diagnostics.push(diag("active-branch-missing", `${answer.questionId}.${path.pathKey}`, "Proposed active path is missing from the conditional answer. Match branch id to pathKey."))
    const inactiveDependencies = dependencies.filter(d => d.questionId === answer.questionId && d.state === "inapplicable")
    for (const missing of answer.missing) if (missing.kind === "source-gap" && inactiveDependencies.some(d => `${missing.detail} ${missing.nextRead ?? ""}`.includes(d.symbol))) diagnostics.push(diag("irrelevant-dependency-gap", answer.questionId, "A named missing dependency is unreachable after accepted early rejection/current premises."))
    if (answer.behavior.disposition === "unknown" && live.length && live.every(p => p.complete) && !open.length && outcomes.size === 1 && live.every(p => p.predicate.truth === "true")) diagnostics.push(diag("overstated-unknown", answer.questionId, "Accepted rules already yield a current determinate outcome; any additional decisive gap must be represented locally."))
    if (program.mode === "conformance") {
      let mismatches = 0, unmapped = !live.length
      for (const path of live) {
        const mappings = slice.policyRules.filter(p => p.questionId === path.questionId && p.pathKey === path.pathKey && (!p.condition || partialEvaluate(p.condition, controlBindings(slice, path.questionId)).truth === "true" || canonicalControl(p.condition) === canonicalControl(path.predicate.residual)))
        if (!path.complete || mappings.length !== 1) { unmapped = true; continue }
        if (path.disposition !== mappings[0]!.expected) mismatches++
      }
      const status = mismatches ? "violated" : unmapped ? "undetermined" : "satisfied"
      policyComparisons.push({ questionId: answer.questionId, status, origin: "host-derived-from-proposed-policy", semanticSupport: "unreviewed" })
      if (answer.policyAssessment && answer.policyAssessment.status !== status) diagnostics.push(diag("policy-behavior-conflict", answer.questionId, `Current independent policy mappings yield ${status}; raw assessment claims ${answer.policyAssessment.status}. Incomplete mappings must remain undetermined.`))
    }
  }
  const unique = diagnostics.filter((d, i) => diagnostics.findIndex(v => v.code === d.code && v.path === d.path && v.message === d.message) === i)
  return { structureValid: true, sourceBound: slice.rules.length > 0 && slice.rules.every(r => r.sourceBound), ruleConsistency: !unique.length, semanticSupport: "unreviewed" as const, taskResolution: unique.length || !evaluated.paths.length || evaluated.paths.some(p => p.state === "blocked") || dependencies.some(d => d.decisive && !["checked", "inapplicable"].includes(d.state)) ? "partial" as const : "bounded" as const, paths: evaluated.paths, diagnostics: unique, policyComparisons, calculationCount: evaluated.calculationCount }
}
