import path from "node:path"
import { loadLocalAuthorizationInput } from "../local-input.ts"
import { loadPortableSourceBundle } from "../inputs.ts"
import { locateAuthorizationSource } from "../source-location.ts"
import type { LocalAuthorizationInput } from "../local-input.ts"
import { AuthorizationEvidenceRequestSchema, type AuthorizationEvidenceReport, type AuthorizationEvidenceRequest } from "./schema.ts"
import { mergeSourceRanges, packSourceSegments, physicalSourceLines, type OriginalSourceRange } from "./segments.ts"

export interface AuthorizationPreparedSnapshot { path: string; content: string }
export interface AuthorizationEvidencePreparation {
  report: AuthorizationEvidenceReport
  snapshots: AuthorizationPreparedSnapshot[]
  preparedInput?: LocalAuthorizationInput & { evidencePreparation: AuthorizationEvidenceReport }
}

const portable = (value: string) => value.length > 0 && !value.includes("\\") && !value.includes("\0")
  && !path.isAbsolute(value) && !path.win32.isAbsolute(value) && !path.posix.isAbsolute(value)
  && value.split("/").every(segment => segment !== "" && segment !== "." && segment !== "..")

function emptyReport(inputFile: string, request: unknown): AuthorizationEvidenceReport {
  const sourceRoot = typeof request === "object" && request !== null && "sourceRoot" in request && typeof request.sourceRoot === "string" ? request.sourceRoot : "unknown"
  return { schemaVersion: "authorization-evidence-report/v1", status: "invalid", sourceIdentity: { repository: "unknown", sourceRef: "unknown" }, sourceRoot,
    included: [], gaps: [{ id: "request", entryKey: "$", reason: `invalid-request-or-input:${inputFile}` }], closureClaim: "declared-dependencies-only" }
}

