import type { AuthorizationTaskV0 } from "../../../task-dsl/authorization/schema.ts"
import { compileAuthorizationTask } from "../../../task-dsl/authorization/semantics.ts"
import type { AuthorizationEvidenceReport, AuthorizationEvidenceRequest } from "./schema.ts"

/** Entries define work. Support locations only expand the fixed source context. */
export function authorizationScopePreview(task: AuthorizationTaskV0, material?: AuthorizationEvidenceRequest | AuthorizationEvidenceReport) {
  const supports = material && "dependencies" in material ? material.dependencies.map(d => ({ id: d.id, from: d.from, path: d.path, startLine: d.startLine ?? null, endLine: d.endLine ?? null, basis: d.basis }))
    : material && "included" in material ? material.included.flatMap(file => ("segments" in file ? file.segments : [{ originalStartLine: file.startLine, originalEndLine: file.endLine, origins: file.origins }]).flatMap(segment => segment.origins.filter(origin => !origin.startsWith("entry:")).map(origin => ({ id: origin, from: null, path: file.originalPath, startLine: segment.originalStartLine, endLine: segment.originalEndLine, basis: origin.split(":")[0] })))) : []
  const compiled = compileAuthorizationTask(task)
  return { analysisEntries: task.entries.length, declaredScenarios: task.obligations.length, expandedObligations: compiled.runnableObligations.length,
    entries: task.entries.map(entry => ({ id: entry.id, name: entry.name, locations: entry.locations, scenarioIds: task.obligations.filter(o => o.entryIds.includes(entry.id)).map(o => o.id) })),
    supportDependencies: new Set(supports.map(s => s.id)).size, supports,
    scopeRule: "Only declared scenario-entry pairs are analyzed. Support does not add an entry; explicit multiple analysis entries are preserved." }
}
