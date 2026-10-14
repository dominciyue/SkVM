import { createHash } from "node:crypto"
import type { SourceSkeleton } from "../../benchmarks/authorization-dsl/evidence-preparation/source-skeleton.ts"
import type { InquiryTools } from "../../benchmarks/authorization-dsl/inquiry-tools.ts"

export type ProgramObligation = {
  id: string; source: { path: string; startLine: number; endLine: number; sha256: string }; text: string
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
  return result
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
