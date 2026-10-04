import { z } from "zod"
import { createHash } from "node:crypto"
import { InquiryText, type InquiryDiagnostic } from "./inquiry.ts"
import { canonicalControl, type ControlRule, type ControlDependency } from "./control-slice.ts"
import { predicateDiagnostics, type Scalar } from "./control-evaluation.ts"

const name = InquiryText.refine(s => !["__proto__", "constructor", "prototype"].includes(s), "Reserved semantic name")
const condition = z.record(z.unknown())
const scalar = z.union([z.string(), z.number().finite(), z.boolean(), z.null()])
const common = { name, claim: InquiryText }
const objects = { principal: name.optional(), resource: name.optional() }
export const SemanticStepSchema = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("bind"), type: z.enum(["principal", "resource", "permission", "configuration", "value"]), aliasOf: name.optional() }).strict(),
  z.object({ ...common, ...objects, kind: z.literal("guard"), condition: condition.optional() }).strict(),
  z.object({ ...common, kind: z.literal("choose"), cases: z.array(z.object({ condition, body: name }).strict()).min(1).max(16), otherwise: name.optional() }).strict(),
  z.object({ ...common, ...objects, kind: z.literal("call"), symbol: name, callee: name.optional(), result: name.optional(), arguments: z.array(z.object({ parameter: name, object: name }).strict()).max(16).default([]), pathHint: InquiryText.optional(), candidateId: InquiryText.optional() }).strict(),
  z.object({ ...common, ...objects, kind: z.literal("effect"), operation: InquiryText.optional(), authorizedBy: z.array(name).max(16).optional() }).strict(),
  z.object({ ...common, kind: z.literal("return"), value: scalar.optional(), outcome: z.enum(["allow", "deny", "unknown"]).optional() }).strict(),
  z.object({ ...common, kind: z.literal("reject") }).strict(),
  z.object({ ...common, kind: z.literal("unresolved"), reason: InquiryText }).strict(),
])
export const SemanticBlockSchema = z.object({ itemId: name, handle: name, op: z.enum(["add", "replace"]), role: z.enum(["entry", "helper"]), start: name, complete: z.boolean(), fallthrough: z.enum(["allow", "deny", "unresolved"]).optional(), parameters: z.array(z.object({ name, type: z.enum(["principal", "resource", "permission", "configuration", "value"]) }).strict()).max(16).default([]), blocks: z.array(z.object({ name, steps: z.array(SemanticStepSchema).max(160) }).strict()).min(1).max(32) }).strict()
export type SemanticBlock = z.infer<typeof SemanticBlockSchema>
export type BoundSemanticBlock = SemanticBlock & { questionId: string; evidenceIds: string[] }
type Step = z.infer<typeof SemanticStepSchema>
interface Cursor { tail: string; route: string[]; objects: Record<string, { identity: string; type: string }>; guards: Record<string, string>; values: Record<string, Scalar>; stopped?: boolean; returned?: boolean; returnValue?: Scalar }
const id = (parts: unknown[]) => "sem-" + createHash("sha256").update(canonicalControl(parts)).digest("hex").slice(0, 24)

