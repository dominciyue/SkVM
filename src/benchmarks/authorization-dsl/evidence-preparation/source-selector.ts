export interface SourceSelector { path: string; startLine?: number; endLine?: number; candidateId?: string }
export interface SourceCandidate { id: string; path: string; startLine: number; endLine: number }
export type SourceSelection<T extends SourceCandidate> =
  | { status: "resolved"; original: string | SourceSelector; selector: SourceSelector; candidates: T[] }
  | { status: "unresolved"; original: string | SourceSelector; selector?: SourceSelector; code: string; message: string; candidates: T[] }

/** One lossless path/range contract for reads, focus and actual call links.
 * It selects source locations only, never receivers or authorization meaning. */
export function selectSourceCandidates<T extends SourceCandidate>(original: string | SourceSelector, context: { candidates: readonly T[]; paths: readonly string[] }): SourceSelection<T> {
  const raw = typeof original === "string" ? { path: original } : original
  const range = /^(.+):(\d+)(?:-(\d+))?$/.exec(raw.path)
  const selector: SourceSelector = { ...raw, path: range?.[1] ?? raw.path }
  const fail = (code: string, message: string, candidates: T[] = []): SourceSelection<T> => ({ status: "unresolved", original: structuredClone(original), selector, code: `source-selector-${code}`, message, candidates })
  if (range) {
    const startLine = Number(range[2]), endLine = Number(range[3] ?? range[2])
    if (raw.startLine !== undefined && raw.startLine !== startLine || raw.endLine !== undefined && raw.endLine !== endLine) return fail("range-conflict", "Explicit range conflicts with the legacy path range; neither is discarded.")
    Object.assign(selector, { startLine, endLine })
  }
  if (!selector.path || /[\\\0:]/.test(selector.path) || selector.path.startsWith("/") || selector.path !== "." && selector.path.split("/").some(p => !p || p === "." || p === "..")) return fail("unsafe-path", "Use an indexed relative file or directory within the declared source root.")
  if (selector.startLine !== undefined || selector.endLine !== undefined) {
    if (!Number.isSafeInteger(selector.startLine) || !Number.isSafeInteger(selector.endLine) || selector.startLine! < 1 || selector.endLine! < selector.startLine!) return fail("range-invalid", "A source range needs positive ordered startLine/endLine; no range is clamped.")
  }
  const includes = (p: string) => selector.path === "." || p === selector.path || p.startsWith(`${selector.path}/`)
  if (!context.paths.some(includes)) return fail("out-of-scope", "The selected file/directory is outside the current indexed source scope.")
  const inPath = context.candidates.filter(c => includes(c.path))
  if (selector.candidateId && !context.candidates.some(c => c.id === selector.candidateId)) return fail("candidate-unknown", "The candidate ID is not in this current index.", [...inPath])
  const selected = inPath.filter(c => !selector.candidateId || c.id === selector.candidateId)
  if (selector.startLine !== undefined) {
    const exact = selected.filter(c => c.path === selector.path && c.startLine === selector.startLine && c.endLine === selector.endLine)
    if (!exact.length) return fail("range-mismatch", "Allowed source exists, but the requested complete candidate range/ID conflicts with the indexed definition.", [...inPath])
    return { status: "resolved", original: structuredClone(original), selector, candidates: [...exact] }
  }
  if (selector.candidateId && !selected.length) return fail("candidate-conflict", "Candidate ID belongs to a different indexed source path.", [...inPath])
  return { status: "resolved", original: structuredClone(original), selector, candidates: [...selected] }
}
