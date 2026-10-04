import { readdir, realpath, stat } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { z } from "zod"
import type { LLMTool } from "../../providers/types.ts"
import { loadPortableSourceBundle, type SourceBundleFile } from "./inputs.ts"
import { indexAuthorizationSymbols, type DiscoverySymbol } from "./evidence-preparation/discovery.ts"

export interface InquiryEvidence {
  id: string; repository: string; sourceRef: string; path: string; sha256: string;
  startLine: number; endLine: number; text: string; quote: string; bytes: number
}
export interface InquiryToolOutput {
  status: "ok" | "partial" | "error" | "ambiguous"; code?: string; message?: string;
  evidence: InquiryEvidence[]; matches: Array<{ path: string; line: number; evidenceId?: string }>;
  candidates: DiscoverySymbol[]; files?: Array<{ path: string; bytes: number; lineCount: number }>;
  truncated?: boolean; requested?: unknown; nextOffset?: number; totalMatches?: number
}
export interface InquiryToolsOptions {
  sourceRoot: string; allowedPaths: string[]; repository: string; sourceRef: string;
  maxFiles?: number; maxReadBytes?: number; maxDisplayBytes?: number; maxToolCalls?: number
}
const excluded = new Set([".git", "node_modules", ".skvm", ".aws", ".codex", ".agents", "__pycache__", ".venv", "venv", "oracle", "oracles", "evaluator", "results", "held-out", "prospective", "tests", "__tests__"])
const sourceExtension = /\.(?:[cm]?jsx?|tsx?|py|go|rs|java|c|h|cpp|hpp|cs|rb|php|proto|sh)$/i
const safePath = (value: string, dot = false) => (dot && value === ".") || (!!value && !/[\\\0:]/.test(value) && !value.startsWith("/") && value.split("/").every(s => s && s !== "." && s !== ".." && !excluded.has(s.toLowerCase()) && !/^(?:\.env|credentials|secrets?)(?:\.|$)/i.test(s)))
const within = (root: string, file: string) => { const rel = path.relative(root, file); return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)) }
const sha = (text: string) => createHash("sha256").update(text).digest("hex")
const linesOf = (text: string) => text ? text.replace(/\r?\n$/, "").split(/\r?\n/) : []
const toolSchema = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []): LLMTool => ({ name, description, inputSchema: { type: "object", properties, required, additionalProperties: false } })
const str = { type: "string" }, int = { type: "integer", minimum: 1 }
export const INQUIRY_SOURCE_TOOLS: LLMTool[] = [
  toolSchema("source_list", "List allowed original source paths, sizes and line counts. No source is implicitly read into analysis.", { offset: { type: "integer", minimum: 0 }, limit: int }),
  toolSchema("source_search", "Search literal text in allowed indexed source, returning numbered source lines and evidence IDs; optional relative file or directory path ('.' means all indexed files). A directory filters the existing index only.", { text: str, path: str, limit: int }, ["text"]),
  toolSchema("source_symbol", "Locate lexical symbol candidates with paths and original ranges; optional relative file or directory path filters the existing allowed index only. All ambiguous candidates are returned; read bodies explicitly. This is not a call graph.", { name: str, path: str }, ["name"]),
  toolSchema("source_read", "Read an original source line range; an end beyond EOF returns the available lines with actual evidence bounds. No shell, writes, network or target execution.", { path: str, startLine: int, endLine: int }, ["path", "startLine", "endLine"]),
]
const schemas = {
  source_list: z.object({ offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(512).default(128) }).strict(),
  source_search: z.object({ text: z.string().min(1).max(500), path: z.string().optional(), limit: z.number().int().min(1).max(100).default(20) }).strict(),
  source_symbol: z.object({ name: z.string().min(1).max(200), path: z.string().optional() }).strict(),
  source_read: z.object({ path: z.string(), startLine: z.number().int().positive(), endLine: z.number().int().positive() }).strict(),
}
/** The structured entrance advertises the executor's exact source argument contract. */
export const InquirySourceCallSchema = z.discriminatedUnion("name", [
  z.object({ name: z.literal("source_list"), arguments: schemas.source_list }).strict(),
  z.object({ name: z.literal("source_search"), arguments: schemas.source_search }).strict(),
  z.object({ name: z.literal("source_symbol"), arguments: schemas.source_symbol }).strict(),
  z.object({ name: z.literal("source_read"), arguments: schemas.source_read }).strict(),
])