/** The host compiles only explicit source interpretations; it never parses target code into an answer. */
export function lowerSemanticFlow(units: BoundSemanticBlock[]) {
  let rules: ControlRule[] = [], dependencies: ControlDependency[] = []
  const diagnostics: InquiryDiagnostic[] = [], owned: Array<{ questionId: string; handle: string; ruleKeys: string[] }> = []
  const fault = (q: string, handle: string, code: string, message: string) => diagnostics.push({ code, path: `semanticBlocks.${q}.${handle}`, questionId: q, message, severity: "error" })
  for (const questionId of new Set(units.map(u => u.questionId))) {
    const local = units.filter(u => u.questionId === questionId), roots = local.filter(u => u.role === "entry"), startIndex = rules.length, dependencyIndex = dependencies.length
    let serial = 0, pathCount = 0
    const append = (u: BoundSemanticBlock, c: Cursor, instance: string, block: string, step: string, kind: ControlRule["kind"], fields: Partial<ControlRule> = {}) => {
      if (rules.length - startIndex >= 127) throw new Error("semantic-node-limit")
      const key = id([questionId, instance, block, step, c.route, serial++])
      const r: ControlRule = { key, questionId, pathKey: id([questionId, "path", c.route]), kind, after: c.tail ? [c.tail] : [], evidenceIds: u.evidenceIds, claim: fields.claim ?? u.handle, terminal: false, sourceOrigin: { handle: u.handle, block, step, instance }, ...fields }
      rules.push(r); c.tail = key; return r
    }
    const terminal = (u: BoundSemanticBlock, c: Cursor, instance: string, block: string, step: string, kind: "return" | "reject" | "unresolved", fields: Partial<ControlRule>) => {
      if (++pathCount > 16) throw new Error("semantic-path-limit")
      append(u, c, instance, block, step, kind, { terminal: true, complete: u.complete && kind !== "unresolved", ...fields }); c.stopped = true
    }
    const gap = (u: BoundSemanticBlock, c: Cursor, instance: string, block: string, step: string, code: string, detail?: string) => { fault(questionId, u.handle, code, `Unresolved local source relation at ${block}.${step}; ${detail ?? "no alternative or call meaning was inferred."}`); terminal(u, c, instance, block, step, "unresolved", { gap: code, claim: code, complete: false }) }
    const predicate = (input: unknown, c: Cursor): any => {
      if (Array.isArray(input)) return input.map(v => predicate(v, c))
      if (!input || typeof input !== "object") return input
      const object = input as Record<string, unknown>
      if (typeof object.binding === "string" && Object.hasOwn(c.values, object.binding)) return { literal: c.values[object.binding] }
      return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, predicate(value, c)]))
    }
    const resolveObject = (c: Cursor, ref?: string) => ref ? c.objects[ref]?.identity ?? id([questionId, "unbound-object", ref]) : undefined
    const walk = (u: BoundSemanticBlock, body: string, cursors: Cursor[], instance: string, stack: string[]): Cursor[] => {
      const marker = `${u.handle}:${body}`
      if (stack.includes(marker) || stack.length >= 12) { for (const c of cursors.filter(c => !c.stopped && !c.returned)) gap(u, c, instance, body, "$cycle", "semantic-cycle"); return cursors }
      const b = u.blocks.find(b => b.name === body)
      if (!b) { for (const c of cursors.filter(c => !c.stopped && !c.returned)) gap(u, c, instance, body, "$missing", "semantic-body-missing"); return cursors }
      let current = cursors
      for (const step of b.steps) {
        const next: Cursor[] = []
        for (const cursor of current) {
          if (cursor.stopped || cursor.returned) { next.push(cursor); continue }
          const c = structuredClone(cursor), fields = { claim: step.claim }
          if (step.kind === "choose") {
            const prior: unknown[] = []
            for (const [index, branch] of step.cases.entries()) {
              const alternative = structuredClone(c); alternative.route.push(`${instance}.${body}.${step.name}:${index}`)
              const test = predicate(branch.condition, c), reach = prior.length ? { op: "all", args: [test, { op: "not", arg: { op: "any", args: [...prior] } }] } : test
              append(u, alternative, instance, body, step.name, "continue", { ...fields, condition: reach }); next.push(...walk(u, branch.body, [alternative], instance, [...stack, marker])); prior.push(test)
            }
            const other = structuredClone(c); other.route.push(`${instance}.${body}.${step.name}:else`)
            if (step.otherwise) { append(u, other, instance, body, step.name, "continue", { ...fields, condition: { op: "not", arg: { op: "any", args: prior } } }); next.push(...walk(u, step.otherwise, [other], instance, [...stack, marker])) }
            else { gap(u, other, instance, body, step.name, "choice-uncovered"); next.push(other) }
            continue
          }
          if (step.kind === "bind") {
            const alias = step.aliasOf ? c.objects[step.aliasOf] : undefined
            if (step.aliasOf && (!alias || alias.type !== step.type)) { gap(u, c, instance, body, step.name, "semantic-alias-missing"); next.push(c); continue }
            if (alias) { c.objects[step.name] = alias; append(u, c, instance, body, step.name, "continue", fields) }
            else {
              const identity = id([questionId, instance, "object", step.name]); c.objects[step.name] = { identity, type: step.type }; c.objects[`${u.handle}.${step.name}`] = c.objects[step.name]!
              append(u, c, instance, body, step.name, "binding", { ...fields, bindingKey: identity, bindingKind: step.type })
            }
          } else if (step.kind === "guard") {
            const r = append(u, c, instance, body, step.name, "guard", { ...fields, ...(step.condition ? { condition: predicate(step.condition, c) } : {}), principal: resolveObject(c, step.principal), resource: resolveObject(c, step.resource) }); c.guards[step.name] = r.key; c.guards[`${u.handle}.${step.name}`] = r.key
          } else if (step.kind === "effect") append(u, c, instance, body, step.name, "effect", { ...fields, principal: resolveObject(c, step.principal), resource: resolveObject(c, step.resource), operation: step.operation, authorizedBy: step.authorizedBy?.map(ref => c.guards[ref] ?? id([questionId, "missing-guard", ref])) })
          else if (step.kind === "reject") terminal(u, c, instance, body, step.name, "reject", { ...fields, outcome: "deny" })
          else if (step.kind === "unresolved") gap(u, c, instance, body, step.name, step.reason)
          else if (step.kind === "return") {
            if (u.role === "entry") {
              const unspecified = !step.outcome || step.outcome === "unknown"
              if (unspecified) fault(questionId, u.handle, "entry-return-outcome-unspecified", `Entry return ${body}.${step.name} has no interpreted permission outcome. Explain its source-visible allow/deny outcome or retain a named source gap; scalar return values never establish permission.`)
              terminal(u, c, instance, body, step.name, unspecified ? "unresolved" : "return", { ...fields, outcome: step.outcome, returnValue: step.value, ...(unspecified ? { gap: "entry-return-outcome-unspecified" } : {}) })
            }
            else { append(u, c, instance, body, step.name, "continue", { ...fields, returnValue: step.value }); c.returned = true; if ("value" in step) c.returnValue = step.value }
          } else if (step.kind === "call") {
            const call = append(u, c, instance, body, step.name, "call", fields), callee = local.find(unit => unit.handle === step.callee && unit.role === "helper")
            if (!callee) {
              dependencies.push({ key: id([call.key, "dependency"]), questionId, pathKey: call.pathKey, from: call.key, symbol: step.symbol, evidenceIds: u.evidenceIds, reason: step.claim, kind: "control", decisive: true, after: [call.key], ...(step.pathHint ? { pathHint: step.pathHint } : {}), ...(step.candidateId ? { candidateId: step.candidateId } : {}) })
              gap(u, c, instance, body, step.name, "semantic-callee-uninterpreted"); next.push(c); continue
            }
            const child: Cursor = { ...structuredClone(c), objects: Object.fromEntries(Object.entries(c.objects).filter(([key]) => key.includes("."))), values: {}, returned: false }
            const invalidArguments: string[] = []
            for (const parameter of callee.parameters) {
              const arg = step.arguments.find(arg => arg.parameter === parameter.name), object = arg && c.objects[arg.object]
              const expected = `helper "${callee.handle}" parameter "${parameter.name}" (${parameter.type})`
              if (!arg) invalidArguments.push(`Missing argument mapping for ${expected}.`)
              else if (!object) invalidArguments.push(`Object "${arg.object}" mapped to ${expected} is not bound in this invocation; declare an entry parameter or a typed bind.`)
              else if (object.type !== parameter.type) invalidArguments.push(`Object "${arg.object}" has type ${object.type}, but ${expected} requires ${parameter.type}.`)
              else child.objects[parameter.name] = object
            }
            if (invalidArguments.length) { gap(u, c, instance, body, step.name, "semantic-argument-unbound", invalidArguments.join(" ")); next.push(c); continue }
            const calleeInstance = `${instance}.${step.name}`, expanded = walk(callee, callee.start, [child], calleeInstance, [...stack, marker])
            for (const returned of expanded) {
              if (!callee.complete && !returned.stopped) gap(callee, returned, calleeInstance, callee.start, "$closure", "semantic-helper-incomplete")
              const resumed: Cursor = { ...returned, objects: structuredClone(c.objects), values: structuredClone(c.values), returned: false }
              if (step.result && Object.hasOwn(returned, "returnValue")) resumed.values[step.result] = returned.returnValue!
              next.push(resumed)
            }
            continue
          }
          next.push(c)
        }
        current = next
      }
      return current
    }
    try {
      for (const root of roots) {
        const cursor: Cursor = { tail: "", route: [root.handle], objects: {}, guards: {}, values: {} }
        append(root, cursor, root.handle, root.start, "$entry", "entry", { claim: `Source entry ${root.handle}` })
        for (const parameter of root.parameters) {
          const identity = id([questionId, root.handle, "parameter", parameter.name])
          cursor.objects[parameter.name] = { identity, type: parameter.type }; cursor.objects[`${root.handle}.${parameter.name}`] = cursor.objects[parameter.name]!
          append(root, cursor, root.handle, root.start, `$parameter.${parameter.name}`, "binding", { claim: `Explicit entry parameter ${parameter.name} (${parameter.type})`, bindingKey: identity, bindingKind: parameter.type })
        }
        for (const c of walk(root, root.start, [cursor], root.handle, [])) if (!c.stopped) {
          if (!root.complete || !root.fallthrough || root.fallthrough === "unresolved") gap(root, c, root.handle, root.start, "$end", "semantic-entry-incomplete")
          else terminal(root, c, root.handle, root.start, "$end", "return", { outcome: root.fallthrough, claim: "Explicit normal fallthrough outcome" })
        }
      }
    } catch (error) {
      rules = rules.slice(0, startIndex); dependencies = dependencies.slice(0, dependencyIndex); pathCount = 0
      const code = (error as Error).message, root = roots[0]!
      if (!root || !["semantic-node-limit", "semantic-path-limit"].includes(code)) throw error
      fault(questionId, root.handle, code, "Bounded expansion exhausted. This question remains unresolved; other questions are retained.")
      const c: Cursor = { tail: "", route: [root.handle, "limit"], objects: {}, guards: {}, values: {} }
      append(root, c, root.handle, root.start, "$entry", "entry"); terminal(root, c, root.handle, root.start, "$limit", "unresolved", { gap: code, claim: code, complete: false })
    }
    for (const u of local) owned.push({ questionId, handle: u.handle, ruleKeys: rules.slice(startIndex).filter(r => r.sourceOrigin?.handle === u.handle).map(r => r.key) })
  }
  return { delta: { schemaVersion: "authorization-control-slice/v2" as const, rules, dependencies, bindings: [], policyRules: [] }, diagnostics, owned }
}

export function semanticBlockDiagnostics(unit: SemanticBlock): InquiryDiagnostic[] {
  const ds: InquiryDiagnostic[] = [], duplicate = (names: string[], at: string) => { if (new Set(names).size !== names.length) ds.push({ code: "semantic-duplicate", path: at, message: "Semantic names must be unique in this local scope.", severity: "error" }) }
  duplicate(unit.blocks.map(b => b.name), "blocks"); duplicate(unit.parameters.map(p => p.name), "parameters")
  duplicate(unit.blocks.flatMap(b => b.steps.map(s => s.name)), "steps")
  for (const b of unit.blocks) for (const s of b.steps) for (const expr of s.kind === "choose" ? s.cases.map(c => c.condition) : s.kind === "guard" && s.condition ? [s.condition] : []) for (const code of predicateDiagnostics(expr)) ds.push({ code, path: `blocks.${b.name}.${s.name}`, message: "Only the bounded predicate algebra is executable.", severity: "error" })
  return ds
}
