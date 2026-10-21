import { z } from "zod"
import { isDeepStrictEqual } from "node:util"
import { finiteValue, partialEvaluate, predicateDiagnostics, scalar, type FiniteValue, type Predicate, type Scalar } from "./control-evaluation.ts"
import { SourceCitationSchema } from "./question-workflow.ts"
import type { AuthoringTargetMode } from "./program-coverage.ts"

export type ResourceValue = FiniteValue | Record<string, Scalar>[]
export type ResourceExpression = { literal: FiniteValue } | { ref: string } | { field: { of: ResourceExpression; key: string; default?: ResourceExpression } } | { test: Predicate } | { choose: { test: Predicate; then: ResourceExpression; else: ResourceExpression } } | { coalesce: ResourceExpression[] } | { integer: ResourceExpression } | { record: Record<string, ResourceExpression> }
const name = z.string().min(1).max(256).refine(v => !["__proto__", "prototype", "constructor"].includes(v), "Reserved name")
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v)
const safeKey = (v: string) => !["__proto__", "prototype", "constructor"].includes(v)
const resourceValue = (v: unknown): v is ResourceValue => finiteValue(v) || Array.isArray(v) && v.length <= 64 && v.every(r => object(r) && finiteValue(r))
export const ResourceInputsSchema = z.record(name, z.custom<ResourceValue>(resourceValue)).refine(v => Object.keys(v).length <= 64)
const predicate = z.custom<Predicate>(v => predicateDiagnostics(v).length === 0, "Use the finite predicate algebra; semantic text is not executable")
const expression = z.custom<ResourceExpression>(value => {
  let count = 0
  const visit = (v: unknown, depth: number): boolean => {
    if (++count > 128 || depth > 12 || !object(v) || Object.keys(v).length !== 1) return false
    if ("literal" in v) return finiteValue(v.literal)
    if ("ref" in v) return typeof v.ref === "string" && !!v.ref && safeKey(v.ref)
    if ("test" in v) return !predicateDiagnostics(v.test).length
    if ("integer" in v) return visit(v.integer, depth + 1)
    if ("coalesce" in v) return Array.isArray(v.coalesce) && v.coalesce.length > 0 && v.coalesce.length <= 16 && v.coalesce.every(x => visit(x, depth + 1))
    if ("record" in v) return object(v.record) && Object.keys(v.record).length <= 64 && Object.entries(v.record).every(([k, x]) => safeKey(k) && visit(x, depth + 1))
    if ("field" in v) return object(v.field) && Object.keys(v.field).every(k => ["of", "key", "default"].includes(k)) && typeof v.field.key === "string" && safeKey(v.field.key) && visit(v.field.of, depth + 1) && (v.field.default === undefined || visit(v.field.default, depth + 1))
    if ("choose" in v) return object(v.choose) && Object.keys(v.choose).length === 3 && !predicateDiagnostics(v.choose.test).length && visit(v.choose.then, depth + 1) && visit(v.choose.else, depth + 1)
    return false
  }
  return visit(value, 0)
}, "Invalid or unbounded resource expression")
const base = { id: name, source: SourceCitationSchema, sources: z.array(SourceCitationSchema).max(16).optional(), because: z.string().min(1).default("Author explanation not supplied."), when: predicate.optional() }
export const ResourceStepSchema = z.discriminatedUnion("op", [
  z.object({ ...base, op: z.literal("value"), value: expression }).strict(),
  z.object({ ...base, op: z.literal("select"), from: name, where: predicate, order: z.array(z.object({ field: name, direction: z.enum(["asc", "desc"]), nullAs: z.number().optional(), nulls: z.enum(["first", "last"]).optional() }).strict()).max(4).optional(), unique: z.boolean().default(true) }).strict(),
  z.object({ ...base, op: z.literal("guard"), test: predicate, failure: name, principal: expression.optional(), resource: expression.optional(), permission: name.optional() }).strict(),
  z.object({ ...base, op: z.literal("external"), name, arguments: z.record(name, expression) }).strict(),
  z.object({ ...base, op: z.literal("return"), value: expression }).strict(),
])
export const ResourceWorkflowSchema = z.object({ inputs: z.array(name).max(64), steps: z.array(ResourceStepSchema).min(1).max(128), gaps: z.array(z.string()).max(64).default([]) }).strict().superRefine((v, c) => {
  const seen = new Set<string>()
  for (const [i, id] of v.inputs.entries()) { if (seen.has(id)) c.addIssue({ code: "custom", path: ["inputs", i], message: "Input identities must be unique" }); seen.add(id) }
  for (const [i, s] of v.steps.entries()) { if (seen.has(s.id)) c.addIssue({ code: "custom", path: ["steps", i, "id"], message: "Input and computed identities must be distinct and unique" }); seen.add(s.id) }
})
/** The envelope is bounded; individual authored steps may still need repair. */
export const ResourceWorkflowDraftSchema = z.object({ inputs: z.array(name).max(64), steps: z.array(z.unknown()).min(1).max(128), gaps: z.array(z.string()).max(64).default([]) }).strict()
export function inspectResourceDraft(raw: unknown) {
  const workflow = ResourceWorkflowDraftSchema.parse(raw)
  const counts = new Map<string, number>()
  for (const id of [...workflow.inputs, ...workflow.steps.flatMap(s => object(s) && typeof s.id === "string" ? [s.id] : [])]) counts.set(id, (counts.get(id) ?? 0) + 1)
  const steps = workflow.steps.map((raw, index) => {
    const parsed = ResourceStepSchema.safeParse(raw), id = object(raw) && name.safeParse(raw.id).success ? raw.id as string : `$invalid-step-${index}`
    const issues = parsed.success ? [] : parsed.error.issues.map(i => ({ path: `steps.${index}.${i.path.join(".")}`, message: i.message }))
    if ((counts.get(id) ?? 0) > 1) issues.push({ path: `steps.${index}.id`, message: `Duplicate input/computed identity:${id}` })
    return { raw, index, id, parsed, issues }
  })
  const terminal = steps.find(s => s.parsed.success && !s.issues.length && s.parsed.data.op === "return" && !s.parsed.data.when)
  const unreachableSteps = terminal ? steps.filter(s => s.index > terminal.index).map(s => ({ id: s.id, index: s.index, after: terminal.id })) : []
  return { workflow, steps, duplicateIds: [...counts].filter(([, count]) => count > 1).map(([id]) => id), unreachableSteps }
}
export const ExternalAssumptionsSchema = z.array(z.object({ name, arguments: z.record(name, z.custom<FiniteValue>(finiteValue)), value: z.custom<FiniteValue>(finiteValue), reason: z.string().min(1) }).strict()).max(64)
export interface ResourceProgramInputs { sourceVerifier?: import("./program-verification.ts").ProgramVerifier; resourceInputs?: Record<string, Record<string, ResourceValue>>; externalAssumptions?: Record<string, z.infer<typeof ExternalAssumptionsSchema>>; authoringTargetMode?: AuthoringTargetMode }
export type ResourceWorkflow = z.infer<typeof ResourceWorkflowSchema>
export interface ResourceEvent {
  sequence: number; id: string; op: string; executor: "host"; meaningOrigin: "authored-program" | "external-assumption";
  source?: z.infer<typeof SourceCitationSchema>; sources?: z.infer<typeof SourceCitationSchema>[]; inputs: Record<string, unknown>; outputs: Record<string, unknown>;
  outcome: "computed" | "conditional" | "unresolved" | "rejected" | "skipped"; gaps: string[]; because: string; condition?: unknown
}
interface Evaluated { known: boolean; value?: ResourceValue; gaps: string[] }
const missing = (...gaps: string[]): Evaluated => ({ known: false, gaps })
const known = (value: ResourceValue): Evaluated => ({ known: true, value, gaps: [] })