/** One bounded executor for Markdown, DSL and the opt-in ordinary adapter. */
export async function createInquiryTools(options: InquiryToolsOptions) {
  for (const value of [options.maxFiles, options.maxReadBytes, options.maxDisplayBytes, options.maxToolCalls]) if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) throw new Error("Invalid inquiry budget")
  if (!options.allowedPaths.length || options.allowedPaths.some(p => !safePath(p, true))) throw new Error("Unsafe allowed source scope")
  const root = await realpath(options.sourceRoot), maxFiles = options.maxFiles ?? 512, maxReadBytes = options.maxReadBytes ?? 8388608
  const maxDisplayBytes = options.maxDisplayBytes ?? 262144, maxToolCalls = options.maxToolCalls ?? 24
  const scopeGaps: Array<{ code: string; path: string; detail: string }> = [], paths: string[] = [], visited = new Set<string>()
  const walk = async (relative: string): Promise<void> => {
    const candidate = path.resolve(root, relative), canonical = await realpath(candidate)
    if (!within(root, canonical)) throw new Error(`Source scope symlink-escape: ${relative}`)
    if (visited.has(canonical)) return
    visited.add(canonical)
    if ((await stat(canonical)).isDirectory()) {
      const entries = (await readdir(canonical, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))
      for (const entry of entries) {
        const next = relative === "." ? entry.name : `${relative}/${entry.name}`
        if (!safePath(next)) continue
        if (entry.isDirectory() || entry.isSymbolicLink() || sourceExtension.test(entry.name)) await walk(next)
      }
    } else if (sourceExtension.test(relative) && !/\.(?:test|spec)\.[^.]+$|_test\.go$|(?:^|\/)test[^/]*\.py$/i.test(relative)) paths.push(relative)
  }
  for (const scope of options.allowedPaths) await walk(scope)
  paths.sort()
  const files = new Map<string, SourceBundleFile>(), symbols: DiscoverySymbol[] = []
  let indexBytes = 0, displayBytes = 0, toolCalls = 0, ioReadBytes = 0, importedEvidenceBytes = 0
  for (const relative of paths) {
    if (files.size >= maxFiles) { scopeGaps.push({ code: "file-budget", path: relative, detail: "Allowed source exceeds the indexed file limit." }); continue }
    const loaded = await loadPortableSourceBundle({ sourceRoot: root, sourceFiles: [relative], repository: options.repository, sourceRef: options.sourceRef, maxBytes: maxReadBytes - indexBytes })
    if (!loaded.success) { scopeGaps.push(...loaded.diagnostics.map(d => ({ code: d.code, path: relative, detail: d.message }))); continue }
    const source = loaded.bundle.files[0]!
    files.set(relative, source); indexBytes += Buffer.byteLength(source.content); ioReadBytes += Buffer.byteLength(source.content)
    symbols.push(...indexAuthorizationSymbols(relative, source.content, options))
  }
  const evidence: InquiryEvidence[] = [], history: Array<{ name: string; arguments: unknown; result: InquiryToolOutput; actionOrigin?: string; questionId?: string; dependencyId?: string; reason?: string }> = []
  const originalWindow = (source: SourceBundleFile, start: number, end: number): InquiryEvidence => {
    const lines = linesOf(source.content), quote = lines.slice(start - 1, end).join("\n"), text = lines.slice(start - 1, end).map((line, i) => `${start + i} | ${line}\n`).join("")
    return { id: `ev-${sha([options.repository, options.sourceRef, source.relativePath, source.sha256, start, end].join("\0")).slice(0, 20)}`, repository: options.repository, sourceRef: options.sourceRef, path: source.relativePath, sha256: source.sha256, startLine: start, endLine: end, text, quote, bytes: Buffer.byteLength(text) }
  }
  const restoreEvidence = (previous: readonly InquiryEvidence[]) => {
    const verified: InquiryEvidence[] = [], diagnostics: Array<{ code: string; evidenceId: string; message: string }> = []
    for (const raw of previous) {
      const source = files.get(raw.path), validRange = Number.isSafeInteger(raw.startLine) && Number.isSafeInteger(raw.endLine) && raw.startLine > 0 && raw.endLine >= raw.startLine && !!source && raw.endLine <= linesOf(source.content).length
      const expected = source && validRange ? originalWindow(source, raw.startLine, raw.endLine) : undefined
      if (!expected || !Object.keys(expected).every(key => raw[key as keyof InquiryEvidence] === expected[key as keyof InquiryEvidence])) diagnostics.push({ code: "reuse-evidence-mismatch", evidenceId: raw.id, message: "Previous evidence must match the current original identity, bounds, text, quote and bytes." })
      else if (!verified.some(e => e.id === expected.id)) verified.push(expected)
    }
    const added = verified.filter(e => !evidence.some(current => current.id === e.id)), addedBytes = added.reduce((sum, e) => sum + e.bytes, 0)
    if (importedEvidenceBytes + addedBytes > maxDisplayBytes) diagnostics.push({ code: "reuse-evidence-budget", evidenceId: "$reuse", message: "Verified imported evidence exceeds the current bounded evidence budget; use fresh analysis." })
    if (!diagnostics.length) { evidence.push(...added); importedEvidenceBytes += addedBytes }
    return { diagnostics, importedEvidenceIds: diagnostics.length ? [] : verified.map(e => e.id) }
  }
  const blank = (status: InquiryToolOutput["status"], code?: string, message?: string): InquiryToolOutput => ({ status, ...(code ? { code } : {}), ...(message ? { message } : {}), evidence: [], matches: [], candidates: [] })
  const selectedFiles = (selector?: string) => selector === undefined || selector === "." ? [...files.keys()] : !safePath(selector) ? [] : [...files.keys()].filter(p => p === selector || p.startsWith(`${selector}/`))
  const current = async (relative: string): Promise<SourceBundleFile | InquiryToolOutput> => {
    if (!safePath(relative) || !files.has(relative)) return blank("error", "source-out-of-scope", "Path is outside the allowed and indexed original source.")
    if (await realpath(options.sourceRoot) !== root) return blank("error", "source-root-changed", "Source root changed identity.")
    const remainingReadBytes = maxReadBytes - ioReadBytes
    if (remainingReadBytes < Buffer.byteLength(files.get(relative)!.content)) return blank("error", "read-budget", "Cumulative physical source read/index budget exhausted; retained evidence remains available.")
    const loaded = await loadPortableSourceBundle({ sourceRoot: root, sourceFiles: [relative], repository: options.repository, sourceRef: options.sourceRef, maxBytes: remainingReadBytes })
    if (!loaded.success) return blank("error", loaded.diagnostics[0]!.code, loaded.diagnostics[0]!.message)
    const source = loaded.bundle.files[0]!; ioReadBytes += Buffer.byteLength(source.content)
    if (source.sha256 !== files.get(relative)!.sha256) return blank("error", "source-changed", "Source bytes changed during this session; earlier evidence remains archived.")
    return source
  }
  const show = (source: SourceBundleFile, start: number, end: number): InquiryToolOutput => {
    const lines = linesOf(source.content)
    if (end < start || start > lines.length) return blank("error", "source-range", "Requested range does not overlap the original file.")
    const requestedEnd = end
    end = Math.min(end, lines.length)
    let text = "", last = start - 1
    for (let i = start; i <= end; i++) {
      const line = `${i} | ${lines[i - 1]!}\n`
      if (displayBytes + Buffer.byteLength(text + line) > maxDisplayBytes) break
      text += line; last = i
    }
    if (!text) return blank("error", "display-budget", "No complete source line fits the remaining display budget.")
    const bytes = Buffer.byteLength(text); displayBytes += bytes
    const item = originalWindow(source, start, last)
    if (!evidence.some(e => e.id === item.id)) evidence.push(item)
    return { ...blank(last === end ? "ok" : "partial", requestedEnd > end ? "source-end-clamped" : undefined, requestedEnd > end ? `Requested end ${requestedEnd} exceeds EOF ${end}; returning available original lines.` : undefined), evidence: [item], requested: { path: source.relativePath, startLine: start, endLine: requestedEnd }, truncated: last !== end }
  }
  const execute = async (name: string, args: Record<string, unknown>, origin?: { actionOrigin: string; questionId: string; dependencyId: string; reason: string }): Promise<InquiryToolOutput> => {
    let result: InquiryToolOutput
    if (toolCalls >= maxToolCalls) result = blank("error", "tool-budget", "Session tool budget exhausted.")
    else {
      toolCalls++
      try {
        const schema = schemas[name as keyof typeof schemas]
        if (!schema) result = blank("error", "tool-not-registered", "This executor has no shell, mutation, network or target execution tool.")
        else if (!schema.safeParse(args).success) result = blank("error", "tool-arguments", "Arguments do not match the registered tool schema.")
        else if (name === "source_list") {
          const a = schemas.source_list.parse(args), all = [...files].map(([p, f]) => ({ path: p, bytes: Buffer.byteLength(f.content), lineCount: linesOf(f.content).length }))
          result = { ...blank(scopeGaps.length ? "partial" : "ok"), files: all.slice(a.offset, a.offset + a.limit), truncated: a.offset + a.limit < all.length, ...(a.offset + a.limit < all.length ? { nextOffset: a.offset + a.limit } : {}) }
        } else if (name === "source_read") {
          const a = schemas.source_read.parse(args), file = await current(a.path)
          result = "status" in file ? file : show(file, a.startLine, a.endLine)
        } else if (name === "source_symbol") {
          const a = schemas.source_symbol.parse(args), selected = selectedFiles(a.path)
          if (a.path !== undefined && !selected.length) result = blank("error", "source-out-of-scope", "Selector must be an allowed indexed file or directory containing indexed files.")
          else {
            const candidates = symbols.filter(s => s.name === a.name && selected.includes(s.path))
            result = { ...blank(candidates.length > 1 ? "ambiguous" : "ok"), candidates }
            for (const p of new Set(candidates.map(s => s.path))) { const file = await current(p); if ("status" in file) { result = file; break } }
          }
        } else {
          const a = schemas.source_search.parse(args), selected = selectedFiles(a.path)
          if (a.path !== undefined && !selected.length) result = blank("error", "source-out-of-scope", "Selector must be an allowed indexed file or directory containing indexed files.")
          else {
            result = blank("ok"); let totalMatches = 0
            for (const p of selected) {
              const source = await current(p)
              if ("status" in source) { result = source; break }
              for (const [i, line] of linesOf(source.content).entries()) if (line.includes(a.text)) {
                totalMatches++
                if (result.matches.length >= a.limit) continue
                const shown = show(source, i + 1, i + 1)
                result.evidence.push(...shown.evidence); result.matches.push({ path: p, line: i + 1, ...(shown.evidence[0] ? { evidenceId: shown.evidence[0].id } : {}) })
                if (shown.status !== "ok") { result.status = "partial"; result.code = shown.code ?? "display-budget" }
              }
            }
            result.totalMatches = totalMatches; result.truncated = totalMatches > result.matches.length
          }
        }
      } catch (error) { result = blank("error", "source-read-failed", String(error)) }
    }
    history.push({ name, arguments: structuredClone(args), result: structuredClone(result), ...origin }); return result
  }
  return { definitions: INQUIRY_SOURCE_TOOLS, execute, restoreEvidence, evidence, history, scopeGaps,
    files: [...files].map(([p, f]) => ({ path: p, sha256: f.sha256, bytes: Buffer.byteLength(f.content) })),
    locateSymbols: (name: string) => structuredClone(symbols.filter(s => s.name === name)),
    symbolHints: (text: string) => { const names = new Set(text.match(/[A-Za-z_$][\w$]*/g) ?? []); return structuredClone(symbols.filter(s => s.name.length >= 3 && names.has(s.name))) },
    get displayBytes() { return displayBytes }, get importedEvidenceBytes() { return importedEvidenceBytes }, get indexBytes() { return indexBytes }, get ioReadBytes() { return ioReadBytes }, get toolCalls() { return toolCalls }, maxToolCalls, maxDisplayBytes }
}
export type InquiryTools = Awaited<ReturnType<typeof createInquiryTools>>

