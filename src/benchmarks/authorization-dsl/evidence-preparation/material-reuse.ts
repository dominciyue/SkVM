import { loadLocalAuthorizationInput } from "../local-input.ts"
import { loadPortableSourceBundle } from "../inputs.ts"
import type { AuthorizationEvidencePreparation } from "./prepare.ts"
import { AuthorizationEvidenceReportSchema, type AuthorizationEvidenceReport } from "./schema.ts"
import { containsOriginalRange, packSourceSegments } from "./segments.ts"
import type { EvidenceLocationRange } from "./location-selection.ts"

export interface PreparedGapChange { id: string; status: "resolved" | "not-relevant"; reason: string; evidence?: EvidenceLocationRange[]; taskChange?: string }
const contains = (report: AuthorizationEvidenceReport, range: EvidenceLocationRange) => {
  if (report.schemaVersion === "authorization-evidence-report/v2") {
    const source = report.included.find(s => s.originalPath === range.path)
    return source ? containsOriginalRange(source.segments, range.startLine, range.endLine) : false
  }
  const source = report.included.find(s => s.originalPath === range.path)
  return source ? range.startLine >= source.startLine && range.endLine <= source.endLine : false
}
const pointer = (value: unknown, path: string): unknown => path.split("/").slice(1).reduce<unknown>((current, part) => current && typeof current === "object" && Object.hasOwn(current, part.replace(/~1/g, "/").replace(/~0/g, "~")) ? (current as Record<string, unknown>)[part.replace(/~1/g, "/").replace(/~0/g, "~")] : undefined, value)

/** Gap retirement is explicit and auditable. Repacking the same material cannot resolve a pending gap. */
export function transitionPreparedGaps(input: { previous: AuthorizationEvidenceReport; current: AuthorizationEvidenceReport; changes: PreparedGapChange[]; taskBefore?: unknown; taskAfter?: unknown }): AuthorizationEvidenceReport {
  const previous = AuthorizationEvidenceReportSchema.parse(input.previous), current = AuthorizationEvidenceReportSchema.parse(input.current)
  if (JSON.stringify(previous.sourceIdentity) !== JSON.stringify(current.sourceIdentity)) throw new Error("Gap history source identity mismatch")
  const gaps = new Map(previous.gaps.map(gap => [gap.id, structuredClone(gap)]))
  for (const gap of current.gaps) {
    if (gaps.has(gap.id) && JSON.stringify(gaps.get(gap.id)) !== JSON.stringify(gap)) throw new Error(`Conflicting pending gap: ${gap.id}`)
    gaps.set(gap.id, structuredClone(gap))
  }
  const claimed = new Set<string>(), history = structuredClone(current.gapHistory ?? previous.gapHistory ?? [])
  for (const change of input.changes) {
    const gap = gaps.get(change.id)
    if (!gap || claimed.has(change.id) || !change.reason.trim()) throw new Error(`Invalid or duplicate gap change: ${change.id}`)
    claimed.add(change.id)
    if (change.status === "resolved") {
      if (!change.evidence?.length || change.evidence.some(range => !contains(current, range) || contains(previous, range) || (gap.attemptedPath && range.path !== gap.attemptedPath))) throw new Error("Resolving a gap requires new evidence in the verified current material")
      history.push({ gap, status: "resolved", reason: change.reason, evidence: structuredClone(change.evidence) })
    } else if (change.status === "not-relevant") {
      if (!change.taskChange || !/^\/(analysisContract|scenarios|request|task\/(obligations|request))(?:\/|$)/.test(change.taskChange)
        || JSON.stringify(pointer(input.taskBefore, change.taskChange)) === JSON.stringify(pointer(input.taskAfter, change.taskChange))) throw new Error("Gap relevance needs an explicitly changed scope or premise and a reason")
      history.push({ gap, status: "not-relevant", reason: change.reason, taskChange: change.taskChange })
    } else throw new Error("Unknown gap lifecycle state")
    gaps.delete(change.id)
  }
  return AuthorizationEvidenceReportSchema.parse({ ...current, gaps: [...gaps.values()], gapHistory: history, status: current.status === "invalid" ? "invalid" : gaps.size ? "partial" : "ready" })
}

