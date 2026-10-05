import { createHash } from "node:crypto"
import { loadLocalAuthorizationInput } from "../local-input.ts"
import { loadPortableSourceBundle } from "../inputs.ts"
import { AuthorizationEvidenceRequestSchema, type AuthorizationEvidenceRequest } from "./schema.ts"
import { physicalSourceLines } from "./segments.ts"
import { evidenceLocationId, selectEvidenceLocation, type EvidenceLocationContext, type EvidenceLocationOutcome, type EvidenceLocationSelector } from "./location-selection.ts"

export interface DiscoverySymbol { id: string; sha256: string; path: string; name: string; kind: "class" | "function"; startLine: number; endLine: number; parent?: string; boundary?: "complete" | "uncertain" }
export interface DiscoveryWindow { id: string; sha256: string; path: string; startLine: number; endLine: number; text: string; bytes: number; origin: string }
export interface DiscoveryDiagnostic { reason: string; path?: string; symbol?: string; from?: string }
export interface AuthorizationDiscovery {
  schemaVersion: "authorization-bounded-discovery/v1"
  sourceIdentity: { repository: string; sourceRef: string }
  request: AuthorizationEvidenceRequest
  files: Array<{ path: string; sha256: string; bytes: number; lineCount: number }>
  symbols: DiscoverySymbol[]
  windows: DiscoveryWindow[]
  diagnostics: DiscoveryDiagnostic[]
  readBytes: number
  displayBytes: number
  uniqueSourceBytes: number
  resentSourceBytes: number
  readOutcomes: DiscoveryReadOutcome[]
  maxDisplayBytes: number
  locator: "lexical-reference-candidates; not a semantic call graph"
}
export interface DiscoveryRead { id?: string; from?: string; selector?: EvidenceLocationSelector; path?: string; startLine?: number; endLine?: number; match?: string; contextLines?: number }
export type DiscoveryReadOutcome = { requestId: string; request: DiscoveryRead; budget: { usedBytes: number; maxBytes: number; requestedBytes?: number } } & (
  | { status: "resolved"; windowId: string; path: string; startLine: number; endLine: number; bytes: number; newlyShown: boolean }
  | { status: "unresolved"; code: Extract<EvidenceLocationOutcome, { status: "unresolved" }>["code"] | "file-unavailable" | "display-budget" | "range-required"; candidates: Array<{ path: string; startLine: number; endLine: number }> }
)
interface RetainedDiscovery {
  sources: Map<string, string[]>
  identity: AuthorizationDiscovery["sourceIdentity"]
  allowedFiles: string[]
  files: AuthorizationDiscovery["files"]
  symbols: DiscoverySymbol[]
  windows: DiscoveryWindow[]
  shownLines: Set<string>
  displayBytes: number
}
const retainedSources = new WeakMap<AuthorizationDiscovery, RetainedDiscovery>()
const portable = (file: string) => !!file && !file.includes("\\") && !file.includes("\0") && !/^(?:[A-Za-z]:|\/)/.test(file) && file.split("/").every(p => p && p !== "." && p !== "..")

function braceCodeLines(lines: string[], goRawStrings: boolean): { code: string[]; uncertainFrom?: number } {
  let quote = "", blockComment = false, openedAt = 0
  const code = lines.map((line, lineIndex) => {
    let output = ""
    for (let i = 0; i < line.length; i++) {
      if (blockComment) {
        if (line.startsWith("*/", i)) { blockComment = false; i++ }
        continue
      }
      if (quote) {
        if (line[i] === "\\" && !(goRawStrings && quote === "`")) { i++; continue }
        if (line[i] === quote) quote = ""
        continue
      }
      if (line.startsWith("//", i)) break
      if (line.startsWith("/*", i)) { blockComment = true; openedAt = lineIndex; output += " "; i++; continue }
      if (line[i] === '"' || line[i] === "'" || line[i] === "`") { quote = line[i]!; openedAt = lineIndex; output += '""'; continue }
      output += line[i]
    }
    return output
  })
  return { code, ...(quote || blockComment ? { uncertainFrom: openedAt } : {}) }
}

