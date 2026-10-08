import { z } from "zod"
import { createHash } from "node:crypto"
import { InquiryText, type InquiryDiagnostic } from "./inquiry.ts"
import { canonicalControl, FiniteValueSchema, type ControlRule, type ControlDependency } from "./control-slice.ts"
import { predicateDiagnostics, partialEvaluate, scalar as isScalar, type Scalar, type FiniteValue } from "./control-evaluation.ts"
import { summarizeProcedure } from "./procedure-summary.ts"

const name = InquiryText.refine(s => !["__proto__", "constructor", "prototype"].includes(s), "Reserved semantic name")
const condition = z.record(z.unknown())
const scalar = z.union([z.string(), z.number().finite(), z.boolean(), z.null()])
const common = { name, claim: InquiryText }
const objects = { principal: name.optional(), resource: name.optional() }
const operand = z.record(z.unknown()).refine(v => !predicateDiagnostics({ op: "truthy", language: "python", value: v }).length, "Finite source operand required")
const methodRead = z.object({ receiver: name, method: name, defaultMethod: name.optional() }).strict()
const boundMethod = z.object({ receiver: name, targetId: name, targetSha256: name }).strict()
const sourceCallable = z.object({ targetId: name, targetSha256: name, scope: z.literal("module").optional(), captures: z.array(z.object({ parameter: name, object: name }).strict()).max(16).refine(values => new Set(values.map(v => v.parameter)).size === values.length, "Unique captured parameters required") }).strict()
const callableRead = z.object({ object: name, targetId: name, targetSha256: name }).strict()
const sourceClass = z.object({ targetId: name, targetSha256: name, scope: z.literal("definition").optional() }).strict()
export const SemanticStepSchema = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("bind"), type: z.enum(["principal", "resource", "permission", "configuration", "value"]), bindingName: name.optional(), aliasOf: name.optional(), value: FiniteValueSchema.optional() }).strict(),
  z.object({ ...common, ...objects, kind: z.literal("guard"), condition: condition.optional() }).strict(),
  z.object({ ...common, kind: z.literal("choose"), cases: z.array(z.object({ condition, body: name }).strict()).min(1).max(16), otherwise: name.optional() }).strict(),
  z.object({ ...common, ...objects, kind: z.literal("call"), symbol: name, sourceCallId: name.optional(), callee: name.optional(), result: name.optional(), arguments: z.array(z.object({ parameter: name, object: name }).strict()).max(16).default([]), pathHint: InquiryText.optional(), candidateId: InquiryText.optional(), methodRead: methodRead.optional(), fieldMethodRead: boundMethod.extend({ object: name }).optional(), callableRead: callableRead.optional() }).strict(),
  z.object({ ...common, ...objects, kind: z.literal("effect"), operation: InquiryText.optional(), authorizedBy: z.array(name).max(16).optional(), mayRaise: z.boolean().optional() }).strict(),
  z.object({ ...common, kind: z.literal("return"), value: scalar.optional(), valueFrom: name.optional(), object: name.optional(), outcome: z.enum(["allow", "deny", "unknown"]).optional() }).strict(),
  z.object({ ...common, kind: z.literal("reject"), failureKind: z.enum(["authorization", "operation"]).optional() }).strict(),
  z.object({ ...common, kind: z.literal("transform"), object: name, field: name, value: FiniteValueSchema.optional(), source: name.optional() }).strict(),
  z.object({ ...common, kind: z.literal("unresolved"), reason: InquiryText }).strict(),
  z.object({ ...common, kind: z.literal("context"), relationship: z.enum(["route-registration", "class-configuration", "dispatch-binding"]), mayRaise: z.boolean().optional() }).strict(),
  z.object({ ...common, kind: z.literal("assign-value"), result: name, value: operand, methodRead: methodRead.optional(), boundMethod: boundMethod.optional(), sourceCallable: sourceCallable.optional(), sourceClass: sourceClass.optional() }).strict(),
  z.object({ ...common, kind: z.literal("short-circuit"), operator: z.enum(["and", "or"]), language: z.enum(["python", "go"]), left: operand, right: operand, body: name, result: name }).strict(),
  z.object({ ...common, kind: z.literal("try"), body: name, handlers: z.array(z.object({ exceptionTypes: z.array(name).max(16), catchesAll: z.boolean(), body: name, unknownType: z.boolean().optional() }).strict()).max(16), otherwise: name.optional(), finally: name.optional() }).strict(),
  z.object({ ...common, kind: z.literal("raise"), exceptionType: name.optional(), failureKind: z.enum(["authorization", "operation"]).optional(), rethrow: z.boolean().optional() }).strict(),
  z.object({ ...common, kind: z.literal("with"), enter: name, body: name, exitUnknown: z.boolean() }).strict(),
  z.object({ ...common, kind: z.literal("loop"), target: name.optional(), iterable: FiniteValueSchema.optional(), iterableFrom: operand.optional(), condition: condition.optional(), body: name, otherwise: name.optional() }).strict(),
  z.object({ ...common, kind: z.literal("break") }).strict(),
  z.object({ ...common, kind: z.literal("continue") }).strict(),
])
export const SEMANTIC_BLOCK_LIMIT = 64
export const SemanticBlockSchema = z.object({ itemId: name, handle: name, op: z.enum(["add", "replace"]), role: z.enum(["entry", "helper"]), start: name, complete: z.boolean(), coverage: z.literal("path").optional(), repairsDraftId: name.optional(), fallthrough: z.enum(["allow", "deny", "unresolved"]).optional(), parameters: z.array(z.object({ name, type: z.enum(["principal", "resource", "permission", "configuration", "value"]) }).strict()).max(16).default([]), blocks: z.array(z.object({ name, steps: z.array(SemanticStepSchema).max(160) }).strict()).min(1).max(SEMANTIC_BLOCK_LIMIT) }).strict()
export type SemanticBlock = z.infer<typeof SemanticBlockSchema>
export type BoundSemanticBlock = SemanticBlock & { questionId: string; evidenceIds: string[]; receiverClass?: string; source?: { id: string; path: string; sha256: string; startLine: number; endLine: number } }
type Step = z.infer<typeof SemanticStepSchema>
export interface PropertyContextSummary {
  questionId: string; handle: string; instance: string; block: string; sourceSteps: string[]; failureSteps: string[]
  semantics: "normal-all-or-first-unknown-exception"; outcomeBinding?: string; normalRuleKey?: string; exceptionRuleKey?: string
}
interface Exit { kind: "return" | "raise" | "break" | "continue"; claim: string; outcome?: "allow" | "deny" | "unknown"; exceptionType?: string; failureKind?: "authorization" | "operation" }
interface ObjectBinding { identity: string; type: string; boundMethod?: { receiverIdentity: string; targetId: string; targetSha256: string }; sourceCallable?: { targetId: string; targetSha256: string; captures: Record<string, ObjectBinding> }; sourceClass?: { targetId: string; targetSha256: string } }
interface Cursor { tail: string; route: string[]; objects: Record<string, ObjectBinding>; fieldObjects: Record<string, ObjectBinding | null>; guards: Record<string, string>; values: Record<string, FiniteValue>; objectValues: Record<string, FiniteValue>; operands?: Record<string, Record<string, unknown>>; stopped?: boolean; returned?: boolean; returnValue?: FiniteValue; returnObject?: ObjectBinding; pending?: Exit; handledException?: Exit }
const id = (parts: unknown[]) => "sem-" + createHash("sha256").update(canonicalControl(parts)).digest("hex").slice(0, 24)

