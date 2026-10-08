import type { AuthorizationInquiryProgram } from "../../task-dsl/authorization/inquiry-program.ts"
import type { BoundSemanticBlock } from "../../task-dsl/authorization/semantic-flow.ts"
import type { SourceMaterial, SourceMaterialSnapshot } from "../../task-dsl/authorization/source-materials.ts"
import type { StructureIndex, StructureMethodControl, StructureCallableBinding } from "./evidence-preparation/structure-index.ts"
import { sourceCallableDefinitionName, sourceCallableToken, sourceCallableValueName, sourceCallableValueResult, sourceClassToken, sourceClassValueName, sourceClassValueResult, sourceDirectMethodRead, sourceFieldMethodToken, sourceMethodCaptureName, sourceMethodCaptureResult, sourceMethodChoiceSentinel, sourceMethodChoiceToken, sourceMethodLookupSelector, sourceMethodLookupSentinel, sourceMethodLookupToken, sourceSyntaxAnchorId } from "./evidence-preparation/source-identities.ts"
import { operationCallSourceSelection, operationCallTargets } from "./operation-links.ts"
import { structuralDependencyRevision } from "./operation-work.ts"
import { canonicalControl } from "../../task-dsl/authorization/control-slice.ts"
import { sourceArgumentBindings } from "./evidence-preparation/source-arguments.ts"
type ChoiceStep = Extract<BoundSemanticBlock["blocks"][number]["steps"][number], { kind: "choose" }>
const sourceControlBlock = (unit: BoundSemanticBlock, controls: StructureMethodControl[]) => {
  let block = unit.blocks.find(b => b.name === unit.start)
  for (const control of controls) {
    const parents = block?.steps.filter(s => s.kind === (control.kind === "branch" ? "choose" : "try") && s.name === `${control.kind === "branch" ? "choose" : "try"}-${control.anchorId}`)
    if (parents?.length !== 1) return
    const parent = parents[0]!
    let name: string | undefined
    if (control.kind === "branch" && parent.kind === "choose" && parent.cases.length === 1) name = control.branch === "true" ? parent.cases[0]!.body : parent.otherwise
    else if (control.kind === "try" && parent.kind === "try") name = control.region === "handler" ? parent.handlers[control.handlerIndex ?? -1]?.body : parent[control.region]
    else return
    block = unit.blocks.find(b => b.name === name)
  }
  return block
}
/** A possible writer is not an executed capture. Retained material must preserve
 * the exact original creation, adjacent field store and source control order. */
function currentMethodStoresValid(index: StructureIndex, unit: BoundSemanticBlock) {
  const proofs = index.methodStores(unit.source!.id, unit.receiverClass), captures = index.relatedCalls(unit.source!.id, unit.receiverClass).filter(c => c.methodCapture), steps = unit.blocks.flatMap(b => b.steps), names = new Set([...proofs.map(p => `field-method-value-${p.anchorId}`), ...captures.map(c => sourceMethodCaptureName(c.id))])
  if (steps.some(s => s.kind === "assign-value" && s.boundMethod && !names.has(s.name))) return false
  for (const call of captures) {
    const proof = call.methodCapture!, block = sourceControlBlock(unit, proof.controls), callAnchor = sourceSyntaxAnchorId(unit.source!.id, call.startIndex!, call.endIndex!, "call"), creations = steps.filter(s => s.name === sourceMethodCaptureName(call.id)), creation = creations[0], result = sourceMethodCaptureResult(call.id)
    const invocations = steps.filter(s => ["call", "context", "effect"].includes(s.kind) && [`call-${callAnchor}`, `context-${callAnchor}`, `effect-${callAnchor}`].includes(s.name)), invocation = invocations[0]
    if (!block || creations.length !== 1 || creation?.kind !== "assign-value" || invocations.length !== 1 || !invocation || !block.steps.includes(creation) || !block.steps.includes(invocation) || block.steps.indexOf(creation) >= block.steps.indexOf(invocation)) return false
    if (creation.result !== result || canonicalControl(creation.value) !== canonicalControl({ literal: sourceFieldMethodToken(proof) }) || canonicalControl(creation.methodRead ?? null) !== canonicalControl({ receiver: proof.receiver, method: proof.method }) || canonicalControl(creation.boundMethod ?? null) !== canonicalControl({ receiver: proof.receiver, targetId: proof.targetId, targetSha256: proof.targetSha256 })) return false
    if (invocation.kind === "call" && (invocation.sourceCallId !== call.id || invocation.symbol !== call.expression || invocation.candidateId !== proof.targetId || steps.filter(s => s.kind === "call" && s.sourceCallId === call.id).length !== 1)) return false
    if (steps.some(s => s !== creation && (s.kind === "bind" && (s.bindingName ?? s.name) === result || (s.kind === "assign-value" || s.kind === "call") && s.result === result))) return false
    const ordered = (events: string[][], lower: number, upper: number) => {
      let previous = lower
      return events.every(alternatives => {
        const positions = block.steps.flatMap((s, i) => alternatives.includes(s.name) ? [i] : [])
        if (positions.length !== 1 || positions[0]! <= previous || positions[0]! >= upper) return false
        previous = positions[0]!
        return true
      })
    }
    if (!ordered(proof.order.before, -1, block.steps.indexOf(creation)) || !ordered(proof.argumentEvents, block.steps.indexOf(creation), block.steps.indexOf(invocation)) || !ordered(proof.order.after, block.steps.indexOf(invocation), block.steps.length)) return false
  }
  return proofs.every(proof => {
    const block = sourceControlBlock(unit, proof.controls), creations = steps.filter(s => s.name === `field-method-value-${proof.anchorId}`), stores = steps.filter(s => s.name === `field-${proof.anchorId}`), creation = creations[0], store = stores[0], result = `field-method-object-${proof.anchorId}`
    if (!block || creations.length !== 1 || stores.length !== 1 || creation?.kind !== "assign-value" || store?.kind !== "transform" || !block.steps.includes(creation) || block.steps.indexOf(store) !== block.steps.indexOf(creation) + 1) return false
    if (creation.result !== result || canonicalControl(creation.value) !== canonicalControl({ literal: sourceFieldMethodToken(proof) }) || canonicalControl(creation.methodRead ?? null) !== canonicalControl({ receiver: proof.receiver, method: proof.method }) || canonicalControl(creation.boundMethod ?? null) !== canonicalControl({ receiver: proof.receiver, targetId: proof.targetId, targetSha256: proof.targetSha256 }) || store.object !== proof.receiver || store.field !== proof.field || store.source !== result || Object.hasOwn(store, "value")) return false
    const ordered = (events: string[][], before: boolean) => events.every(alternatives => {
      const positions = block.steps.flatMap((s, i) => alternatives.includes(s.name) ? [i] : [])
      return positions.length === 1 && (before ? positions[0]! < block.steps.indexOf(creation) : positions[0]! > block.steps.indexOf(store))
    })
    return ordered(proof.order.before, true) && ordered(proof.order.after, false)
  })
}