function pythonCodeLines(lines: string[]): { code: string[]; uncertainFrom?: number } {
  let quote = "", openedAt = 0
  const code = lines.map((line, lineIndex) => {
    let output = ""
    for (let i = 0; i < line.length; i++) {
      if (quote) {
        if (line[i] === "\\") { i++; continue }
        if (line.startsWith(quote, i)) { i += quote.length - 1; quote = "" }
        continue
      }
      if (line[i] === "#") break
      if (line[i] === '"' || line[i] === "'") {
        quote = line.startsWith(line[i]!.repeat(3), i) ? line[i]!.repeat(3) : line[i]!
        openedAt = lineIndex; output += '""'; i += quote.length - 1; continue
      }
      output += line[i]
    }
    return output
  })
  return { code, ...(quote ? { uncertainFrom: openedAt } : {}) }
}

function indexSymbols(file: string, physical: string[]): Array<Omit<DiscoverySymbol, "sha256">> {
  const lines = physical.map(line => line.replace(/\r?\n$/, "")), output: Array<Omit<DiscoverySymbol, "sha256">> = []
  const python = file.endsWith(".py")
  const lexical = python ? pythonCodeLines(lines) : braceCodeLines(lines, file.endsWith(".go"))
  for (let i = 0; i < lines.length; i++) {
    const line = lexical.code[i]!
    const py = /^([ \t]*)(?:async\s+)?(def|class)\s+(\w+)/.exec(line)
    const other = /\b(?:function|class)\s+(\w+)|^\s*func\s+(?:\([^)]*\)\s*)?(\w+)\s*\(/.exec(line)
    if (!(python ? py : other)) continue
    const name = python ? py![3]! : (other![1] ?? other![2])!
    const kind = python ? py![2] === "class" ? "class" : "function" : /\bclass\s/.test(line) ? "class" : "function"
    let end = i, boundary: "complete" | "uncertain" = "uncertain"
    if (python) {
      const indent = py![1]!.length
      // A dedented closing parenthesis still belongs to a multiline declaration.
      // Strip quoted defaults/comments before balancing its logical header.
      let brackets = 0
      for (let j = i; j < lines.length; j++) {
        const header = lexical!.code[j]!
        brackets += (header.match(/[([{]/g) ?? []).length - (header.match(/[)\]}]/g) ?? []).length
        end = j
        if (brackets <= 0 && !header.trimEnd().endsWith("\\")) { boundary = header.trimEnd().endsWith(":") ? "complete" : "uncertain"; break }
      }
      let bodyDepth = 0, continued = false, bodySeen = false
      for (let j = end + 1; j < lines.length; j++) {
        const body = lexical!.code[j]!
        if (!bodyDepth && !continued && body.trim() && (body.match(/^\s*/)?.[0].length ?? 0) <= indent) break
        if (body.trim()) bodySeen = true
        bodyDepth += (body.match(/[([{]/g) ?? []).length - (body.match(/[)\]}]/g) ?? []).length
        continued = body.trimEnd().endsWith("\\")
        end = j
      }
      if (!bodySeen || bodyDepth !== 0 || continued || (lexical!.uncertainFrom !== undefined && lexical!.uncertainFrom <= end)) boundary = "uncertain"
    } else {
      let depth = 0, began = false
      for (let j = i; j < lines.length; j++) {
        const text = lexical.code[j]!
        const opens = (text.match(/\{/g) ?? []).length, closes = (text.match(/\}/g) ?? []).length
        if (opens) began = true
        depth += opens - closes; end = j
        if (began && depth === 0) { boundary = "complete"; break }
        if (j - i > 1000) break
      }
      if (lexical.uncertainFrom !== undefined && lexical.uncertainFrom <= end) boundary = "uncertain"
    }
    output.push({ id: `symbol:${file}:${i + 1}:${name}`, path: file, name, kind, startLine: i + 1, endLine: end + 1, boundary })
  }
  for (const symbol of output) {
    const parent = output.filter(s => s.kind === "class" && s.startLine < symbol.startLine && s.endLine >= symbol.endLine).sort((a, b) => b.startLine - a.startLine)[0]
    if (parent) symbol.parent = parent.id
  }
  return output
}

