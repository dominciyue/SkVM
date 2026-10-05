import type { StructureIndex } from "./evidence-preparation/structure-index.ts"
import type { BoundSemanticBlock } from "../../task-dsl/authorization/semantic-flow.ts"
import { operationWork } from "./operation-work.ts"
type CallStep = Extract<BoundSemanticBlock["blocks"][number]["steps"][number], { kind: "call" }>
export interface OperationSourceLink { action: "bind" | "unbind"; caller: string; call: string; target?: string; previousTarget?: string; receiverClass?: string; relationId?: string; structureRevision: string }
/** Bind source identity only. Model-authored control meaning and typed arguments are unchanged. */
function sourceActions(index: StructureIndex, caller: BoundSemanticBlock, step: CallStep) {
  const source = caller.source, owner = source && index.symbols.find(s => s.id === source.id && s.sha256 === source.sha256)
  if (!owner) return []
  const calls = index.relatedCalls(owner.id, caller.receiverClass)
  if (calls.some(c => c.resolution === "unresolved" && (c.expression === step.symbol || c.expression.split(".").at(-1) === step.symbol))) return []
  return operationWork(index, owner.id, [], [], caller.receiverClass).actions.filter(a => {
    const candidate = index.symbols.find(s => s.id === a.candidateId)!, call = calls.find(c => c.id === a.relationId)
    const named = step.symbol === call?.expression || step.symbol === candidate.qualifiedName || step.symbol === candidate.name
    return named && (!step.candidateId || step.candidateId === candidate.id) && (!step.pathHint || candidate.path === step.pathHint || candidate.path.startsWith(`${step.pathHint}/`))
  })
}
export function operationCallTargets(index: StructureIndex, caller: BoundSemanticBlock, step: CallStep, units: BoundSemanticBlock[]) {
  const actions = sourceActions(index, caller, step)
  return units.filter(u => u.questionId === caller.questionId && u.role === "helper").flatMap(unit => {
    const target = unit.source && index.symbols.find(s => s.id === unit.source!.id && s.sha256 === unit.source!.sha256)
    const action = target && actions.find(a => a.candidateId === target.id && a.receiverClass === unit.receiverClass)
    return action ? [{ unit, relationId: action.relationId, receiverClass: action.receiverClass }] : []
  })
}
export function bindOperationCalls(index: StructureIndex, original: BoundSemanticBlock[]) {
  const units = structuredClone(original), records: OperationSourceLink[] = []
  for (const caller of units) for (const block of caller.blocks) for (const step of block.steps) {
    if (step.kind !== "call") continue
    const targets = operationCallTargets(index, caller, step, units)
    if (sourceActions(index, caller, step).length !== 1 || targets.length !== 1) {
      if (step.callee) {
        records.push({ action: "unbind", caller: caller.handle, call: step.name, previousTarget: step.callee, structureRevision: index.revision })
        delete step.callee
      }
      continue
    }
    if (step.callee === targets[0]!.unit.handle) continue
    const target = targets[0]!
    records.push({ action: "bind", caller: caller.handle, call: step.name, target: target.unit.handle, previousTarget: step.callee, receiverClass: target.receiverClass, relationId: target.relationId, structureRevision: index.revision })
    step.callee = target.unit.handle
  }
  return { units, records }
}
