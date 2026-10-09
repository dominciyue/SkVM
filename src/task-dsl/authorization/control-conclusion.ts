import type { AuthorizationInquiryProgram } from "./inquiry-program.ts"
import { AuthorizationInquiryResultSchema, InquiryQuestionResultSchema } from "./inquiry-result.ts"
import { questionIdForDiagnostic, type InquiryDiagnostic } from "./inquiry.ts"
import { controlBindings, type ControlSlice, type BoundControlRule } from "./control-slice.ts"
import { partialEvaluate, equivalentPredicateConditions, type PartialPredicate } from "./control-evaluation.ts"
import type { PropertyDemand } from "./property-demand.ts"
import type { BoundSemanticBlock } from "./semantic-flow.ts"
import { validatePropertyQuestionMapping, type BoundPropertyQuery, type PropertySourceReference } from "./property-query.ts"

export interface DependencyCheckState { key: string; questionId: string; pathKey: string; state: string; decisive: boolean; symbol: string }
const diag = (code: string, path: string, message: string, questionId?: string): InquiryDiagnostic => ({ code, path, message, severity: "error", ...(questionId ? { questionId } : {}) })
export function diagnosticQuestionId(program: AuthorizationInquiryProgram, d: InquiryDiagnostic) {
  return questionIdForDiagnostic(program.questions.map(q => q.id), d)
}
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
  complete: boolean; predicate: PartialPredicate; condition: unknown; nodeKeys: string[]; terminalKeys: string[]; gaps: string[]; sourceBound: boolean;
  protectedEffect?: "none" | "performed" | "unresolved"; returnValues?: unknown[]
}
export function evaluateControlPaths(slice: ControlSlice): { paths: ControlPathEvaluation[]; diagnostics: InquiryDiagnostic[]; calculationCount: number } {
  const paths: ControlPathEvaluation[] = [], diagnostics: InquiryDiagnostic[] = []
  let calculationCount = 0
  for (const questionId of new Set(slice.rules.map(r => r.questionId))) {
    const rules = slice.rules.filter(r => r.questionId === questionId), terminals = rules.filter(r => r.terminal === true || r.terminal !== false && (r.kind === "effect" || r.kind === "reject"))
    const groups = new Map<string, BoundControlRule[]>()
    for (const terminal of terminals.length ? terminals : rules) groups.set(terminal.pathKey, [...(groups.get(terminal.pathKey) ?? []), terminal])
    if (groups.size > 16) diagnostics.push(diag("control-path-limit", questionId, `${groups.size} proposed paths exceed 16; additional paths remain explicit residuals, task is not closed.`))
    for (const [pathKey, nodes] of groups) {
      const reaches = nodes.map(n => { calculationCount++; return { node: n, ...controlRuleReach(slice, n) } })
      const live = reaches.filter(r => r.predicate.truth !== "false" && !r.stoppedBy.length)
      for (const r of reaches) if (r.node.kind === "effect" && r.stoppedBy.length && r.predicate.truth !== "false") diagnostics.push(diag("effect-after-reject", `${questionId}.${pathKey}.${r.node.key}`, `Effect follows terminating rejection ${r.stoppedBy.join(", ")}.`))
      const outcomes = new Set(live.flatMap(r => r.node.kind === "unresolved" ? [] : r.node.kind === "return" ? r.node.outcome && r.node.outcome !== "unknown" ? [r.node.outcome] : [] : r.node.kind === "reject" ? ["deny"] : r.node.kind === "effect" ? ["allow"] : []))
      if (outcomes.size > 1) diagnostics.push(diag("path-outcome-conflict", `${questionId}.${pathKey}`, "The same proposed feasible path has conflicting terminal outcomes. Split genuine alternatives with explicit predicates and distinct path keys."))
      const gaps = [...new Set(live.flatMap(r => [...r.gaps, ...r.ancestors.filter(n => n.kind === "unresolved").map(n => n.gap ?? "semantic-unresolved"), ...(!r.ancestors.some(n => n.kind === "entry") ? ["entry-missing"] : []), ...(!r.node.complete ? ["closure-not-proposed"] : []), ...r.predicate.diagnostics]))]
      const complete = live.length > 0 && outcomes.size === 1 && !gaps.length && groups.size <= 16
      const predicates = live.map(r => r.condition)
      const condition = predicates.length === 1 ? predicates[0] : { op: "any", args: predicates }
      const predicate = partialEvaluate(condition, controlBindings(slice, questionId)); calculationCount++
      paths.push({ questionId, pathKey, state: !live.length ? "inapplicable" : complete ? "checked" : "blocked", disposition: complete ? [...outcomes][0]! as "allow" | "deny" : "unknown", complete, predicate, condition, nodeKeys: [...new Set(live.flatMap(r => r.ancestors.map(n => n.key)))], terminalKeys: live.map(r => r.node.key), gaps, sourceBound: reaches.every(r => r.ancestors.every(n => n.sourceBound)), ...(slice.schemaVersion === "authorization-control-slice/v2" ? { protectedEffect: live.some(r => r.ancestors.some(n => n.kind === "unresolved")) ? "unresolved" as const : live.some(r => r.ancestors.some(n => n.kind === "effect")) ? "performed" as const : "none" as const, returnValues: live.flatMap(r => "returnValue" in r.node ? [r.node.returnValue] : []) } : {}) })
    }
  }
  return { paths, diagnostics, calculationCount }
}
/** Formal object checks on the current proposed slice; no answer or source interpretation is supplied. */
export function controlObjectDiagnostics(slice: ControlSlice): InquiryDiagnostic[] {
  const diagnostics: InquiryDiagnostic[] = []
  for (const rule of slice.rules) {
    const reach = controlRuleReach(slice, rule)
    if (reach.predicate.truth === "false" || reach.stoppedBy.length) continue
    for (const field of ["principal", "resource"] as const) {
      if (!rule[field] || (rule.kind === "binding" && rule.bindingKind === field && rule.bindingKey === rule[field])) continue
      const declared = slice.rules.filter(r => r.questionId === rule.questionId && r.kind === "binding" && r.bindingKey === rule[field] && r.bindingKind === field)
      const preceding = declared.filter(r => r.key !== rule.key && reach.ancestors.some(a => a.id === r.id))
      if (!declared.length) diagnostics.push(diag("object-binding-missing", rule.key, `Typed ${field} ${rule[field]} is not bound in this question. ${field} references the bindingKey of a same-question ${field} binding; the binding node's own ${field} field is also a reference, not an alias declaration.`, rule.questionId))
      else if (!preceding.length) diagnostics.push(diag("object-binding-unreachable", rule.key, `Typed ${field} ${rule[field]} has no binding among this rule's reachable explicit predecessors.`, rule.questionId))
      else if (preceding.length > 1) diagnostics.push(diag("object-binding-conflict", rule.key, `Typed ${field} ${rule[field]} resolves to multiple distinct predecessor bindings (${preceding.map(r => r.key).join(", ")}); use separate identity keys or explicitly revise the mistaken binding.`, rule.questionId))
    }
    for (const key of rule.authorizedBy ?? []) {
      const guard = slice.rules.find(r => r.questionId === rule.questionId && r.key === key && r.kind === "guard")
      if (!guard) diagnostics.push(diag("authorization-edge-missing", rule.key, `Claimed authorizing guard ${key} is absent.`, rule.questionId))
      else {
        if (!guard.resource || !rule.resource || !guard.principal || !rule.principal || guard.resource !== rule.resource || guard.principal !== rule.principal) diagnostics.push(diag("control-object-mismatch", rule.key, "Claimed authorizing control and protected effect lack the same explicit principal/resource identity. Equal labels or identifiers do not establish it.", rule.questionId))
        if (!reach.ancestors.some(r => r.key === key && r.key !== rule.key)) diagnostics.push(diag("control-order-missing", rule.key, "Claimed guard is not an explicit predecessor of this effect.", rule.questionId))
      }
    }
  }
  return diagnostics
}
export function checkControlConclusions(program: AuthorizationInquiryProgram, slice: ControlSlice, input: unknown, dependencies: DependencyCheckState[]) {
  const parsed = AuthorizationInquiryResultSchema.safeParse(input), evaluated = evaluateControlPaths(slice), diagnostics = [...evaluated.diagnostics]
  const policyComparisons: Array<{ questionId: string; status: "satisfied" | "violated" | "undetermined"; origin: "host-derived-from-proposed-policy"; semanticSupport: "unreviewed" }> = []
  const rawQuestions = input && typeof input === "object" && Array.isArray((input as any).questions) ? (input as any).questions as unknown[] : []
  const answers = parsed.success ? parsed.data.questions : rawQuestions.flatMap(q => { const p = InquiryQuestionResultSchema.safeParse(q); return p.success ? [p.data] : [] })
  if (!parsed.success) diagnostics.push(diag("control-result-schema", "$", "Result has no valid complete structured envelope; usable question candidates are checked separately."))
  for (const question of program.questions) {
    const count = answers.filter(a => a.questionId === question.id).length
    if (!count) diagnostics.push(diag("control-question-missing", question.id, "This original question has no valid result; another question's checked paths cannot replace it.", question.id))
    else if (count > 1) diagnostics.push(diag("control-question-duplicate", question.id, "This original question has multiple results; provide one current result for its original identity.", question.id))
  }
  for (const answer of answers) if (!program.questions.some(q => q.id === answer.questionId)) diagnostics.push(diag("control-question-unknown", answer.questionId, "Result names a question outside the original request."))
  for (const conflict of slice.conflicts.filter(c => !c.resolved)) diagnostics.push(diag("control-conflict", conflict.id, "Unresolved conflicting extraction remains; explicit correction is needed.", (conflict.previous as { questionId?: string })?.questionId))
  diagnostics.push(...controlObjectDiagnostics(slice))
  for (const answer of answers) {
    const paths = evaluated.paths.filter(p => p.questionId === answer.questionId), live = paths.filter(p => p.state !== "inapplicable")
    const relevant = dependencies.filter(d => d.questionId === answer.questionId && d.state !== "inapplicable")
    const open = relevant.filter(d => d.decisive && d.state !== "checked")
    const unacknowledged = open.filter(d => !answer.missing.some(m => (m.kind === "source-gap" || d.state === "read" && m.kind === "interpretation-gap" || d.state === "external-unknown" && m.kind === "dependency-out-of-scope") && [d.key, d.symbol].some(key => `${m.detail} ${m.nextRead ?? ""}`.includes(key))))
    if (unacknowledged.length) diagnostics.push(diag("decisive-dependency-open", answer.questionId, `Decisive source dependencies remain without a corresponding source gap: ${unacknowledged.map(d => `${d.key}:${d.state}`).join(", ")}. An unspecified user premise or deployment fact cannot conceal them.`))
    if (answer.behavior.disposition !== "unknown" && (!live.length || live.some(p => !p.complete))) diagnostics.push(diag("path-not-closed", answer.questionId, "Current rule slice has no fully linked entry-to-terminal description of every proposed active path; preserve a local gap."))
    if (["allow", "deny"].includes(answer.behavior.disposition) && live.length && !live.some(p => p.complete && p.predicate.truth === "true")) diagnostics.push(diag("unresolved-path-condition", answer.questionId, "No complete proposed path is known reachable under the current premises. Preserve its residual conditions in a conditional answer or the missing premise in an unknown answer; a structurally complete path does not establish an unconditional outcome."))
    for (const branch of answer.branches) {
      const path = paths.find(p => p.pathKey === branch.id)
      if (path?.state === "inapplicable") diagnostics.push(diag("inapplicable-branch", `${answer.questionId}.${branch.id}`, "Explicit current premises or an earlier rejection exclude this branch from result.branches. Preserve requested counterfactuals in behavior.explanation with citations; result.branches lists only current feasible paths."))
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
        const mappings = slice.policyRules.filter(p => {
          if (p.questionId !== path.questionId || p.pathKey !== path.pathKey) return false
          if (!p.condition) return true
          const condition = partialEvaluate(p.condition, controlBindings(slice, path.questionId))
          return !condition.diagnostics.length && (condition.truth === "true" || condition.truth === "unknown" && equivalentPredicateConditions(condition.residual, path.predicate.residual))
        })
        if (!path.complete || mappings.length !== 1) { unmapped = true; continue }
        if (path.disposition !== mappings[0]!.expected) mismatches++
      }
      const status = mismatches ? "violated" : unmapped ? "undetermined" : "satisfied"
      policyComparisons.push({ questionId: answer.questionId, status, origin: "host-derived-from-proposed-policy", semanticSupport: "unreviewed" })
      if (answer.policyAssessment && answer.policyAssessment.status !== status) diagnostics.push(diag("policy-behavior-conflict", answer.questionId, `Current independent policy mappings yield ${status}; raw assessment claims ${answer.policyAssessment.status}. Incomplete mappings must remain undetermined.`))
    }
  }
  const unique = diagnostics.filter((d, i) => diagnostics.findIndex(v => v.code === d.code && v.path === d.path && v.message === d.message && v.questionId === d.questionId) === i)
  const questionChecks = summarizeControlQuestions(program, slice, dependencies, evaluated.paths, unique)
  return { structureValid: parsed.success, sourceBound: slice.rules.length > 0 && slice.rules.every(r => r.sourceBound), ruleConsistency: !unique.length, semanticSupport: "unreviewed" as const, taskResolution: unique.length || !questionChecks.length || questionChecks.some(q => !q.ruleConsistent || q.evidenceCoverage !== "bounded") ? "partial" as const : "bounded" as const, paths: evaluated.paths, diagnostics: unique, policyComparisons, calculationCount: evaluated.calculationCount, questionChecks }
}
/** Reuse the actual checker results; this is a scoped report, never a second semantic check. */
export function summarizeControlQuestions(program: AuthorizationInquiryProgram, slice: ControlSlice, dependencies: DependencyCheckState[], paths: ControlPathEvaluation[], diagnostics: InquiryDiagnostic[]) {
  return program.questions.map(q => {
    const rules = slice.rules.filter(r => r.questionId === q.id), localPaths = paths.filter(p => p.questionId === q.id)
    const open = dependencies.filter(d => d.questionId === q.id && d.decisive && !["checked", "inapplicable"].includes(d.state))
    const localDiagnostics = diagnostics.filter(d => d.code !== "control-result-schema" && (!diagnosticQuestionId(program, d) || diagnosticQuestionId(program, d) === q.id))
    return { questionId: q.id, ruleConsistent: !localDiagnostics.some(d => d.severity === "error"), evidenceCoverage: rules.length && rules.every(r => r.sourceBound) && localPaths.length && localPaths.every(p => p.state !== "blocked") && !open.length ? "bounded" as const : "unresolved" as const, semanticReview: "unreviewed" as const, diagnostics: localDiagnostics,
      trace: { rules: rules.map(({ key, kind, after, pathKey, principal, resource, authorizedBy, evidenceIds }) => ({ key, kind, after, pathKey, principal, resource, authorizedBy, evidenceIds })), paths: localPaths, uncovered: [...new Set([...localPaths.flatMap(p => p.gaps), ...open.map(d => `${d.key}:${d.state}`)])] } }
  })
}

