import { createHash } from "node:crypto"
import type { StructureIndex, StructureCall } from "./evidence-preparation/structure-index.ts"
import type { SourceFactDependency } from "../../task-dsl/authorization/operation-facts.ts"
import type { BoundSemanticBlock } from "../../task-dsl/authorization/semantic-flow.ts"
import type { ControlSlice } from "../../task-dsl/authorization/control-slice.ts"
import type { InquiryDiagnostic } from "../../task-dsl/authorization/inquiry.ts"

export interface OperationWorkAction { id: string; obligation: "entry" | "principal-binding" | "resource-binding" | "guard" | "effect" | "exception"; kind: "read" | "interpret" | "link"; candidateId: string; relationId: string; reason: string; receiverClass?: string }
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex")
/** Structural candidates satisfy a need to inspect a relationship, never its authorization meaning. */
export function operationWork(index: StructureIndex, entryId: string, readSymbols: string[], interpretedSymbols: string[], receiverClass?: string) {
  const entry = index.symbols.find(s => s.id === entryId), actions: OperationWorkAction[] = [], gaps: StructureCall[] = [], frameworkDependencies: SourceFactDependency[] = []
  if (!entry) return { actions, gaps, frameworkDependencies }
  const add = (candidateId: string, relationId: string, reason: string, obligation: OperationWorkAction["obligation"] = "guard", context?: string) => {
    if (interpretedSymbols.includes(candidateId) || actions.some(a => a.candidateId === candidateId)) return
    actions.push({ id: `opwork-${hash([entry.id, candidateId, relationId, context]).slice(0, 24)}`, obligation, kind: readSymbols.includes(candidateId) ? "interpret" : "read", candidateId, relationId, reason, ...(context ? { receiverClass: context } : {}) })
  }
  for (const call of index.relatedCalls(entry.id, receiverClass)) {
    if (call.resolution === "unresolved") { gaps.push(call); continue }
    for (const candidate of call.candidateIds) add(candidate, call.id, `Inspect AST-bound ${call.expression} at ${call.path}:${call.startLine}; arguments ${JSON.stringify(call.arguments)}. Source relevance and conditions still need interpretation.`, "guard", call.receiverClass)
  }
  for (const route of index.routes.filter(r => r.candidateIds.includes(entry.id))) {
    add(route.id, route.sourceCallId, `Inspect source-bound ${route.method} ${route.path} registration, middleware ${JSON.stringify(route.middlewareExpressions)} and exact handler ${route.handlerExpression}. Registration syntax does not prove middleware meaning.`, "entry")
    frameworkDependencies.push({ kind: "framework-model", key: `${route.model}:${route.id}`, revision: hash([route.sourcePath, index.symbols.find(s => s.id === route.id)?.sha256, route]) })
  }
  // DRF dispatch is enabled by source-visible qualified inheritance. All method
  // bodies and serializer declarations remain source candidates to be read.
  const className = receiverClass ?? (entry.kind === "class" ? entry.qualifiedName : entry.className)
  const mro = className ? index.linearize(className) : undefined
  if (entry.kind === "class" && className && mro?.some(c => c.startsWith("rest_framework."))) {
    const frameworkSources = index.symbols.filter(s => s.module.startsWith("rest_framework.")).map(s => [s.path, s.sha256])
    frameworkDependencies.push({ kind: "framework-model", key: "drf-source-dispatch/v1", revision: hash(frameworkSources) })
    for (const method of ["initial", "check_permissions", "get_permissions", "create", "get_serializer", "get_serializer_class", "get_serializer_context", "perform_create"]) for (const s of index.lookupMethod(className, method)) add(s.id, `drf:${className}:${method}`, `Source-qualified DRF method lookup for ${className}.${method}; inspect actual override/MRO body.`, method === "create" ? "entry" : "guard", className)
    const serializer = index.attribute(className, "serializer_class")
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
  return { actions, gaps, frameworkDependencies }
}

/** Turn checker feedback into existing local actions; never synthesize source meaning. */
export function diagnosticWork(diagnostics: InquiryDiagnostic[], units: BoundSemanticBlock[], slice: ControlSlice) {
  return diagnostics.filter((d, i, all) => d.severity === "error" && all.findIndex(v => v.code === d.code && v.path === d.path && v.questionId === d.questionId) === i).slice(0, 16).map(d => {
    const rule = slice.rules.find(r => (!d.questionId || r.questionId === d.questionId) && (d.path === r.key || d.path.endsWith(`.${r.key}`)))
    const unit = units.find(u => (!d.questionId || u.questionId === d.questionId) && (u.handle === rule?.sourceOrigin?.handle || d.path.endsWith(`.${u.handle}`)))
    const kind = /argument-unbound|link-missing/.test(d.code) ? "link" : /object-|binding-|semantic-(?:return|transform|guard|entry-incomplete|helper-incomplete|path-limit|node-limit)/.test(d.code) ? "reinterpret" : /callee-uninterpreted|dependency-open/.test(d.code) ? "inspect-dependency" : /entry-missing|location-/.test(d.code) ? "locate" : /unresolved-path-condition/.test(d.code) ? "conditional-answer" : "revise-answer"
    return { id: `repair-${hash([d.code, d.path, d.questionId]).slice(0, 24)}`, kind, diagnosticCode: d.code, questionId: d.questionId ?? unit?.questionId, reason: d.message,
      ...(unit ? { handle: unit.handle, itemId: unit.itemId, source: unit.source, ...(kind === "reinterpret" ? { request: { kind: "defer", revisit: unit.handle, reason: d.message } } : {}) } : {}),
      instruction: kind === "link" ? "Use the current offered caller/call/target and explicit typed arguments; revisit its retained source if no valid caller object exists." : kind === "inspect-dependency" ? "Inspect the current dependency's actual allowed candidate, then interpret/link its offered source; otherwise retain the named source gap." : kind === "conditional-answer" ? "Preserve the current residual conditions in the answer or bind only an exact explicit user premise; do not infer a missing value." : kind === "reinterpret" ? "Revisit this retained source transaction and correct the named object/branch relation; existing facts elsewhere remain." : kind === "locate" ? "Select a candidate actually shown by source_symbol; request its original range before interpretation." : "Revise the current answer against its source/condition/path skeleton; no old final check is inherited." }
  })
}

export function sourceRelationRevision(index: StructureIndex, symbolId: string, receiverClass?: string) {
  const symbol = index.symbols.find(s => s.id === symbolId)
  if (!symbol) return undefined
  return hash([symbol.qualifiedName, index.candidateRevision(receiverClass ?? symbol.className ?? symbol.qualifiedName, symbol.name), index.relatedCalls(symbolId, receiverClass).map(c => [c, c.candidateIds.map(id => { const s = index.symbols.find(s => s.id === id); return s && [s.id, s.path, s.sha256] })]), index.routes.filter(r => r.candidateIds.includes(symbolId)).map(r => [r, index.symbols.find(s => s.id === r.id)?.sha256])])
}
export function structuralDependencyRevision(index: StructureIndex, dependency: SourceFactDependency) {
  if (dependency.kind === "symbol-resolution") return index.symbols.find(s => s.id === dependency.key)?.sha256
  if (dependency.kind === "candidate-set") {
    const [first, second, receiver] = dependency.key.split(":")
    return first === "relations" ? sourceRelationRevision(index, second!, receiver || undefined) : index.candidateRevision(first!, second!)
  }
  if (dependency.kind === "framework-model") {
    if (dependency.key === "drf-source-dispatch/v1") return hash(index.symbols.filter(s => s.module.startsWith("rest_framework.")).map(s => [s.path, s.sha256]))
    const routes = index.routes.filter(r => `${r.model}:${r.id}` === dependency.key || r.model === dependency.key)
    if (routes.length === 1) { const r = routes[0]!; return hash([r.sourcePath, index.symbols.find(s => s.id === r.id)?.sha256, r]) }
  }
  return undefined
}