/** Count only original numbered windows actually present in this provider request. */
export function modelSourceDisplay(evidence: InquiryEvidence[], serialized: string, displayed: ReadonlySet<string>) {
  let bytes = 0, resentBytes = 0
  const evidenceIds: string[] = [], originals = new Map(evidence.map(e => [e.id, e])), counts = new Map<string, number>()
  // Host-rendered source windows start with their stable ID. A catalog ID or an
  // equal text in another path cannot establish that this original was shown.
  for (const match of serialized.matchAll(/\{\s*"id"\s*:\s*"(ev-[a-f0-9]+)"/g)) {
    const e = originals.get(match[1]!); if (!e) continue
    let depth = 0, quoted = false, escaped = false, end = match.index!
    for (; end < serialized.length; end++) {
      const char = serialized[end]!
      if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; continue }
      if (char === '"') quoted = true
      else if (char === "{") depth++
      else if (char === "}" && --depth === 0) break
    }
    try {
      const shown = JSON.parse(serialized.slice(match.index, end + 1))
      if (["repository", "sourceRef", "path", "sha256", "startLine", "endLine", "text"].every(key => shown[key] === e[key as keyof InquiryEvidence])) counts.set(e.id, (counts.get(e.id) ?? 0) + 1)
    } catch { /* Natural prose and catalog fragments are not original windows. */ }
  }
  for (const e of evidence) {
    const count = counts.get(e.id) ?? 0
    bytes += count * e.bytes; resentBytes += (displayed.has(e.id) ? count : Math.max(0, count - 1)) * e.bytes
    if (count) evidenceIds.push(e.id)
  }
  return { bytes, resentBytes, evidenceIds }
}