/** Only explicit equality-conjunction queries have a finite argument map.
 * Unsupported predicates remain unobserved, never inferred from selected rows. */
function selectionQuery(predicate: Predicate, bindings: Record<string, FiniteValue>) {
  const query: Record<string, unknown> = Object.create(null)
  const visit = (p: any): boolean => {
    if (p.op === "all") return p.args.every(visit)
    if (p.op !== "eq") return false
    const [row, other] = p.left?.binding?.startsWith("row.") ? [p.left, p.right] : [p.right, p.left]
    if (!row?.binding?.startsWith("row.") || other?.binding?.startsWith("row.")) return false
    const key = row.binding.slice(4), value = Object.hasOwn(other ?? {}, "literal") ? other.literal : bindings[other?.binding]
    if (value === undefined || Object.hasOwn(query, key) && !isDeepStrictEqual(query[key], value)) return false
    query[key] = value
    return true
  }
  return visit(predicate) ? query : undefined
}

/** Diagnostics never relax exact argument matching or print whole object values. */
function argumentDifferences(actual: unknown, fact: unknown) {
  const differences: Record<string, unknown>[] = []
  const type = (v: unknown) => v === null ? "null" : Array.isArray(v) ? "array" : typeof v
  const display = (v: unknown) => typeof v === "string" && v.length > 120 ? v.slice(0, 120) + "..." : v
  let truncated = false
  const visit = (a: unknown, f: unknown, path: string) => {
    if (isDeepStrictEqual(a, f)) return
    if (differences.length >= 12) { truncated = true; return }
    if (type(a) !== type(f)) differences.push({ path, kind: "type", actualType: type(a), factType: type(f) })
    else if (object(a) && object(f)) for (const key of new Set([...Object.keys(a), ...Object.keys(f)])) {
      if (differences.length >= 12) { truncated = true; break }
      if (!Object.hasOwn(a, key)) differences.push({ path: `${path}.${key}`, kind: "missing-argument" })
      else if (!Object.hasOwn(f, key)) differences.push({ path: `${path}.${key}`, kind: "extra-argument" })
      else visit(a[key], f[key], `${path}.${key}`)
    }
    else if (Array.isArray(a) && Array.isArray(f)) differences.push({ path, kind: "value", actualType: "array", factType: "array", actualLength: a.length, factLength: f.length })
    else differences.push({ path, kind: "value", actual: display(a), fact: display(f) })
  }
  visit(actual, fact, "arguments")
  return { differences, truncated }
}

