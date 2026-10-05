import path from "node:path"
import { createHash } from "node:crypto"
import { Parser, Language, type Node } from "@vscode/tree-sitter-wasm"
import type { DiscoverySymbol } from "./discovery.ts"

export interface StructureSymbol extends DiscoverySymbol {
  qualifiedName: string; module: string; language: "python" | "go"; className?: string; receiver?: string;
  parameters: Array<{ name: string; type?: string }>; returns: string[]; bases: string[]; attributes: Record<string, string>
}
export interface StructureCall {
  id: string; ownerId?: string; path: string; sha256: string; startLine: number; endLine: number;
  expression: string; receiver?: string; receiverClass?: string; arguments: string[]; candidateIds: string[]; resolution: "resolved" | "ambiguous" | "unresolved";
  basis: string[]; gap?: string; resultNames: string[]
}
export interface StructureRoute { id: string; sourceCallId: string; sourcePath: string; startLine: number; endLine: number; method: string; path: string; handlerExpression: string; candidateIds: string[]; middlewareExpressions: string[]; model: string }
interface FileScope { path: string; module: string; language: "python" | "go"; aliases: Record<string, string>; symbols: StructureSymbol[]; rawCalls: Array<{ call: StructureCall; types: Record<string, string>; groupPaths: string[] }> }
const hash = (v: unknown) => createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex")
let initialized: Promise<Map<string, Language>> | undefined
function languages() {
  return initialized ??= (async () => {
    const dir = path.dirname(import.meta.resolveSync("@vscode/tree-sitter-wasm"))
    await Parser.init({ locateFile: () => path.join(dir, "tree-sitter.wasm") })
    return new Map(await Promise.all(["python", "go"].map(async name => [name, await Language.load(path.join(dir, `tree-sitter-${name}.wasm`))] as const)))
  })()
}
const field = (n: Node, key: string) => n.childForFieldName(key)
const children = (n: Node | null | undefined): Node[] => (n?.namedChildren ?? []).filter((v): v is Node => !!v)
const descendants = (n: Node, types: string[]): Node[] => n.descendantsOfType(types).filter((v): v is Node => !!v)
const cleanType = (s: string) => s.replace(/^[*]+/, "").trim()
function moduleName(file: string, language: string) {
  if (language === "go") return path.posix.dirname(file).replace(/^\.\/?/, "")
  let name = file.replace(/\.py$/, "").replace(/\/__init__$/, "").replace(/^src\//, "")
  const framework = name.indexOf("rest_framework/")
  if (framework >= 0) name = name.slice(framework)
  return name.replaceAll("/", ".")
}
/** Only AST syntax and bounded name binding. No target import, execution or permission inference. */
export async function buildStructureIndex(files: Array<{ path: string; content: string }>, identity: { repository: string; sourceRef: string }) {
  const started = performance.now(), loaded = await languages(), scopes: FileScope[] = [], diagnostics: Array<{ path: string; code: string; line?: number }> = []
  for (const file of files) {
    const language = file.path.endsWith(".py") ? "python" : file.path.endsWith(".go") ? "go" : undefined
    if (!language) { diagnostics.push({ path: file.path, code: "structure-language-unsupported" }); continue }
    const parser = new Parser(); parser.setLanguage(loaded.get(language)!)
    const tree = parser.parse(file.content)!
    try {
      const root = tree.rootNode, sha256 = hash(file.content), module = moduleName(file.path, language), aliases: Record<string, string> = {}, symbols: StructureSymbol[] = []
      if (root.hasError) diagnostics.push({ path: file.path, code: "structure-parse-partial" })
      if (language === "python") for (const n of descendants(root, ["import_statement", "import_from_statement"])) {
        const from = field(n, "module_name")?.text
        const imported = children(n).filter(c => c.type === "aliased_import" || c.type === "dotted_name" && c.id !== field(n, "module_name")?.id)
        for (const v of imported) {
          const name = field(v, "name")?.text ?? v.text, alias = field(v, "alias")?.text ?? (from ? name : name.split(".")[0]!)
          const qualified = from ? `${from}.${name}` : name
          aliases[alias] = qualified.startsWith(".") ? `${module.split(".").slice(0, -1).join(".")}${qualified}` : qualified
        }
      }
      else for (const n of descendants(root, ["import_spec"])) {
        const target = field(n, "path")?.text.slice(1, -1)
        if (target) aliases[field(n, "name")?.text ?? target.split("/").at(-1)!] = target
      }
      const definitions = descendants(root, language === "python" ? ["class_definition", "function_definition"] : ["function_declaration", "method_declaration", "type_spec"])
      const byNode = new Map<number, StructureSymbol>()
      for (const n of definitions) {
        const name = field(n, "name")?.text
        if (!name || language === "go" && n.type === "type_spec" && field(n, "type")?.type !== "struct_type") continue
        let parent = n.parent
        while (parent && !definitions.some(d => d.id === parent!.id)) parent = parent.parent
        const owner = parent && byNode.get(parent.id), receiverNode = field(n, "receiver"), receiverParam = receiverNode && descendants(receiverNode, ["parameter_declaration"])[0]
        const receiverType = receiverParam && field(receiverParam, "type")?.text, receiver = receiverType && cleanType(receiverType)
        const className = owner?.kind === "class" ? owner.qualifiedName : receiver ? `${module}.${receiver}` : undefined
        const parametersNode = field(n, "parameters"), parameters: StructureSymbol["parameters"] = []
        if (parametersNode) for (const param of children(parametersNode)) {
          if (language === "python") {
            const name = field(param, "name")?.text ?? (param.type === "identifier" ? param.text : children(param)[0]?.text)
            if (name) parameters.push({ name, ...(field(param, "type") ? { type: field(param, "type")!.text } : {}) })
          } else {
            const type = field(param, "type")?.text
            for (const id of children(param).filter(c => c.type === "identifier")) parameters.push({ name: id.text, ...(type ? { type } : {}) })
          }
        }
        if (receiverParam) { const receiverName = field(receiverParam, "name")?.text ?? children(receiverParam).find(c => c.type === "identifier")?.text; if (receiverName) parameters.unshift({ name: receiverName, type: receiverType ?? undefined }) }
        const qualifiedName = `${className ?? owner?.qualifiedName ?? module}.${name}`.replace(/^\./, "")
        const attributes: Record<string, string> = {}
        if (n.type === "class_definition") for (const statement of children(field(n, "body"))) for (const assignment of statement.type === "expression_statement" ? children(statement).filter(c => c.type === "assignment") : []) {
          const key = field(assignment, "left")?.text, value = field(assignment, "right")?.text; if (key && value) attributes[key] = value
        }
        if (n.type === "type_spec") for (const declaration of descendants(n, ["field_declaration"])) {
          const type = field(declaration, "type")?.text
          for (const key of children(declaration).filter(c => c.type === "field_identifier")) if (type) attributes[key.text] = type
        }
        const s: StructureSymbol = { id: `struct-${hash([identity, file.path, sha256, n.startIndex, qualifiedName]).slice(0, 24)}`, path: file.path, sha256, name, qualifiedName, module, language, kind: n.type === "class_definition" || n.type === "type_spec" ? "class" : "function", startLine: n.startPosition.row + 1, endLine: n.endPosition.row + 1, boundary: n.hasError ? "uncertain" : "complete", ...(className ? { parent: className.split(".").at(-1), className } : {}), ...(receiver ? { receiver } : {}), parameters, returns: field(n, "return_type") || field(n, "result") ? [(field(n, "return_type") ?? field(n, "result"))!.text] : [], bases: children(field(n, "superclasses")).map(c => c.text), attributes }
        byNode.set(n.id, s); symbols.push(s)
      }
      const rawCalls: FileScope["rawCalls"] = []
      for (const n of descendants(root, language === "python" ? ["call"] : ["call_expression"])) {
        const fn = field(n, "function"); if (!fn) continue
        let owner = n.parent; while (owner && !byNode.has(owner.id)) owner = owner.parent
        const symbol = owner && byNode.get(owner.id), types: Record<string, string> = {}
        for (const p of symbol?.parameters ?? []) if (p.type) types[p.name] = p.type
        if (symbol?.className && language === "python") types.self = symbol.className
        const boundedText = (c: Node) => c.type === "function_literal" || c.type === "lambda" ? `source-function-body@${c.startPosition.row + 1}-${c.endPosition.row + 1}` : c.text.length > 500 ? `${c.text.slice(0, 500)} [structure-text-truncated]` : c.text
        const expression = fn.text, args = children(field(n, "arguments")).map(boundedText), resultNames: string[] = [], groupPaths: string[] = []
        let surrounding = n.parent
        while (surrounding) { if (surrounding.type === "call_expression" && field(surrounding, "function")?.text.endsWith(".Group")) { const p = children(field(surrounding, "arguments"))[0]; if (p && /^"[^"\n]*"$/.test(p.text)) groupPaths.unshift(JSON.parse(p.text)) }; surrounding = surrounding.parent }
        let assignment = n.parent
        while (assignment && !["assignment", "short_var_declaration", "assignment_statement", "function_definition", "function_declaration", "method_declaration"].includes(assignment.type)) assignment = assignment.parent
        if (assignment && ["assignment", "short_var_declaration", "assignment_statement"].includes(assignment.type)) resultNames.push(...(children(field(assignment, "left")).length ? children(field(assignment, "left")).map(c => c.text) : [field(assignment, "left")?.text ?? ""]).filter(Boolean))
        rawCalls.push({ types, groupPaths, call: { id: `call-${hash([identity, file.path, sha256, n.startIndex]).slice(0, 24)}`, ...(symbol ? { ownerId: symbol.id } : {}), path: file.path, sha256, startLine: n.startPosition.row + 1, endLine: n.endPosition.row + 1, expression, ...(expression.includes(".") ? { receiver: expression.slice(0, expression.lastIndexOf(".")) } : {}), arguments: args, candidateIds: [], resolution: "unresolved", basis: [], resultNames } })
      }
      scopes.push({ path: file.path, module, language, aliases, symbols, rawCalls })
    } finally { tree.delete(); parser.delete() }
  }
  const symbols = scopes.flatMap(f => f.symbols), scopeFor = (s: StructureSymbol) => scopes.find(f => f.path === s.path)!
  const qualified = (text: string, scope: FileScope) => {
    const value = cleanType(text), parts = value.split("."), aliased = scope.aliases[parts[0]!]
    return aliased ? [aliased, ...parts.slice(1)].join(".") : value.includes(".") ? value : `${scope.module}.${value}`.replace(/^\./, "")
  }
  const exactNames = new Map<string, StructureSymbol[]>(), pythonSuffixes = new Map<string, StructureSymbol[]>(), goNames = new Map<string, StructureSymbol[]>(), matchingCache = new Map<string, StructureSymbol[]>()
  const addName = (map: Map<string, StructureSymbol[]>, key: string, symbol: StructureSymbol) => map.set(key, [...(map.get(key) ?? []), symbol])
  for (const s of symbols) {
    addName(exactNames, s.qualifiedName, s)
    if (s.language === "go") addName(goNames, s.qualifiedName.replaceAll("/", "."), s)
    else { const parts = s.qualifiedName.split("."); for (let i = 1; i < parts.length; i++) addName(pythonSuffixes, parts.slice(i).join("."), s) }
  }
  const matching = (text: string) => {
    if (matchingCache.has(text)) return matchingCache.get(text)!
    const candidates = [...(exactNames.get(text) ?? [])], parts = text.replaceAll("/", ".").split(".")
    if (!candidates.length) candidates.push(...(pythonSuffixes.get(text) ?? []))
    // Import paths include a repository prefix that relative file modules omit.
    // Stop at the longest existing module, never union shorter homonyms.
    if (!candidates.length) for (let i = 0; i < parts.length; i++) { const found = goNames.get(parts.slice(i).join(".")); if (found?.length) { candidates.push(...found); break } }
    const found = [...new Map(candidates.map(c => [c.id, c])).values()]; matchingCache.set(text, found); return found
  }
  const mroCache = new Map<string, string[] | undefined>()
  const linearize = (name: string, active: string[] = []): string[] | undefined => {
    if (!active.length && mroCache.has(name)) return mroCache.get(name)?.slice()
    if (active.includes(name)) return undefined
    const cls = matching(name).filter(s => s.kind === "class")
    if (cls.length !== 1) return [name]
    const bases = cls[0]!.bases.map(b => qualified(b, scopeFor(cls[0]!))), lists = bases.map(b => linearize(b, [...active, name]))
    if (lists.some(l => !l)) return undefined
    const sequences = [...lists as string[][], [...bases]], result = [cls[0]!.qualifiedName]
    while (sequences.some(s => s.length)) {
      const head = sequences.filter(s => s.length).map(s => s[0]!).find(h => sequences.every(s => !s.slice(1).includes(h)))
      if (!head) return undefined
      result.push(head); for (const sequence of sequences) if (sequence[0] === head) sequence.shift()
    }
    if (!active.length) mroCache.set(name, [...result])
    return result
  }
  const lookupMethod = (className: string, method: string) => {
    const mro = linearize(className)
    if (!mro) return []
    for (const cls of mro) { const candidates = symbols.filter(s => s.className === cls && s.name === method); if (candidates.length) return candidates }
    return []
  }
  const attribute = (className: string, name: string): { value: string; scope: FileScope } | undefined => {
    for (const cls of linearize(className) ?? []) { const s = matching(cls).find(s => s.kind === "class"); if (s && Object.hasOwn(s.attributes, name)) return { value: s.attributes[name]!, scope: scopeFor(s) } }
  }
  function resolveCall(raw: FileScope["rawCalls"][number], scope: FileScope, receiverClass?: string): StructureCall {
    const call = structuredClone(raw.call), parts = call.expression.split("."), name = parts.pop()!, root = parts[0], owner = symbols.find(s => s.id === call.ownerId)
    let candidates: StructureSymbol[] = [], basis: string[] = []
    if (!parts.length) { candidates = matching(qualified(name, scope)).filter(s => !s.className); basis = ["AST unqualified name in module/import scope"] }
    else if (root && scope.aliases[root]) { candidates = matching(qualified(call.expression, scope)); basis = ["AST import/alias binding"] }
    else if (root && (raw.types[root] || root === "self" && receiverClass)) {
      let type = root === "self" && receiverClass ? receiverClass : qualified(raw.types[root]!, scope)
      for (const p of parts.slice(1)) { const a = attribute(type, p); type = a ? qualified(a.value, a.scope) : "" }
      const classes = matching(type).filter(s => s.kind === "class")
      if (classes.length === 1) type = classes[0]!.qualifiedName
      candidates = type ? lookupMethod(type, name) : []; basis = ["AST parameter/receiver type and explicit field chain", ...(owner?.className ? ["C3 inheritance/override lookup"] : [])]
      if (candidates.length && type) call.receiverClass = type
    } else { candidates = matching(qualified(call.expression, scope)); basis = ["AST qualified source binding"] }
    call.candidateIds = candidates.map(c => c.id); call.resolution = candidates.length === 1 ? "resolved" : candidates.length > 1 ? "ambiguous" : "unresolved"; call.basis = basis
    if (!candidates.length) call.gap = "receiver/import/value binding unavailable; unique lexical name is not a call edge"
    return call
  }
  // Declared return types and explicit constructor assignments are bounded
  // source bindings. Dynamic/unannotated returns do not inherit a unique name.
  for (const scope of scopes) {
    const locals = new Map<string, Record<string, string>>()
    for (const raw of scope.rawCalls) {
      const key = raw.call.ownerId ?? "$module", known = locals.get(key) ?? {}; Object.assign(raw.types, known)
      const resolved = resolveCall(raw, scope), target = resolved.candidateIds.length === 1 ? symbols.find(s => s.id === resolved.candidateIds[0]) : undefined
      const returned = target?.kind === "class" ? target.qualifiedName : target?.returns.length === 1 && !/[(),]/.test(target.returns[0]!) ? qualified(target.returns[0]!, scopeFor(target)) : undefined
      for (const name of raw.call.resultNames) if (returned) known[name] = returned; else delete known[name]
      locals.set(key, known)
    }
  }
  const calls = scopes.flatMap(f => f.rawCalls.map(r => resolveCall(r, f))), routes: StructureRoute[] = []
  for (const scope of scopes) for (const raw of scope.rawCalls) {
    const c = raw.call, verb = c.expression.split(".").at(-1)!, goRoute = scope.language === "go" && ["Get", "Post", "Put", "Patch", "Delete", "Head", "Options"].includes(verb), drf = scope.language === "python" && verb === "register"
    // Only static string tokens, including Python raw/unicode prefixes. A
    // formatted, concatenated or escaped unknown value remains a route gap.
    const token = /^(?:([rRuU]))?(['"])([^'"\r\n]*)\2$/.exec(c.arguments[0] ?? "")
    const hasLiteral = !!token && (!token[3]!.includes("\\") || !!token[1])
    if (!goRoute && !drf || !hasLiteral && (!goRoute || !raw.groupPaths.length)) continue
    const handler = drf ? c.arguments[1] : c.arguments.at(-1); if (!handler || !/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(handler)) continue
    const candidates = matching(qualified(handler, scope)).filter(s => drf ? s.kind === "class" && linearize(s.qualifiedName)?.some(n => n.startsWith("rest_framework.")) : s.kind === "function" && !s.className)
    if (!candidates.length) continue
    const literal = hasLiteral ? token![3]! : "", route: StructureRoute = { id: `route-${hash([c.id, handler]).slice(0, 24)}`, sourceCallId: c.id, sourcePath: c.path, startLine: c.startLine, endLine: c.endLine, method: drf ? "DRF-actions" : verb.toUpperCase(), path: [...raw.groupPaths, literal].join(""), handlerExpression: handler, candidateIds: candidates.map(s => s.id), middlewareExpressions: drf ? [] : c.arguments.slice(hasLiteral ? 1 : 0, -1), model: drf ? "drf-source-router/v1" : "go-route-registration/v1" }
    routes.push(route)
    symbols.push({ id: route.id, path: c.path, sha256: c.sha256, name: `${route.method} ${route.path}`, qualifiedName: `${scope.module}.route@${c.startLine}`, module: scope.module, language: scope.language, kind: "function", startLine: c.startLine, endLine: c.endLine, boundary: "complete", parameters: [], returns: [], bases: [], attributes: { routeModel: route.model, handlerExpression: handler } })
  }
  const candidateRevision = (className: string, method: string) => hash([linearize(className), lookupMethod(className, method).map(s => [s.id, s.sha256]), scopes.map(s => [s.path, s.aliases])])
  const relatedCalls = (symbolId: string, receiverClass?: string) => { const route = routes.find(r => r.id === symbolId); return scopes.flatMap(f => f.rawCalls.filter(r => route ? r.call.path === route.sourcePath && r.call.id !== route.sourceCallId && r.call.startLine >= route.startLine && r.call.endLine <= route.endLine : r.call.ownerId === symbolId).map(r => resolveCall(r, f, receiverClass))) }
  const resolveName = (text: string, sourcePath: string) => { const scope = scopes.find(f => f.path === sourcePath); return scope ? matching(qualified(text, scope)) : [] }
  return { schemaVersion: "authorization-structure-index/v1" as const, parser: "@vscode/tree-sitter-wasm@0.3.1", symbols, calls, routes, diagnostics, lookupMethod, attribute, linearize, candidateRevision, relatedCalls, resolveName,
    revision: hash([symbols, calls, routes, diagnostics]), preparation: { files: files.length, bytes: files.reduce((s, f) => s + Buffer.byteLength(f.content), 0), durationMs: performance.now() - started, targetExecutions: 0 } }
}
export type StructureIndex = Awaited<ReturnType<typeof buildStructureIndex>>