/** Prepare declared source bytes. This function does not write files or infer source behavior. */
export async function prepareAuthorizationEvidence(input: {
  inputFile: string
  outDir: string
  request: AuthorizationEvidenceRequest
}): Promise<AuthorizationEvidencePreparation> {
  const parsed = AuthorizationEvidenceRequestSchema.safeParse(input.request)
  const loaded = await loadLocalAuthorizationInput(input.inputFile)
  if (!parsed.success || loaded.status !== "valid") return { report: emptyReport(input.inputFile, input.request), snapshots: [] }
  const request = parsed.data
  const report: AuthorizationEvidenceReport = { schemaVersion: request.schemaVersion === "authorization-evidence-request/v2" ? "authorization-evidence-report/v2" : "authorization-evidence-report/v1", status: "invalid",
    sourceIdentity: { repository: loaded.task.repository, sourceRef: loaded.task.sourceRef }, sourceRoot: request.sourceRoot,
    included: [], gaps: [], closureClaim: "declared-dependencies-only" }
  const invalid = (id: string, entryKey: string, reason: string, attemptedPath?: string): AuthorizationEvidencePreparation => ({
    report: { ...report, status: "invalid", included: [], gaps: [...report.gaps, { id, entryKey, reason, ...(attemptedPath ? { attemptedPath } : {}) }] }, snapshots: [],
  })
  if (request.sourceRoot !== loaded.normalizedInput.sourceRoot) return invalid("source-root", "$", "source-root-mismatch")
  if (request.allowedFiles.some(file => !portable(file)) || new Set(request.allowedFiles).size !== request.allowedFiles.length) return invalid("allowed-files", "$", "unsafe-or-duplicate-allowlist")
  const allowed = new Set(request.allowedFiles)
  const entries = new Map<string, string>()
  const expectedEntries = loaded.task.entries.flatMap(entry => entry.locations.map(location => ({
    key: entry.id.startsWith("entry:") ? decodeURIComponent(entry.id.slice("entry:".length)) : entry.id,
    path: location.path, startLine: location.startLine, endLine: location.endLine,
  })))
  for (const entry of request.entries) {
    if (!portable(entry.path) || !allowed.has(entry.path)) return invalid(entry.entryKey, entry.entryKey, "entry-outside-allowlist", entry.path)
    const matches = expectedEntries.some(expected => expected.key === entry.entryKey && expected.path === entry.path
      && expected.startLine === entry.startLine && expected.endLine === entry.endLine)
    if (!matches) return invalid(entry.entryKey, entry.entryKey, "entry-range-mismatch", entry.path)
    const key = `${entry.entryKey}\0${entry.path}\0${entry.startLine}\0${entry.endLine}`
    if (entries.has(key)) return invalid(entry.entryKey, entry.entryKey, "duplicate-entry", entry.path)
    entries.set(key, entry.entryKey)
  }
  if (entries.size !== expectedEntries.length) return invalid("entries", "$", "declared-entry-missing")
  const sourceRoot = loaded.sourceRoot
  const cache = new Map<string, { content: string; lines: string[] } | null>()
  const readSource = async (sourcePath: string) => {
    if (cache.has(sourcePath)) return cache.get(sourcePath)!
    const result = await loadPortableSourceBundle({ sourceRoot, repository: loaded.task.repository, sourceRef: loaded.task.sourceRef, sourceFiles: [sourcePath] })
    if (!result.success) {
      if (result.diagnostics.some(diagnostic => diagnostic.code !== "missing-input")) throw new Error(result.diagnostics.map(diagnostic => diagnostic.code).join(","))
      cache.set(sourcePath, null)
      return null
    }
    const content = result.bundle.files[0]!.content
    const value = { content, lines: physicalSourceLines(content) }
    cache.set(sourcePath, value)
    return value
  }
  type Selection = { path: string; ranges: OriginalSourceRange[] }
  const selected = new Map<string, Selection>()
  const bytes = (selection: Selection, source: { content: string }) => packSourceSegments(source.content, selection.ranges).bytes
  const assign = async (sourcePath: string, startLine: number, endLine: number, origin: string, required: boolean): Promise<string | null> => {
    let source: Awaited<ReturnType<typeof readSource>>
    try { source = await readSource(sourcePath) } catch (error) { return `invalid-source:${String(error)}` }
    if (!source) return required ? "missing-entry-file" : "missing-file"
    if (startLine < 1 || endLine < startLine || endLine > source.lines.length) return "out-of-range"
    const previous = selected.get(sourcePath)
    if (!previous && selected.size >= request.limits.maxFiles) return "file-budget"
    const ranges = mergeSourceRanges([...(previous?.ranges ?? []), { originalStartLine: startLine, originalEndLine: endLine, origins: [origin] }])
    const proposed: Selection = { path: sourcePath, ranges: request.schemaVersion === "authorization-evidence-request/v1" ? [{
      originalStartLine: ranges[0]!.originalStartLine, originalEndLine: ranges.at(-1)!.originalEndLine, origins: [...new Set(ranges.flatMap(range => range.origins))],
    }] : ranges }
    const current = [...selected.values()].reduce((sum, item) => sum + bytes(item, cache.get(item.path)!), 0)
    const prior = previous ? bytes(previous, source) : 0
    if (current - prior + bytes(proposed, source) > request.limits.maxBytes) return required ? "entry-byte-budget" : "byte-budget"
    selected.set(sourcePath, proposed)
    return null
  }
  for (const entry of request.entries) {
    const failure = await assign(entry.path, entry.startLine, entry.endLine, `entry:${entry.entryKey}`, true)
    if (failure) return invalid(entry.entryKey, entry.entryKey, failure, entry.path)
  }
  const ids = new Set<string>()
  const byId = new Map(request.dependencies.map(dependency => [dependency.id, dependency]))
  const resolveOrigin = (id: string, visiting = new Set<string>()): { entryKey: string; depth: number } | null => {
    if (request.entries.some(entry => entry.entryKey === id)) return { entryKey: id, depth: 0 }
    const dependency = byId.get(id)
    if (!dependency || visiting.has(id)) return null
    visiting.add(id)
    const parent = resolveOrigin(dependency.from, visiting)
    visiting.delete(id)
    return parent ? { entryKey: parent.entryKey, depth: parent.depth + 1 } : null
  }
  for (const dependency of request.dependencies) {
    if (ids.has(dependency.id)) return invalid(dependency.id, "$", "duplicate-dependency-id")
    ids.add(dependency.id)
    if (!portable(dependency.path) || !allowed.has(dependency.path)) return invalid(dependency.id, "$", "dependency-outside-allowlist", dependency.path)
    const origin = resolveOrigin(dependency.from)
    if (!origin) { report.gaps.push({ id: dependency.id, entryKey: "$", reason: "unresolved-or-cyclic-parent", attemptedPath: dependency.path }); continue }
    if (origin.depth + 1 > request.limits.maxDepth) { report.gaps.push({ id: dependency.id, entryKey: origin.entryKey, reason: "depth-budget", attemptedPath: dependency.path }); continue }
    if (dependency.unresolvedReason) { report.gaps.push({ id: dependency.id, entryKey: origin.entryKey, reason: dependency.unresolvedReason, attemptedPath: dependency.path }); continue }
    if (dependency.startLine === undefined || dependency.endLine === undefined) { report.gaps.push({ id: dependency.id, entryKey: origin.entryKey, reason: "range-required", attemptedPath: dependency.path }); continue }
    if (dependency.match) {
      const located = await locateAuthorizationSource({ root: sourceRoot, file: dependency.path, match: dependency.match })
      if (located.status !== "unique" || located.truncated || located.matches[0]!.line < dependency.startLine || located.matches[0]!.line > dependency.endLine) {
        report.gaps.push({ id: dependency.id, entryKey: origin.entryKey, reason: "ambiguous-location", attemptedPath: dependency.path })
        continue
      }
    }
    const failure = await assign(dependency.path, dependency.startLine, dependency.endLine, `${dependency.basis}:${dependency.id}`, false)
    if (failure) {
      if (failure.startsWith("invalid-source:")) return invalid(dependency.id, origin.entryKey, failure, dependency.path)
      report.gaps.push({ id: dependency.id, entryKey: origin.entryKey, reason: failure, attemptedPath: dependency.path })
    }
  }
  // Reserve every declared range before spending spare bytes on complete files.
  for (const [sourcePath, selection] of request.schemaVersion === "authorization-evidence-request/v1" ? selected : []) {
    const source = cache.get(sourcePath)!
    if (!source || source.lines.length === 0) continue
    const full: Selection = { ...selection, ranges: [{ originalStartLine: 1, originalEndLine: source.lines.length, origins: selection.ranges.flatMap(range => range.origins) }] }
    const current = [...selected.values()].reduce((sum, item) => sum + bytes(item, cache.get(item.path)!), 0)
    if (current - bytes(selection, source) + bytes(full, source) <= request.limits.maxBytes) selected.set(sourcePath, full)
  }
  const packed = [...selected.values()].map(selection => ({ path: selection.path, ...packSourceSegments(cache.get(selection.path)!.content, selection.ranges) }))
  const snapshots = packed.map(({ path, content }) => ({ path, content }))
  const included = packed.map(item => ({ path: item.path, originalPath: item.path,
    startLine: item.segments[0]!.originalStartLine, endLine: item.segments.at(-1)!.originalEndLine, origins: [...new Set(item.segments.flatMap(segment => segment.origins))], segments: item.segments }))
  if (report.schemaVersion === "authorization-evidence-report/v2") report.included = included
  else report.included = included.map(({ segments: _segments, ...item }) => item)
  report.status = report.gaps.length ? "partial" : "ready"
  const preparedInput = { ...structuredClone(loaded.normalizedInput), sourceRoot: "source", sources: snapshots.map(item => item.path), evidencePreparation: report }
  return { report, snapshots, preparedInput }
}
