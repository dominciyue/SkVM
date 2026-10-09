import { z } from "zod"
import { createHash } from "node:crypto"
import { InquiryText, type InquiryDiagnostic } from "./inquiry.ts"
import type { AuthorizationInquiryProgram } from "./inquiry-program.ts"
import type { InquiryEvidenceContext } from "./inquiry-result.ts"
import { predicateDiagnostics, type FiniteValue } from "./control-evaluation.ts"

export type InquiryStrategy = "legacy" | "domain-evidence-v1" | "guided-evidence-v2" | "semantic-flow-v1" | "focused-closure-v1" | "operation-evidence-v1" | "operation-evidence-v2" | "operation-evidence-v3" | "operation-evidence-v4" | "operation-evidence-v5" | "operation-evidence-v6" | "operation-evidence-v7" | "task-binding-v1"
export const InquiryStrategySchema = z.enum(["legacy", "domain-evidence-v1", "guided-evidence-v2", "semantic-flow-v1", "focused-closure-v1", "operation-evidence-v1", "operation-evidence-v2", "operation-evidence-v3", "operation-evidence-v4", "operation-evidence-v5", "operation-evidence-v6", "operation-evidence-v7", "task-binding-v1"])
export const isTaskBindingStrategy = (strategy?: InquiryStrategy) => strategy === "task-binding-v1"
export const isInterproceduralPropertyStrategy = (strategy?: InquiryStrategy) => strategy === "operation-evidence-v7" || isTaskBindingStrategy(strategy)
export const isPropertyAbstractionStrategy = (strategy?: InquiryStrategy) => strategy === "operation-evidence-v6" || isInterproceduralPropertyStrategy(strategy)
export const isQuestionDirectedInquiryStrategy = (strategy?: InquiryStrategy) => strategy === "operation-evidence-v5" || isPropertyAbstractionStrategy(strategy)
export const isPropertyDirectedInquiryStrategy = (strategy?: InquiryStrategy) => strategy === "operation-evidence-v4" || isQuestionDirectedInquiryStrategy(strategy)
export const isFiniteControlInquiryStrategy = (strategy?: InquiryStrategy) => strategy === "operation-evidence-v3" || isPropertyDirectedInquiryStrategy(strategy)
export const sourceMaterialSemanticVersion = (strategy?: InquiryStrategy) => isInterproceduralPropertyStrategy(strategy) ? "interprocedural-property/v1" as const : isPropertyAbstractionStrategy(strategy) ? "property-abstraction/v1" as const : isQuestionDirectedInquiryStrategy(strategy) ? "question-control/v1" as const : isPropertyDirectedInquiryStrategy(strategy) ? "property-control/v1" as const : "finite-control/v1" as const
export const isOperationInquiryStrategy = (strategy?: InquiryStrategy) => strategy === "operation-evidence-v1" || strategy === "operation-evidence-v2" || isFiniteControlInquiryStrategy(strategy)
export const isSourceAssistedInquiryStrategy = (strategy?: InquiryStrategy) => strategy === "operation-evidence-v2" || isFiniteControlInquiryStrategy(strategy)
export const isFocusedInquiryStrategy = (strategy?: InquiryStrategy) => strategy === "focused-closure-v1" || isOperationInquiryStrategy(strategy)
export const isSemanticInquiryStrategy = (strategy?: InquiryStrategy) => strategy === "semantic-flow-v1" || isFocusedInquiryStrategy(strategy)
export const isGuidedInquiryStrategy = (strategy?: InquiryStrategy) => strategy === "guided-evidence-v2" || isSemanticInquiryStrategy(strategy)
export function parseInquiryStrategy(input: unknown): InquiryStrategy {
  const parsed = InquiryStrategySchema.safeParse(input ?? "legacy")
  if (!parsed.success) throw new Error(`inquiry-strategy: strategy must be ${InquiryStrategySchema.options.join(", ")}`)
  return parsed.data
}
const key = InquiryText.refine(s => !["__proto__", "constructor", "prototype"].includes(s), "Reserved binding key")
const expression = z.record(z.unknown())
const revision = { revisionOf: InquiryText.optional(), revisionReason: InquiryText.optional() }
export const ControlRuleSchema = z.object({
  key, questionId: InquiryText, pathKey: key, kind: z.enum(["entry", "binding", "guard", "reject", "continue", "effect"]),
  after: z.array(key).max(64), evidenceIds: z.array(InquiryText).min(1).max(16), claim: InquiryText,
  condition: expression.optional(), principal: key.optional(), resource: key.optional(), operation: InquiryText.optional(),
  bindingKey: key.optional(), bindingKind: z.enum(["principal", "resource", "permission", "configuration", "value"]).optional(),
  authorizedBy: z.array(key).max(64).optional(), complete: z.boolean().optional(), ...revision,
}).strict()
export const ControlDependencySchema = z.object({
  key, questionId: InquiryText, pathKey: key, from: key, symbol: InquiryText, evidenceIds: z.array(InquiryText).min(1).max(16),
  reason: InquiryText, kind: z.enum(["principal-binding", "resource-binding", "control", "effect", "exception"]), decisive: z.boolean(),
  condition: expression.optional(), after: z.array(key).max(64).optional(), parent: key.optional(), pathHint: InquiryText.optional(), candidateId: InquiryText.optional(), ...revision,
}).strict()
const scalarValueSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()])
export const FiniteValueSchema = z.union([...scalarValueSchema.options, z.array(scalarValueSchema).max(64), z.record(scalarValueSchema).refine(v => Object.keys(v).length <= 64, "Finite map limit")])
export const UserBindingSchema = z.object({ questionId: InquiryText, key, value: FiniteValueSchema, origin: z.literal("user"), text: InquiryText, ...revision }).strict()
export const PolicyRuleSchema = z.object({ questionId: InquiryText, key, pathKey: key, condition: expression.optional(), expected: z.enum(["allow", "deny"]), text: InquiryText, location: InquiryText, origin: z.literal("policy"), ...revision }).strict()
/** Predicates have a separately enforced finite algebra, avoiding an unbounded recursive model schema. */
export const ControlSliceV1DeltaSchema = z.object({
  schemaVersion: z.literal("authorization-control-slice/v1"), rules: z.array(ControlRuleSchema).max(1024).default([]),
  dependencies: z.array(ControlDependencySchema).max(1024).default([]), bindings: z.array(UserBindingSchema).max(1024).default([]), policyRules: z.array(PolicyRuleSchema).max(256).default([]),
}).strict()
/** Strict v1 is retained. v2 can distinguish a return from an actual protected operation. */
export const SemanticControlRuleSchema = ControlRuleSchema.extend({
  kind: z.enum(["entry", "binding", "guard", "reject", "continue", "effect", "call", "return", "unresolved"]),
  terminal: z.boolean().optional(), outcome: z.enum(["allow", "deny", "unknown"]).optional(),
  returnValue: z.union([z.string(), z.number().finite(), z.boolean(), z.null()]).optional(), gap: InquiryText.optional(),
  failureKind: z.enum(["authorization", "operation"]).optional(),
  permission: InquiryText.optional(),
  sourceOrigin: z.object({ handle: key, block: key, step: key, instance: key, steps: z.array(key).min(1).max(160).optional() }).strict().optional(),
  bindingName: key.optional(),
}).strict()
export const ControlSliceV2DeltaSchema = ControlSliceV1DeltaSchema.extend({ schemaVersion: z.literal("authorization-control-slice/v2"), rules: z.array(SemanticControlRuleSchema).max(1024).default([]) }).strict()
export const ControlSliceDeltaSchema = z.discriminatedUnion("schemaVersion", [ControlSliceV1DeltaSchema, ControlSliceV2DeltaSchema])
export type ControlRule = z.infer<typeof SemanticControlRuleSchema>
export type ControlDependency = z.infer<typeof ControlDependencySchema>
type Bound<T> = T & { id: string; digest: string; sourceBound: boolean; semanticSupport: "unreviewed" }
export type BoundControlRule = Bound<ControlRule>
export type BoundControlDependency = Bound<ControlDependency>
export interface ControlSlice {
  schemaVersion: "authorization-control-slice/v1" | "authorization-control-slice/v2"; revision: number; rules: BoundControlRule[]; dependencies: BoundControlDependency[];
  bindings: Bound<z.infer<typeof UserBindingSchema>>[]; policyRules: Bound<z.infer<typeof PolicyRuleSchema>>[];
  conflicts: Array<{ id: string; proposed: unknown; previous: unknown; resolved: boolean }>;
  revisions: Array<{ id: string; previous: unknown; accepted: unknown; reason: string }>
}
export function createControlSlice(): ControlSlice { return { schemaVersion: "authorization-control-slice/v1", revision: 0, rules: [], dependencies: [], bindings: [], policyRules: [], conflicts: [], revisions: [] } }
export function canonicalControl(value: unknown): string {
  return JSON.stringify(value, (_k, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v)
}
const digest = (value: unknown) => createHash("sha256").update(canonicalControl(value)).digest("hex")
const diagnostic = (code: string, path: string, message: string): InquiryDiagnostic => ({ code, path, message, severity: "error" })
export function mergeControlSlice(previous: ControlSlice, input: unknown, program: AuthorizationInquiryProgram, context: InquiryEvidenceContext & { suppliedUserText?: string[]; globalUserText?: string[] }): { state: ControlSlice; diagnostics: InquiryDiagnostic[] } {
  const state = structuredClone(previous), diagnostics: InquiryDiagnostic[] = [], parsed = ControlSliceDeltaSchema.safeParse(input)
  if (!parsed.success) return { state, diagnostics: parsed.error.issues.map(i => diagnostic("control-schema", i.path.join("."), i.message)) }
  if (parsed.data.schemaVersion === "authorization-control-slice/v2") state.schemaVersion = parsed.data.schemaVersion
  const accept = (group: "rules" | "dependencies" | "bindings" | "policyRules", proposed: any, sourceBound: boolean) => {
    const list: any[] = state[group], id = `ctrl-${digest([group, proposed.questionId, proposed.key]).slice(0, 20)}`
    const { revisionOf, revisionReason, ...content } = proposed, hash = digest(content), old = list.find(i => i.id === id)
    if (old?.digest === hash) return
    const bound = { ...content, id, digest: hash, sourceBound, semanticSupport: "unreviewed" as const }
    if (old && (revisionOf !== old.digest || !revisionReason)) {
      if (!state.conflicts.some(c => c.id === id && canonicalControl(c.proposed) === canonicalControl(content) && !c.resolved)) state.conflicts.push({ id, proposed: content, previous: old, resolved: false })
      diagnostics.push(diagnostic("control-conflict", `${group}.${proposed.key}`, "Conflicting proposal retained. Explicit revisionOf digest and revisionReason are required; existing rule was not overwritten.")); return
    }
    if (old) { list[list.indexOf(old)] = bound; state.revisions.push({ id, previous: old, accepted: bound, reason: revisionReason }); for (const c of state.conflicts.filter(c => c.id === id)) c.resolved = true }
    else list.push(bound)
    state.revision++
  }
  for (const group of ["rules", "dependencies", "bindings", "policyRules"] as const) {
    const over = new Set<string>()
    for (const q of program.questions) {
      const combined = new Set([...state.rules, ...parsed.data.rules].filter(r => r.questionId === q.id).map(r => r.key))
      const nodeLimit = state.schemaVersion === "authorization-control-slice/v2" ? 128 : 64
      if (combined.size > nodeLimit && group === "rules") { over.add(q.id); diagnostics.push(diagnostic("control-node-limit", group, `Question ${q.id} exceeds ${nodeLimit} local nodes; proposals for this question remain residual.`)) }
      if (group === "dependencies" && new Set([...state.dependencies, ...parsed.data.dependencies].filter(d => d.questionId === q.id).map(d => d.key)).size > 64) { over.add(q.id); diagnostics.push(diagnostic("control-dependency-limit", group, `Question ${q.id} exceeds 64 dependencies.`)) }
    }
    for (const item of parsed.data[group]) {
      if (over.has(item.questionId)) continue
      const at = `${group}.${item.key}`, start = diagnostics.length, q = program.questions.find(q => q.id === item.questionId)
      if (!q || !context.questionIds.includes(item.questionId)) diagnostics.push(diagnostic("unknown-question", at, "Question is not declared."))
      if ("condition" in item && item.condition) for (const code of predicateDiagnostics(item.condition)) diagnostics.push(diagnostic(code, at, "Only the bounded finite permission algebra is executable; unsupported expression retained in proposal."))
      if (group === "rules" || group === "dependencies") {
        for (const e of (item as ControlRule).evidenceIds) {
          if (e.startsWith("policy") || e === program.policy?.location) diagnostics.push(diagnostic("policy-as-source", at, "Normative policy cannot serve as source evidence."))
          else if (!context.shownEvidenceIds.includes(e)) diagnostics.push(diagnostic("evidence-not-shown", at, `Evidence ${e} was not shown.`))
          else if (context.evidenceQuestions?.[e] && !context.evidenceQuestions[e]!.includes(item.questionId)) diagnostics.push(diagnostic("evidence-question-mismatch", at, "Evidence belongs to another question."))
        }
        if (group === "rules" && (item as ControlRule).kind === "binding" && (!(item as ControlRule).bindingKey || !(item as ControlRule).bindingKind)) diagnostics.push(diagnostic("binding-type-required", at, "A binding node declares a typed identity key."))
      } else if (group === "bindings") {
        const binding = item as z.infer<typeof UserBindingSchema>
        const own = q ? [q.request, ...q.premises.map(p => p.text)] : []
        // Native contexts may flatten all declaration questions. Such entries
        // keep their original question scope; a separate natural brief is global.
        const supplied = context.suppliedUserText?.filter(t => context.globalUserText?.includes(t) || own.includes(t) || !program.questions.some(other => other.id !== item.questionId && [other.request, ...other.premises.map(p => p.text)].includes(t))) ?? own
        if (!q || !supplied.some(t => t.includes(binding.text))) diagnostics.push(diagnostic("premise-not-supplied", at, "Known values require an exact span of an original supplied statement for this question or a global user brief, not another question or a model-authored premise; mapping meaning remains unreviewed."))
        if (/\b(?:unspecified|unknown|not (?:given|supplied|specified|provided|known))\b|未(?:给定|指定|提供)|未知/i.test(binding.text)) diagnostics.push(diagnostic("premise-value-unspecified", at, "This quoted user span explicitly leaves the value unspecified. Omit this known-value binding; null means a supplied null value, never an unknown placeholder. Other mapping meaning remains unreviewed."))
      } else {
        const p = item as z.infer<typeof PolicyRuleSchema>
        if (program.mode !== "conformance" || !program.policy || p.location !== program.policy.location || !program.policy.text.includes(p.text)) diagnostics.push(diagnostic("policy-not-supplied", at, "Policy mapping must quote the current independent policy in its own namespace."))
      }
      if (diagnostics.length === start) accept(group, item, group === "rules" || group === "dependencies")
    }
  }
  return { state, diagnostics }
}
export function controlBindings(state: ControlSlice, questionId: string): Record<string, FiniteValue> {
  const values = Object.fromEntries(state.bindings.filter(b => b.questionId === questionId).map(b => [b.key, b.value]))
  for (const b of state.bindings.filter(b => b.questionId === questionId)) {
    const candidates = state.rules.filter(r => r.questionId === questionId && r.kind === "binding" && r.bindingName && (b.key === r.bindingName || b.key.startsWith(`${r.bindingName}.`) || r.sourceOrigin && (b.key === `${r.sourceOrigin.handle}.${r.bindingName}` || b.key.startsWith(`${r.sourceOrigin.handle}.${r.bindingName}.`))))
    const identities = new Set(candidates.map(c => c.bindingKey))
    if (identities.size !== 1) continue
    const node = candidates[0]!, prefix = b.key.startsWith(`${node.sourceOrigin?.handle}.${node.bindingName}`) ? `${node.sourceOrigin!.handle}.${node.bindingName}` : node.bindingName!
    values[node.bindingKey! + b.key.slice(prefix.length)] = b.value
  }
  return values
}
