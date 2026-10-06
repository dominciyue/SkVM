import type { AuthorizationInquiryProgram } from "../../task-dsl/authorization/inquiry-program.ts"
import type { BoundSemanticBlock } from "../../task-dsl/authorization/semantic-flow.ts"
import type { SourceMaterial, SourceMaterialSnapshot } from "../../task-dsl/authorization/source-materials.ts"
import type { StructureIndex } from "./evidence-preparation/structure-index.ts"
import { operationCallSourceSelection, operationCallTargets } from "./operation-links.ts"
import { structuralDependencyRevision } from "./operation-work.ts"
import { canonicalControl } from "../../task-dsl/authorization/control-slice.ts"

export interface SourceMaterialUse {
  kind: "entry" | "call"; operationId: string; questionId: string; materialId: string; callerMaterialId?: string;
  relationId?: string; receiverClass?: string; arguments: Array<{ parameter: string; object: string }>;
}
const instantiate = (material: SourceMaterial, questionId: string, accepted: BoundSemanticBlock[]): BoundSemanticBlock => {
  const original = material.unit, handle = accepted.find(u => u.role === original.role && u.source?.id === material.source.id && u.receiverClass === material.receiverClass)?.handle ?? material.id
  const rebind = (v: unknown): any => Array.isArray(v) ? v.map(rebind) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([key]) => key !== "callee").map(([key, value]) => [key, rebind(value)])) : typeof v === "string" && v.startsWith(`${original.handle}.`) ? `${handle}.${v.slice(original.handle.length + 1)}` : v
  return { ...rebind(original), handle, questionId }
}
const literalArgument = (text: string): { known: boolean; value?: unknown } => {
  if (["None", "null", "nil"].includes(text)) return { known: true, value: null }
  if (["True", "true", "False", "false"].includes(text)) return { known: true, value: /^(True|true)$/.test(text) }
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return { known: true, value: Number(text) }
  try { return { known: true, value: JSON.parse(text) } } catch { if (/^'[^'\\]*'$/.test(text)) return { known: true, value: text.slice(1, -1) }; return { known: false } }
}
/** Parameter adoption is a source relationship, not a model assertion. Complex
 * unresolved expression mappings remain unlinked instead of guessing aliases. */
function actualArguments(index: StructureIndex, caller: BoundSemanticBlock, step: Extract<BoundSemanticBlock["blocks"][number]["steps"][number], { kind: "call" }>, target: BoundSemanticBlock) {
  const call = index.relatedCalls(caller.source!.id, caller.receiverClass).find(c => c.id === step.sourceCallId), symbol = index.symbols.find(s => s.id === target.source!.id)
  if (!call || !symbol || call.arguments.some(a => /^\*/.test(a.trim()))) return false
  const arguments_ = call.arguments.map(expression => { const keyword = /^(\w+)\s*=(?!=)([\s\S]+)$/.exec(expression); return { parameter: keyword?.[1], expression: (keyword?.[2] ?? expression).trim() } }), positional = arguments_.filter(a => !a.parameter)
  const steps = caller.blocks.flatMap(b => b.steps); let position = 0
  const expected = symbol.parameters.map((parameter, i) => {
    const receiver = i === 0 && symbol.className && symbol.attributes.methodBinding !== "static" && call.receiver
    return { parameter: parameter.name, expression: receiver || (arguments_.find(a => a.parameter === parameter.name) ?? positional[position++])?.expression || parameter.defaultExpression }
  })
  if (step.arguments.length !== expected.filter(a => a.expression !== undefined).length) return false
  return expected.every(argument => {
    if (argument.expression === undefined) return !step.arguments.some(a => a.parameter === argument.parameter)
    const actual = step.arguments.filter(a => a.parameter === argument.parameter); if (actual.length !== 1) return false
    if (actual[0]!.object === argument.expression) return true
    const literal = literalArgument(argument.expression)
    if (literal.known && steps.some(s => s.kind === "bind" && s.type === "value" && (s.bindingName ?? s.name) === actual[0]!.object && canonicalControl(s.value) === canonicalControl(literal.value))) return true
    const nested = index.relatedCalls(caller.source!.id, caller.receiverClass).filter(c => `${c.expression}(${c.arguments.join(",")})`.replace(/\s/g, "") === argument.expression!.replace(/\s/g, ""))
    return nested.length === 1 && steps.some(s => s.kind === "call" && s.sourceCallId === nested[0]!.id && s.result === actual[0]!.object)
  })
}
/** Reachability comes from exact current source calls, independently of saved availability. */
export function projectSourceMaterials(program: AuthorizationInquiryProgram, accepted: BoundSemanticBlock[], snapshot: SourceMaterialSnapshot, index: StructureIndex) {
  const available = snapshot.materials.filter(m => m.current && index.symbols.some(s => s.id === m.source.id && s.sha256 === m.source.sha256) && m.dependencies.every(d => d.kind === "source-span" ? index.symbols.some(s => s.path === d.key && s.sha256 === d.revision) : d.kind === "symbol-resolution" ? index.symbols.some(s => s.id === d.key && s.sha256 === d.revision) : structuralDependencyRevision(index, d) === d.revision))
  const units: BoundSemanticBlock[] = [], uses: SourceMaterialUse[] = []
  for (const operation of program.operations ?? []) {
    const entry = accepted.find(u => u.questionId === operation.sourceQuestionId && u.role === "entry" && u.source)
    const root = entry && available.find(m => m.unit.role === "entry" && m.source.id === entry.source!.id && m.source.sha256 === entry.source!.sha256 && m.receiverClass === entry.receiverClass)
    if (!root) continue
    for (const question of program.operationQuestions?.filter(q => q.operationId === operation.id) ?? []) {
      const candidates = available.map(m => instantiate(m, question.questionId, accepted)), local: BoundSemanticBlock[] = [], seen = new Set<string>()
      const byMaterial = new Map(available.map((m, i) => [m.id, candidates[i]!]))
      const visit = (material: SourceMaterial) => {
        if (seen.has(material.id)) return
        seen.add(material.id)
        const caller = byMaterial.get(material.id)!; local.push(caller)
        for (const block of caller.blocks) for (const step of block.steps) if (step.kind === "call") {
          if (!step.sourceCallId) { delete step.callee; continue }
          const selected = operationCallSourceSelection(index, caller, step), targets = operationCallTargets(index, caller, step, candidates)
          if (selected.actions.length !== 1 || targets.length !== 1 || !actualArguments(index, caller, step, targets[0]!.unit)) { delete step.callee; continue }
          const target = targets[0]!, helper = available.find(m => byMaterial.get(m.id) === target.unit)!
          step.callee = target.unit.handle
          uses.push({ kind: "call", operationId: operation.id, questionId: question.questionId, materialId: helper.id, callerMaterialId: material.id, relationId: target.relationId, receiverClass: target.receiverClass, arguments: structuredClone(step.arguments) })
          visit(helper)
        }
      }
      uses.push({ kind: "entry", operationId: operation.id, questionId: question.questionId, materialId: root.id, receiverClass: root.receiverClass, arguments: [] })
      visit(root); units.push(...local)
    }
  }
  return { units, uses }
}