/** Check a selected property on the same source-bound slice. A checked local
 * relation never certifies interpretation meaning or the original whole task. */
export function checkPropertyQueries(program: AuthorizationInquiryProgram, slice: ControlSlice, demands: PropertyDemand[], units: BoundSemanticBlock[], dependencies: DependencyCheckState[], sourceTransactions: InquiryDiagnostic[] = []) {
  const evaluated = evaluateControlPaths(slice)
  const questions = program.questions.map(question => {
    const local = demands.filter(d => d.questionId === question.id || d.dependencies?.propertyQueries?.questionId === question.id || d.dependencies?.propertyQueries?.queries.some(q => q.questionId === question.id))
    const candidates = local.flatMap(d => d.dependencies?.propertyQueries?.queries ?? []).filter(q => q.questionId === question.id)
    // Every shown body has a declaration placeholder. Only actual proposed
    // bindings compete for identity; an unbound helper does not duplicate or
    // poison a binding on another source. Multiple explicit bindings still fail.
    const queries = [...new Set(candidates.map(q => q.id))].flatMap(id => {
      const declared = candidates.filter(q => q.id === id), explicit = declared.filter(q => q.effectAnchorId || q.guardAnchorId)
      return explicit.length ? explicit : declared.slice(0, 1)
    })
    const properties = queries.map(q => {
      if (q.bindingScope === "interprocedural-property/v1") return checkInterproceduralProperty(q, slice, local, units, dependencies, queries.filter(v => v.id === q.id).length !== 1, sourceTransactions)
      const gaps: string[] = [], trace: string[] = []
      let status: "checked" | "violated" | "unknown" = "unknown", value = "unresolved"
      const sourceUnits = units.filter(u => u.questionId === question.id && u.source?.id === q.source.id && u.source.sha256 === q.source.sha256)
      const sameSource = (r: BoundControlRule) => r.questionId === question.id && sourceUnits.some(u => u.handle === r.sourceOrigin?.handle)
      const effects = slice.rules.filter(r => sameSource(r) && r.kind === "effect" && [`effect-${q.effectAnchorId}`, `field-effect-${q.effectAnchorId}`].includes(r.sourceOrigin?.step ?? ""))
      if (q.state !== "bound") gaps.push(...q.missing)
      if (queries.filter(v => v.id === q.id).length !== 1) gaps.push("property-binding-duplicate")
      const propertyLocal = local.filter(d => d.source.id === q.source.id && d.revision === q.sourceRevision)
      if (propertyLocal.some(d => d.dependencies?.propertyQueries?.diagnostics.some(d => !d.propertyId || d.propertyId === q.id))) gaps.push("property-query-diagnostics")
      if (!sourceUnits.length || !effects.length) gaps.push("property-source-effect-unadopted")
      if (dependencies.some(d => d.questionId === question.id && d.decisive && !["checked", "inapplicable"].includes(d.state))) gaps.push("property-dependency-open")
      const reaches = effects.map(effect => ({ effect, ...controlRuleReach(slice, effect) }))
      if (reaches.some(r => r.gaps.length || !r.ancestors.some(a => a.kind === "entry") || r.ancestors.some(a => !a.sourceBound || a.kind === "unresolved"))) gaps.push("property-prefix-unresolved")
      if (controlObjectDiagnostics(slice).some(d => d.questionId === question.id && d.code.startsWith("object-binding-"))) gaps.push("property-object-binding-unresolved")
      const live = reaches.filter(r => r.predicate.truth !== "false" && !r.stoppedBy.length)
      if (!gaps.length) {
        if (q.kind === "authorization-before-effect" || q.kind === "authorized-object-matches-effect") {
          if (!live.length) gaps.push("property-effect-not-reachable")
          for (const reach of live) {
            trace.push(...reach.ancestors.map(a => a.key))
            const guard = reach.ancestors.find(r => sameSource(r) && r.kind === "guard" && r.sourceOrigin?.step === `guard-${q.guardAnchorId}`)
            if (!guard) { status = "violated"; value = "guard-not-predecessor"; break }
            if (!guard.principal || guard.principal !== reach.effect.principal || !guard.resource || guard.resource !== reach.effect.resource) { status = "violated"; value = "authorized-object-mismatch"; break }
          }
          if (status !== "violated" && !gaps.length) { status = "checked"; value = "satisfied" }
        } else if (q.kind === "effect-reachability") {
          status = "checked"; value = live.some(r => r.predicate.truth === "true") ? "reachable" : live.length ? "conditional" : "unreachable"
        } else {
          const paths = evaluated.paths.filter(p => p.questionId === question.id && p.state !== "inapplicable")
          if (!paths.length || paths.some(p => !p.complete || !p.sourceBound) || propertyLocal.some(d => d.sourceGaps?.length || d.dependencies?.residuals?.length)) gaps.push("property-completion-unresolved")
          else { status = "checked"; value = paths.every(p => p.predicate.truth === "true") ? "bounded-control-outcomes" : "conditional-control-outcomes" }
        }
      }
      return { propertyId: q.id, kind: q.kind, status, value, questionId: question.id, source: q.source, sourceRevision: q.sourceRevision, gaps: [...new Set(gaps)], trace: [...new Set(trace)], semanticReview: "unreviewed" as const, scope: "current-proposed-source-relation" as const }
    })
    return { questionId: question.id, properties, gaps: properties.length ? [] : ["property-query-undeclared"] }
  })
  return { schemaVersion: "authorization-property-check/v1" as const, revision: slice.revision, questions, diagnostics: validatePropertyQuestionMapping(program.questions.map(q => q.id), questions), originalQuestionCount: program.questions.length, wholeTaskCertified: false as const, semanticReview: "unreviewed" as const }
}

