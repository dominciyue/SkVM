import { loadLocalAuthorizationInput } from "../local-input.ts"
import { loadPortableSourceBundle } from "../inputs.ts"
import { AuthorizationEvidenceRequestSchema, type AuthorizationEvidenceRequest } from "./schema.ts"
import { physicalSourceLines } from "./segments.ts"

export interface DiscoverySymbol { id: string; path: string; name: string; kind: "class" | "function"; startLine: number; endLine: number; parent?: string }
export interface DiscoveryWindow { path: string; startLine: number; endLine: number; text: string; bytes: number; origin: string }
export interface DiscoveryDiagnostic { reason: string; path?: string; symbol?: string; from?: string }
export interface AuthorizationDiscovery {
  schemaVersion: "authorization-bounded-discovery/v1"
  request: AuthorizationEvidenceRequest
  files: Array<{ path: string; sha256: string; bytes: number; lineCount: number }>
  symbols: DiscoverySymbol[]
  windows: DiscoveryWindow[]
  diagnostics: DiscoveryDiagnostic[]
  readBytes: number
  displayBytes: number
  maxDisplayBytes: number
  locator: "lexical-reference-candidates; not a semantic call graph"
}
export interface DiscoveryRead { path: string; startLine?: number; endLine?: number; match?: string; contextLines?: number }
const retainedSources = new WeakMap<AuthorizationDiscovery, Map<string, string[]>>()
const portable = (file: string) => !!file && !file.includes("\\") && !file.includes("\0") && !/^(?:[A-Za-z]:|\/)/.test(file) && file.split("/").every(p => p && p !== "." && p !== "..")
const cleanLine = (line: string) => line.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`/g, "\"\"").replace(/\/\/.*$/, "")

function indexSymbols(file: string, physical: string[]): DiscoverySymbol[] {
  const lines = physical.map(line => line.replace(/\r?\n$/, "")), output: DiscoverySymbol[] = []
  const python = file.endsWith(".py")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const py = /^([ \t]*)(?:async\s+)?(def|class)\s+(\w+)/.exec(line)
    const other = /\b(?:function|class)\s+(\w+)|^\s*func\s+(?:\([^)]*\)\s*)?(\w+)\s*\(/.exec(line)
    if (!(python ? py : other)) continue
    const name = python ? py![3]! : (other![1] ?? other![2])!
    const kind = python ? py![2] === "class" ? "class" : "function" : /\bclass\s/.test(line) ? "class" : "function"
    let end = i
    if (python) {
      const indent = py![1]!.length
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j]!.trim() && !lines[j]!.trim().startsWith("#") && (lines[j]!.match(/^\s*/)?.[0].length ?? 0) <= indent) break
        end = j
      }
    } else {
      let depth = 0, began = false
      for (let j = i; j < lines.length; j++) {
        const text = cleanLine(lines[j]!)
        const opens = (text.match(/\{/g) ?? []).length, closes = (text.match(/\}/g) ?? []).length
        if (opens) began = true
        depth += opens - closes; end = j
        if (began && depth <= 0) break
        if (j - i > 1000) break
      }
    }
    output.push({ id: `symbol:${file}:${i + 1}:${name}`, path: file, name, kind, startLine: i + 1, endLine: end + 1 })
  }
  for (const symbol of output) {
    const parent = output.filter(s => s.kind === "class" && s.startLine < symbol.startLine && s.endLine >= symbol.endLine).sort((a, b) => b.startLine - a.startLine)[0]
    if (parent) symbol.parent = parent.id
  }
  return output
}

function references(content: string): string[] {
  // A declaration's own name is not a call. Real recursive calls in its body remain candidates.
  const bodies = content.replace(/(^|\n)\s*(?:(?:export\s+)?(?:async\s+)?function\s+|(?:async\s+)?def\s+|func\s+(?:\([^)]*\)\s*)?)[A-Za-z_]\w*\s*\(/g, "$1(")
  const calls = [...bodies.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)].map(match => match[1]!)
  const bases = [...content.matchAll(/\bclass\s+\w+\s*\(([^)]*)\)/g)].flatMap(match => match[1]!.match(/[A-Za-z_]\w*/g) ?? [])
  return [...new Set([...calls, ...bases])].filter(name => !["if", "for", "while", "switch", "catch", "return", "function", "func", "def", "class"].includes(name))
}

function makeWindow(sources: Map<string, string[]>, file: string, start: number, end: number, origin: string): DiscoveryWindow {
  const lines = sources.get(file)
  if (!lines) throw new Error(`Requested file is not readable in the allowlist: ${file}`)
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > lines.length) throw new Error(`Read outside source range: ${file}:${start}-${end}`)
  const text = lines.slice(start - 1, end).map((line, i) => `${start + i} | ${line.replace(/\r?\n$/, "")}`).join("\n")
  return { path: file, startLine: start, endLine: end, text, bytes: Buffer.byteLength(text, "utf8"), origin }
}

/** Reads only the authored file universe. Candidate positions are lexical evidence, never authorization answers. */
export async function discoverAuthorizationEvidence(input: { inputFile: string; request: AuthorizationEvidenceRequest; maxReadBytes?: number; maxDisplayBytes?: number }): Promise<AuthorizationDiscovery> {
  const request = AuthorizationEvidenceRequestSchema.parse(input.request)
  const loaded = await loadLocalAuthorizationInput(input.inputFile)
  if (loaded.status !== "valid" || request.sourceRoot !== loaded.normalizedInput.sourceRoot) throw new Error("Discovery requires valid input and matching sourceRoot")
  if (request.schemaVersion !== "authorization-evidence-request/v2") throw new Error("Discovery requires explicit request/v2")
  if (request.allowedFiles.some(file => !portable(file)) || new Set(request.allowedFiles).size !== request.allowedFiles.length || request.entries.some(entry => !request.allowedFiles.includes(entry.path))) throw new Error("Unsafe discovery allowlist")
  if (request.allowedFiles.length > 12) throw new Error("Discovery candidate-file budget is 12")
  const result: AuthorizationDiscovery = { schemaVersion: "authorization-bounded-discovery/v1", request: structuredClone(request), files: [], symbols: [], windows: [], diagnostics: [], readBytes: 0, displayBytes: 0, maxDisplayBytes: Math.min(input.maxDisplayBytes ?? 65536, 65536), locator: "lexical-reference-candidates; not a semantic call graph" }
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
    result.symbols.push(...indexSymbols(file, lines))
  }
  retainedSources.set(result, sources)
  const addWindow = (file: string, start: number, end: number, origin: string) => {
    if (result.windows.some(w => w.path === file && w.startLine <= start && w.endLine >= end)) return
    const window = makeWindow(sources, file, start, end, origin)
    // Reserve half of the cumulative model display budget for bounded supplementary reads.
    if (result.displayBytes + window.bytes > Math.floor(result.maxDisplayBytes / 2)) { result.diagnostics.push({ reason: "display-budget", path: file, from: origin }); return }
    result.windows.push(window); result.displayBytes += window.bytes
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
    if (symbol.kind === "class") for (const method of result.symbols.filter(s => s.parent === symbol.id)) {
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

/** Supplementary requests are only literal/range reads against bytes already indexed under the read budget. */
export async function readDiscoveryWindows(discovery: AuthorizationDiscovery, reads: DiscoveryRead[]): Promise<{ windows: DiscoveryWindow[]; bytes: number }> {
  const sources = retainedSources.get(discovery)
  if (!sources) throw new Error("Discovery read context unavailable; do not resume a dispatched unknown request")
  const windows: DiscoveryWindow[] = []
  let bytes = 0
  for (const read of reads) {
    if (!discovery.request.allowedFiles.includes(read.path) || !portable(read.path)) throw new Error("Supplementary path is outside the allowlist")
    const lines = sources.get(read.path)
    if (!lines) throw new Error("Supplementary file was not read under budget")
    let start = read.startLine, end = read.endLine
    if (read.match !== undefined) {
      const hits = lines.flatMap((line, i) => line.includes(read.match!) ? [i + 1] : [])
      if (hits.length !== 1) throw new Error(`Supplementary literal is missing or ambiguous: ${read.path}`)
      const context = Math.min(80, Math.max(0, read.contextLines ?? 20))
      start = Math.max(1, hits[0]! - context); end = Math.min(lines.length, hits[0]! + context)
    }
    if (start === undefined || end === undefined) throw new Error("Supplementary read requires a literal or exact range")
    const window = makeWindow(sources, read.path, start, end, "model-read")
    if (windows.some(w => w.path === window.path && w.startLine === window.startLine && w.endLine === window.endLine)) continue
    if (discovery.displayBytes + bytes + window.bytes > discovery.maxDisplayBytes) throw new Error("Cumulative supplementary display budget exhausted")
    windows.push(window); bytes += window.bytes
  }
  discovery.windows.push(...windows); discovery.displayBytes += bytes
  return { windows, bytes }
}