/** The same bounded lexical index supplies host context; a complete bound is not a semantic proof. */
export function indexAuthorizationSymbols(file: string, content: string, identity: AuthorizationDiscovery["sourceIdentity"]): DiscoverySymbol[] {
  const sha256 = createHash("sha256").update(content).digest("hex")
  const physical = physicalSourceLines(content), indexed = indexSymbols(file, physical)
  if (file.endsWith(".py")) for (const symbol of indexed) {
    const indent = physical[symbol.startLine - 1]!.match(/^[ \t]*/)?.[0] ?? ""
    while (symbol.startLine > 1) {
      const previous = physical[symbol.startLine - 2]!.replace(/\r?\n$/, "")
      if (!previous.startsWith(`${indent}@`) || /[()[\]{}]/.test(previous.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "").replace(/^.*?@/, "").replace(/\([^()]*\)/g, ""))) break
      symbol.startLine--
    }
  }
  const ids = new Map(indexed.map(s => [s.id, evidenceLocationId("symbol", identity, { ...s, sha256 })]))
  return indexed.map(s => ({ ...s, id: ids.get(s.id)!, sha256, ...(s.parent ? { parent: ids.get(s.parent)! } : {}) }))
}

function references(content: string): string[] {
  // A declaration's own name is not a call. Real recursive calls in its body remain candidates.
  const bodies = content.replace(/(^|\n)\s*(?:(?:export\s+)?(?:async\s+)?function\s+|(?:async\s+)?def\s+|func\s+(?:\([^)]*\)\s*)?)[A-Za-z_]\w*\s*\(/g, "$1(")
  const calls = [...bodies.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)].map(match => match[1]!)
  const bases = [...content.matchAll(/\bclass\s+\w+\s*\(([^)]*)\)/g)].flatMap(match => match[1]!.match(/[A-Za-z_]\w*/g) ?? [])
  return [...new Set([...calls, ...bases])].filter(name => !["if", "for", "while", "switch", "catch", "return", "function", "func", "def", "class"].includes(name))
}

function makeWindow(state: RetainedDiscovery, file: string, start: number, end: number, origin: string): DiscoveryWindow {
  const lines = state.sources.get(file)
  if (!lines) throw new Error(`Requested file is not readable in the allowlist: ${file}`)
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > lines.length) throw new Error(`Read outside source range: ${file}:${start}-${end}`)
  const text = lines.slice(start - 1, end).map((line, i) => `${start + i} | ${line.replace(/\r?\n$/, "")}\n`).join("")
  const value = { path: file, startLine: start, endLine: end, sha256: state.files.find(f => f.path === file)!.sha256 }
  return { ...value, id: evidenceLocationId("window", state.identity, value), text, bytes: Buffer.byteLength(text, "utf8"), origin }
}

function retained(discovery: AuthorizationDiscovery): RetainedDiscovery {
  const state = retainedSources.get(discovery)
  if (!state) throw new Error("Discovery read context unavailable; do not resume a dispatched unknown request")
  if (JSON.stringify(state.identity) !== JSON.stringify(discovery.sourceIdentity) || JSON.stringify(state.allowedFiles) !== JSON.stringify(discovery.request.allowedFiles)
    || JSON.stringify(state.files) !== JSON.stringify(discovery.files) || JSON.stringify(state.symbols) !== JSON.stringify(discovery.symbols)
    || JSON.stringify(state.windows) !== JSON.stringify(discovery.windows) || state.displayBytes !== discovery.displayBytes) throw new Error("Discovery snapshot integrity mismatch")
  return state
}

export function discoveryLocationContext(discovery: AuthorizationDiscovery): EvidenceLocationContext {
  const state = retained(discovery)
  return { sourceIdentity: { ...state.identity }, sources: state.files.map(f => ({ path: f.path, sha256: f.sha256, content: state.sources.get(f.path)!.join("") })), windows: structuredClone(state.windows), symbols: structuredClone(state.symbols) }
}

/** Every rendered UTF-8 source line counts on every dispatch, including previously shown context. */
export function recordDiscoveryDisplay(discovery: AuthorizationDiscovery, windows: DiscoveryWindow[]): void {
  const state = retained(discovery)
  const bytes = windows.reduce((sum, w) => sum + w.bytes, 0)
  if (discovery.displayBytes + bytes > Math.min(65536, discovery.maxDisplayBytes)) throw new Error("Cumulative source display budget exhausted")
  for (const window of windows) {
    const actual = makeWindow(state, window.path, window.startLine, window.endLine, window.origin)
    if (JSON.stringify(actual) !== JSON.stringify(window)) throw new Error("Discovery window integrity mismatch")
    for (let line = window.startLine; line <= window.endLine; line++) {
      const key = `${window.path}\0${line}`
      const lineBytes = Buffer.byteLength(`${line} | ${state.sources.get(window.path)![line - 1]!.replace(/\r?\n$/, "")}\n`, "utf8")
      if (state.shownLines.has(key)) discovery.resentSourceBytes += lineBytes
      else { state.shownLines.add(key); discovery.uniqueSourceBytes += lineBytes }
    }
  }
  discovery.displayBytes += bytes; state.displayBytes += bytes
}