/** A source reference or definition must create its real callable at the
 * original control/order point. The finite selector token is insufficient. */
function currentCallableCreationsValid(index: StructureIndex, unit: BoundSemanticBlock) {
  const owner = unit.source!.id, calls = index.relatedCalls(owner, unit.receiverClass), steps = unit.blocks.flatMap(b => b.steps)
  const values = [...new Map(calls.flatMap(c => c.argumentFacts?.flatMap(a => a.callableValue?.kind === "module" ? [a.callableValue] : []) ?? []).map(p => [sourceCallableValueName(owner, p), p])).values()]
  const classes = [...new Map(calls.flatMap(c => c.argumentFacts?.flatMap(a => a.classValue ? [a.classValue] : []) ?? []).map(p => [sourceClassValueName(owner, p), p])).values()]
  const definitions = index.symbols.filter(s => s.valueCallable && !s.valueCallable.gap && s.valueCallable.ownerId === owner && s.valueCallable.ownerSha256 === unit.source!.sha256)
  const permitted = new Set([...values.map(p => sourceCallableValueName(owner, p)), ...definitions.map(s => sourceCallableDefinitionName(s.valueCallable!.anchorId))])
  if (steps.some(s => s.kind === "assign-value" && s.sourceCallable && !permitted.has(s.name))) return false
  if (steps.some(s => s.kind === "assign-value" && s.sourceClass && !classes.some(p => s.name === sourceClassValueName(owner, p)))) return false
  const validate = (name: string, result: string, target: { targetId: string; targetSha256: string }, captures: Array<{ parameter: string; object: string }>, controls: StructureMethodControl[], order: { before: string[][]; after: string[][] }, evaluation?: typeof order, classReference = false) => {
    const block = sourceControlBlock(unit, controls), creations = steps.filter(s => s.name === name), creation = creations[0]
    if (!block || creations.length !== 1 || creation?.kind !== "assign-value" || !block.steps.includes(creation) || creation.result !== result || canonicalControl(creation.value) !== canonicalControl({ literal: classReference ? sourceClassToken(target) : sourceCallableToken(target) }) || (classReference ? canonicalControl(creation.sourceClass ?? null) !== canonicalControl(target) || !!creation.sourceCallable : canonicalControl(creation.sourceCallable ?? null) !== canonicalControl({ ...target, ...(evaluation ? { scope: "module" } : {}), captures }) || !!creation.sourceClass) || creation.boundMethod || creation.methodRead) return false
    if (steps.some(s => s !== creation && (s.kind === "bind" && (s.bindingName ?? s.name) === result || (s.kind === "assign-value" || s.kind === "call") && s.result === result))) return false
    const position = block.steps.indexOf(creation), ordered = (events: string[][], lower: number, upper: number) => {
      let previous = lower
      return events.every(names => {
        const positions = block.steps.flatMap((s, i) => names.includes(s.name) ? [i] : [])
        if (positions.length !== 1 || positions[0]! <= previous || positions[0]! >= upper) return false
        previous = positions[0]!; return true
      })
    }
    return ordered(order.before, -1, position) && ordered(order.after, position, block.steps.length) && (!evaluation || ordered(evaluation.before, -1, position) && ordered(evaluation.after, position, block.steps.length))
  }
  return classes.every(p => validate(sourceClassValueName(owner, p), sourceClassValueResult(owner, p), { targetId: p.targetId, targetSha256: p.targetSha256 }, [], p.controls, p.order, p.evaluationOrder, true)) && values.every(p => validate(sourceCallableValueName(owner, p), sourceCallableValueResult(owner, p), { targetId: p.targetId, targetSha256: p.targetSha256 }, [], p.controls, p.order, p.evaluationOrder)) && definitions.every(s => {
    const p = s.valueCallable!
    if (!validate(sourceCallableDefinitionName(p.anchorId), p.name, { targetId: s.id, targetSha256: s.sha256 }, p.captures.map(c => ({ parameter: c.name, object: c.name })), p.controls, p.order)) return false
    if (s.returnedCallable && !s.returnedCallable.gap) {
      const returns = steps.filter(s => s.kind === "return"), returned = returns[0], block = unit.blocks.find(b => b.name === unit.start)
      return returns.length === 1 && returned?.kind === "return" && returned.name === `return-${s.returnedCallable.returnAnchorId}` && returned.valueFrom === s.name && returned.object === undefined && !Object.hasOwn(returned, "value") && !!block?.steps.includes(returned)
    }
    return true
  })
}