/** Verify current raw sources, then reuse exactly the old snapshots and all pending metadata. No provider. */
export async function reusePreparedMaterial(input: { previousInputFile: string; inputFile: string; outDir: string; gapChanges?: PreparedGapChange[] }): Promise<AuthorizationEvidencePreparation & { reuse: { requiresAnalysis: true; previousInputFile: string; sourceBytes: number; pendingGapIds: string[] } }> {
  const before = await loadLocalAuthorizationInput(input.previousInputFile), after = await loadLocalAuthorizationInput(input.inputFile)
  const original = before.status === "valid" ? before.normalizedInput.evidencePreparation : undefined
  const report: AuthorizationEvidenceReport = original ? structuredClone(original) : { schemaVersion: "authorization-evidence-report/v2", status: "invalid", sourceIdentity: { repository: "unknown", sourceRef: "unknown" }, sourceRoot: "unknown", included: [], gaps: [], closureClaim: "declared-dependencies-only" }
  const reuse = { requiresAnalysis: true as const, previousInputFile: input.previousInputFile, sourceBytes: 0, pendingGapIds: report.gaps.map(g => g.id) }
  const invalid = (reason: string): AuthorizationEvidencePreparation & { reuse: typeof reuse } => ({ report: { ...report, status: "invalid", gaps: [...report.gaps, { id: "material-reuse", entryKey: "$", reason }] }, snapshots: [], reuse })
  if (before.status !== "valid" || after.status !== "valid" || !original) return invalid("invalid-reuse-input")
  if (!report.materialBinding) return invalid("source-binding-unavailable")
  if (JSON.stringify(report.sourceIdentity) !== JSON.stringify(after.normalizedInput.sourceIdentity)) return invalid("source-identity-changed")
  if (JSON.stringify(before.task.entries) !== JSON.stringify(after.task.entries)) return invalid("entry-scope-changed")
  const raw = new Map<string, string>()
  for (const binding of report.materialBinding.sources) {
    if (!report.materialBinding.request.allowedFiles.includes(binding.path)) return invalid("binding-outside-allowlist")
    const actual = await loadPortableSourceBundle({ sourceRoot: after.sourceRoot, repository: after.task.repository, sourceRef: after.task.sourceRef, sourceFiles: [binding.path] })
    if (binding.sha256 === null) {
      if (actual.success || actual.diagnostics.some(d => d.code !== "missing-input")) return invalid("source-availability-changed")
    } else {
      if (!actual.success || actual.bundle.files[0]!.sha256 !== binding.sha256) return invalid("source-bytes-changed")
      raw.set(binding.path, actual.bundle.files[0]!.content)
    }
  }
  const snapshots = before.sourceBundle.files.map(file => ({ path: file.relativePath, content: file.content }))
  for (const snapshot of snapshots) {
    const included = report.included.find(s => s.path === snapshot.path), content = included && raw.get(included.originalPath)
    if (!included || content === undefined) return invalid("snapshot-binding-unavailable")
    const ranges = report.schemaVersion === "authorization-evidence-report/v2" ? report.included.find(s => s.path === snapshot.path)!.segments : [{ originalStartLine: included.startLine, originalEndLine: included.endLine, origins: included.origins }]
    if (packSourceSegments(content, ranges).content !== snapshot.content) return invalid("snapshot-bytes-changed")
  }
  const current = input.gapChanges?.length ? transitionPreparedGaps({ previous: report, current: report, changes: input.gapChanges, taskBefore: before.normalizedInput, taskAfter: after.normalizedInput }) : report
  reuse.sourceBytes = snapshots.reduce((n, s) => n + Buffer.byteLength(s.content), 0)
  reuse.pendingGapIds = current.gaps.map(g => g.id)
  return { report: current, snapshots, preparedInput: { ...structuredClone(after.normalizedInput), sourceRoot: "source", sources: snapshots.map(s => s.path), evidencePreparation: current }, reuse }
}
