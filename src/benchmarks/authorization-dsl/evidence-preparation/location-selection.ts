import { createHash } from "node:crypto"
import { z } from "zod"
import { physicalSourceLines } from "./segments.ts"

const Text = z.string().min(1)
const Line = z.number().int().positive()
const Literal = Text.max(500).refine(value => !/[\0\r\n]/.test(value), "Use one exact source-line literal")
export const EvidenceLocationSelectorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("shown-range"), windowId: Text, startLine: Line, endLine: Line, exactLiteral: Literal.optional() }).strict(),
  z.object({ kind: z.literal("indexed-symbol"), symbolId: Text }).strict(),
  z.object({ kind: z.literal("literal-search"), path: Text, literal: Literal, startLine: Line.optional(), endLine: Line.optional() }).strict(),
])
export type EvidenceLocationSelector = z.infer<typeof EvidenceLocationSelectorSchema>
export interface EvidenceLocationRange { path: string; startLine: number; endLine: number }
export interface EvidenceBoundLocation extends EvidenceLocationRange { id: string; sha256: string; name?: string }
export interface EvidenceLocationContext {
  sourceIdentity: { repository: string; sourceRef: string }
  sources: Array<{ path: string; sha256: string; content: string }>
  windows: EvidenceBoundLocation[]
  symbols: EvidenceBoundLocation[]
}
export type EvidenceLocationOutcome =
  | ({ status: "resolved" } & EvidenceLocationRange)
  | { status: "unresolved"; code: "not-found" | "ambiguous" | "range-conflict" | "not-shown"; candidates: EvidenceLocationRange[]; candidateCount?: number }

/** Host IDs bind a physical fragment to the exact repository, ref and source digest. */
export function evidenceLocationId(kind: "window" | "symbol", identity: EvidenceLocationContext["sourceIdentity"], value: Omit<EvidenceBoundLocation, "id">): string {
  return `${kind}-${createHash("sha256").update(JSON.stringify([identity.repository, identity.sourceRef, value.path, value.sha256, value.startLine, value.endLine, kind === "symbol" ? value.name ?? "" : ""])).digest("hex").slice(0, 24)}`
}

/** Pure mechanical selection. Symbol indices may request reads; unseen bodies cannot become evidence. */
export function selectEvidenceLocation(context: EvidenceLocationContext, selector: EvidenceLocationSelector, purpose: "evidence" | "read" = "evidence"): EvidenceLocationOutcome {
  const unresolved = (code: Extract<EvidenceLocationOutcome, { status: "unresolved" }>["code"], candidates: EvidenceLocationRange[] = []): EvidenceLocationOutcome => ({ status: "unresolved", code, candidates: candidates.slice(0, 32), ...(candidates.length > 32 ? { candidateCount: candidates.length } : {}) })
  const source = (file: string) => {
    const value = context.sources.find(s => s.path === file)
    if (value && createHash("sha256").update(value.content).digest("hex") !== value.sha256) throw new Error(`Source digest mismatch: ${file}`)
    return value
  }
  const bound = (kind: "window" | "symbol", value: EvidenceBoundLocation) => value.id === evidenceLocationId(kind, context.sourceIdentity, value) && value.sha256 === source(value.path)?.sha256
  const shown = (range: EvidenceLocationRange) => context.windows.some(w => bound("window", w) && w.path === range.path && w.startLine <= range.startLine && w.endLine >= range.endLine)
  const resolveRange = (range: EvidenceLocationRange, literal?: string): EvidenceLocationOutcome => {
    const value = source(range.path)
    if (!value) return unresolved("not-found")
    const lines = physicalSourceLines(value.content)
    if (!Number.isInteger(range.startLine) || !Number.isInteger(range.endLine) || range.startLine < 1 || range.endLine < range.startLine || range.endLine > lines.length) return unresolved("range-conflict")
    if (literal !== undefined) {
      const hits = lines.flatMap((line, i) => line.replace(/\r?\n$/, "").includes(literal) ? [{ path: range.path, startLine: i + 1, endLine: i + 1 }] : [])
      const within = hits.filter(hit => hit.startLine >= range.startLine && hit.endLine <= range.endLine)
      if (!within.length) return unresolved(hits.length ? "range-conflict" : "not-found", hits)
      if (within.length > 1) return unresolved("ambiguous", within)
    }
    if (purpose === "evidence" && !shown(range)) return unresolved("not-shown", [range])
    return { status: "resolved", ...range }
  }
  if (selector.kind === "shown-range") {
    const window = context.windows.find(w => w.id === selector.windowId)
    if (!window || !bound("window", window) || selector.startLine < window.startLine || selector.endLine > window.endLine) return unresolved("not-shown")
    return resolveRange({ path: window.path, startLine: selector.startLine, endLine: selector.endLine }, selector.exactLiteral)
  }
  if (selector.kind === "indexed-symbol") {
    const symbol = context.symbols.find(s => s.id === selector.symbolId)
    if (!symbol || !bound("symbol", symbol)) return unresolved("not-found")
    return resolveRange({ path: symbol.path, startLine: symbol.startLine, endLine: symbol.endLine })
  }
  if ((selector.startLine === undefined) !== (selector.endLine === undefined)) return unresolved("range-conflict")
  if (selector.startLine !== undefined && selector.endLine !== undefined) return resolveRange({ path: selector.path, startLine: selector.startLine, endLine: selector.endLine }, selector.literal)
  const value = source(selector.path)
  if (!value) return unresolved("not-found")
  const candidates = physicalSourceLines(value.content).flatMap((line, i) => line.replace(/\r?\n$/, "").includes(selector.literal) ? [{ path: selector.path, startLine: i + 1, endLine: i + 1 }] : [])
  if (!candidates.length) return unresolved("not-found")
  if (candidates.length > 1) return unresolved("ambiguous", candidates)
  return resolveRange(candidates[0]!)
}
