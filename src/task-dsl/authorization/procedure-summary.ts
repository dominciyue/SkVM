import { canonicalControl } from "./control-slice.ts"
import type { BoundSemanticBlock } from "./semantic-flow.ts"
import type { Scalar } from "./control-evaluation.ts"

type Step = BoundSemanticBlock["blocks"][number]["steps"][number]
export interface ProcedureVariant { kind: "return" | "reject"; value?: Scalar; object?: string; steps?: Step[]; failureKind?: "authorization" | "operation"; condition?: Record<string, unknown>; claims: string[] }
const all = (args: Record<string, unknown>[]) => args.length === 0 ? undefined : args.length === 1 ? args[0] : { op: "all", args }
const any = (args: Record<string, unknown>[]) => args.length === 0 ? undefined : args.length === 1 ? args[0] : { op: "any", args }
/** Finite parameterized helper summaries. Calls/dynamic bodies retain exact expansion. */
export function summarizeProcedure(unit: BoundSemanticBlock) {
  const variants: ProcedureVariant[] = [], gaps: string[] = []
  const walk = (block: string, conditions: Record<string, unknown>[], claims: string[], stack: string[], retained: Step[] = [], suffix: Step[] = []) => {
    if (stack.includes(block) || stack.length >= 12) { gaps.push("summary-cycle"); return }
    const body = unit.blocks.find(b => b.name === block)
    if (!body) { gaps.push("summary-body-missing"); return }
    const steps = [...body.steps, ...suffix]
    const visit = (index: number, tests: Record<string, unknown>[], seen: string[], trail: Step[]) => {
      if (variants.length > 64) { gaps.push("summary-variant-limit"); return }
      const step = steps[index]
      if (!step) { gaps.push("summary-return-missing"); return }
      const text = [...seen, step.claim]
      const common = { ...(all(tests) ? { condition: all(tests) } : {}), ...(trail.length ? { steps: structuredClone(trail) } : {}), claims: text }
      if (step.kind === "return") variants.push({ kind: "return", ...(Object.hasOwn(step, "value") ? { value: step.value } : {}), ...(step.object ? { object: step.object } : {}), ...common })
      else if (step.kind === "reject") variants.push({ kind: "reject", ...(step.failureKind ? { failureKind: step.failureKind } : {}), ...common })
      else if (step.kind === "guard") {
        if (step.principal || step.resource || !step.condition) visit(index + 1, tests, text, [...trail, step])
        else visit(index + 1, [...tests, step.condition], text, trail)
      } else if (["bind", "effect", "transform"].includes(step.kind)) visit(index + 1, tests, text, [...trail, step])
      else if (step.kind === "choose") {
        const prior: Record<string, unknown>[] = []
        for (const branch of step.cases) {
          const reach = prior.length ? { op: "all", args: [branch.condition, { op: "not", arg: any([...prior]) }] } : branch.condition
          walk(branch.body, [...tests, reach], text, [...stack, block], trail, steps.slice(index + 1)); prior.push(branch.condition)
        }
        if (step.otherwise) walk(step.otherwise, [...tests, { op: "not", arg: any(prior) }], text, [...stack, block], trail, steps.slice(index + 1))
        else gaps.push("summary-choice-uncovered")
      } else gaps.push("summary-needs-exact-expansion")
    }
    visit(0, conditions, claims, retained)
  }
  if (unit.complete) walk(unit.start, [], [], [])
  else gaps.push("summary-source-incomplete")
  const groups = new Map<string, ProcedureVariant[]>()
  for (const v of variants) { const key = canonicalControl([v.kind, Object.hasOwn(v, "value"), v.value, v.object, v.steps, v.failureKind]); groups.set(key, [...(groups.get(key) ?? []), v]) }
  const joined = [...groups.values()].map(list => ({ ...list[0]!, ...(list.every(v => v.condition) ? { condition: any(list.map(v => v.condition!)) } : { condition: undefined }), claims: [...new Set(list.flatMap(v => v.claims))] }))
  return { handle: unit.handle, source: unit.source, parameters: unit.parameters, evidenceIds: [...unit.evidenceIds], complete: unit.complete, composable: gaps.length === 0 && joined.length > 0 && joined.length <= 16, variants: joined, gaps: [...new Set(gaps)], semanticSupport: "unreviewed" as const }
}
