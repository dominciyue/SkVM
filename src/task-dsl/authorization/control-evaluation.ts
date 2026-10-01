/** Bounded three-valued algebra. It never interprets natural text or runs target code. */
export type Truth = "true" | "false" | "unknown"
export type Scalar = string | number | boolean | null
export type Value = { literal: Scalar } | { binding: string }
export type Predicate = { op: "eq" | "neq"; left: Value; right: Value } | { op: "is-null"; value: Value } | { op: "all" | "any"; args: Predicate[] } | { op: "not"; arg: Predicate }
export interface PartialPredicate { truth: Truth; residual: unknown | null; missingBindings: string[]; trace: Array<{ op: string; truth: Truth }>; diagnostics: string[] }
export const scalar = (v: unknown): v is Scalar => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v)
const keys = (v: Record<string, unknown>, required: string[]) => Object.keys(v).length === required.length && required.every(k => Object.hasOwn(v, k))
export function predicateDiagnostics(input: unknown, maxDepth = 12, maxNodes = 64): string[] {
  let count = 0
  const diagnostics: string[] = [], active = new Set<unknown>()
  const value = (v: unknown) => record(v) && ((keys(v, ["literal"]) && scalar(v.literal)) || (keys(v, ["binding"]) && typeof v.binding === "string" && !!v.binding.trim() && !["__proto__", "prototype", "constructor"].includes(v.binding)))
  const visit = (p: unknown, depth: number): void => {
    if (++count > maxNodes || depth > maxDepth) { diagnostics.push("predicate-limit"); return }
    if (!record(p) || active.has(p)) { diagnostics.push("predicate-invalid"); return }
    active.add(p)
    if (p.op === "eq" || p.op === "neq") { if (!keys(p, ["op", "left", "right"]) || !value(p.left) || !value(p.right)) diagnostics.push("predicate-invalid") }
    else if (p.op === "is-null") { if (!keys(p, ["op", "value"]) || !value(p.value)) diagnostics.push("predicate-invalid") }
    else if (p.op === "not" && keys(p, ["op", "arg"])) visit(p.arg, depth + 1)
    else if ((p.op === "all" || p.op === "any") && keys(p, ["op", "args"]) && Array.isArray(p.args) && p.args.length <= maxNodes) for (const arg of p.args) visit(arg, depth + 1)
    else diagnostics.push("predicate-unsupported")
    active.delete(p)
  }
  visit(input, 0)
  return [...new Set(diagnostics)]
}
export function partialEvaluate(input: unknown, knownBindings: Record<string, Scalar>): PartialPredicate {
  const diagnostics = predicateDiagnostics(input), trace: PartialPredicate["trace"] = []
  if (diagnostics.length) return { truth: "unknown", residual: input, missingBindings: [], trace, diagnostics }
  const evaluate = (p: Predicate): Omit<PartialPredicate, "trace" | "diagnostics"> => {
    let result: Omit<PartialPredicate, "trace" | "diagnostics">
    const resolve = (v: Value): { known: boolean; value?: Scalar; residual: Value; missing: string[] } => "literal" in v ? { known: true, value: v.literal, residual: v, missing: [] } : Object.hasOwn(knownBindings, v.binding) && scalar(knownBindings[v.binding]) ? { known: true, value: knownBindings[v.binding], residual: { literal: knownBindings[v.binding]! }, missing: [] } : { known: false, residual: v, missing: [v.binding] }
    if (p.op === "eq" || p.op === "neq") {
      const l = resolve(p.left), r = resolve(p.right)
      result = l.known && r.known ? { truth: (p.op === "eq" ? l.value === r.value : l.value !== r.value) ? "true" : "false", residual: null, missingBindings: [] } : { truth: "unknown", residual: { op: p.op, left: l.residual, right: r.residual }, missingBindings: [...new Set([...l.missing, ...r.missing])] }
    } else if (p.op === "is-null") {
      const v = resolve(p.value)
      result = v.known ? { truth: v.value === null ? "true" : "false", residual: null, missingBindings: [] } : { truth: "unknown", residual: p, missingBindings: v.missing }
    } else if (p.op === "not") {
      const arg = evaluate(p.arg)
      result = { truth: arg.truth === "true" ? "false" : arg.truth === "false" ? "true" : "unknown", residual: arg.residual === null ? null : { op: "not", arg: arg.residual }, missingBindings: arg.missingBindings }
    } else {
      const composite = p as { op: "all" | "any"; args: Predicate[] }
      const evaluated = composite.args.map(evaluate), decisive: Truth = composite.op === "all" ? "false" : "true"
      if (evaluated.some(v => v.truth === decisive)) result = { truth: decisive, residual: null, missingBindings: [] }
      else {
        const unknown = evaluated.filter(v => v.truth === "unknown")
        result = unknown.length ? { truth: "unknown", residual: unknown.length === 1 ? unknown[0]!.residual : { op: p.op, args: unknown.map(v => v.residual) }, missingBindings: [...new Set(unknown.flatMap(v => v.missingBindings))].sort() } : { truth: p.op === "all" ? "true" : "false", residual: null, missingBindings: [] }
      }
    }
    trace.push({ op: p.op, truth: result.truth }); return result
  }
  return { ...evaluate(input as Predicate), trace, diagnostics }
}