function registerWindows(discovery: AuthorizationDiscovery, windows: DiscoveryWindow[]) {
  const state = retained(discovery)
  recordDiscoveryDisplay(discovery, windows)
  for (const window of windows) if (!state.windows.some(w => w.id === window.id)) {
    discovery.windows.push(window); state.windows.push(structuredClone(window))
  }
}

/** Reads only the authored file universe. Candidate positions are lexical evidence, never authorization answers. */
export async function discoverAuthorizationEvidence(input: { inputFile: string; request: AuthorizationEvidenceRequest; maxReadBytes?: number; maxDisplayBytes?: number; contextStrategy?: "callable-v1" }): Promise<AuthorizationDiscovery> {
  const request = AuthorizationEvidenceRequestSchema.parse(input.request)
  const loaded = await loadLocalAuthorizationInput(input.inputFile)
  if (loaded.status !== "valid" || request.sourceRoot !== loaded.normalizedInput.sourceRoot) throw new Error("Discovery requires valid input and matching sourceRoot")
  if (request.schemaVersion !== "authorization-evidence-request/v2") throw new Error("Discovery requires explicit request/v2")
  if (request.allowedFiles.some(file => !portable(file)) || new Set(request.allowedFiles).size !== request.allowedFiles.length || request.entries.some(entry => !request.allowedFiles.includes(entry.path))) throw new Error("Unsafe discovery allowlist")
  if (request.allowedFiles.length > 12) throw new Error("Discovery candidate-file budget is 12")
  const result: AuthorizationDiscovery = { schemaVersion: "authorization-bounded-discovery/v1", sourceIdentity: { repository: loaded.task.repository, sourceRef: loaded.task.sourceRef }, request: structuredClone(request), files: [], symbols: [], windows: [], diagnostics: [], readBytes: 0, displayBytes: 0, uniqueSourceBytes: 0, resentSourceBytes: 0, readOutcomes: [], maxDisplayBytes: Math.min(input.maxDisplayBytes ?? 65536, 65536), locator: "lexical-reference-candidates; not a semantic call graph" }
  const sources = new Map<string, string[]>()
  for (const file of request.allowedFiles) {
    const read = await loadPortableSourceBundle({ sourceRoot: loaded.sourceRoot, repository: loaded.task.repository, sourceRef: loaded.task.sourceRef, sourceFiles: [file], maxBytes: Math.max(0, Math.min(input.maxReadBytes ?? 1048576, 1048576) - result.readBytes) })
    if (!read.success) {
      const budget = read.diagnostics.some(d => d.code === "input-byte-budget")
      if (read.diagnostics.some(d => ["unsafe-input-path", "symlink-escape", "duplicate-source-path"].includes(d.code))) throw new Error(`Invalid discovery source: ${file}`)
      result.diagnostics.push({ reason: budget ? "read-budget" : "unreadable-file", path: file }); continue
    }
    const source = read.bundle.files[0]!, lines = physicalSourceLines(source.content), bytes = Buffer.byteLength(source.content)
    sources.set(file, lines); result.readBytes += bytes
    result.files.push({ path: file, sha256: source.sha256, bytes, lineCount: lines.length })
    const indexed = indexSymbols(file, lines)
    const ids = new Map(indexed.map(s => [s.id, evidenceLocationId("symbol", result.sourceIdentity, { ...s, sha256: source.sha256 })]))
    result.symbols.push(...indexed.map(s => ({ ...s, id: ids.get(s.id)!, sha256: source.sha256, ...(s.parent ? { parent: ids.get(s.parent)! } : {}) })))
  }
  const state: RetainedDiscovery = { sources, identity: structuredClone(result.sourceIdentity), allowedFiles: request.allowedFiles.slice(), files: structuredClone(result.files), symbols: structuredClone(result.symbols), windows: [], shownLines: new Set(), displayBytes: 0 }
  retainedSources.set(result, state)
  const addWindow = (file: string, start: number, end: number, origin: string) => {
    if (result.windows.some(w => w.path === file && w.startLine <= start && w.endLine >= end)) return
    const window = makeWindow(state, file, start, end, origin)
    // Reserve half of the cumulative model display budget for bounded supplementary reads.
    if (result.displayBytes + window.bytes > Math.floor(result.maxDisplayBytes / 2)) { result.diagnostics.push({ reason: "display-budget", path: file, from: origin }); return }
    registerWindows(result, [window])
  }
  type Pending = { path: string; start: number; end: number; from: string; depth: number; trail: string[] }
  const queue: Pending[] = request.entries.map(entry => ({ path: entry.path, start: entry.startLine, end: entry.endLine, from: entry.entryKey, depth: 0, trail: [] }))
  const selected = new Map<string, string>()
  const usedIds = new Set([...request.entries.map(entry => entry.entryKey), ...request.dependencies.map(dependency => dependency.id)])
  let nextId = 1
  const newId = () => {
    while (usedIds.has(`located-${nextId}`)) nextId++
    const id = `located-${nextId++}`
    usedIds.add(id)
    return id
  }
  const addSymbol = (symbol: DiscoverySymbol, parent: Pending) => {
    if (parent.trail.includes(symbol.id)) { result.diagnostics.push({ reason: "cycle", path: symbol.path, symbol: symbol.name, from: parent.from }); return }
    if (selected.has(symbol.id)) return
    if (parent.depth >= Math.min(request.limits.maxDepth, 3)) { result.diagnostics.push({ reason: "depth-budget", symbol: symbol.name, from: parent.from }); return }
    const id = newId()
    selected.set(symbol.id, id)
    const firstMember = result.symbols.find(s => s.parent === symbol.id)
    const end = symbol.kind === "class" && firstMember ? Math.max(symbol.startLine, firstMember.startLine - 1) : symbol.endLine
    result.request.dependencies.push({ id, from: parent.from, path: symbol.path, startLine: symbol.startLine, endLine: end, reason: "other", basis: "locator" })
    queue.push({ path: symbol.path, start: symbol.startLine, end, from: id, depth: parent.depth + 1, trail: [...parent.trail, symbol.id] })
    // Class bodies expose methods as candidates. Each method remains support and cannot add an obligation.
    if (symbol.kind === "class" && !input.contextStrategy) for (const method of result.symbols.filter(s => s.parent === symbol.id)) {
      if (selected.has(method.id)) continue
      if (parent.depth + 2 > Math.min(request.limits.maxDepth, 3)) { result.diagnostics.push({ reason: "depth-budget", symbol: method.name, from: id }); continue }
      const methodId = newId()
      selected.set(method.id, methodId)
      result.request.dependencies.push({ id: methodId, from: id, path: method.path, startLine: method.startLine, endLine: method.endLine, reason: "other", basis: "locator" })
      queue.push({ path: method.path, start: method.startLine, end: method.endLine, from: methodId, depth: parent.depth + 2, trail: [...parent.trail, symbol.id, method.id] })
    }
  }
  while (queue.length) {
    const current = queue.shift()!, lines = sources.get(current.path)
    if (!lines) { result.diagnostics.push({ reason: "entry-unreadable", path: current.path, from: current.from }); continue }
    addWindow(current.path, current.start, current.end, current.from)
    const text = lines.slice(current.start - 1, current.end).join("")
    if (/\[[^\]]+\]\s*\(|getattr\s*\(/.test(text)) result.diagnostics.push({ reason: "dynamic-dispatch", path: current.path, from: current.from })
    if (current.depth === 0) {
      const enclosing = result.symbols.filter(s => s.path === current.path && s.kind === "class" && s.startLine <= current.start && s.endLine >= current.end).sort((a, b) => b.startLine - a.startLine)[0]
      if (enclosing) addSymbol(enclosing, current)
    }
    for (const name of references(text)) {
      const matches = result.symbols.filter(s => s.name === name)
      const sameFile = matches.filter(s => s.path === current.path)
      const narrowed = sameFile.length === 1 ? sameFile : matches
      if (narrowed.length === 1) addSymbol(narrowed[0]!, current)
      else if (narrowed.length > 1) result.diagnostics.push({ reason: "ambiguous-symbol", symbol: name, from: current.from })
      else result.diagnostics.push({ reason: "unresolved-reference", symbol: name, from: current.from })
    }
  }
  return result
}

/** Keep caller IDs in request.id; outcome IDs must distinguish every read in this job. */
export function discoveryReadRequestIds(discovery: Pick<AuthorizationDiscovery, "readOutcomes">, reads: readonly DiscoveryRead[]): string[] {
  const used = new Set(discovery.readOutcomes.map(outcome => outcome.requestId))
  return reads.map((read, index) => {
    const base = read.id ?? `read-${index + 1}`
    let id = base, suffix = 2
    while (used.has(id)) id = `${base}:${suffix++}`
    used.add(id)
    return id
  })
}

/** Safe read failures are gaps; unsafe paths and changed host snapshots still reject the job. */
export async function readDiscoveryWindows(discovery: AuthorizationDiscovery, reads: DiscoveryRead[], options: { reserveDisplayBytes?: number } = {}): Promise<{ windows: DiscoveryWindow[]; bytes: number; outcomes: DiscoveryReadOutcome[] }> {
  const state = retained(discovery), context = discoveryLocationContext(discovery)
  const selectors = reads.map(read => read.selector ?? (read.match !== undefined && read.path ? { kind: "literal-search" as const, path: read.path, literal: read.match, ...(read.startLine === undefined ? {} : { startLine: read.startLine }), ...(read.endLine === undefined ? {} : { endLine: read.endLine }) } : undefined))
  for (const [i, read] of reads.entries()) {
    const selector = selectors[i]
    const file = selector?.kind === "literal-search" ? selector.path : read.path
    if (file !== undefined && (!discovery.request.allowedFiles.includes(file) || !portable(file))) throw new Error("Supplementary path is outside the allowlist")
  }
  const windows: DiscoveryWindow[] = []
  const outcomes: DiscoveryReadOutcome[] = []
  const requestIds = discoveryReadRequestIds(discovery, reads)
  let bytes = 0
  for (const [i, read] of reads.entries()) {
    const selector = selectors[i]
    const file = selector?.kind === "literal-search" ? selector.path : read.path
    const base = { requestId: requestIds[i]!, request: structuredClone(read), budget: { usedBytes: discovery.displayBytes + bytes, maxBytes: Math.min(65536, discovery.maxDisplayBytes) } }
    if (file && !state.sources.has(file)) { outcomes.push({ ...base, status: "unresolved", code: "file-unavailable", candidates: [] }); continue }
    let location: EvidenceLocationOutcome
    if (selector) location = selectEvidenceLocation(context, selector, "read")
    else if (file && read.startLine !== undefined && read.endLine !== undefined) {
      const lineCount = state.sources.get(file)?.length ?? 0
      location = read.startLine >= 1 && read.endLine >= read.startLine && read.endLine <= lineCount ? { status: "resolved", path: file, startLine: read.startLine, endLine: read.endLine } : { status: "unresolved", code: "range-conflict", candidates: [] }
    } else { outcomes.push({ ...base, status: "unresolved", code: "range-required", candidates: [] }); continue }
    if (location.status === "unresolved") { outcomes.push({ ...base, ...location }); continue }
    let { startLine: start, endLine: end } = location
    if (selector?.kind === "literal-search" && selector.startLine === undefined) {
      const margin = Math.min(80, Math.max(0, read.contextLines ?? 20))
      start = Math.max(1, start - margin); end = Math.min(state.sources.get(location.path)!.length, end + margin)
    }
    const existing = [...discovery.windows, ...windows].find(w => w.path === location.path && w.startLine <= start && w.endLine >= end)
    if (existing) { outcomes.push({ ...base, status: "resolved", windowId: existing.id, path: location.path, startLine: start, endLine: end, bytes: 0, newlyShown: false }); continue }
    const window = makeWindow(state, location.path, start, end, "model-read")
    if (discovery.displayBytes + bytes + window.bytes + (options.reserveDisplayBytes ?? 0) > base.budget.maxBytes) { outcomes.push({ ...base, budget: { ...base.budget, requestedBytes: window.bytes }, status: "unresolved", code: "display-budget", candidates: [{ path: location.path, startLine: start, endLine: end }] }); continue }
    windows.push(window); bytes += window.bytes
    outcomes.push({ ...base, status: "resolved", windowId: window.id, path: location.path, startLine: start, endLine: end, bytes: window.bytes, newlyShown: true })
  }
  registerWindows(discovery, windows)
  discovery.readOutcomes.push(...outcomes)
  discovery.diagnostics.push(...outcomes.filter(o => o.status === "unresolved").map(o => ({ reason: o.status === "unresolved" ? o.code : "", ...(o.request.path ? { path: o.request.path } : {}), from: o.requestId })))
  return { windows, bytes, outcomes }
}
