/** Bounded three-valued algebra. It never interprets natural text or runs target code. */
export type Truth = "true" | "false" | "unknown"
export type Scalar = string | number | boolean | null
export type FiniteValue = Scalar | Scalar[] | Record<string, Scalar>
export type Value = { literal: FiniteValue } | { binding: string } | { lookup: { map: Value; key: Value } }
export type Predicate = { op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte"; left: Value; right: Value; order?: Scalar[] } | { op: "is-null"; value: Value } | { op: "has-key"; map: Value; key: Value } | { op: "member"; value: Value; set: Value } | { op: "all" | "any"; args: Predicate[] } | { op: "not"; arg: Predicate }
export interface ValueEvaluation { known: boolean; value?: FiniteValue; residual: Value; missingBindings: string[]; diagnostics: string[]; origin: "literal" | "binding" | "lookup" }
export interface PartialPredicate { truth: Truth; residual: unknown | null; missingBindings: string[]; trace: Array<{ op: string; truth: Truth }>; diagnostics: string[]; valueTrace?: ValueEvaluation[] }
export const FINITE_PERMISSION_GUIDE = 'Additional finite predicates: {op:"member",value:<operand>,set:<operand>}, {op:"has-key",map:<operand>,key:<operand>}, {op:"gt"|"gte"|"lt"|"lte",left:<operand>,right:<operand>,order?:[source-supported ordered scalars]}. Operands are {literal:scalar|scalar[]|map<string,scalar>}, {binding:name}, or {lookup:{map:<operand>,key:<operand>}}. Finite sets/maps have at most64 entries. Numeric comparisons need no order; other ordering requires an explicit source-supported order, never inferred role names. Missing map keys are errors rather than null; has-key explicitly tests absence. Unknown user values remain residual. Short-circuit skips later evaluation errors, but invalid syntax is rejected. Parameterized object fields use binding:"object.field"; host substitutes actual invocation identities from explicit arguments. Values on one object never apply to another. For operation shared source, values may name questionId and are still exact current user premises.'
export const scalar = (v: unknown): v is Scalar => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v)
export const finiteValue = (v: unknown): v is FiniteValue => scalar(v) || Array.isArray(v) && v.length <= 64 && v.every(scalar) || record(v) && Object.keys(v).length <= 64 && Object.values(v).every(scalar)
const keys = (v: Record<string, unknown>, required: string[]) => Object.keys(v).length === required.length && required.every(k => Object.hasOwn(v, k))
export function predicateDiagnostics(input: unknown, maxDepth = 12, maxNodes = 64): string[] {
  let count = 0
  const diagnostics: string[] = [], active = new Set<unknown>()
  const value = (v: unknown, depth = 0): boolean => {
    if (depth > maxDepth || !record(v) || active.has(v)) return false
    if (keys(v, ["literal"])) return finiteValue(v.literal)
    if (keys(v, ["binding"])) return typeof v.binding === "string" && !!v.binding.trim() && !["__proto__", "prototype", "constructor"].includes(v.binding)
    if (!keys(v, ["lookup"]) || !record(v.lookup) || !keys(v.lookup, ["map", "key"])) return false
    if (++count > maxNodes) return false
    active.add(v); const valid = value(v.lookup.map, depth + 1) && value(v.lookup.key, depth + 1); active.delete(v); return valid
  }
  const visit = (p: unknown, depth: number): void => {
    if (++count > maxNodes || depth > maxDepth) { diagnostics.push("predicate-limit"); return }
    if (!record(p) || active.has(p)) { diagnostics.push("predicate-invalid"); return }
    active.add(p)
    if (p.op === "eq" || p.op === "neq") { if (!keys(p, ["op", "left", "right"]) || !value(p.left) || !value(p.right)) diagnostics.push("predicate-invalid") }
    else if (["gt", "gte", "lt", "lte"].includes(p.op)) { if (!keys(p, p.order === undefined ? ["op", "left", "right"] : ["op", "left", "right", "order"]) || !value(p.left) || !value(p.right) || p.order !== undefined && (!Array.isArray(p.order) || !p.order.length || p.order.length > 64 || !p.order.every(scalar) || new Set(p.order).size !== p.order.length)) diagnostics.push("predicate-invalid") }
    else if (p.op === "is-null") { if (!keys(p, ["op", "value"]) || !value(p.value)) diagnostics.push("predicate-invalid") }
    else if (p.op === "member") { if (!keys(p, ["op", "value", "set"]) || !value(p.value) || !value(p.set)) diagnostics.push("predicate-invalid") }
    else if (p.op === "has-key") { if (!keys(p, ["op", "map", "key"]) || !value(p.map) || !value(p.key)) diagnostics.push("predicate-invalid") }
    else if (p.op === "not" && keys(p, ["op", "arg"])) visit(p.arg, depth + 1)
    else if ((p.op === "all" || p.op === "any") && keys(p, ["op", "args"]) && Array.isArray(p.args) && p.args.length <= maxNodes) for (const arg of p.args) visit(arg, depth + 1)
    else diagnostics.push("predicate-unsupported")
    active.delete(p)
  }
  visit(input, 0)
  return [...new Set(diagnostics)]
}
export function partialEvaluate(input: unknown, knownBindings: Record<string, FiniteValue>): PartialPredicate {
  const diagnostics = predicateDiagnostics(input), trace: PartialPredicate["trace"] = [], valueTrace: ValueEvaluation[] = []
  if (diagnostics.length) return { truth: "unknown", residual: input, missingBindings: [], trace, diagnostics }
  const resolve = (v: Value): ValueEvaluation => {
    let r: ValueEvaluation
    if ("literal" in v) r = { known: true, value: v.literal, residual: v, missingBindings: [], diagnostics: [], origin: "literal" }
    else if ("binding" in v) r = Object.hasOwn(knownBindings, v.binding) && finiteValue(knownBindings[v.binding]) ? { known: true, value: knownBindings[v.binding], residual: { literal: knownBindings[v.binding]! }, missingBindings: [], diagnostics: [], origin: "binding" } : { known: false, residual: v, missingBindings: [v.binding], diagnostics: [], origin: "binding" }
    else {
      const map = resolve(v.lookup.map), key = resolve(v.lookup.key), errors = [...map.diagnostics, ...key.diagnostics]
      if (map.known && key.known && (!record(map.value) || typeof key.value !== "string")) errors.push("predicate-type-error")
      else if (map.known && key.known && !Object.hasOwn(map.value as Record<string, Scalar>, key.value as string)) errors.push("value-key-missing")
      const known = map.known && key.known && !errors.length
      r = { known, ...(known ? { value: (map.value as Record<string, Scalar>)[key.value as string], residual: { literal: (map.value as Record<string, Scalar>)[key.value as string]! } } : { residual: { lookup: { map: map.residual, key: key.residual } } }), missingBindings: [...new Set([...map.missingBindings, ...key.missingBindings])], diagnostics: errors, origin: "lookup" }
    }
    valueTrace.push(r); return r
  }
  const evaluate = (p: Predicate): Omit<PartialPredicate, "trace" | "diagnostics"> => {
    let result: Omit<PartialPredicate, "trace" | "diagnostics">
    const unknown = (values: ValueEvaluation[], residual: unknown) => ({ truth: "unknown" as const, residual, missingBindings: [...new Set(values.flatMap(v => v.missingBindings))].sort() })
    const done = (truth: boolean) => ({ truth: truth ? "true" as const : "false" as const, residual: null, missingBindings: [] })
    if (["eq", "neq", "gt", "gte", "lt", "lte"].includes(p.op)) {
      const binary = p as Extract<Predicate, { left: Value }>
      const l = resolve(binary.left), r = resolve(binary.right)
      result = unknown([l, r], { ...p, left: l.residual, right: r.residual })
      if (l.known && r.known) {
        if (p.op === "eq" || p.op === "neq") {
          if (!scalar(l.value) || !scalar(r.value)) diagnostics.push("predicate-type-error")
          else result = done(p.op === "eq" ? l.value === r.value : l.value !== r.value)
        } else {
          let left: number | undefined, right: number | undefined
          if (binary.order) {
            if (!scalar(l.value) || !scalar(r.value)) diagnostics.push("predicate-type-error")
            else { left = binary.order.indexOf(l.value); right = binary.order.indexOf(r.value); if (left < 0 || right < 0) { diagnostics.push("ordered-value-not-in-order"); left = right = undefined } }
          } else if (typeof l.value === "number" && typeof r.value === "number") { left = l.value; right = r.value }
          else diagnostics.push("predicate-type-error")
          if (left !== undefined && right !== undefined) result = done(p.op === "gt" ? left > right : p.op === "gte" ? left >= right : p.op === "lt" ? left < right : left <= right)
        }
      }
    } else if (p.op === "is-null") {
      const v = resolve(p.value)
      result = v.known ? done(v.value === null) : unknown([v], { op: p.op, value: v.residual })
    } else if (p.op === "member" || p.op === "has-key") {
      const a = resolve(p.op === "member" ? p.value : p.map), b = resolve(p.op === "member" ? p.set : p.key)
      result = unknown([a, b], p.op === "member" ? { op: p.op, value: a.residual, set: b.residual } : { op: p.op, map: a.residual, key: b.residual })
      if (a.known && b.known) {
        if (p.op === "member" && scalar(a.value) && Array.isArray(b.value)) result = done(b.value.includes(a.value))
        else if (p.op === "has-key" && record(a.value) && typeof b.value === "string") result = done(Object.hasOwn(a.value, b.value))
        else diagnostics.push("predicate-type-error")
      }
    } else if (p.op === "not") {
      const arg = evaluate(p.arg)
      result = { truth: arg.truth === "true" ? "false" : arg.truth === "false" ? "true" : "unknown", residual: arg.residual === null ? null : { op: "not", arg: arg.residual }, missingBindings: arg.missingBindings }
    } else {
      const composite = p as { op: "all" | "any"; args: Predicate[] }
      const evaluated: Array<Omit<PartialPredicate, "trace" | "diagnostics">> = [], decisive: Truth = composite.op === "all" ? "false" : "true"
      for (const arg of composite.args) { const v = evaluate(arg); evaluated.push(v); if (v.truth === decisive) break }
      if (evaluated.some(v => v.truth === decisive)) result = { truth: decisive, residual: null, missingBindings: [] }
      else { const pending = evaluated.filter(v => v.truth === "unknown"); result = pending.length ? { truth: "unknown", residual: pending.length === 1 ? pending[0]!.residual : { op: p.op, args: pending.map(v => v.residual) }, missingBindings: [...new Set(pending.flatMap(v => v.missingBindings))].sort() } : done(p.op === "all") }
    }
    trace.push({ op: p.op, truth: result.truth }); return result
  }
  const result = evaluate(input as Predicate)
  diagnostics.push(...valueTrace.flatMap(v => v.diagnostics))
  return { ...result, ...(diagnostics.length ? { truth: "unknown" as const, residual: input } : {}), trace, diagnostics: [...new Set(diagnostics)], valueTrace }
}

/** Compare validated finite conditions using associative/commutative/idempotent all/any identities, without assigning any binding. */
export function equivalentPredicateConditions(left: unknown, right: unknown): boolean {
  if (predicateDiagnostics(left).length || predicateDiagnostics(right).length) return false
  const key = (value: unknown) => JSON.stringify(value, (_name, v) => record(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v)
  const normalize = (p: Predicate): Predicate => {
    if (p.op === "all" || p.op === "any") {
      const children = p.args.map(normalize).flatMap(child => child.op === p.op ? (child as { args: Predicate[] }).args : [child])
      const unique = [...new Map(children.map(child => [key(child), child])).entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, child]) => child)
      return unique.length === 1 ? unique[0]! : { op: p.op, args: unique }
    }
    return p.op === "not" ? { op: "not", arg: normalize(p.arg) } : p
  }
  return key(normalize(left as Predicate)) === key(normalize(right as Predicate))
}