export interface SourceMaterialUse {
  kind: "entry" | "call" | "framework"; operationId: string; questionId: string; materialId: string; callerMaterialId?: string;
  relationId?: string; receiverClass?: string; arguments: Array<{ parameter: string; object: string }>;
  sourceId?: string; sourceCallId?: string; frameworkModel?: string; projectedHandle?: string;
  /** Scratch wrapper environment, never an argument declared by the source function. */
  contextArguments?: Array<{ parameter: string; object: string }>;
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
  if (!call || !symbol) return false
  const binding = sourceArgumentBindings(index, call, symbol), expected = binding.bindings, steps = caller.blocks.flatMap(b => b.steps)
  if (binding.gap || step.arguments.length !== expected.length) return false
  const returnedCreationValid = (proof: StructureCallableBinding, controls: StructureMethodControl[]) => {
    const creations = steps.filter(s => s.kind === "call" && s.sourceCallId === proof.creationCallId), creation = creations[0], block = sourceControlBlock(caller, proof.controls)
    if (!block || creations.length !== 1 || creation?.kind !== "call" || !creation.callee || creation.candidateId !== proof.factoryId || creation.result !== proof.name || creation.name !== `call-${sourceSyntaxAnchorId(caller.source!.id, proof.source.startIndex, proof.source.endIndex, "call")}` || !block.steps.includes(creation)) return false
    if (steps.some(s => s !== creation && (s.kind === "bind" && (s.bindingName ?? s.name) === proof.name || (s.kind === "assign-value" || s.kind === "call") && s.result === proof.name))) return false
    const position = block.steps.indexOf(creation), ordered = (events: string[][], lower: number, upper: number) => {
      let previous = lower
      return events.every(names => { const positions = block.steps.flatMap((s, i) => names.includes(s.name) ? [i] : []); if (positions.length !== 1 || positions[0]! <= previous || positions[0]! >= upper) return false; previous = positions[0]!; return true })
    }
    if (!ordered(proof.order.before, -1, position) || !ordered(proof.order.after, position, block.steps.length)) return false
    let common = 0
    while (common < proof.controls.length && common < controls.length && canonicalControl(proof.controls[common]) === canonicalControl(controls[common])) common++
    const parent = sourceControlBlock(caller, controls.slice(0, common)), controlStep = (control: StructureMethodControl) => parent?.steps.find(s => s.kind === (control.kind === "branch" ? "choose" : "try") && s.name === `${control.kind === "branch" ? "choose" : "try"}-${control.anchorId}`)
    const before = proof.controls[common] ? controlStep(proof.controls[common]!) : creation, anchor = sourceSyntaxAnchorId(caller.source!.id, call.startIndex!, call.endIndex!, "call")
    const after = controls[common] ? controlStep(controls[common]!) : call.callableParameter ? parent?.steps.find(s => s.kind === "choose" && s.name === `function-call-${anchor}`) : step
    return !!parent && !!before && !!after && parent.steps.includes(before) && parent.steps.includes(after) && (before === after || parent.steps.indexOf(before) < parent.steps.indexOf(after))
  }
  if (call.callableParameter) {
    const proof = call.callableParameter, anchor = sourceSyntaxAnchorId(caller.source!.id, call.startIndex!, call.endIndex!, "call"), block = sourceControlBlock(caller, proof.controls), dispatches = steps.filter((s): s is ChoiceStep => s.kind === "choose" && s.name === `function-call-${anchor}`), dispatch = dispatches[0]
    if (!block || dispatches.length !== 1 || !dispatch || !block.steps.includes(dispatch) || dispatch.cases.length !== proof.choices.length || new Set(dispatch.cases.map(c => c.body)).size !== proof.choices.length || steps.filter(s => s.kind === "call" && s.sourceCallId === call.id).length !== proof.choices.length) return false
    const ordered = (events: string[][], lower: number, upper: number) => {
      let previous = lower
      return events.every(names => { const positions = block.steps.flatMap((s, i) => names.includes(s.name) ? [i] : []); if (positions.length !== 1 || positions[0]! <= previous || positions[0]! >= upper) return false; previous = positions[0]!; return true })
    }
    if (!ordered(proof.order.before, -1, block.steps.indexOf(dispatch)) || !ordered(proof.order.after, block.steps.indexOf(dispatch), block.steps.length)) return false
    for (const [i, choice] of proof.choices.entries()) {
      const alternative = dispatch.cases[i]!, variant = caller.blocks.find(b => b.name === alternative.body), invocations = variant?.steps.filter(s => s.kind === "call"), invocation = invocations?.[0]
      if (canonicalControl(alternative.condition) !== canonicalControl({ op: "eq", left: { binding: proof.name }, right: { literal: sourceCallableToken(choice) } }) || invocations?.length !== 1 || invocation?.kind !== "call" || variant!.steps.some(s => s !== invocation && s.kind !== "bind")) return false
      if (invocation.name !== `call-${anchor}-callable-${i}` || invocation.sourceCallId !== call.id || invocation.symbol !== call.expression || invocation.candidateId !== choice.targetId) return false
    }
    const selected = proof.choices.findIndex(c => c.targetId === symbol.id && c.targetSha256 === symbol.sha256), failure = caller.blocks.find(b => b.name === dispatch.otherwise)?.steps
    if (selected < 0 || step.name !== `call-${anchor}-callable-${selected}` || !caller.blocks.find(b => b.name === dispatch.cases[selected]!.body)?.steps.includes(step) || failure?.length !== 1 || failure[0]!.kind !== "unresolved" || failure[0]!.reason !== "source-callable-value-unresolved") return false
    if (symbol.valueCallable?.captures.some(c => target.parameters.filter(p => p.name === c.name).length !== 1) || target.parameters.some(p => !symbol.parameters.some(s => s.name === p.name) && !symbol.valueCallable?.captures.some(c => c.name === p.name))) return false
  }
  if (call.methodField) {
    const proof = call.methodField, callAnchor = call.startIndex !== undefined && call.endIndex !== undefined ? sourceSyntaxAnchorId(caller.source!.id, call.startIndex, call.endIndex, "call") : undefined, block = sourceControlBlock(caller, proof.controls)
    const dispatches = steps.filter((s): s is ChoiceStep => s.kind === "choose" && s.name === `field-method-call-${callAnchor}`), dispatch = dispatches[0]
    if (!callAnchor || !block || dispatches.length !== 1 || !dispatch || !block.steps.includes(dispatch) || dispatch.cases.length !== proof.choices.length || new Set(dispatch.cases.map(c => c.body)).size !== proof.choices.length || steps.filter(s => s.kind === "call" && s.sourceCallId === call.id).length !== proof.choices.length) return false
    for (const [i, choice] of proof.choices.entries()) {
      const alternative = dispatch.cases[i]!, variant = caller.blocks.find(b => b.name === alternative.body), invocations = variant?.steps.filter(s => s.kind === "call"), invocation = invocations?.[0]
      if (canonicalControl(alternative.condition) !== canonicalControl({ op: "eq", left: { binding: `${proof.receiver}.${proof.field}` }, right: { literal: sourceFieldMethodToken(choice) } }) || invocations?.length !== 1 || invocation?.kind !== "call" || variant!.steps.some(s => s !== invocation && s.kind !== "bind")) return false
      if (invocation.name !== `call-${callAnchor}-field-${i}` || invocation.sourceCallId !== call.id || invocation.symbol !== call.expression || invocation.candidateId !== choice.targetId) return false
    }
    const selected = proof.choices.findIndex(choice => choice.targetId === symbol.id), failure = caller.blocks.find(b => b.name === dispatch.otherwise)?.steps
    if (selected < 0 || step.name !== `call-${callAnchor}-field-${selected}` || !caller.blocks.find(b => b.name === dispatch.cases[selected]!.body)?.steps.includes(step) || failure?.length !== 1 || failure[0]!.kind !== "unresolved" || failure[0]!.reason !== "source-field-method-value-unresolved") return false
  }
  if (call.methodBinding) {
    const proof = call.methodBinding, creation = steps.find(s => s.kind === "assign-value" && s.result === proof.name && canonicalControl(s.value) === canonicalControl({ binding: `${proof.receiver}.${proof.method}` }))
    if (!creation || creation.kind !== "assign-value" || canonicalControl(creation.methodRead ?? null) !== canonicalControl({ receiver: proof.receiver, method: proof.method }) || steps.indexOf(creation) >= steps.indexOf(step) || steps.some(s => s !== creation && (s.kind === "bind" && (s.bindingName ?? s.name) === proof.name || (s.kind === "assign-value" || s.kind === "call") && s.result === proof.name))) return false
  }
  if (call.methodChoices) {
    const proof = call.methodChoices, owner = caller.source!.id, block = caller.blocks.find(b => b.steps.includes(step)), callAnchor = call.startIndex !== undefined && call.endIndex !== undefined ? sourceSyntaxAnchorId(owner, call.startIndex, call.endIndex, "call") : undefined
    const dispatches = caller.blocks.flatMap(b => b.steps.filter((s): s is ChoiceStep => s.kind === "choose" && s.name === `method-choice-${callAnchor}`).map(dispatch => ({ block: b, dispatch })))
    if (!block || !callAnchor || dispatches.length !== 1 || dispatches[0]!.dispatch.kind !== "choose") return false
    const { dispatch, block: dispatchBlock } = dispatches[0]!
    if (dispatch.cases.length !== proof.choices.length || new Set(dispatch.cases.map(c => c.body)).size !== proof.choices.length || steps.filter(s => s.kind === "call" && s.sourceCallId === call.id).length !== proof.choices.length) return false
    for (const [i, choice] of proof.choices.entries()) {
      const alternative = dispatch.cases[i]!, variant = caller.blocks.find(b => b.name === alternative.body), invocations = variant?.steps.filter(s => s.kind === "call")
      if (canonicalControl(alternative.condition) !== canonicalControl({ op: "eq", left: { binding: proof.name }, right: { literal: sourceMethodChoiceToken(proof, choice) } }) || invocations?.length !== 1) return false
      const invocation = invocations[0]!
      if (invocation.name !== `call-${callAnchor}-method-${i}` || invocation.sourceCallId !== call.id || invocation.symbol !== call.expression || invocation.candidateId !== choice.targetId) return false
    }
    const selected = proof.choices.filter(choice => choice.targetId === symbol.id && dispatch.cases.some(c => c.body === block.name && canonicalControl(c.condition) === canonicalControl({ op: "eq", left: { binding: proof.name }, right: { literal: sourceMethodChoiceToken(proof, choice) } })))
    if (selected.length !== 1) return false
    const choice = selected[0]!, token = sourceMethodChoiceToken(proof, choice), initName = `method-choice-init-${proof.name}`, start = caller.blocks.find(b => b.name === caller.start), init = start?.steps.find(s => s.name === initName)
    if (step.name !== `call-${callAnchor}-method-${proof.choices.indexOf(choice)}`) return false
    if (!init || init.kind !== "assign-value" || init.result !== proof.name || canonicalControl(init.value) !== canonicalControl({ literal: sourceMethodChoiceSentinel(proof) }) || choice.source.endIndex > call.startIndex!) return false
    if (start!.steps.slice(0, start!.steps.indexOf(init)).some(s => s.kind !== "bind" && !(s.kind === "assign-value" && s.name.startsWith("method-choice-init-")))) return false
    const failure = caller.blocks.find(b => b.name === dispatch.otherwise)?.steps
    if (failure?.length !== 1 || failure[0]!.kind !== "raise" || failure[0]!.exceptionType !== "UnboundLocalError" || failure[0]!.failureKind !== "operation" || failure[0]!.rethrow) return false
    let creationBlock = start
    for (const control of choice.controls) {
      const parent = creationBlock, branch = parent?.steps.find(s => s.kind === "choose" && s.name === `choose-${control.anchorId}`)
      if (!branch || branch.kind !== "choose" || branch.cases.length !== 1 || parent === dispatchBlock && parent.steps.indexOf(branch) >= parent.steps.indexOf(dispatch)) return false
      creationBlock = caller.blocks.find(b => b.name === (control.branch === "true" ? branch.cases[0]!.body : branch.otherwise))
    }
    const creation = creationBlock?.steps.find(s => s.name === `assign-${choice.anchorId}`)
    if (!creation || creation.kind !== "assign-value" || creation.result !== proof.name || canonicalControl(creation.value) !== canonicalControl({ literal: token }) || canonicalControl(creation.methodRead ?? null) !== canonicalControl({ receiver: proof.receiver, method: choice.method }) || creationBlock === dispatchBlock && creationBlock.steps.indexOf(creation) >= creationBlock.steps.indexOf(dispatch)) return false
    const permitted = new Map([[initName, sourceMethodChoiceSentinel(proof)], ...proof.choices.map(c => [`assign-${c.anchorId}`, sourceMethodChoiceToken(proof, c)] as const)])
    if (steps.some(s => s.kind === "bind" && (s.bindingName ?? s.name) === proof.name || s.kind === "call" && s.result === proof.name || s.kind === "assign-value" && s.result === proof.name && (!permitted.has(s.name) || canonicalControl(s.value) !== canonicalControl({ literal: permitted.get(s.name) })))) return false
  }
  if (call.methodLookup) {
    const proof = call.methodLookup, callAnchor = call.startIndex !== undefined && call.endIndex !== undefined ? sourceSyntaxAnchorId(caller.source!.id, call.startIndex, call.endIndex, "call") : undefined
    const creation = steps.filter(s => s.name === `method-lookup-${proof.creationCallId}`), dispatch = steps.filter((s): s is ChoiceStep => s.kind === "choose" && s.name === `method-lookup-call-${callAnchor}`), start = caller.blocks.find(b => b.name === caller.start), lookupChoices = proof.choices.filter(c => c.lookup)
    const controlStep = (block: BoundSemanticBlock["blocks"][number] | undefined, control: StructureMethodControl) => block?.steps.find(s => s.kind === (control.kind === "branch" ? "choose" : "try") && s.name === `${control.kind === "branch" ? "choose" : "try"}-${control.anchorId}`)
    const locate = (controls: StructureMethodControl[]) => {
      let block = start
      for (const control of controls) {
        const parent = controlStep(block, control)
        if (!parent) return
        let name: string | undefined
        if (control.kind === "branch" && parent.kind === "choose" && parent.cases.length === 1) name = control.branch === "true" ? parent.cases[0]!.body : parent.otherwise
        else if (control.kind === "try" && parent.kind === "try") name = control.region === "handler" ? parent.handlers[control.handlerIndex ?? -1]?.body : parent[control.region]
        else return
        block = caller.blocks.find(b => b.name === name)
      }
      return block
    }
    const ordered = (controls: StructureMethodControl[], sourceIndex: number, created: typeof steps[number]) => {
      let common = 0
      while (common < controls.length && common < proof.callControls.length && canonicalControl(controls[common]) === canonicalControl(proof.callControls[common])) common++
      const parent = locate(controls.slice(0, common)), before = controls[common] ? controlStep(parent, controls[common]!) : created, after = proof.callControls[common] ? controlStep(parent, proof.callControls[common]!) : dispatch[0]
      return !!parent && !!before && !!after && (before === after || (parent.steps.indexOf(before) < parent.steps.indexOf(after)) === (sourceIndex < call.startIndex!))
    }
    if (!callAnchor || !start || creation.length !== 1 || dispatch.length !== 1 || !locate(proof.controls)?.steps.includes(creation[0]!) || !locate(proof.callControls)?.steps.includes(dispatch[0]!) || !ordered(proof.controls, proof.source.startIndex, creation[0]!) || steps.filter(s => s.kind === "call" && s.sourceCallId === call.id).length !== proof.choices.length) return false
    if (dispatch[0]!.cases.length !== proof.choices.length || new Set(dispatch[0]!.cases.map(c => c.body)).size !== proof.choices.length) return false
    const initName = `method-lookup-init-${proof.name}`, init = start.steps.find(s => s.name === initName)
    if (!init || init.kind !== "assign-value" || init.result !== proof.name || canonicalControl(init.value) !== canonicalControl({ literal: sourceMethodLookupSentinel(proof) }) || start.steps.slice(0, start.steps.indexOf(init)).some(s => s.kind !== "bind" && !(s.kind === "assign-value" && /^(method-choice|method-lookup)-init-/.test(s.name)))) return false
    const permitted = new Map([[initName, sourceMethodLookupSentinel(proof)]])
    if (lookupChoices.length) {
      const selector = creation[0]!
      if (selector.kind !== "choose" || selector.cases.length !== lookupChoices.length || new Set(selector.cases.map(c => c.body)).size !== lookupChoices.length) return false
      for (const [i, choice] of lookupChoices.entries()) {
        const created = selector.cases[i]!, value = caller.blocks.find(b => b.name === created.body)?.steps, assignmentName = `lookup-assign-${proof.creationCallId}-${proof.choices.indexOf(choice)}`, token = sourceMethodLookupToken(proof, choice)
        if (canonicalControl(created.condition) !== canonicalControl({ op: "eq", left: sourceMethodLookupSelector(proof), right: { literal: choice.method } }) || value?.length !== 1 || value[0]!.kind !== "assign-value" || value[0]!.name !== assignmentName || value[0]!.result !== proof.name || canonicalControl(value[0]!.value) !== canonicalControl({ literal: token }) || canonicalControl(value[0]!.methodRead ?? null) !== canonicalControl({ receiver: proof.receiver, method: choice.method, ...(proof.fallbackExpression ? { defaultMethod: proof.fallbackExpression.slice(proof.receiver.length + 1) } : {}) })) return false
        permitted.set(assignmentName, token)
      }
      const unknown = caller.blocks.find(b => b.name === selector.otherwise)?.steps
      if (unknown?.length !== 1 || unknown[0]!.kind !== "unresolved" || unknown[0]!.reason !== "source-method-lookup-attribute-unmodeled") return false
    } else if (creation[0]!.kind !== "unresolved" || creation[0]!.reason !== "source-method-lookup-attribute-unmodeled") return false
    for (const [i, choice] of proof.choices.entries()) {
      const token = sourceMethodLookupToken(proof, choice), invocation = dispatch[0]!.cases[i]!, calls = caller.blocks.find(b => b.name === invocation.body)?.steps.filter(s => s.kind === "call")
      if (canonicalControl(invocation.condition) !== canonicalControl({ op: "eq", left: { binding: proof.name }, right: { literal: token } }) || calls?.length !== 1 || calls[0]!.name !== `call-${callAnchor}-lookup-${i}` || calls[0]!.sourceCallId !== call.id || calls[0]!.symbol !== call.expression || calls[0]!.candidateId !== choice.targetId) return false
    }
    const fallback = caller.blocks.find(b => b.name === dispatch[0]!.otherwise)?.steps, check = fallback?.[0]
    if (fallback?.length !== 1 || check?.kind !== "choose" || check.cases.length !== 1 || canonicalControl(check.cases[0]!.condition) !== canonicalControl({ op: "eq", left: { binding: proof.name }, right: { literal: sourceMethodLookupSentinel(proof) } })) return false
    const uncreated = caller.blocks.find(b => b.name === check.cases[0]!.body)?.steps, unknown = caller.blocks.find(b => b.name === check.otherwise)?.steps
    if (uncreated?.length !== 1 || uncreated[0]!.kind !== "raise" || uncreated[0]!.exceptionType !== "UnboundLocalError" || uncreated[0]!.failureKind !== "operation" || uncreated[0]!.rethrow || unknown?.length !== 1 || unknown[0]!.kind !== "unresolved" || unknown[0]!.reason !== "source-method-lookup-value-unresolved") return false
    for (const alternate of proof.alternatives) {
      const creation = steps.find(s => s.name === `assign-${alternate.anchorId}`), choice = proof.choices.find(c => c.targetId === alternate.targetId), token = choice && sourceMethodLookupToken(proof, choice)
      if (!creation || !choice || creation.kind !== "assign-value" || creation.result !== proof.name || canonicalControl(creation.value) !== canonicalControl({ literal: token }) || canonicalControl(creation.methodRead ?? null) !== canonicalControl({ receiver: proof.receiver, method: alternate.method }) || !locate(alternate.controls)?.steps.includes(creation) || !ordered(alternate.controls, alternate.source.startIndex, creation)) return false
      permitted.set(creation.name, token!)
    }
    if (steps.some(s => s.kind === "bind" && (s.bindingName ?? s.name) === proof.name || s.kind === "call" && s.result === proof.name || s.kind === "assign-value" && s.result === proof.name && (!permitted.has(s.name) || canonicalControl(s.value) !== canonicalControl({ literal: permitted.get(s.name) })))) return false
  }
  if (call.callableBinding) {
    const instance = call.callableBinding
    if (!symbol.valueCallable || symbol.valueCallable.gap || symbol.valueCallable.captures.some(c => target.parameters.filter(p => p.name === c.name).length !== 1) || target.parameters.some(p => !symbol.parameters.some(s => s.name === p.name) && !symbol.valueCallable!.captures.some(c => c.name === p.name)) || expected.some(a => !target.parameters.some(p => p.name === a.parameter))) return false
    if (!instance.callControls || !returnedCreationValid(instance, instance.callControls)) return false
  }
  return expected.every(argument => {
    if (argument.expression === undefined) return !step.arguments.some(a => a.parameter === argument.parameter)
    const actual = step.arguments.filter(a => a.parameter === argument.parameter); if (actual.length !== 1) return false
    if (argument.classValue) return actual[0]!.object === sourceClassValueResult(caller.source!.id, argument.classValue)
    if (argument.callableValue) {
      const proof = argument.callableValue
      if (proof.kind === "returned" && (!proof.creation || !returnedCreationValid(proof.creation, proof.controls))) return false
      if (proof.kind !== "returned" || !argument.sourceCallId) return actual[0]!.object === (proof.kind === "module" ? sourceCallableValueResult(caller.source!.id, proof) : argument.expression)
    }
    if (argument.valueFlow) {
      const proof = argument.valueFlow, values = steps.filter(s => s.kind === "short-circuit" && s.name === `short-${proof.anchorId}`), value = values[0], body = value?.kind === "short-circuit" ? caller.blocks.find(b => b.name === value.body) : undefined, invocationBlock = caller.blocks.find(b => b.steps.includes(step))
      if (actual[0]!.object !== proof.result || values.length !== 1 || value?.kind !== "short-circuit" || value.result !== proof.result || value.operator !== proof.operator || value.language !== "python" || canonicalControl(value.left) !== canonicalControl(proof.left) || canonicalControl(value.right) !== canonicalControl(proof.right) || !body || !invocationBlock?.steps.includes(value) || invocationBlock.steps.indexOf(value) >= invocationBlock.steps.indexOf(step)) return false
      if (proof.leftCallId) {
        const calls = steps.filter(s => s.kind === "call" && s.sourceCallId === proof.leftCallId), call = calls[0], block = caller.blocks.find(b => b.steps.includes(value))
        if (calls.length !== 1 || call?.kind !== "call" || call.result !== proof.left.binding || !block?.steps.includes(call) || block.steps.indexOf(call) >= block.steps.indexOf(value)) return false
      }
      if (!proof.rightCallId) return body.steps.length === 0
      const calls = body.steps.filter(s => s.kind === "call" && s.sourceCallId === proof.rightCallId), call = calls[0]
      return calls.length === 1 && call?.kind === "call" && call.result === proof.right.binding && body.steps.every(s => s.kind === "bind" || s === call)
    }
    if (!argument.sourceCallId && actual[0]!.object === argument.expression) return true
    const literal = argument.literalKnown ? { known: true, value: argument.literalValue } : literalArgument(argument.expression)
    if (literal.known && steps.some(s => s.kind === "bind" && s.type === "value" && (s.bindingName ?? s.name) === actual[0]!.object && canonicalControl(s.value) === canonicalControl(literal.value))) return true
    const nested = index.relatedCalls(caller.source!.id, caller.receiverClass).filter(c => argument.sourceCallId ? c.id === argument.sourceCallId : `${c.expression}(${c.arguments.join(",")})`.replace(/\s/g, "") === argument.expression!.replace(/\s/g, ""))
    return nested.length === 1 && steps.some(s => s.kind === "call" && s.sourceCallId === nested[0]!.id && s.result === actual[0]!.object)
  })
}
/** Reachability comes from exact current source calls, independently of saved availability. */
export function projectSourceMaterials(program: AuthorizationInquiryProgram, accepted: BoundSemanticBlock[], snapshot: SourceMaterialSnapshot, index: StructureIndex, options: { questionDirected?: boolean } = {}) {
  const available = snapshot.materials.filter(m => m.current && index.symbols.some(s => s.id === m.source.id && s.sha256 === m.source.sha256) && m.dependencies.every(d => d.kind === "source-span" ? index.symbols.some(s => s.path === d.key && s.sha256 === d.revision) : d.kind === "symbol-resolution" ? index.symbols.some(s => s.id === d.key && s.sha256 === d.revision) : structuralDependencyRevision(index, d) === d.revision) && (!options.questionDirected || currentMethodStoresValid(index, m.unit) && currentCallableCreationsValid(index, m.unit)))
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
          delete step.methodRead
          delete step.fieldMethodRead
          delete step.callableRead
          if (!step.sourceCallId) { delete step.callee; continue }
          const selected = operationCallSourceSelection(index, caller, step), targets = operationCallTargets(index, caller, step, candidates)
          if (selected.actions.length !== 1 || targets.length !== 1 || !actualArguments(index, caller, step, targets[0]!.unit)) { delete step.callee; continue }
          const target = targets[0]!, helper = available.find(m => byMaterial.get(m.id) === target.unit)!
          const call = index.relatedCalls(caller.source!.id, caller.receiverClass).find(c => c.id === step.sourceCallId), symbol = index.symbols.find(s => s.id === target.unit.source!.id), methodRead = call && symbol && (!options.questionDirected || !call.methodCapture) && sourceDirectMethodRead(call, symbol)
          if (methodRead) step.methodRead = methodRead
          if (call?.methodField && symbol) step.fieldMethodRead = { object: call.expression, receiver: call.methodField.receiver, targetId: symbol.id, targetSha256: symbol.sha256 }
          if (options.questionDirected && call?.methodCapture && symbol) step.fieldMethodRead = { object: sourceMethodCaptureResult(call.id), receiver: call.methodCapture.receiver, targetId: symbol.id, targetSha256: symbol.sha256 }
          if (options.questionDirected && (call?.callableParameter || call?.callableBinding) && symbol) step.callableRead = { object: call!.expression, targetId: symbol.id, targetSha256: symbol.sha256 }
          step.callee = target.unit.handle
          uses.push({ kind: "call", operationId: operation.id, questionId: question.questionId, materialId: helper.id, callerMaterialId: material.id, relationId: target.relationId, receiverClass: target.receiverClass, arguments: structuredClone(step.arguments) })
          visit(helper)
        }
      }
      uses.push({ kind: "entry", operationId: operation.id, questionId: question.questionId, materialId: root.id, receiverClass: root.receiverClass, arguments: [] })
      visit(root)
      if (options.questionDirected) {
        const routes = index.routes.filter(r => r.model === "fastapi-source-router/v1" && r.candidateIds.includes(root.source.id)), entry = byMaterial.get(root.id)!
        const gap = (unit: BoundSemanticBlock, reason: string, relationId: string) => { unit.blocks.find(b => b.name === unit.start)!.steps.unshift({ kind: "unresolved", name: `$framework-${relationId}`, claim: `Current request source relationship: ${reason}`, reason }); unit.complete = false }
        const unmodeled = index.diagnostics.find(d => d.handlerId === root.source.id && d.code.startsWith("route-"))
        if (unmodeled) gap(entry, unmodeled.code, root.source.id)
        else if (routes.length > 1) gap(entry, "framework-route-ambiguous", root.source.id)
        else if (routes.length === 1) {
          const route = routes[0]!, registrations = available.filter(m => m.source.id === route.id && m.unit.role === "helper" && !m.receiverClass)
          if (route.bindingGap) gap(entry, route.bindingGap, route.id)
          else if (registrations.length !== 1 || !registrations[0]!.unit.complete) gap(entry, "framework-route-uninterpreted", route.id)
          else {
            const registration = registrations[0]!; visit(registration)
            uses.push({ kind: "framework", operationId: operation.id, questionId: question.questionId, materialId: registration.id, callerMaterialId: root.id, relationId: route.sourceCallId, sourceId: registration.source.id, sourceCallId: route.sourceCallId, frameworkModel: route.model, projectedHandle: byMaterial.get(registration.id)!.handle, arguments: [] })
            const requestTypes = new Set(["fastapi.Request", "fastapi.requests.Request", "starlette.requests.Request"]), source = index.symbols.find(s => s.id === root.source.id)!
            const entryInjected = new Set(index.requestDependencies(root.source.id).flatMap(d => d.parameter ?? []))
            const requests = source.parameters.filter(p => !entryInjected.has(p.name) && p.type && requestTypes.has(index.qualifySourceName(p.type, source.path) ?? "") && entry.parameters.some(a => a.name === p.name))
            const needsRequestContext = (sourceId: string, active = new Set<string>()): boolean => {
              if (active.has(sourceId)) return false
              const symbol = index.symbols.find(s => s.id === sourceId), dependencies = index.requestDependencies(sourceId), injected = new Set(dependencies.flatMap(d => d.parameter ?? [])), next = new Set(active).add(sourceId)
              return !!symbol && (symbol.parameters.some(p => !injected.has(p.name) && p.type && requestTypes.has(index.qualifySourceName(p.type, symbol.path) ?? "")) || dependencies.some(d => d.resolution === "resolved" && d.candidateIds.length === 1 && needsRequestContext(d.candidateIds[0]!, next)))
            }
            const invoked = new Set<string>()
            const compose = (material: SourceMaterial, unit: BoundSemanticBlock, stack: string[], requestObject: string | undefined, extraDependencies: ReturnType<StructureIndex["requestDependencies"]> = []) => {
              const dependencies = [...extraDependencies, ...index.requestDependencies(material.source.id)], prefix: BoundSemanticBlock["blocks"][number]["steps"] = []
              const injected = new Set(dependencies.flatMap(d => d.parameter ?? []))
              unit.parameters = unit.parameters.filter(p => !injected.has(p.name))
              for (const dependency of dependencies) {
                const fail = (reason: string) => { prefix.push({ kind: "unresolved", name: `$framework-${dependency.id}`, claim: `Current ${dependency.constructor} source binding: ${reason}`, reason }); unit.complete = false }
                if (dependency.resolution !== "resolved" || dependency.candidateIds.length !== 1) { fail(dependency.gap ?? "framework-dependency-unresolved"); continue }
                const targetId = dependency.candidateIds[0]!, targets = available.filter(m => m.source.id === targetId && m.unit.role === "helper" && !m.receiverClass)
                if (targets.length !== 1) { fail("framework-dependency-uninterpreted"); continue }
                const target = targets[0]!
                if (stack.includes(target.id)) { fail("framework-dependency-cycle"); continue }
                if (invoked.has(target.id)) { fail("framework-dependency-cache-unmodeled"); continue }
                const targetSymbol = index.symbols.find(s => s.id === targetId)!, targetInjected = new Set(index.requestDependencies(targetId).flatMap(d => d.parameter ?? []))
                if (target.unit.parameters.filter(p => !targetInjected.has(p.name)).some(p => { const declaration = targetSymbol.parameters.find(d => d.name === p.name); return !requestObject || !declaration?.type || !requestTypes.has(index.qualifySourceName(declaration.type, targetSymbol.path) ?? "") })) { fail("framework-request-argument-unbound"); continue }
                visit(target)
                const original = byMaterial.get(target.id)!, handle = `$request-${dependency.id}`, rebind = (v: unknown): any => Array.isArray(v) ? v.map(rebind) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([key, value]) => [key, rebind(value)])) : typeof v === "string" && v.startsWith(`${original.handle}.`) ? `${handle}.${v.slice(original.handle.length + 1)}` : v
                const adopted: BoundSemanticBlock = { ...rebind(original), handle, role: "helper" }
                const symbol = index.symbols.find(s => s.id === targetId)!, ownRequests = symbol.parameters.filter(p => !targetInjected.has(p.name) && p.type && requestTypes.has(index.qualifySourceName(p.type, symbol.path) ?? ""))
                const contextParameter = requestObject && !ownRequests.length && needsRequestContext(targetId) ? "$request-context" : undefined, localRequest = ownRequests.length === 1 ? ownRequests[0]!.name : contextParameter
                if (contextParameter) adopted.parameters.push({ name: contextParameter, type: entry.parameters.find(p => p.name === requestEnvironment)!.type })
                invoked.add(target.id)
                compose(target, adopted, [...stack, target.id], localRequest)
                const arguments_: SourceMaterialUse["arguments"] = []
                let unbound = false
                for (const parameter of adopted.parameters) {
                  const declaration = symbol.parameters.find(p => p.name === parameter.name), qualified = declaration?.type && index.qualifySourceName(declaration.type, symbol.path)
                  if (parameter.name !== contextParameter && (!qualified || !requestTypes.has(qualified)) || !requestObject) { unbound = true; break }
                  arguments_.push({ parameter: parameter.name, object: requestObject })
                }
                if (unbound) { fail("framework-request-argument-unbound"); continue }
                local.push(adopted)
                prefix.push({ kind: "call", name: `$framework-${dependency.id}`, claim: `Source-qualified ${dependency.constructor} invokes ${dependency.expression} before this request body; framework meaning remains unreviewed`, symbol: dependency.expression, sourceCallId: dependency.sourceCallId, callee: adopted.handle, arguments: arguments_, ...(dependency.parameter ? { result: dependency.parameter } : {}), candidateId: targetId, pathHint: `${symbol.path}:${symbol.startLine}-${symbol.endLine}` })
                uses.push({ kind: "framework", operationId: operation.id, questionId: question.questionId, materialId: target.id, callerMaterialId: material.id, relationId: dependency.id, sourceId: target.source.id, sourceCallId: dependency.sourceCallId, frameworkModel: dependency.model, projectedHandle: adopted.handle, arguments: structuredClone(arguments_.filter(a => a.parameter !== contextParameter)), ...(contextParameter ? { contextArguments: structuredClone(arguments_.filter(a => a.parameter === contextParameter)) } : {}) })
              }
              unit.blocks.find(b => b.name === unit.start)!.steps.unshift(...prefix)
            }
            const routeDependencies = index.requestDependencies(route.id), requestConflict = source.parameters.some(p => entryInjected.has(p.name) && p.type && requestTypes.has(index.qualifySourceName(p.type, source.path) ?? ""))
            const implicitRequest = !requests.length && !requestConflict && (needsRequestContext(root.source.id) || routeDependencies.some(d => d.resolution === "resolved" && d.candidateIds.length === 1 && needsRequestContext(d.candidateIds[0]!)))
            const requestEnvironment = requests.length === 1 ? requests[0]!.name : implicitRequest ? "$request-context" : undefined
            if (implicitRequest) {
              entry.parameters.push({ name: "$request-context", type: "value" })
              uses.find(u => u.kind === "entry" && u.questionId === question.questionId && u.materialId === root.id)!.contextArguments = [{ parameter: "$request-context", object: "$request-context" }]
            }
            if (requestConflict) gap(entry, "framework-request-argument-unbound", root.source.id)
            else compose(root, entry, [root.id], requestEnvironment, routeDependencies)
          }
        }
      }
      units.push(...local)
    }
  }
  return { units, uses }
}