/** Finite source-authored resource summaries, using the existing three-valued
 * predicate core. No target code, database, permission service or model runs. */
export function executeResourceWorkflow(raw: unknown, supplied: unknown, options: { progressive?: boolean; invalidSteps?: Record<string, string[]>; externalAssumptions?: z.infer<typeof ExternalAssumptionsSchema> } = {}) {
  const draft = inspectResourceDraft(options.progressive ? raw : ResourceWorkflowSchema.parse(raw)), workflow = draft.workflow, inputs = ResourceInputsSchema.parse(supplied), external = ExternalAssumptionsSchema.parse(options.externalAssumptions ?? [])
  for (const k of Object.keys(inputs)) if (!workflow.inputs.includes(k)) throw new Error(`resource-input-not-declared:${k}`)
  const env: Record<string, Evaluated> = Object.create(null), values: Record<string, ResourceValue> = Object.create(null), events: ResourceEvent[] = [], conditions: unknown[] = []
  for (const k of workflow.inputs) env[k] = draft.duplicateIds.includes(k) ? missing(`duplicate-identity:${k}`) : Object.hasOwn(inputs, k) ? known(inputs[k]!) : missing(k)
  let termination: string | undefined, returned: ResourceValue | undefined
  const bindings = (row?: Record<string, Scalar>) => {
    const out: Record<string, FiniteValue> = Object.create(null)
    for (const [k, v] of Object.entries(env)) if (v.known && finiteValue(v.value)) { out[k] = v.value; if (object(v.value)) for (const [f, x] of Object.entries(v.value)) if (scalar(x)) out[`${k}.${f}`] = x }
    if (row) for (const [k, v] of Object.entries(row)) out[`row.${k}`] = v
    return out
  }
  const test = (p: Predicate, row?: Record<string, Scalar>) => partialEvaluate(p, bindings(row))
  const evalExpr = (e: ResourceExpression): Evaluated => {
    if ("literal" in e) return known(e.literal)
    if ("ref" in e) return env[e.ref] ?? missing(e.ref)
    if ("test" in e) { const r = test(e.test); return r.truth === "unknown" ? missing(...r.missingBindings, ...r.diagnostics) : known(r.truth === "true") }
    if ("field" in e) {
      const r = evalExpr(e.field.of)
      if (!r.known) return r
      if (!object(r.value)) return missing(`field-object-required:${e.field.key}`)
      return Object.hasOwn(r.value, e.field.key) ? known((r.value as Record<string, Scalar>)[e.field.key]!) : e.field.default ? evalExpr(e.field.default) : missing(`field-missing:${e.field.key}`)
    }
    if ("coalesce" in e) { for (const x of e.coalesce) { const r = evalExpr(x); if (!r.known || r.value !== null) return r } return known(null) }
    if ("choose" in e) {
      const r = test(e.choose.test)
      if (r.truth !== "unknown") return evalExpr(r.truth === "true" ? e.choose.then : e.choose.else)
      const a = evalExpr(e.choose.then), b = evalExpr(e.choose.else)
      return a.known && b.known && isDeepStrictEqual(a.value, b.value) ? a : missing(...r.missingBindings, ...r.diagnostics, ...a.gaps, ...b.gaps)
    }
    if ("integer" in e) {
      const r = evalExpr(e.integer); if (!r.known) return r
      // Deliberately bounded decimal subset. Unsupported Python int forms stay gaps.
      if (typeof r.value !== "string") return missing("integer-unsupported-type")
      if (!/^[+-]?\d+$/.test(r.value.trim())) return /^[\x00-\x7f]*$/.test(r.value) && !r.value.includes("_") ? known(null) : missing("integer-unsupported-syntax")
      const n = Number(r.value.trim()); return Number.isSafeInteger(n) ? known(n) : missing("integer-outside-safe-range")
    }
    const fields = Object.entries(e.record).map(([k, v]) => [k, evalExpr(v)] as const)
    if (fields.some(([, v]) => !v.known || !scalar(v.value))) return missing(...fields.flatMap(([k, v]) => v.gaps.length ? v.gaps : !scalar(v.value) ? [`record-scalar-required:${k}`] : []))
    return known(Object.fromEntries(fields.map(([k, v]) => [k, v.value as Scalar])))
  }
  for (const slot of draft.steps) {
    if (!slot.parsed.success || slot.issues.length) {
      const raw = object(slot.raw) ? slot.raw : {}, gaps = slot.issues.map(i => `resource-step:${i.path}:${i.message}`)
      const source = SourceCitationSchema.safeParse(raw.source), when = predicate.safeParse(raw.when)
      // Only a current, supported activation can exclude a malformed control slot.
      const inactive = source.success && !options.invalidSteps?.[slot.id] && when.success && test(when.data).truth === "false"
      const barrier = !["value", "select", "external"].includes(raw.op)
      if (barrier && !inactive) conditions.push({ step: slot.id, controlGaps: gaps, otherwise: "unresolved-control" })
      env[slot.id] = missing(...gaps)
      delete values[slot.id]
      events.push({ sequence: events.length + 1, id: slot.id, op: typeof raw.op === "string" ? raw.op : "unknown", executor: "host", meaningOrigin: "authored-program", ...(source.success ? { source: source.data } : {}), inputs: {}, outputs: { known: false }, outcome: inactive ? "skipped" : "unresolved", gaps: inactive ? [] : gaps, because: typeof raw.because === "string" ? raw.because : "Author explanation not supplied." })
      continue
    }
    const step = slot.parsed.data
    const event: ResourceEvent = { sequence: events.length + 1, id: step.id, op: step.op, executor: "host", meaningOrigin: "authored-program", source: step.source, ...(step.sources ? { sources: step.sources } : {}), inputs: {}, outputs: {}, outcome: "computed", gaps: [], because: step.because }
    let result: Evaluated = missing(step.id), active = true
    if (options.invalidSteps?.[step.id]) { result = missing(...options.invalidSteps[step.id]!); active = false }
    if (active && step.when) {
      const condition = test(step.when); event.inputs.when = condition; event.condition = step.when
      if (condition.truth === "false") { env[step.id] = known(null); event.outcome = "skipped"; event.outputs = { known: true, value: null }; events.push(event); continue }
      if (condition.truth === "unknown") { result = missing(...condition.missingBindings, ...condition.diagnostics); active = false }
    }
    if (!active && (step.op === "guard" || step.op === "return")) conditions.push({ step: step.id, controlGaps: result.gaps, otherwise: step.op === "guard" ? step.failure : "return" })
    if (active) {
      if (step.op === "value" || step.op === "return") { event.inputs.expression = step.value; result = evalExpr(step.value) }
      else if (step.op === "select") {
        const rows = env[step.from] ?? missing(step.from); event.inputs.from = step.from; event.inputs.rows = rows; event.inputs.where = step.where; event.inputs.query = selectionQuery(step.where, bindings())
        if (!rows.known) result = rows
        else if (!Array.isArray(rows.value) || !rows.value.every(object)) result = missing(`record-collection-required:${step.from}`)
        else {
          const tested = (rows.value as Record<string, Scalar>[]).map(row => ({ row, predicate: test(step.where, row) })); event.inputs.candidates = tested
          if (tested.some(t => t.predicate.truth === "unknown")) result = missing(...tested.flatMap(t => [...t.predicate.missingBindings, ...t.predicate.diagnostics]))
          else {
            const selected = tested.filter(t => t.predicate.truth === "true").map(t => t.row)
            event.inputs.selection = { mode: step.unique ? "unique" : step.order?.length ? "ordered-first" : "first", matchedCount: selected.length, order: step.order ?? [], guidance: "unique defaults to true and rejects multiple matches. Use unique:false with explicit order for ordered first; numeric null keys need nulls:first|last or nullAs. Equal keys use the next order key; otherwise input order is retained." }
            const invalidOrder = step.order?.some(o => selected.some(r => !(r[o.field] === null && o.nulls) && typeof (r[o.field] ?? o.nullAs) !== "number"))
            if (invalidOrder) result = missing("selection-order-unknown")
            else {
              if (step.order) selected.sort((a, b) => { for (const o of step.order!) { if (o.nulls && (a[o.field] === null || b[o.field] === null)) { if (a[o.field] === b[o.field]) continue; return (a[o.field] === null ? 1 : -1) * (o.nulls === "last" ? 1 : -1) } const n = Number(a[o.field] ?? o.nullAs) - Number(b[o.field] ?? o.nullAs); if (n) return o.direction === "asc" ? n : -n } return 0 })
              result = step.unique && selected.length > 1 ? missing(`selection-not-unique:${step.id}`) : known(selected[0] ?? null)
            }
          }
        }
      } else if (step.op === "guard") {
        const r = test(step.test); event.inputs.test = r; event.inputs.permission = step.permission
        const identityGaps: string[] = []
        if (step.principal) { const identity = evalExpr(step.principal); event.inputs.principal = identity.value; identityGaps.push(...identity.gaps) }
        if (step.resource) { const identity = evalExpr(step.resource); event.inputs.resource = identity.value; identityGaps.push(...identity.gaps) }
        result = r.truth === "unknown" ? missing(...r.missingBindings, ...r.diagnostics) : known(r.truth === "true")
        if (identityGaps.length) { result = missing(...result.gaps, ...identityGaps); conditions.push({ step: step.id, identityGaps }) }
        if (r.truth === "false") { termination = step.failure; event.outcome = conditions.length ? "conditional" : "rejected" }
        else if (r.truth === "unknown") conditions.push({ step: step.id, test: r.residual, otherwise: step.failure })
      } else {
        const args = Object.fromEntries(Object.entries(step.arguments).map(([k, v]) => [k, evalExpr(v)]))
        event.inputs.arguments = args; event.inputs.name = step.name
        const complete = Object.values(args).every(v => v.known), actual = Object.fromEntries(Object.entries(args).map(([k, v]) => [k, v.value]))
        const matches = complete ? external.filter(a => a.name === step.name && isDeepStrictEqual(a.arguments, actual)) : []
        const sameName = external.filter(a => a.name === step.name)
        event.inputs.externalMatch = { status: !complete ? "arguments-unresolved" : matches.length === 1 ? "matched" : matches.length > 1 ? matches.some(a => !isDeepStrictEqual(a.value, matches[0]!.value)) ? "conflicting-facts" : "ambiguous-facts" : sameName.length ? "argument-mismatch" : "no-fact", sameNameCount: sameName.length, exactMatchCount: matches.length,
          candidates: complete && !matches.length ? sameName.slice(0, 4).map((fact, index) => ({ index, ...argumentDifferences(actual, fact.arguments) })) : [], candidatesTruncated: complete && !matches.length && sameName.length > 4,
          instruction: "Only exact name and complete argument values bind a fact. Use source-supported explicit field projections to align supplied facts; never borrow another object or permission grant. Supplied facts remain unreviewed assumptions." }
        if (matches.length === 1) { result = known(matches[0]!.value); event.meaningOrigin = "external-assumption"; event.inputs.assumption = matches[0] }
        else result = missing(`external:${step.name}`, ...Object.values(args).flatMap(v => v.gaps))
      }
    }
    env[step.id] = result
    if (result.known) { values[step.id] = result.value!; event.outputs.value = result.value }
    else { event.gaps = [...new Set(result.gaps.length ? result.gaps : [`unresolved:${step.id}`])]; event.outcome = "unresolved" }
    if (conditions.length && event.outcome === "computed") event.outcome = "conditional"
    event.outputs.known = result.known
    events.push(event)
    if (active && step.op === "return") { returned = result.value; termination = "return" }
    if (termination) break
  }
  const gaps = [...new Set([...workflow.gaps, ...events.flatMap(e => e.gaps)])]
  return { status: conditions.length || gaps.length ? "conditional" as const : "computed" as const, inputs, values, events, returned, termination, conditions, gaps, semanticSupport: "unreviewed" as const, requestOperationCertified: false as const }
}
