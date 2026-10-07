import type { AuthorizationInquiryProgram } from "../../task-dsl/authorization/inquiry-program.ts"
import type { BoundSemanticBlock } from "../../task-dsl/authorization/semantic-flow.ts"
import type { SourceMaterial, SourceMaterialSnapshot } from "../../task-dsl/authorization/source-materials.ts"
import type { StructureIndex } from "./evidence-preparation/structure-index.ts"
import { operationCallSourceSelection, operationCallTargets } from "./operation-links.ts"
import { structuralDependencyRevision } from "./operation-work.ts"
import { canonicalControl } from "../../task-dsl/authorization/control-slice.ts"

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
export function projectSourceMaterials(program: AuthorizationInquiryProgram, accepted: BoundSemanticBlock[], snapshot: SourceMaterialSnapshot, index: StructureIndex, options: { questionDirected?: boolean } = {}) {
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