/** The host compiles only explicit source interpretations; it never parses target code into an answer. */
export function lowerSemanticFlow(units: BoundSemanticBlock[], options: { compositional?: boolean; propertyDirected?: boolean } = {}) {
  let rules: ControlRule[] = [], dependencies: ControlDependency[] = []
  const diagnostics: InquiryDiagnostic[] = [], owned: Array<{ questionId: string; handle: string; ruleKeys: string[] }> = []
  const fieldChanges: Array<{ questionId: string; handle: string; step: string; object: string; field: string; value?: FiniteValue; source?: string; evidenceIds: string[] }> = []
  const propertySummaries: PropertyContextSummary[] = []
  const fault = (q: string, handle: string, code: string, message: string) => diagnostics.push({ code, path: `semanticBlocks.${q}.${handle}`, questionId: q, message, severity: "error" })
  for (const questionId of new Set(units.map(u => u.questionId))) {
    const local = units.filter(u => u.questionId === questionId), roots = local.filter(u => u.role === "entry"), startIndex = rules.length, dependencyIndex = dependencies.length, fieldIndex = fieldChanges.length, summaryIndex = propertySummaries.length
    let serial = 0, pathCount = 0
    const append = (u: BoundSemanticBlock, c: Cursor, instance: string, block: string, step: string, kind: ControlRule["kind"], fields: Partial<ControlRule> = {}) => {
      if (rules.length - startIndex >= 127) throw new Error("semantic-node-limit")
      const key = id([questionId, instance, block, step, c.route, serial++])
      const r: ControlRule = { key, questionId, pathKey: id([questionId, "path", c.route]), kind, after: c.tail ? [c.tail] : [], evidenceIds: u.evidenceIds, claim: fields.claim ?? u.handle, terminal: false, sourceOrigin: { handle: u.handle, block, step, instance }, ...fields }
      rules.push(r); c.tail = key; return r
    }
    const terminal = (u: BoundSemanticBlock, c: Cursor, instance: string, block: string, step: string, kind: "return" | "reject" | "unresolved", fields: Partial<ControlRule>) => {
      if (++pathCount > 16) throw new Error("semantic-path-limit")
      append(u, c, instance, block, step, kind, { terminal: true, complete: (u.complete || u.coverage === "path") && kind !== "unresolved", ...fields }); c.stopped = true
    }
    const gap = (u: BoundSemanticBlock, c: Cursor, instance: string, block: string, step: string, code: string, detail?: string) => { fault(questionId, u.handle, code, `Unresolved local source relation at ${block}.${step}; ${detail ?? "no alternative or call meaning was inferred."}`); terminal(u, c, instance, block, step, "unresolved", { gap: code, claim: code, complete: false }) }
    const valueObject = (c: Cursor, ref: string): ObjectBinding | undefined => {
      const base = Object.keys(c.objects).sort((a, b) => b.length - a.length).find(key => ref.startsWith(`${key}.`))
      if (base) {
        const parent = valueObject(c, base)!
        let projected = parent, stored = parent.identity !== c.objects[base]!.identity
        for (const field of ref.slice(base.length + 1).split(".")) {
          const key = `${projected.identity}.${field}`
          stored ||= Object.hasOwn(c.fieldObjects, key)
          projected = c.fieldObjects[key] ?? { identity: key, type: "value" }
        }
        if (stored || !c.objects[ref]) return projected
      }
      if (c.objects[ref]) return c.objects[ref]
      if (Object.hasOwn(c.fieldObjects, ref)) return c.fieldObjects[ref] ?? { identity: ref, type: "value" }
      if (Object.hasOwn(c.values, ref)) {
        const identity = id([questionId, "source-value", c.route, ref, c.values[ref]])
        setSourceValue(c, identity, { value: c.values[ref]! }); return { identity, type: "value" }
      }
      const source = c.operands?.[ref]?.binding
      if (typeof source === "string" && source !== ref) {
        const mapped = valueObject(c, source)
        if (mapped) return { ...mapped, type: "value" }
      }
      return undefined
    }
    const setSourceValue = (c: Cursor, key: string, literal?: { value: FiniteValue }, parent?: string, field?: string) => {
      const previous = parent ? c.objectValues[parent] : undefined
      for (const stored of Object.keys(c.objectValues)) {
        if (stored === key || stored.startsWith(`${key}.`) || key.startsWith(`${stored}.`)) delete c.objectValues[stored]
      }
      if (parent && field && previous !== null && typeof previous === "object" && !Array.isArray(previous) && literal && (literal.value === null || typeof literal.value !== "object")) {
        const updated = { ...previous, [field]: literal.value }
        if (Object.keys(updated).length <= 64) c.objectValues[parent] = updated
      }
      if (!literal) return
      const value = structuredClone(literal.value); c.objectValues[key] = value
      if (value !== null && typeof value === "object" && !Array.isArray(value)) for (const [field, scalar] of Object.entries(value)) c.objectValues[`${key}.${field}`] = scalar
    }
    const predicate = (input: unknown, c: Cursor): any => {
      if (Array.isArray(input)) return input.map(v => predicate(v, c))
      if (!input || typeof input !== "object") return input
      const object = input as Record<string, unknown>
      if (Object.hasOwn(object, "literal")) return structuredClone(input)
      if (typeof object.binding === "string" && Object.hasOwn(c.values, object.binding)) return { literal: c.values[object.binding] }
      if (typeof object.binding === "string" && c.operands?.[object.binding]) return structuredClone(c.operands[object.binding])
      if (typeof object.binding === "string") {
        const reference = object.binding, resolved = valueObject(c, reference)
        if (resolved && (resolved.type === "value" || reference.includes("."))) {
          const key = resolved.identity
          return Object.hasOwn(c.objectValues, key) ? { literal: structuredClone(c.objectValues[key]) } : { binding: key }
        }
      }
      return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, predicate(value, c)]))
    }
    const resolveObject = (c: Cursor, ref?: string) => ref ? valueObject(c, ref)?.identity ?? id([questionId, "unbound-object", ref]) : undefined
    const assignValue = (c: Cursor, result: string, value: Record<string, unknown>) => {
      const actual = predicate(value, c), reference = typeof value.binding === "string" ? valueObject(c, value.binding) : undefined
      delete c.values[result]; delete c.objects[result]; c.operands ??= {}; delete c.operands[result]
      if (reference?.sourceCallable || reference?.boundMethod || reference?.sourceClass) c.objects[result] = structuredClone(reference)
      else if (Object.hasOwn(actual, "literal")) c.values[result] = structuredClone(actual.literal)
      else c.operands[result] = actual
    }
    const finish = (u: BoundSemanticBlock, c: Cursor, instance: string, body: string, step: string) => {
      const exit = c.pending
      if (!exit) return
      if (exit.kind === "raise") {
        if (!exit.exceptionType || !exit.failureKind) gap(u, c, instance, body, step, "semantic-exception-type-unknown")
        else terminal(u, c, instance, body, step, "reject", { claim: exit.claim, outcome: "deny", failureKind: exit.failureKind })
      } else if (exit.kind === "return") {
        if (!exit.outcome || exit.outcome === "unknown") gap(u, c, instance, body, step, "entry-return-outcome-unspecified")
        else terminal(u, c, instance, body, step, "return", { claim: exit.claim, outcome: exit.outcome, ...(isScalar(c.returnValue) ? { returnValue: c.returnValue } : {}) })
      } else gap(u, c, instance, body, step, "semantic-loop-exit-outside-loop")
    }
    const walk = (u: BoundSemanticBlock, body: string, cursors: Cursor[], instance: string, stack: string[]): Cursor[] => {
      const marker = `${u.handle}:${body}`
      if (stack.includes(marker) || stack.length >= 12) { for (const c of cursors.filter(c => !c.stopped && !c.returned)) gap(u, c, instance, body, "$cycle", "semantic-cycle"); return cursors }
      const b = u.blocks.find(b => b.name === body)
      if (!b) { for (const c of cursors.filter(c => !c.stopped && !c.returned)) gap(u, c, instance, body, "$missing", "semantic-body-missing"); return cursors }
      let current = cursors
      for (let stepIndex = 0; stepIndex < b.steps.length; stepIndex++) {
        const step = b.steps[stepIndex]!, contexts: Extract<Step, { kind: "context" }>[] = []
        // The explicit context step has no state delta. Only adjacent such steps
        // in this exact block/invocation can share the same failure continuation.
        // Calls, values, objects, guards, effects and control regions end the run.
        if (options.propertyDirected && step.kind === "context") {
          contexts.push(step)
          while (b.steps[stepIndex + 1]?.kind === "context") contexts.push(b.steps[++stepIndex] as Extract<Step, { kind: "context" }>)
        }
        const next: Cursor[] = []
        for (const cursor of current) {
          if (cursor.stopped || cursor.returned || cursor.pending) { next.push(cursor); continue }
          const c = structuredClone(cursor), fields = { claim: step.claim }
          const summary: PropertyContextSummary | undefined = contexts.length ? { questionId, handle: u.handle, instance, block: body, sourceSteps: contexts.map(s => s.name), failureSteps: u.coverage === "path" ? contexts.filter(s => s.mayRaise).map(s => s.name) : [], semantics: "normal-all-or-first-unknown-exception" } : undefined
          if (summary) propertySummaries.push(summary)
          const groupStep = contexts.length > 1 ? `$context-sequence-${id(contexts.map(s => s.name))}` : step.name
          const groupOrigin = summary ? { handle: u.handle, block: body, step: groupStep, instance, steps: summary.sourceSteps } : undefined
          if (u.coverage === "path" && ((step.kind === "effect" || step.kind === "context") && step.mayRaise || summary?.failureSteps.length)) {
            // This abstract outcome means all source contexts returned normally,
            // or the first unknown exception in their retained ordered origins.
            // No per-context outcome becomes a known user/source value.
            const outcome = contexts.length > 1 ? `${instance}.${body}:context-sequence-${id(contexts.map(s => s.name))}:call-outcome` : `${instance}.${body}.${step.name}:call-outcome`, thrown = structuredClone(cursor)
            const failureClaim = contexts.length > 1 ? `Unknown exception in ordered source context sequence (${summary!.failureSteps.length} possible origins)` : `Unknown source call exception: ${step.claim}`
            thrown.route.push(`${outcome}:exception`); thrown.pending = { kind: "raise", claim: failureClaim }
            const failureRule = append(u, thrown, instance, body, groupStep, "continue", { ...fields, ...(groupOrigin ? { sourceOrigin: { ...groupOrigin, steps: summary!.failureSteps }, claim: failureClaim } : {}), condition: { op: "eq", left: { binding: outcome }, right: { literal: "exception" } } }); next.push(thrown)
            c.route.push(`${outcome}:normal`); const normalRule = append(u, c, instance, body, groupStep, "continue", { ...fields, ...(groupOrigin ? { sourceOrigin: groupOrigin, claim: `All ${contexts.length} interpreted source contexts returned normally` } : {}), condition: { op: "eq", left: { binding: outcome }, right: { literal: "normal" } } })
            if (summary) Object.assign(summary, { outcomeBinding: outcome, normalRuleKey: normalRule.key, exceptionRuleKey: failureRule.key })
          }
          if (step.kind === "choose") {
            const prior: unknown[] = []
            for (const [index, branch] of step.cases.entries()) {
              const alternative = structuredClone(c); alternative.route.push(`${instance}.${body}.${step.name}:${index}`)
              const test = predicate(branch.condition, c), reach = prior.length ? { op: "all", args: [test, { op: "not", arg: { op: "any", args: [...prior] } }] } : test
              if (u.coverage === "path" && partialEvaluate(reach, {}).truth === "false") { prior.push(test); continue }
              append(u, alternative, instance, body, step.name, "continue", { ...fields, condition: reach }); next.push(...walk(u, branch.body, [alternative], instance, [...stack, marker])); prior.push(test)
            }
            const other = structuredClone(c); other.route.push(`${instance}.${body}.${step.name}:else`)
            const otherwiseCondition = { op: "not", arg: { op: "any", args: prior } }
            if (u.coverage === "path" && partialEvaluate(otherwiseCondition, {}).truth === "false") continue
            if (step.otherwise) { append(u, other, instance, body, step.name, "continue", { ...fields, condition: otherwiseCondition }); next.push(...walk(u, step.otherwise, [other], instance, [...stack, marker])) }
            else { gap(u, other, instance, body, step.name, "choice-uncovered"); next.push(other) }
            continue
          }
          if (step.kind === "try") {
            const scope = [...stack, marker], attempted = walk(u, step.body, [c], instance, scope), handled: Cursor[] = []
            for (const attemptedCursor of attempted) {
              if (attemptedCursor.stopped) { handled.push(attemptedCursor); continue }
              if (attemptedCursor.pending?.kind !== "raise") { handled.push(...(!attemptedCursor.pending && step.otherwise ? walk(u, step.otherwise, [attemptedCursor], instance, scope) : [attemptedCursor])); continue }
              const exception = attemptedCursor.pending
              // Match in source order. A later exact handler cannot bypass an
              // earlier uncertain subtype or dynamic match; bare except consumes
              // only the exceptions left by all preceding handlers.
              const prior: unknown[] = []; let exhaustive = false
              for (const [i, handler] of step.handlers.entries()) {
                const possible = structuredClone(attemptedCursor); delete possible.pending; possible.handledException = exception; possible.route.push(`${instance}.${step.name}:handler${i}`)
                const guaranteed = handler.catchesAll || !handler.unknownType && !!exception.exceptionType && handler.exceptionTypes.includes(exception.exceptionType)
                const test = guaranteed ? { op: "eq", left: { literal: true }, right: { literal: true } } : { op: "eq", left: { binding: `${instance}.${step.name}:exception-match` }, right: { literal: i } }, condition = prior.length ? { op: "all", args: [test, { op: "not", arg: { op: "any", args: [...prior] } }] } : test
                append(u, possible, instance, body, step.name, "continue", { ...fields, condition }); handled.push(...walk(u, handler.body, [possible], instance, scope)); prior.push(test)
                if (guaranteed) { exhaustive = true; break }
              }
              if (!exhaustive) {
                const unmatched = structuredClone(attemptedCursor)
                if (step.handlers.length) { unmatched.route.push(`${instance}.${step.name}:unmatched`); append(u, unmatched, instance, body, step.name, "continue", { ...fields, condition: { op: "not", arg: { op: "any", args: prior } } }); unmatched.pending = { ...exception, exceptionType: undefined } }
                handled.push(unmatched)
              }
            }
            for (const handledCursor of handled) {
              if (!step.finally || handledCursor.stopped) { next.push(handledCursor); continue }
              const saved = handledCursor.pending, savedValue = handledCursor.returnValue, savedObject = handledCursor.returnObject, finalCursor = structuredClone(handledCursor)
              delete finalCursor.pending; finalCursor.returned = false; delete finalCursor.returnValue; delete finalCursor.returnObject
              for (const done of walk(u, step.finally, [finalCursor], instance, scope)) {
                if (!done.pending && !done.stopped) { done.pending = saved; done.returnValue = savedValue; done.returnObject = savedObject }
                next.push(done)
              }
            }
            continue
          }
          if (step.kind === "with") {
            const entered = walk(u, step.enter, [c], instance, [...stack, marker])
            for (const entering of entered) {
              if (entering.stopped || entering.pending) { next.push(entering); continue }
              for (const done of walk(u, step.body, [entering], instance, [...stack, marker])) { if (!done.stopped && step.exitUnknown) gap(u, done, instance, body, step.name, "semantic-context-exit-unknown"); next.push(done) }
            }
            continue
          }
          if (step.kind === "short-circuit") {
            const test = { op: "truthy", language: step.language, value: predicate(step.left, c) }, truth = partialEvaluate(test, {})
            if (truth.diagnostics.length) { gap(u, c, instance, body, step.name, "semantic-short-circuit-type-error"); next.push(c); continue }
            for (const executeRight of [false, true]) {
              const condition = executeRight === (step.operator === "and") ? test : { op: "not", arg: test }
              if (partialEvaluate(condition, {}).truth === "false") continue
              const selected = structuredClone(c); selected.route.push(`${instance}.${step.name}:${executeRight ? "rhs" : "left"}`)
              append(u, selected, instance, body, step.name, "continue", { ...fields, condition })
              if (!executeRight) { assignValue(selected, step.result, step.left); next.push(selected) }
              else for (const done of walk(u, step.body, [selected], instance, [...stack, marker])) { if (!done.pending && !done.stopped) assignValue(done, step.result, step.right); next.push(done) }
            }
            continue
          }
          if (step.kind === "loop") {
            const input = Object.hasOwn(step, "iterable") ? { literal: step.iterable } : step.iterableFrom ? predicate(step.iterableFrom, c) : undefined
            const literal = input && Object.hasOwn(input, "literal") ? input.literal : undefined
            if (Array.isArray(literal) && literal.length <= 8) {
              let active = [c]; const exited: Cursor[] = []
              for (const [i, value] of literal.entries()) {
                const upcoming: Cursor[] = []
                for (const current of active) {
                  if (step.target) assignValue(current, step.target, { literal: value }); current.route.push(`${instance}.${step.name}:iteration${i}`)
                  for (const done of walk(u, step.body, [current], `${instance}.${step.name}.${i}`, [...stack, marker])) {
                    if (done.pending?.kind === "break") { delete done.pending; exited.push(done) }
                    else if (done.stopped || done.pending && done.pending.kind !== "continue") exited.push(done)
                    else { delete done.pending; upcoming.push(done) }
                  }
                }
                active = upcoming
              }
              next.push(...exited, ...(step.otherwise ? walk(u, step.otherwise, active, instance, [...stack, marker]) : active))
            } else if (literal !== undefined) { gap(u, c, instance, body, step.name, "semantic-loop-finite-limit"); next.push(c) }
            else {
              const condition = step.condition ? predicate(step.condition, c) : { op: "truthy", language: "python", value: { binding: `${instance}.${step.name}:has-first` } }
              for (const first of [false, true]) {
                const reach = first ? condition : { op: "not", arg: condition }
                if (partialEvaluate(reach, {}).truth === "false") continue
                const selected = structuredClone(c); selected.route.push(`${instance}.${step.name}:${first ? "first" : "empty"}`); append(u, selected, instance, body, step.name, "continue", { ...fields, condition: reach })
                if (!first) next.push(...(step.otherwise ? walk(u, step.otherwise, [selected], instance, [...stack, marker]) : [selected]))
                else {
                  if (step.target) { delete selected.values[step.target]; delete selected.objects[step.target]; if (selected.operands) delete selected.operands[step.target] }
                  for (const done of walk(u, step.body, [selected], `${instance}.${step.name}.first`, [...stack, marker])) {
                    if (done.pending?.kind === "break") delete done.pending
                    else if (!done.stopped && (!done.pending || done.pending.kind === "continue")) { delete done.pending; gap(u, done, instance, body, step.name, "semantic-loop-subsequent-unknown") }
                    next.push(done)
                  }
                }
              }
            }
            continue
          }
          if ((step.kind === "assign-value" || step.kind === "call") && step.methodRead) {
            const read = step.methodRead, receiver = valueObject(c, read.receiver)
            if (!receiver) { gap(u, c, instance, body, step.name, "semantic-method-receiver-unbound"); next.push(c); continue }
            // An unknown store still leaves a fieldObjects marker. Check at the
            // original read, so later writes cannot change a copied bound method.
            const slots = [read.method, ...(read.defaultMethod ? [read.defaultMethod] : []), "__class__"].map(field => `${receiver.identity}.${field}`)
            if (Object.keys(c.fieldObjects).some(key => slots.some(slot => key === slot || key.startsWith(`${slot}.`)))) { gap(u, c, instance, body, step.name, "source-method-slot-written"); next.push(c); continue }
          }
          if (step.kind === "call" && step.fieldMethodRead) {
            const read = step.fieldMethodRead, reference = valueObject(c, read.object)?.boundMethod, receiver = valueObject(c, read.receiver)
            if (!reference || !receiver || reference.receiverIdentity !== receiver.identity || reference.targetId !== read.targetId || reference.targetSha256 !== read.targetSha256 || Object.keys(c.fieldObjects).some(key => key === `${receiver.identity}.__class__` || key.startsWith(`${receiver.identity}.__class__.`))) { gap(u, c, instance, body, step.name, "source-field-method-value-unresolved"); next.push(c); continue }
          }
          const callable = step.kind === "call" && step.callableRead ? valueObject(c, step.callableRead.object)?.sourceCallable : undefined
          if (step.kind === "call" && step.callableRead && (!callable || callable.targetId !== step.callableRead.targetId || callable.targetSha256 !== step.callableRead.targetSha256)) { gap(u, c, instance, body, step.name, "source-callable-value-unresolved"); next.push(c); continue }
          if (step.kind === "call" && step.callableRead && Object.keys(c.fieldObjects).some(key => key.startsWith(`${valueObject(c, step.callableRead!.object)!.identity}.`))) { gap(u, c, instance, body, step.name, "source-callable-attributes-written"); next.push(c); continue }
          if (step.kind === "assign-value") {
            if (step.sourceClass && (!Object.hasOwn(step.value, "literal") || step.boundMethod || step.sourceCallable || step.methodRead)) { gap(u, c, instance, body, step.name, "source-class-creation-unresolved"); next.push(c); continue }
            const captures = step.sourceCallable?.captures.map(capture => ({ parameter: capture.parameter, object: valueObject(c, capture.object) }))
            if (step.sourceCallable && (!Object.hasOwn(step.value, "literal") || step.boundMethod || step.sourceCallable.scope === "module" && captures!.length !== 0 || captures!.some(capture => !capture.object) || new Set(captures!.map(capture => capture.parameter)).size !== captures!.length)) { gap(u, c, instance, body, step.name, "source-callable-creation-unresolved"); next.push(c); continue }
            assignValue(c, step.result, step.value)
            if (step.boundMethod) {
              const reference = step.boundMethod, receiver = valueObject(c, reference.receiver)
              if (!receiver || !step.methodRead || step.methodRead.receiver !== reference.receiver || !Object.hasOwn(step.value, "literal")) { gap(u, c, instance, body, step.name, "source-bound-method-creation-unresolved"); next.push(c); continue }
              const identity = id([questionId, instance, body, step.name, c.route, "bound-method"])
              c.objects[step.result] = { identity, type: "value", boundMethod: { receiverIdentity: receiver.identity, targetId: reference.targetId, targetSha256: reference.targetSha256 } }
              setSourceValue(c, identity, { value: c.values[step.result]! }); delete c.values[step.result]
            }
            if (step.sourceCallable) {
              const identity = step.sourceCallable.scope === "module" ? id([questionId, "module-callable", step.sourceCallable.targetId, step.sourceCallable.targetSha256]) : id([questionId, instance, body, step.name, c.route, "source-callable"])
              c.objects[step.result] = { identity, type: "value", sourceCallable: { targetId: step.sourceCallable.targetId, targetSha256: step.sourceCallable.targetSha256, captures: Object.fromEntries(captures!.map(capture => [capture.parameter, structuredClone(capture.object!)])) } }
              setSourceValue(c, identity, { value: c.values[step.result]! }); delete c.values[step.result]
            }
            if (step.sourceClass) {
              const identity = step.sourceClass.scope === "definition" ? id([questionId, instance, body, step.name, c.route, "source-class"]) : id([questionId, "module-class", step.sourceClass.targetId, step.sourceClass.targetSha256])
              c.objects[step.result] = { identity, type: "value", sourceClass: { targetId: step.sourceClass.targetId, targetSha256: step.sourceClass.targetSha256 } }
              // Reading a loaded module class preserves every earlier mutation.
              c.objectValues[identity] = c.values[step.result]!; delete c.values[step.result]
            }
            append(u, c, instance, body, step.name, "continue", fields)
          }
          else if (step.kind === "raise") { append(u, c, instance, body, step.name, "continue", fields); c.pending = step.rethrow ? c.handledException ?? { kind: "raise", claim: step.claim } : { kind: "raise", claim: step.claim, exceptionType: step.exceptionType, failureKind: step.failureKind } }
          else if (step.kind === "break" || step.kind === "continue") { append(u, c, instance, body, step.name, "continue", fields); c.pending = { kind: step.kind, claim: step.claim } }
          else if (step.kind === "context") { if (!summary?.normalRuleKey) { const r = append(u, c, instance, body, groupStep, "continue", { ...fields, ...(groupOrigin ? { sourceOrigin: groupOrigin } : {}) }); if (summary) summary.normalRuleKey = r.key } }
          else if (step.kind === "bind") {
            if (Object.hasOwn(step, "value") && (step.type !== "value" || step.aliasOf)) { gap(u, c, instance, body, step.name, "semantic-source-value-invalid"); next.push(c); continue }
            const alias = step.aliasOf ? valueObject(c, step.aliasOf) : undefined
            if (step.aliasOf && (!alias || alias.type !== step.type)) { gap(u, c, instance, body, step.name, "semantic-alias-missing", `Alias "${step.name}" (${step.type}) references "${step.aliasOf}" (${alias?.type ?? "unbound"}). aliasOf requires an existing same-type identity; declare a source-supported typed field bind before its alias, without inventing user values.`); next.push(c); continue }
            const bindingName = step.bindingName ?? step.name
            delete c.values[bindingName]
            if (alias) { c.objects[step.name] = alias; append(u, c, instance, body, step.name, "continue", fields) }
            else {
              const identity = id([questionId, instance, "object", step.name]); c.objects[step.name] = { identity, type: step.type }; c.objects[`${u.handle}.${step.name}`] = c.objects[step.name]!
              if (Object.hasOwn(step, "value")) setSourceValue(c, identity, { value: step.value! })
              append(u, c, instance, body, step.name, "binding", { ...fields, bindingKey: identity, bindingKind: step.type, bindingName })
            }
            c.objects[bindingName] = c.objects[step.name]!
            c.objects[`${u.handle}.${bindingName}`] = c.objects[step.name]!
          } else if (step.kind === "guard") {
            const r = append(u, c, instance, body, step.name, "guard", { ...fields, ...(step.condition ? { condition: predicate(step.condition, c) } : {}), principal: resolveObject(c, step.principal), resource: resolveObject(c, step.resource) }); c.guards[step.name] = r.key; c.guards[`${u.handle}.${step.name}`] = r.key
          } else if (step.kind === "effect") append(u, c, instance, body, step.name, "effect", { ...fields, principal: resolveObject(c, step.principal), resource: resolveObject(c, step.resource), operation: step.operation, authorizedBy: step.authorizedBy?.map(ref => c.guards[ref] ?? id([questionId, "missing-guard", ref])) })
          else if (step.kind === "reject") terminal(u, c, instance, body, step.name, "reject", { ...fields, outcome: "deny", ...(step.failureKind ? { failureKind: step.failureKind } : {}) })
          else if (step.kind === "transform") {
            const object = valueObject(c, step.object)
            const sourceObject = step.source ? valueObject(c, step.source) : undefined
            if (!object || step.source && !sourceObject || Object.hasOwn(step, "value") === !!step.source) gap(u, c, instance, body, step.name, "semantic-transform-unbound")
            else {
              const key = `${object.identity}.${step.field}`, source = sourceObject?.identity
              const sourceValue = source && Object.hasOwn(c.objectValues, source) ? { value: structuredClone(c.objectValues[source]!) } : undefined
              setSourceValue(c, key, Object.hasOwn(step, "value") ? { value: step.value! } : sourceValue, object.identity, step.field)
              for (const stored of Object.keys(c.fieldObjects)) if (stored.startsWith(`${key}.`)) delete c.fieldObjects[stored]
              c.fieldObjects[key] = sourceObject && (sourceObject.type !== "value" || sourceObject.boundMethod || sourceObject.sourceCallable || sourceObject.sourceClass) ? { ...sourceObject } : null
              fieldChanges.push({ questionId, handle: u.handle, step: step.name, object: object.identity, field: step.field, ...(Object.hasOwn(step, "value") ? { value: step.value } : {}), ...(source ? { source } : {}), evidenceIds: u.evidenceIds }); append(u, c, instance, body, step.name, "continue", fields)
            }
          }
          else if (step.kind === "unresolved") gap(u, c, instance, body, step.name, step.reason)
          else if (step.kind === "return") {
            if (u.coverage === "path") {
              if (step.object && !valueObject(c, step.object)) { gap(u, c, instance, body, step.name, "semantic-return-object-unbound"); next.push(c); continue }
              append(u, c, instance, body, step.name, "continue", fields); c.pending = { kind: "return", claim: step.claim, outcome: step.outcome }
              if (Object.hasOwn(step, "value")) c.returnValue = step.value
              else if (step.valueFrom) { const object = valueObject(c, step.valueFrom), value = predicate({ binding: step.valueFrom }, c); if (object?.sourceCallable || object?.boundMethod || object?.sourceClass) c.returnObject = object; else if (Object.hasOwn(value, "literal")) c.returnValue = value.literal; else c.returnObject = object }
              if (step.object) c.returnObject = valueObject(c, step.object)
            } else if (u.role === "entry") {
              const unspecified = !step.outcome || step.outcome === "unknown"
              if (unspecified) fault(questionId, u.handle, "entry-return-outcome-unspecified", `Entry return ${body}.${step.name} has no interpreted permission outcome. Explain its source-visible allow/deny outcome or retain a named source gap; scalar return values never establish permission.`)
              terminal(u, c, instance, body, step.name, unspecified ? "unresolved" : "return", { ...fields, outcome: step.outcome, returnValue: step.value, ...(unspecified ? { gap: "entry-return-outcome-unspecified" } : {}) })
            }
            else {
              if (step.object && !valueObject(c, step.object)) { gap(u, c, instance, body, step.name, "semantic-return-object-unbound"); next.push(c); continue }
              append(u, c, instance, body, step.name, "continue", { ...fields, returnValue: step.value }); c.returned = true; if ("value" in step) c.returnValue = step.value
              if (step.object) c.returnObject = valueObject(c, step.object)
            }
          } else if (step.kind === "call") {
            const call = append(u, c, instance, body, step.name, "call", fields), callee = local.find(unit => unit.handle === step.callee && unit.role === "helper")
            if (!callee) {
              dependencies.push({ key: id([call.key, "dependency"]), questionId, pathKey: call.pathKey, from: call.key, symbol: step.symbol, evidenceIds: u.evidenceIds, reason: step.claim, kind: "control", decisive: true, after: [call.key], ...(step.pathHint ? { pathHint: step.pathHint } : {}), ...(step.candidateId ? { candidateId: step.candidateId } : {}) })
              gap(u, c, instance, body, step.name, "semantic-callee-uninterpreted"); next.push(c); continue
            }
            if (callable && callee.source && (callee.source.id !== callable.targetId || callee.source.sha256 !== callable.targetSha256)) { gap(u, c, instance, body, step.name, "source-callable-target-stale"); next.push(c); continue }
            if (callable && Object.keys(callable.captures).some(parameter => step.arguments.some(argument => argument.parameter === parameter) || !callee.parameters.some(p => p.name === parameter))) { gap(u, c, instance, body, step.name, "source-callable-capture-conflict"); next.push(c); continue }
            const child: Cursor = { ...structuredClone(c), objects: Object.fromEntries(Object.entries(c.objects).filter(([key]) => key.includes("."))), values: {}, returned: false }
            delete child.returnValue; delete child.returnObject
            const invalidArguments: string[] = []
            for (const parameter of callee.parameters) {
              const captured = callable?.captures[parameter.name], arg = step.arguments.find(arg => arg.parameter === parameter.name), object = captured ?? (arg && valueObject(c, arg.object))
              const expected = `helper "${callee.handle}" parameter "${parameter.name}" (${parameter.type})`
              if (!arg && !captured) invalidArguments.push(`Missing argument mapping for ${expected}.`)
              else if (!object) invalidArguments.push(`Object "${arg?.object ?? `capture:${parameter.name}`}" mapped to ${expected} is not bound in this invocation; declare an entry parameter or a typed bind.`)
              else if (object.type !== parameter.type) invalidArguments.push(`Object "${arg?.object ?? `capture:${parameter.name}`}" has type ${object.type}, but ${expected} requires ${parameter.type}.`)
              else {
                child.objects[parameter.name] = object
                child.objects[`${callee.handle}.${parameter.name}`] = object
                for (const [key, value] of Object.entries(c.objectValues)) if (key === object.identity || key.startsWith(`${object.identity}.`)) child.objectValues[key] = structuredClone(value)
              }
            }
            if (invalidArguments.length) { gap(u, c, instance, body, step.name, "semantic-argument-unbound", invalidArguments.join(" ")); next.push(c); continue }
            const summary = options.compositional && callee.coverage !== "path" ? summarizeProcedure(callee) : undefined
            if (summary?.composable && summary.variants.every(v => !v.steps?.length && !v.object)) {
              for (const [index, variant] of summary.variants.entries()) {
                const resumed = structuredClone(c); resumed.route.push(`${instance}.${step.name}.summary:${index}`)
                append(callee, resumed, `${instance}.${step.name}`, callee.start, `$summary.${index}`, "continue", { claim: `Source-supported helper summary: ${variant.claims.join("; ")}`, ...(variant.condition ? { condition: predicate(variant.condition, child) } : {}) })
                if (variant.kind === "reject") terminal(callee, resumed, `${instance}.${step.name}`, callee.start, `$reject.${index}`, "reject", { outcome: "deny", claim: variant.claims.join("; "), ...(variant.failureKind ? { failureKind: variant.failureKind } : {}) })
                else if (step.result && Object.hasOwn(variant, "value")) resumed.values[step.result] = variant.value!
                next.push(resumed)
              }
              continue
            }
            const calleeInstance = `${instance}.${step.name}`
            const expanded = summary?.composable ? summary.variants.flatMap((variant, index) => {
              const start = structuredClone(child); start.route.push(`${instance}.${step.name}.summary:${index}`)
              if (variant.condition) append(callee, start, calleeInstance, callee.start, `$summary.${index}`, "continue", { claim: variant.claims.join("; "), condition: predicate(variant.condition, child) })
              const end: Step = variant.kind === "reject" ? { kind: "reject", name: `$summary-reject-${index}`, claim: variant.claims.at(-1)!, ...(variant.failureKind ? { failureKind: variant.failureKind } : {}) } : { kind: "return", name: `$summary-return-${index}`, claim: variant.claims.at(-1)!, ...(Object.hasOwn(variant, "value") ? { value: variant.value } : {}), ...(variant.object ? { object: variant.object } : {}) }
              const virtual = { ...callee, blocks: [{ name: callee.start, steps: [...(variant.steps ?? []), end] }] }
              return walk(virtual, virtual.start, [start], calleeInstance, [...stack, marker])
            }) : walk(callee, callee.start, [child], calleeInstance, [...stack, marker])
            for (const returned of expanded) {
              if (!callee.complete && callee.coverage !== "path" && !returned.stopped) gap(callee, returned, calleeInstance, callee.start, "$closure", "semantic-helper-incomplete")
              const resumed: Cursor = { ...returned, objects: structuredClone(c.objects), values: structuredClone(c.values), returned: false }
              resumed.operands = structuredClone(c.operands)
              if (resumed.pending?.kind === "return") delete resumed.pending
              if (step.result && (Object.hasOwn(returned, "returnValue") || returned.returnObject)) { delete resumed.values[step.result]; delete resumed.objects[step.result]; if (resumed.operands) delete resumed.operands[step.result] }
              if (step.result && Object.hasOwn(returned, "returnValue")) resumed.values[step.result] = returned.returnValue!
              if (step.result && returned.returnObject) resumed.objects[step.result] = returned.returnObject
              delete resumed.returnValue; delete resumed.returnObject
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
        const cursor: Cursor = { tail: "", route: [root.handle], objects: {}, fieldObjects: {}, guards: {}, values: {}, objectValues: {} }
        append(root, cursor, root.handle, root.start, "$entry", "entry", { claim: `Source entry ${root.handle}` })
        for (const parameter of root.parameters) {
          const identity = id([questionId, root.handle, "parameter", parameter.name])
          cursor.objects[parameter.name] = { identity, type: parameter.type }; cursor.objects[`${root.handle}.${parameter.name}`] = cursor.objects[parameter.name]!
          append(root, cursor, root.handle, root.start, `$parameter.${parameter.name}`, "binding", { claim: `Explicit entry parameter ${parameter.name} (${parameter.type})`, bindingKey: identity, bindingKind: parameter.type, bindingName: parameter.name })
        }
        for (const c of walk(root, root.start, [cursor], root.handle, [])) if (!c.stopped) {
          if (c.pending) finish(root, c, root.handle, root.start, "$exit")
          else if ((!root.complete && root.coverage !== "path") || !root.fallthrough || root.fallthrough === "unresolved") gap(root, c, root.handle, root.start, "$end", "semantic-entry-incomplete")
          else terminal(root, c, root.handle, root.start, "$end", "return", { outcome: root.fallthrough, claim: "Explicit normal fallthrough outcome" })
        }
      }
    } catch (error) {
      rules = rules.slice(0, startIndex); dependencies = dependencies.slice(0, dependencyIndex); pathCount = 0
      fieldChanges.splice(fieldIndex); propertySummaries.splice(summaryIndex)
      const code = (error as Error).message, root = roots[0]!
      if (!root || !["semantic-node-limit", "semantic-path-limit"].includes(code)) throw error
      fault(questionId, root.handle, code, "Bounded expansion exhausted. This question remains unresolved; other questions are retained.")
      const c: Cursor = { tail: "", route: [root.handle, "limit"], objects: {}, fieldObjects: {}, guards: {}, values: {}, objectValues: {} }
      append(root, c, root.handle, root.start, "$entry", "entry"); terminal(root, c, root.handle, root.start, "$limit", "unresolved", { gap: code, claim: code, complete: false })
    }
    for (const u of local) owned.push({ questionId, handle: u.handle, ruleKeys: rules.slice(startIndex).filter(r => r.sourceOrigin?.handle === u.handle).map(r => r.key) })
  }
  const propertyMetrics = { contextOriginsRepresented: propertySummaries.reduce((n, s) => n + s.sourceSteps.length, 0), failureOriginsMerged: propertySummaries.reduce((n, s) => n + Math.max(0, s.failureSteps.length - 1), 0), contextSequences: propertySummaries.length }
  return { delta: { schemaVersion: "authorization-control-slice/v2" as const, rules, dependencies, bindings: [], policyRules: [] }, diagnostics, owned, fieldChanges, propertySummaries, propertyMetrics }
}

export function semanticBlockDiagnostics(unit: SemanticBlock): InquiryDiagnostic[] {
  const ds: InquiryDiagnostic[] = [], duplicate = (names: string[], at: string) => { if (new Set(names).size !== names.length) ds.push({ code: "semantic-duplicate", path: at, message: "Semantic names must be unique in this local scope.", severity: "error" }) }
  duplicate(unit.blocks.map(b => b.name), "blocks"); duplicate(unit.parameters.map(p => p.name), "parameters")
  duplicate(unit.blocks.flatMap(b => b.steps.map(s => s.name)), "steps")
  if (!unit.blocks.some(b => b.name === unit.start)) ds.push({ code: "semantic-start-missing", path: "start", message: `start must name one of the declared blocks: ${JSON.stringify(unit.blocks.map(b => b.name))}. Use the exact block name, never a prose description.`, severity: "error" })
  for (const b of unit.blocks) for (const s of b.steps) {
    if (s.kind === "bind" && Object.hasOwn(s, "value") && (s.type !== "value" || s.aliasOf)) ds.push({ code: "semantic-source-value-invalid", path: `blocks.${b.name}.${s.name}`, message: "A source literal requires type:value and cannot also declare aliasOf. Its source mapping remains unreviewed; it is never a user premise.", severity: "error" })
    if (s.kind === "transform" && Object.hasOwn(s, "value") === !!s.source) ds.push({ code: "semantic-transform-unbound", path: `blocks.${b.name}.${s.name}`, message: "A field write requires exactly one explicit finite value or bound source object.", severity: "error" })
  }
  for (const b of unit.blocks) for (const s of b.steps) for (const expr of s.kind === "choose" ? s.cases.map(c => c.condition) : s.kind === "guard" && s.condition ? [s.condition] : []) for (const code of predicateDiagnostics(expr)) ds.push({ code, path: `blocks.${b.name}.${s.name}`, message: "Only the bounded predicate algebra is executable.", severity: "error" })
  return ds
}
