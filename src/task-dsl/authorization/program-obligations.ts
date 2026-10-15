import { createHash } from "node:crypto"
import type { SourceSkeleton } from "../../benchmarks/authorization-dsl/evidence-preparation/source-skeleton.ts"
import type { InquiryTools } from "../../benchmarks/authorization-dsl/inquiry-tools.ts"

export type ProgramObligation = {
  id: string; source: { path: string; startLine: number; endLine: number; sha256: string }; text: string
  function?: { id: string; path: string; startLine: number; endLine: number; sha256: string }
  kind: "branch-exit" | "error-exit" | "return-exit" | "call-completion"
  origin: "source-structure"; stepIds: string[]; declarationIds: string[]
  state: "unmapped" | "mapped-unreviewed" | "external"; diagnostics: string[]
}
/** Syntax candidates, never inferred authorization conditions or required calls.
 * Only an exact current span maps a candidate; broad author claims remain separate. */
export function projectProgramObligations(skeletons: readonly SourceSkeleton[], raw: any): ProgramObligation[] {
  const kinds = { condition: "branch-exit", raise: "error-exit", return: "return-exit", call: "call-completion" } as const
  const steps = new Set((Array.isArray(raw?.resourceWorkflow?.steps) ? raw.resourceWorkflow.steps : []).map((s: any) => s?.id))
  const seen = new Set<string>(), result: ProgramObligation[] = []
  for (const skeleton of skeletons.filter(s => s.modelCovered)) for (const anchor of skeleton.anchors) {
    const kind = kinds[anchor.kind as keyof typeof kinds]; if (!kind) continue
    if (anchor.selector.startLine === undefined) continue
    const source = { path: skeleton.source.path, startLine: anchor.selector.startLine, endLine: anchor.selector.endLine ?? anchor.selector.startLine, sha256: skeleton.source.sha256 }
    const id = "obligation-" + createHash("sha256").update(JSON.stringify([source, anchor.id, kind])).digest("hex").slice(0, 24)
    if (seen.has(id)) continue; seen.add(id)
    const claims: any[] = (raw?.authoringTarget?.coverage ?? []).filter((c: any) => c.source?.path === source.path && c.source.startLine === source.startLine && (c.source.endLine ?? c.source.startLine) === source.endLine)
    const current = claims.filter(c => (!c.source.sha256 || c.source.sha256 === source.sha256) && c.stepIds?.every((id: string) => steps.has(id)))
    const mapped = current.filter(c => c.disposition === "implemented" && c.stepIds.length), external = current.filter(c => c.disposition === "external")
    result.push({ id, source, text: anchor.text, kind, origin: "source-structure", stepIds: [...new Set<string>(mapped.flatMap(c => c.stepIds))], declarationIds: current.map(c => c.id), state: mapped.length ? "mapped-unreviewed" : external.length ? "external" : "unmapped", diagnostics: [...(claims.length > 1 ? ["duplicate-author-mapping"] : []), ...(claims.some(c => c.source.sha256 && c.source.sha256 !== source.sha256) ? ["stale-author-reference"] : []), ...(claims.some(c => c.stepIds?.some((id: string) => !steps.has(id))) ? ["missing-author-step"] : [])] })
  }
  return result.map(o => ({ ...o, function: skeletons.find(s => s.source.path === o.source.path && s.source.startLine <= o.source.startLine && s.source.endLine >= o.source.endLine)?.source }))
}
/** Function containment is routing evidence only, never exact mapping or proof. */
export function projectProgramCandidateFrontier(catalog: readonly ProgramObligation[], raw: any, dependencies: readonly any[] = []) {
  const citations: any[] = []
  const visit = (v: any) => { if (!v || typeof v !== "object") return; if (typeof v.path === "string" && Number.isInteger(v.startLine)) citations.push(v); else for (const child of Object.values(v)) visit(child) }
  visit(raw?.scope); visit(raw?.resourceWorkflow); visit(raw?.sourceDeclarations); visit(dependencies)
  const pending = catalog.filter(o => o.state === "unmapped" || o.diagnostics.length)
  const related = pending.filter(o => { const f = o.function ?? o.source; return citations.some(c => c.path === f.path && (!c.sha256 || c.sha256 === f.sha256) && c.startLine <= f.endLine && (c.endLine ?? c.startLine) >= f.startLine) })
  const candidates = related
  const first = candidates[0], group = first?.function ?? first?.source
  const items = candidates.filter(o => { const f = o.function ?? o.source; return f.path === group?.path && f.startLine === group?.startLine && f.endLine === group?.endLine }).slice(0, 12)
  return { items, function: group, total: catalog.length, pending: pending.length, related: related.length, remainingRelated: Math.max(0, related.length - items.length), relation: related.length ? "program-citation-or-known-dependency" : "no-current-program-location", details: "authorization_program_details({catalog:'source-candidates'}) returns the complete catalog. For an empty draft, choose and read a function related to the original task, then cite it in a small program. Relatedness and exact mapping are unreviewed; do not invent required calls from syntax." }
}
/** Uses the existing cached parser, and only functions completely shown already. */
export async function collectProgramObligations(tools: InquiryTools, raw?: unknown) {
  if (tools.snapshotVerification?.valid === false) return []
  const skeletons: SourceSkeleton[] = []
  for (const s of tools.structure?.symbols ?? []) {
    if (s.kind !== "function" || !tools.evidence.some(e => e.path === s.path && e.sha256 === s.sha256 && e.startLine <= s.endLine && e.endLine >= s.startLine)) continue
    const skeleton = await tools.sourceSkeleton(s.id)
    if (skeleton?.modelCovered) skeletons.push(skeleton)
  }
  return projectProgramObligations(skeletons, raw)
}