/** Consume current invocation paths from the existing evaluator. Syntax refs
 * select sources; only mapped predecessor identities prove the local relation. */
function checkInterproceduralProperty(q: BoundPropertyQuery, slice: ControlSlice, demands: PropertyDemand[], units: BoundSemanticBlock[], dependencies: DependencyCheckState[], duplicate: boolean, sourceTransactions: InquiryDiagnostic[]) {
  const gaps = [...q.missing], traced = new Map<string, BoundControlRule>()
  let status: "checked" | "violated" | "unknown" = "unknown", value = "unresolved"
  const selectedUnits = (ref?: PropertySourceReference) => ref ? units.filter(u => u.questionId === q.questionId && u.source?.id === ref.sourceId && u.source.sha256 === ref.sourceSha256 && u.receiverClass === ref.receiverClass) : []
  const effectUnits = selectedUnits(q.effectRef), guardUnits = selectedUnits(q.guardRef)
  const from = (r: BoundControlRule, owners: BoundSemanticBlock[]) => r.questionId === q.questionId && owners.some(u => u.handle === r.sourceOrigin?.handle)
  const calls = slice.rules.filter(r => from(r, effectUnits) && r.kind === "call" && (r.sourceOrigin?.step === `call-${q.effectAnchorId}` || r.sourceOrigin?.step.startsWith(`call-${q.effectAnchorId}-`)))
  const inCall = (rule: BoundControlRule, call: BoundControlRule) => !!rule.sourceOrigin?.instance.startsWith(`${call.sourceOrigin!.instance}.${call.sourceOrigin!.step}`) && controlRuleReach(slice, rule).ancestors.some(a => a.key === call.key)
  const effects = slice.rules.filter(r => r.questionId === q.questionId && r.kind === "effect" && (q.effectKind === "call" ? calls.some(c => inCall(r, c)) : from(r, effectUnits) && [`effect-${q.effectAnchorId}`, `field-effect-${q.effectAnchorId}`].includes(r.sourceOrigin?.step ?? "")))
  const reaches = effects.map(effect => ({ effect, ...controlRuleReach(slice, effect) })), callReaches = calls.map(call => ({ call, ...controlRuleReach(slice, call) }))
  const live = reaches.filter(r => r.predicate.truth !== "false" && !r.stoppedBy.length)
  const addTrace = (rules: BoundControlRule[]) => { for (const rule of rules) traced.set(rule.key, rule) }
  for (const reach of [...callReaches, ...reaches]) addTrace(reach.ancestors)
  const subtree = q.effectKind === "call" ? slice.rules.filter(r => calls.some(c => inCall(r, c))) : []
  addTrace(subtree)
  if (duplicate) gaps.push("property-binding-duplicate")
  for (const d of sourceTransactions.filter(d => d.severity === "error" && (!d.questionId || d.questionId === q.questionId))) gaps.push(`property-current-source-rejected:${d.code}`)
  if (!effectUnits.length || (q.effectKind === "call" ? !calls.length : !effects.length)) gaps.push("property-source-effect-unadopted")
  if (q.guardRef && !guardUnits.length) gaps.push("property-guard-unadopted")
  const prefixes = [...callReaches, ...reaches]
  if (prefixes.some(r => r.gaps.length || !r.ancestors.some(a => a.kind === "entry") || r.ancestors.some(a => !a.sourceBound || a.kind === "unresolved"))) gaps.push("property-prefix-unresolved")
  for (const r of [...traced.values()].filter(r => r.kind === "unresolved")) gaps.push(`property-source-gap:${r.gap ?? r.key}`)
  const relevantKeys = new Set(traced.keys()), open = dependencies.filter(d => d.questionId === q.questionId && d.decisive && !["checked", "inapplicable"].includes(d.state) && (d.pathKey === "$framework" || slice.dependencies.some(edge => edge.key === d.key && relevantKeys.has(edge.from))))
  if (open.length) gaps.push(...open.map(d => `property-dependency-open:${d.symbol}`))
  if (controlObjectDiagnostics(slice).some(d => d.questionId === q.questionId && d.code.startsWith("object-binding-") && relevantKeys.has(d.path))) gaps.push("property-object-binding-unresolved")
  if (!gaps.length) {
    if (q.kind === "authorization-before-effect" || q.kind === "authorized-object-matches-effect") {
      if (!live.length && q.effectKind !== "call") gaps.push("property-effect-not-reachable")
      for (const reach of live) {
        const guard = reach.ancestors.findLast(r => from(r, guardUnits) && r.kind === "guard" && r.sourceOrigin?.step === `guard-${q.guardAnchorId}` && (q.guardRef?.sourceId !== q.effectRef?.sourceId || r.sourceOrigin.instance === reach.effect.sourceOrigin?.instance))
        if (!guard) { status = "violated"; value = "guard-not-predecessor"; break }
        if (!guard.principal || !guard.resource || !reach.effect.principal || !reach.effect.resource) { gaps.push("property-object-identity-unresolved"); break }
        if (guard.principal !== reach.effect.principal || guard.resource !== reach.effect.resource) { status = "violated"; value = "authorized-object-mismatch"; break }
        if (q.requiredPermission && !guard.permission) { gaps.push("property-permission-unresolved"); break }
        if (q.requiredPermission && guard.permission !== q.requiredPermission) { status = "violated"; value = "permission-mismatch"; break }
      }
      if (status !== "violated" && !gaps.length) { status = "checked"; value = live.length ? "satisfied" : "no-effect-on-covered-paths" }
    } else if (q.kind === "effect-reachability") { status = "checked"; value = live.some(r => r.predicate.truth === "true") ? "reachable" : live.length ? "conditional" : "unreachable" }
    else {
      const paths = evaluateControlPaths(slice).paths.filter(p => p.questionId === q.questionId && p.state !== "inapplicable")
      if (!paths.length || paths.some(p => !p.complete || !p.sourceBound) || demands.some(d => d.questionId === q.questionId && (d.sourceGaps.length || d.dependencies?.residuals?.length))) gaps.push("property-completion-unresolved")
      else { status = "checked"; value = paths.every(p => p.predicate.truth === "true") ? "bounded-control-outcomes" : "conditional-control-outcomes" }
    }
  }
  if (!traced.size && effectUnits.length) addTrace(slice.rules.filter(r => from(r, effectUnits)))
  return { propertyId: q.id, kind: q.kind, status, value, questionId: q.questionId, source: q.source, sourceRevision: q.sourceRevision, gaps: [...new Set(gaps)], trace: [...traced.keys()], traceDetails: [...traced.values()].map(r => ({ key: r.key, kind: r.kind, source: units.find(u => u.questionId === q.questionId && u.handle === r.sourceOrigin?.handle)?.source, origin: r.sourceOrigin, after: r.after, principal: r.principal, resource: r.resource, permission: r.permission, gap: r.gap })), effectOccurrences: effects.map(r => ({ key: r.key, instance: r.sourceOrigin?.instance, principal: r.principal, resource: r.resource })), semanticReview: "unreviewed" as const, scope: "current-proposed-source-relation" as const }
}
