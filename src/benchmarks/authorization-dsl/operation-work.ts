import { createHash } from "node:crypto"
import type { StructureIndex, StructureCall } from "./evidence-preparation/structure-index.ts"
import type { SourceFactDependency } from "../../task-dsl/authorization/operation-facts.ts"
import type { BoundSemanticBlock } from "../../task-dsl/authorization/semantic-flow.ts"
import type { ControlSlice } from "../../task-dsl/authorization/control-slice.ts"
import type { InquiryDiagnostic } from "../../task-dsl/authorization/inquiry.ts"
import type { PropertyDemand } from "../../task-dsl/authorization/property-demand.ts"

export interface OperationWorkAction { id: string; obligation: "entry" | "principal-binding" | "resource-binding" | "guard" | "effect" | "exception"; kind: "read" | "interpret" | "link"; candidateId: string; relationId: string; reason: string; receiverClass?: string; decisive: boolean; frameworkBoundary?: boolean }
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex")
const drfDispatchMethods = ["dispatch", "initial", "check_permissions", "get_permissions"]
/** Invalidation follows this receiver's source configuration; it proves no control meaning. */
function drfReceiverRevision(index: StructureIndex, className: string) {
  const mro = index.linearize(className)
  if (!mro?.some(c => c.startsWith("rest_framework."))) return undefined
  const classSources = (name: string) => (index.linearize(name) ?? [name]).map(owner => [owner, index.symbols.filter(s => s.kind === "class" && s.qualifiedName === owner).map(s => [s.id, s.path, s.sha256, s.bases])])
  const configurations = ["permission_classes", "serializer_class"].map(name => {
    const attribute = index.attribute(className, name)
    if (!attribute) return [name, null]
    const candidates = [...new Map((attribute.value.match(/[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/g) ?? []).flatMap(value => index.resolveName(value, attribute.scope.path).filter(s => s.kind === "class")).map(s => [s.id, s])).values()]
    return [name, attribute.value, attribute.scope.path, attribute.scope.sha256, candidates.map(s => classSources(s.qualifiedName))]
  })
  return hash([classSources(className), drfDispatchMethods.map(method => [method, index.candidateRevision(className, method)]), configurations])
}
/** Structural candidates satisfy a need to inspect a relationship, never its authorization meaning. */
export function operationWork(index: StructureIndex, entryId: string, readSymbols: string[], interpretedSymbols: Array<string | { id: string; receiverClass?: string }>, receiverClass?: string, options: { sourceAssisted?: boolean; operationRoot?: boolean; questionDirected?: boolean; frameworkInvocation?: boolean; sourceCallId?: string; propertyDemand?: PropertyDemand } = {}) {
  const entry = index.symbols.find(s => s.id === entryId), actions: OperationWorkAction[] = [], gaps: StructureCall[] = [], frameworkDependencies: SourceFactDependency[] = [], frameworkGaps: Array<{ key: string; reason: string; receiverClass?: string; code?: string }> = [], propertyResiduals: Array<{ sourceCallId: string; candidateIds: string[]; reason: string }> = []
  if (!entry) return { actions, gaps, frameworkDependencies, frameworkGaps, propertyResiduals }
  const add = (candidateId: string, relationId: string, reason: string, obligation: OperationWorkAction["obligation"] = "guard", context?: string, decisive = false, frameworkBoundary = false) => {
    const interpreted = interpretedSymbols.some(s => typeof s === "string" ? s === candidateId : s.id === candidateId && s.receiverClass === context)
    if (interpreted && !frameworkBoundary || actions.some(a => a.candidateId === candidateId && a.receiverClass === context && (!frameworkBoundary || a.frameworkBoundary && a.relationId === relationId))) return
    actions.push({ id: `opwork-${hash([entry.id, candidateId, relationId, context]).slice(0, 24)}`, obligation, kind: interpreted ? "link" : readSymbols.includes(candidateId) ? "interpret" : "read", candidateId, relationId, reason, decisive, ...(context ? { receiverClass: context } : {}), ...(frameworkBoundary ? { frameworkBoundary: true } : {}) })
  }
  for (const call of index.relatedCalls(entry.id, receiverClass)) {
    if (options.sourceCallId && call.id !== options.sourceCallId) continue
    if (call.syntaxRole === "argument-default") continue
    const demand = options.propertyDemand, scope = demand?.source.id === entry.id && demand.source.sha256 === entry.sha256 && demand.dependencies?.schemaVersion === "authorization-property-dependencies/v2" ? demand.dependencies.callScopes?.find(s => s.sourceCallId === call.id) : undefined
    if (scope && scope.state !== "required" && !options.frameworkInvocation) { propertyResiduals.push({ sourceCallId: call.id, candidateIds: [...call.candidateIds], reason: scope.reason }); continue }
    if (call.resolution === "unresolved") { gaps.push(call); continue }
    for (const candidate of call.candidateIds) add(candidate, call.id, `Inspect AST-bound ${call.expression} at ${call.path}:${call.startLine}; arguments ${JSON.stringify(call.arguments)}. Source relevance and conditions still need interpretation.`, "guard", call.receiverClass, call.syntaxRole === "condition" || call.syntaxRole === "return")
  }
  const addRequestDependencies = (ownerId: string) => {
    const dependencies = index.requestDependencies(ownerId)
    if (dependencies.length) frameworkDependencies.push({ kind: "framework-model", key: `fastapi-source-injection/v1:${ownerId}`, revision: hash(dependencies) })
    for (const dependency of dependencies) {
      if (dependency.gap) frameworkGaps.push({ key: dependency.id, reason: `Current source ${dependency.constructor} binding: ${dependency.gap}; no request relationship is inferred.`, code: dependency.gap })
      for (const candidate of dependency.candidateIds) add(candidate, dependency.id, `Inspect source-qualified request dependency ${dependency.expression} for ${dependency.parameter ?? "route-level prerequisite"}; current source call ${dependency.sourceCallId}. Read/interpret this function and its nested dependencies; authorization meaning remains unreviewed.`, "principal-binding", undefined, true, true)
    }
  }
  const routes = index.routes.filter(r => r.candidateIds.includes(entry.id) && (!options.questionDirected || options.operationRoot))
  if (options.questionDirected && options.operationRoot) for (const diagnostic of index.diagnostics.filter(d => d.handlerId === entry.id && d.code.startsWith("route-"))) frameworkGaps.push({ key: `route:${entry.id}:${diagnostic.code}`, reason: `Current source registration cannot bind this request: ${diagnostic.code}.`, code: diagnostic.code })
  for (const route of routes) {
    add(route.id, route.sourceCallId, `Inspect source-bound ${route.method} ${route.path} registration, middleware ${JSON.stringify(route.middlewareExpressions)} and exact handler ${route.handlerExpression}. Registration syntax does not prove middleware meaning.`, "entry", undefined, true, true)
    frameworkDependencies.push({ kind: "framework-model", key: `${route.model}:${route.id}`, revision: hash([route.sourcePath, index.symbols.find(s => s.id === route.id)?.sha256, route]) })
    if (options.questionDirected && route.bindingGap) frameworkGaps.push({ key: `route:${route.id}:binding`, reason: `Current source registration cannot bind this request: ${route.bindingGap}.`, code: route.bindingGap })
    if (options.questionDirected) {
      const middleware = index.requestMiddleware(route.id)
      if (middleware.length) frameworkDependencies.push({ kind: "framework-model", key: `fastapi-source-asgi/v1:${route.id}`, revision: hash(middleware) })
      for (const registration of middleware) {
        if (registration.gap) frameworkGaps.push({ key: registration.id, reason: `Current middleware ${registration.qualifiedName} at ${registration.source.path}:${registration.source.startLine}: ${registration.gap}.`, code: registration.gap, receiverClass: registration.receiverClass })
        for (const method of registration.methodCandidates) add(method.candidateId, `${registration.id}:${method.method}`, `Inspect source middleware reference ${registration.qualifiedName}.${method.method}, application binding ${registration.registrationBinding}, source call ${registration.sourceCallId}, configuration ${JSON.stringify(registration.arguments)} and enclosing source contexts ${JSON.stringify(registration.registrationContext)}. Source order does not prove request execution order or continuation adoption.`, "guard", registration.receiverClass, true, true)
      }
    }
    if (options.questionDirected && route.model === "fastapi-source-router/v1") addRequestDependencies(route.id)
    else for (const expression of route.dependencyExpressions ?? []) for (const candidate of index.resolveName(expression, route.sourcePath).filter(s => s.kind === "function")) add(candidate.id, `${route.id}:dependency:${expression}`, `Inspect actual ${route.model} dependency ${expression}; constructor/import and route bind this source, not its authorization meaning.`, "principal-binding", candidate.className, true, true)
  }
  if (options.questionDirected && (options.frameworkInvocation || routes.some(r => r.model === "fastapi-source-router/v1"))) addRequestDependencies(entry.id)
  // DRF dispatch is enabled by source-visible qualified inheritance. All method
  // bodies and serializer declarations remain source candidates to be read.
  const className = receiverClass ?? (entry.kind === "class" ? entry.qualifiedName : entry.className)
  const mro = className ? index.linearize(className) : undefined
  if (options.questionDirected && className) {
    const decorators = index.classDecorators(className)
    if (decorators.length) frameworkDependencies.push({ kind: "framework-model", key: `source-class-decorator/v1:${className}`, revision: hash(decorators) })
    for (const decorator of decorators) {
      frameworkGaps.push({ key: decorator.id, code: decorator.gap ?? "source-class-decorator-transformation-unadopted", receiverClass: className, reason: `Class decorator ${decorator.expression} on ${decorator.declaringClass} at ${decorator.source.path}:${decorator.source.startLine}: ${decorator.gap ?? "current class/method transformation has not been adopted"}. Returned identity, mutations and exceptions remain source obligations.` })
      for (const candidate of decorator.sourceCandidates) add(candidate.candidateId, `${decorator.id}:${candidate.role}:${candidate.candidateId}`, `Inspect ${candidate.role} source for class decorator ${decorator.expression}, declaration ${decorator.source.path}:${decorator.source.startLine}, arguments ${JSON.stringify(decorator.arguments)}, actual receiver ${className}. Factory and returned callable candidates prove no invocation or class/method transformation; retain mutation and exception control.`, "guard", undefined, true, true)
    }
  }
  if ((entry.kind === "class" || options.sourceAssisted && options.operationRoot) && className && mro?.some(c => c.startsWith("rest_framework."))) {
    frameworkDependencies.push(options.questionDirected
      ? { kind: "framework-model", key: `drf-source-dispatch/v2:${className}`, revision: drfReceiverRevision(index, className)! }
      : { kind: "framework-model", key: "drf-source-dispatch/v1", revision: hash(index.symbols.filter(s => s.module.startsWith("rest_framework.")).map(s => [s.path, s.sha256])) })
    const dispatch = index.lookupMethod(className, "dispatch")
    if (!dispatch.length) frameworkGaps.push({ key: `drf:${className}:dispatch`, receiverClass: className, reason: "Source-qualified DRF inheritance has no unique current dispatch body; upstream ordering remains an explicit source gap." })
    for (const method of entry.kind === "class" ? [...drfDispatchMethods, "create", "get_serializer", "get_serializer_class", "get_serializer_context", "perform_create"] : drfDispatchMethods) for (const s of index.lookupMethod(className, method)) add(s.id, `drf:${className}:${method}`, `Source-qualified DRF method lookup for ${className}.${method}; inspect actual override/MRO body.`, method === "create" ? "entry" : "guard", className, true, method === "dispatch")
    if (options.questionDirected) {
      const mappings = index.requestActions(className), current = mappings.filter(m => entry.kind === "class" || m.sourceId === entry.id || m.methodMappings.some(method => method.candidateIds.includes(entry.id)))
      if (current.length) frameworkDependencies.push({ kind: "framework-model", key: `drf-source-action/v1:${className}`, revision: hash(mappings) })
      for (const mapping of current) {
        if (mapping.gap) frameworkGaps.push({ key: mapping.id, code: mapping.gap, receiverClass: className, reason: `Current DRF HTTP declaration ${mapping.actionName}: ${mapping.gap}; execution remains unproven.` })
        if (!mapping.routeIds.length) frameworkGaps.push({ key: `${mapping.id}:registration`, code: "framework-action-registration-missing", receiverClass: className, reason: "No current allowed router registration binds this action's actual request receiver." })
        for (const routeId of mapping.routeIds) {
          const route = index.routes.find(r => r.id === routeId)!
          add(routeId, route.sourceCallId, `Inspect current DRF registration ${route.path} for actual receiver ${className}; HTTP declarations ${JSON.stringify(mapping.methodMappings)} remain source work.`, "entry", undefined, true, true)
          if (route.bindingGap) frameworkGaps.push({ key: `${mapping.id}:${routeId}`, code: route.bindingGap, receiverClass: className, reason: `Current DRF router source binding: ${route.bindingGap}.` })
        }
        for (const candidate of mapping.sourceCandidates) add(candidate.candidateId, `${mapping.id}:${candidate.role}:${candidate.candidateId}`, `Inspect ${candidate.role} source for declared HTTP mapping ${mapping.actionName} on actual receiver ${className}; declaration ${mapping.source.path}:${mapping.source.startLine}, source call ${mapping.sourceCallId}. Mapping binding and invocation remain unproven; inspect the actual factory/mapper and router/as_view before adopting request dispatch or its dynamic handler.`, "guard", candidate.receiverClass, true, true)
      }
    }
    const serializer = entry.kind === "class" && index.attribute(className, "serializer_class")
    if (serializer) {
      const candidates = index.resolveName(serializer.value, serializer.scope.path).filter(s => s.kind === "class")
      for (const cls of candidates) {
        const selected = new Map([...index.symbols.filter(s => s.className === cls.qualifiedName && s.name.startsWith("validate_")), ...["is_valid", "validate", "create", "save", "run_validation", "to_internal_value"].flatMap(method => index.lookupMethod(cls.qualifiedName, method))].map(s => [s.id, s]))
        for (const s of selected.values()) add(s.id, `drf:serializer:${cls.id}:${s.name}`, `serializer_class source assignment binds ${cls.qualifiedName}; inspect field/object validation and save candidates.`, s.name === "create" || s.name === "save" ? "effect" : "resource-binding", cls.qualifiedName)
      }
    }
    const permissions = index.attribute(className, "permission_classes")
    if (permissions) for (const name of permissions.value.match(/[A-Za-z_]\w*/g) ?? []) {
      const cls = index.resolveName(name, permissions.scope.path).filter(s => s.kind === "class")
      for (const c of cls) for (const method of ["has_permission", "has_object_permission"]) for (const s of index.lookupMethod(c.qualifiedName, method)) add(s.id, `drf:permission:${c.id}:${method}`, `permission_classes source assignment names ${c.qualifiedName}; applicability remains to be interpreted.`, "guard", c.qualifiedName)
    }
  }
  return { actions, gaps, frameworkDependencies, frameworkGaps, propertyResiduals }
}

/** Turn checker feedback into existing local actions; never synthesize source meaning. */
export function diagnosticWork(diagnostics: InquiryDiagnostic[], units: BoundSemanticBlock[], slice: ControlSlice, projectedUnits: BoundSemanticBlock[] = []) {
  return diagnostics.filter((d, i, all) => d.severity === "error" && all.findIndex(v => v.code === d.code && v.path === d.path && v.questionId === d.questionId) === i).slice(0, 16).map(d => {
    const rule = slice.rules.find(r => (!d.questionId || r.questionId === d.questionId) && (d.path === r.key || d.path.endsWith(`.${r.key}`)))
    const projected = projectedUnits.find(u => (!d.questionId || u.questionId === d.questionId) && (u.handle === rule?.sourceOrigin?.handle || d.path.endsWith(`.${u.handle}`)))
    const origins = projected?.source ? units.filter(u => u.source?.id === projected.source!.id && u.source.sha256 === projected.source!.sha256 && u.receiverClass === projected.receiverClass) : []
    const localOrigins = origins.filter(u => u.questionId === projected?.questionId)
    const unit = units.find(u => (!d.questionId || u.questionId === d.questionId) && (u.handle === rule?.sourceOrigin?.handle || d.path.endsWith(`.${u.handle}`))) ?? (localOrigins.length === 1 ? localOrigins[0] : origins.length === 1 ? origins[0] : undefined)
    const kind = /argument-unbound|link-missing/.test(d.code) ? "link" : /object-|binding-|semantic-(?:return|transform|guard|entry-incomplete|helper-incomplete|path-limit|node-limit)/.test(d.code) ? "reinterpret" : /callee-uninterpreted|dependency-open/.test(d.code) ? "inspect-dependency" : /entry-missing|location-/.test(d.code) ? "locate" : /unresolved-path-condition/.test(d.code) ? "conditional-answer" : "revise-answer"
    return { id: `repair-${hash([d.code, d.path, d.questionId]).slice(0, 24)}`, kind, diagnosticCode: d.code, questionId: d.questionId ?? unit?.questionId, reason: d.message,
      ...(unit ? { handle: unit.handle, itemId: unit.itemId, source: unit.source, ...(kind === "reinterpret" ? { request: { kind: "defer", revisit: unit.handle, reason: d.message } } : {}) } : {}),
      instruction: kind === "link" ? "Use the current offered caller/call/target and explicit typed arguments; revisit its retained source if no valid caller object exists." : kind === "inspect-dependency" ? "Inspect the current dependency's actual allowed candidate, then interpret/link its offered source; otherwise retain the named source gap." : kind === "conditional-answer" ? "Preserve the current residual conditions in the answer or bind only an exact explicit user premise; do not infer a missing value." : kind === "reinterpret" ? "Revisit this retained source transaction and correct the named object/branch relation; existing facts elsewhere remain." : kind === "locate" ? "Select a candidate actually shown by source_symbol; request its original range before interpretation." : "Revise the current answer against its source/condition/path skeleton; no old final check is inherited." }
  })
}

export function sourceRelationRevision(index: StructureIndex, symbolId: string, receiverClass?: string) {
  const symbol = index.symbols.find(s => s.id === symbolId)
  if (!symbol) return undefined
  return hash([symbol.qualifiedName, ...symbol.moduleInitialization ? [["module-initialization", symbol.moduleInitialization]] : [], ...symbol.classMethod ? [["class-method", symbol.classMethod]] : [], index.candidateRevision(receiverClass ?? symbol.className ?? symbol.qualifiedName, symbol.name), index.relatedCalls(symbolId, receiverClass).map(c => [c, c.candidateIds.map(id => { const s = index.symbols.find(s => s.id === id); return s && [s.id, s.path, s.sha256] })]), index.fieldStores(symbolId, receiverClass), index.methodStores(symbolId, receiverClass), index.callableParameters(symbolId), index.symbols.filter(s => (s.classDefinition ?? s.moduleClassDefinition)?.ownerId === symbolId).map(s => [s.id, s.sha256, s.classDefinition ?? s.moduleClassDefinition]), index.routes.filter(r => r.candidateIds.includes(symbolId)).map(r => [r, index.symbols.find(s => s.id === r.id)?.sha256, index.requestMiddleware(r.id)]), index.requestDependencies(symbolId)])
}
export function structuralDependencyRevision(index: StructureIndex, dependency: SourceFactDependency) {
  if (dependency.kind === "symbol-resolution") return index.symbols.find(s => s.id === dependency.key)?.sha256
  if (dependency.kind === "candidate-set") {
    const [first, second, receiver] = dependency.key.split(":")
    return first === "relations" ? sourceRelationRevision(index, second!, receiver || undefined) : index.candidateRevision(first!, second!)
  }
  if (dependency.kind === "framework-model") {
    if (dependency.key === "drf-source-dispatch/v1") return hash(index.symbols.filter(s => s.module.startsWith("rest_framework.")).map(s => [s.path, s.sha256]))
    if (dependency.key.startsWith("drf-source-dispatch/v2:")) return drfReceiverRevision(index, dependency.key.slice("drf-source-dispatch/v2:".length))
    if (dependency.key.startsWith("drf-source-action/v1:")) { const cls = dependency.key.slice("drf-source-action/v1:".length); return index.symbols.some(s => s.kind === "class" && s.qualifiedName === cls) ? hash(index.requestActions(cls)) : undefined }
    if (dependency.key.startsWith("source-class-decorator/v1:")) { const cls = dependency.key.slice("source-class-decorator/v1:".length); return index.symbols.some(s => s.kind === "class" && s.qualifiedName === cls) ? hash(index.classDecorators(cls)) : undefined }
    if (dependency.key.startsWith("fastapi-source-injection/v1:")) { const id = dependency.key.slice("fastapi-source-injection/v1:".length); return index.symbols.some(s => s.id === id) ? hash(index.requestDependencies(id)) : undefined }
    if (dependency.key.startsWith("fastapi-source-asgi/v1:")) { const id = dependency.key.slice("fastapi-source-asgi/v1:".length); return index.routes.some(r => r.id === id) ? hash(index.requestMiddleware(id)) : undefined }
    const routes = index.routes.filter(r => `${r.model}:${r.id}` === dependency.key || r.model === dependency.key)
    if (routes.length === 1) { const r = routes[0]!; return hash([r.sourcePath, index.symbols.find(s => s.id === r.id)?.sha256, r]) }
  }
  return undefined
}
