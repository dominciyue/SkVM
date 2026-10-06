import path from "node:path"
import { createHash } from "node:crypto"
import { Parser, Language, type Node } from "@vscode/tree-sitter-wasm"
import type { DiscoverySymbol } from "./discovery.ts"
import type { FiniteValue } from "../../../task-dsl/authorization/control-evaluation.ts"

export interface StructureSymbol extends DiscoverySymbol {
  qualifiedName: string; module: string; language: "python" | "go"; className?: string; receiver?: string;
  parameters: Array<{ name: string; type?: string; defaultExpression?: string; defaultLiteralKnown?: boolean; defaultLiteralValue?: FiniteValue }>; returns: string[]; bases: string[]; attributes: Record<string, string>
}
export interface StructureCall {
  id: string; ownerId?: string; path: string; sha256: string; startLine: number; endLine: number;
  expression: string; receiver?: string; receiverClass?: string; arguments: string[]; candidateIds: string[]; resolution: "resolved" | "ambiguous" | "unresolved";
  basis: string[]; gap?: string; resultNames: string[]; syntaxRole: "condition" | "return" | "argument-default" | "body" | "source-context"
}
export interface StructureRoute { id: string; sourceCallId: string; sourcePath: string; startLine: number; endLine: number; method: string; path: string; handlerExpression: string; candidateIds: string[]; middlewareExpressions: string[]; dependencyExpressions?: string[]; model: string }
interface FileScope { path: string; sha256: string; module: string; language: "python" | "go"; aliases: Record<string, string>; moduleAliases: Record<string, string>; symbols: StructureSymbol[]; rawCalls: Array<{ call: StructureCall; types: Record<string, string>; localNames: string[]; groupPaths: string[] }>; moduleAssignments: Record<string, number>; constants: Record<string, string>; routers: Array<{ name: string; constructor: string; prefix: string; repeated: boolean }>; decorators: Array<{ callId: string; handlerId: string; receiver: string; verb: string; path: string; middleware: string[]; dependencies: Array<{ constructor: string; expression: string }>; wrapped: boolean }>; includes: Array<{ callId: string; receiver: string; child: string; prefix: string }> }
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
/** Share the existing parser runtime; only plain facts may escape the disposed tree. */
export async function withSourceSyntax<T>(content: string, language: "python" | "go", visit: (root: Node) => T): Promise<T> {
  const loaded = await languages(), parser = new Parser()
  parser.setLanguage(loaded.get(language)!)
  const tree = parser.parse(content)!
  try { return visit(tree.rootNode) } finally { tree.delete(); parser.delete() }
}
/** Finite literal syntax only; a call, field or interpolation is never evaluated. */
export function sourceLiteral(n?: Node | null): { literalKnown: boolean; literalValue?: FiniteValue } {
  if (!n) return { literalKnown: false }
  if (["expression_list", "argument_list"].includes(n.type) && children(n).length === 1) return sourceLiteral(children(n)[0])
  if (["true", "false", "none", "nil"].includes(n.type)) return { literalKnown: true, literalValue: n.text === "True" || n.text === "true" ? true : n.text === "False" || n.text === "false" ? false : null }
  if (["integer", "float", "int_literal", "float_literal"].includes(n.type) && Number.isFinite(Number(n.text))) return { literalKnown: true, literalValue: Number(n.text) }
  if (["string", "interpreted_string_literal"].includes(n.type)) { const match = /^(['"])([^'"\\\r\n]*)\1$/.exec(n.text); if (match) return { literalKnown: true, literalValue: match[2]! } }
  if (n.type === "list" || n.type === "tuple") { const values = children(n).map(sourceLiteral); if (values.length <= 64 && values.every(v => v.literalKnown && (v.literalValue === null || typeof v.literalValue !== "object"))) return { literalKnown: true, literalValue: values.map(v => v.literalValue!) as FiniteValue } }
  if (n.type === "dictionary") {
    const entries = children(n).map(p => ({ key: sourceLiteral(field(p, "key")), value: sourceLiteral(field(p, "value")) }))
    if (entries.length <= 64 && entries.every(e => typeof e.key.literalValue === "string" && e.value.literalKnown && (e.value.literalValue === null || typeof e.value.literalValue !== "object"))) return { literalKnown: true, literalValue: Object.fromEntries(entries.map(e => [e.key.literalValue, e.value.literalValue])) as FiniteValue }
  }
  return { literalKnown: false }
}
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
  const sourceIdentity = { repository: identity.repository, sourceRef: identity.sourceRef }
  const started = performance.now(), loaded = await languages(), scopes: FileScope[] = [], diagnostics: Array<{ path: string; code: string; line?: number }> = []
  for (const file of [...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) {
    const language = file.path.endsWith(".py") ? "python" : file.path.endsWith(".go") ? "go" : undefined
    if (!language) { diagnostics.push({ path: file.path, code: "structure-language-unsupported" }); continue }
    const parser = new Parser(); parser.setLanguage(loaded.get(language)!)
    const tree = parser.parse(file.content)!
    try {
      const root = tree.rootNode, sha256 = hash(file.content), module = moduleName(file.path, language), aliases: Record<string, string> = {}, moduleAliases: Record<string, string> = {}, symbols: StructureSymbol[] = []
      if (root.hasError) diagnostics.push({ path: file.path, code: "structure-parse-partial" })
      if (language === "python") for (const n of descendants(root, ["import_statement", "import_from_statement"])) {
        const from = field(n, "module_name")?.text
        const imported = children(n).filter(c => c.type === "aliased_import" || c.type === "dotted_name" && c.id !== field(n, "module_name")?.id)
        for (const v of imported) {
          const name = field(v, "name")?.text ?? v.text, alias = field(v, "alias")?.text ?? (from ? name : name.split(".")[0]!)
          const qualified = from ? `${from}.${name}` : name
          aliases[alias] = qualified.startsWith(".") ? `${module.split(".").slice(0, -1).join(".")}${qualified}` : qualified
          if (n.parent?.id === root.id) moduleAliases[alias] = aliases[alias]!
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
            const defaultNode = field(param, "value"), literal = sourceLiteral(defaultNode)
            if (name && /^[A-Za-z_]\w*$/.test(name)) parameters.push({ name, ...(field(param, "type") ? { type: field(param, "type")!.text } : {}), ...(defaultNode ? { defaultExpression: defaultNode.text, defaultLiteralKnown: literal.literalKnown, ...(literal.literalKnown ? { defaultLiteralValue: literal.literalValue! } : {}) } : {}) })
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
        const s: StructureSymbol = { id: `struct-${hash([sourceIdentity, file.path, sha256, n.startIndex, qualifiedName]).slice(0, 24)}`, path: file.path, sha256, name, qualifiedName, module, language, kind: n.type === "class_definition" || n.type === "type_spec" ? "class" : "function", startLine: n.startPosition.row + 1, endLine: n.endPosition.row + 1, boundary: n.hasError ? "uncertain" : "complete", ...(className ? { parent: className.split(".").at(-1), className } : {}), ...(receiver ? { receiver } : {}), parameters, returns: field(n, "return_type") || field(n, "result") ? [(field(n, "return_type") ?? field(n, "result"))!.text] : [], bases: children(field(n, "superclasses")).map(c => c.text), attributes }
        byNode.set(n.id, s); symbols.push(s)
      }
      const localNames = new Map<string, Set<string>>(), moduleAssignments: Record<string, number> = {}, globalNames = new Map<string, Set<string>>()
      if (language === "python") for (const n of descendants(root, ["global_statement"])) {
        let owner = n.parent; while (owner && !byNode.has(owner.id)) owner = owner.parent
        const symbol = owner && byNode.get(owner.id)
        if (symbol?.kind === "function") { const names = globalNames.get(symbol.id) ?? new Set<string>(); for (const name of children(n)) if (name.type === "identifier") names.add(name.text); globalNames.set(symbol.id, names) }
      }
      if (language === "python") for (const n of descendants(root, ["assignment", "augmented_assignment", "named_expression", "for_statement", "as_pattern", "delete_statement", "import_statement", "import_from_statement", "function_definition", "class_definition"])) {
        let owner = n.parent; while (owner && !byNode.has(owner.id)) owner = owner.parent
        const symbol = owner && byNode.get(owner.id), left = field(n, "left") ?? field(n, "name") ?? field(n, "alias")
        const names = ["import_statement", "import_from_statement"].includes(n.type) ? children(n).filter(c => c.type === "aliased_import" || c.type === "dotted_name" && c.id !== field(n, "module_name")?.id).map(c => field(c, "alias")?.text ?? (field(n, "module_name") ? field(c, "name")?.text ?? c.text : (field(c, "name")?.text ?? c.text).split(".")[0]!))
          : left?.type === "identifier" ? [left.text] : descendants(left ?? n, ["identifier"]).filter(c => n.type === "delete_statement" || left?.type === "pattern_list" || left?.type === "as_pattern_target").map(c => c.text)
        for (const name of names) if (!symbol || symbol.kind === "function" && globalNames.get(symbol.id)?.has(name)) moduleAssignments[name] = (moduleAssignments[name] ?? 0) + 1
        else if (symbol.kind === "function") { const bound = localNames.get(symbol.id) ?? new Set<string>(); bound.add(name); localNames.set(symbol.id, bound) }
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
        if (assignment && ["assignment", "short_var_declaration", "assignment_statement"].includes(assignment.type)) {
          const right = field(assignment, "right"), left = children(field(assignment, "left")).length ? children(field(assignment, "left")).map(c => c.text) : [field(assignment, "left")?.text ?? ""]
          if (right?.id === n.id || right && children(right).length === 1 && children(right)[0]?.id === n.id) resultNames.push(...left.filter(Boolean))
          else if (right?.type === "expression_list") { const i = children(right).findIndex(c => c.id === n.id); if (i >= 0 && left[i]) resultNames.push(left[i]!) }
        }
        let syntaxRole: StructureCall["syntaxRole"] = symbol ? "body" : "source-context", ancestor = n.parent
        if (owner && symbol?.kind === "function" && field(owner, "body") && n.startIndex < field(owner, "body")!.startIndex) syntaxRole = "argument-default"
        else while (ancestor && ancestor.id !== owner?.id) {
          const condition = field(ancestor, "condition")
          if (condition && condition.startIndex <= n.startIndex && condition.endIndex >= n.endIndex) { syntaxRole = "condition"; break }
          if (ancestor.type === "return_statement") { syntaxRole = "return"; break }
          ancestor = ancestor.parent
        }
        rawCalls.push({ types, localNames: language === "python" && symbol?.kind === "function" ? [...new Set([...symbol.parameters.map(p => p.name), ...localNames.get(symbol.id) ?? []])] : [], groupPaths, call: { id: `call-${hash([sourceIdentity, file.path, sha256, n.startIndex]).slice(0, 24)}`, ...(symbol ? { ownerId: symbol.id } : {}), path: file.path, sha256, startLine: n.startPosition.row + 1, endLine: n.endPosition.row + 1, expression, ...(expression.includes(".") ? { receiver: expression.slice(0, expression.lastIndexOf(".")) } : {}), arguments: args, candidateIds: [], resolution: "unresolved", basis: [], resultNames, syntaxRole } })
      }
      const constants: Record<string, string> = {}, routers: FileScope["routers"] = [], decorators: FileScope["decorators"] = [], includes: FileScope["includes"] = []
      if (language === "python") {
        const assignments = children(root).flatMap(n => n.type === "expression_statement" ? children(n).filter(c => c.type === "assignment") : [])
        const count = (name: string) => assignments.filter(n => field(n, "left")?.text === name).length
        for (const n of assignments) {
          const name = field(n, "left")?.text, value = field(n, "right")
          if (!name || !value || !/^[A-Za-z_]\w*$/.test(name)) continue
          if (count(name) === 1) constants[name] = value.text
          if (value.type === "call") routers.push({ name, constructor: field(value, "function")?.text ?? "", prefix: children(field(value, "arguments")).find(a => a.type === "keyword_argument" && field(a, "name")?.text === "prefix")?.childForFieldName("value")?.text ?? '""', repeated: count(name) !== 1 })
        }
        const verbs = new Set(["get", "post", "put", "patch", "delete", "head", "options", "trace"])
        for (const n of descendants(root, ["decorated_definition"])) {
          const fn = children(n).find(c => c.type === "function_definition"), handler = fn && byNode.get(fn.id)
          if (!handler) continue
          const ds = children(n).filter(c => c.type === "decorator")
          for (const d of ds) {
            const call = children(d).find(c => c.type === "call"), expression = call && field(call, "function")?.text, verb = expression?.split(".").at(-1)
            if (!call || !expression?.includes(".") || !verb || !verbs.has(verb)) continue
            const args = children(field(call, "arguments")), raw = rawCalls.find(r => r.call.startLine === call.startPosition.row + 1 && r.call.expression === expression)
            const dependencyNodes = [...args.filter(a => a.type === "keyword_argument" && field(a, "name")?.text === "dependencies"), ...children(field(fn!, "parameters"))]
            const dependencies = dependencyNodes.flatMap(p => descendants(p, ["call"]).map(c => ({ constructor: field(c, "function")?.text ?? "", expression: (children(field(c, "arguments")).find(a => a.type !== "keyword_argument") ?? children(field(c, "arguments")).find(a => field(a, "name")?.text === "dependency")?.childForFieldName("value"))?.text ?? "" })))
            if (raw) decorators.push({ callId: raw.call.id, handlerId: handler.id, receiver: expression.slice(0, expression.lastIndexOf(".")), verb, path: (args.find(a => a.type !== "keyword_argument") ?? args.find(a => field(a, "name")?.text === "path")?.childForFieldName("value"))?.text ?? "", middleware: dependencyNodes.filter(p => descendants(p, ["call"]).length).map(p => p.text), dependencies, wrapped: ds.length !== 1 })
          }
        }
        for (const n of descendants(root, ["call"])) {
          const expression = field(n, "function")?.text
          if (!expression?.endsWith(".include_router")) continue
          let ancestor = n.parent
          while (ancestor && !["function_definition", "class_definition", "if_statement", "for_statement", "while_statement"].includes(ancestor.type)) ancestor = ancestor.parent
          const args = children(field(n, "arguments")), raw = rawCalls.find(r => r.call.startLine === n.startPosition.row + 1 && r.call.expression === expression)
          if (raw) includes.push({ callId: raw.call.id, receiver: expression.slice(0, -".include_router".length), child: (args.find(a => a.type !== "keyword_argument") ?? args.find(a => field(a, "name")?.text === "router")?.childForFieldName("value"))?.text ?? "", prefix: ancestor ? "$dynamic" : args.find(a => field(a, "name")?.text === "prefix")?.childForFieldName("value")?.text ?? '""' })
        }
      }
      scopes.push({ path: file.path, sha256, module, language, aliases, moduleAliases, symbols, rawCalls, moduleAssignments, constants, routers, decorators, includes })
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
  const moduleQualified = (text: string, scope: FileScope) => {
    const parts = text.split("."), aliased = scope.moduleAliases[parts[0]!]
    return aliased ? [aliased, ...parts.slice(1)].join(".") : text.includes(".") ? text : `${scope.module}.${text}`
  }
  const moduleInstances = scopes.filter(s => s.language === "python").flatMap(scope => scope.routers.flatMap(r => {
    if (r.repeated || scope.moduleAssignments[r.name] !== 1 || !/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(r.constructor)) return []
    const candidates = matching(moduleQualified(r.constructor, scope)).filter(s => s.kind === "class")
    return candidates.length === 1 ? [{ name: `${scope.module}.${r.name}`, className: candidates[0]!.qualifiedName, path: scope.path, sha256: scope.sha256, classSha256: candidates[0]!.sha256 }] : []
  }))
  const instanceClass = (name: string) => {
    const exact = moduleInstances.filter(v => v.name === name), candidates = exact.length ? exact : moduleInstances.filter(v => v.name.endsWith(`.${name}`))
    return candidates.length === 1 ? candidates[0]!.className : undefined
  }
  function resolveCall(raw: FileScope["rawCalls"][number], scope: FileScope, receiverClass?: string): StructureCall {
    const call = structuredClone(raw.call), parts = call.expression.split("."), name = parts.pop()!, root = parts[0], owner = symbols.find(s => s.id === call.ownerId)
    let candidates: StructureSymbol[] = [], basis: string[] = []
    if (scope.language === "python" && /^super\(\)\.[A-Za-z_]\w*$/.test(call.expression) && owner?.className) {
      const mro = linearize(receiverClass ?? owner.className), position = mro?.indexOf(owner.className) ?? -1
      if (mro && position >= 0) for (const cls of mro.slice(position + 1)) {
        candidates = symbols.filter(s => s.className === cls && s.name === name)
        if (candidates.length) break
      }
      basis = ["AST zero-argument super after defining class in actual C3 receiver"]
      if (candidates.length && mro) call.receiverClass = mro[0]
    }
    else if (!parts.length) { candidates = matching(qualified(name, scope)).filter(s => !s.className); basis = ["AST unqualified name in module/import scope"] }
    else if (root && raw.localNames.includes(root) && !raw.types[root]) { basis = ["AST local or parameter shadows module receiver without a bound type"] }
    else if (root && (raw.types[root] || root === "self" && receiverClass)) {
      let type = root === "self" && receiverClass ? receiverClass : qualified(raw.types[root]!, scope)
      for (const p of parts.slice(1)) { const a = attribute(type, p); type = a ? qualified(a.value, a.scope) : "" }
      const classes = matching(type).filter(s => s.kind === "class")
      if (classes.length === 1) type = classes[0]!.qualifiedName
      candidates = type ? lookupMethod(type, name) : []; basis = ["AST parameter/receiver type and explicit field chain", ...(owner?.className ? ["C3 inheritance/override lookup"] : [])]
      if (candidates.length && type) call.receiverClass = type
    } else {
      candidates = matching(scope.language === "python" ? moduleQualified(call.expression, scope) : qualified(call.expression, scope)); basis = [scope.aliases[root ?? ""] ? "AST import/alias binding" : "AST qualified source binding"]
      const type = !candidates.length && scope.language === "python" && call.receiver ? instanceClass(moduleQualified(call.receiver, scope)) : undefined
      if (type) { candidates = lookupMethod(type, name); basis.push("AST unique unreassigned module constructor instance and C3 method lookup"); if (candidates.length) call.receiverClass = type }
    }
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
  const pythonScopes = scopes.filter(s => s.language === "python")
  const literal = (expression: string, scope: FileScope, seen = new Set<string>()): string | undefined => {
    const token = /^(?:([rRuU]))?(['"])([^'"\r\n]*)\2$/.exec(expression)
    if (token && (!token[3]!.includes("\\") || token[1])) return token[3]
    if (!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(expression)) return undefined
    const name = qualified(expression, scope)
    if (seen.has(name)) return undefined
    seen.add(name)
    const targets = pythonScopes.flatMap(s => Object.keys(s.constants).filter(k => `${s.module}.${k}` === name || `${s.module}.${k}`.endsWith(`.${name}`)).map(k => ({ scope: s, key: k })))
    return targets.length === 1 ? literal(targets[0]!.scope.constants[targets[0]!.key]!, targets[0]!.scope, seen) : undefined
  }
  const routerDeclarations = pythonScopes.flatMap(s => s.routers.filter(r => !r.repeated && ["fastapi.APIRouter", "fastapi.FastAPI", "fastapi.routing.APIRouter", "fastapi.applications.FastAPI"].includes(qualified(r.constructor, s))).map(r => ({ name: `${s.module}.${r.name}`, prefix: literal(r.prefix, s) })))
  const routerNames = (name: string) => { const exact = routerDeclarations.filter(r => r.name === name); return (exact.length ? exact : routerDeclarations.filter(r => r.name.endsWith(`.${name}`))).map(r => r.name) }
  const mounts = pythonScopes.flatMap(s => s.includes.map(i => { const parents = routerNames(qualified(i.receiver, s)), children = routerNames(qualified(i.child, s)); return { ...i, parent: parents.length === 1 ? parents[0]! : "$unresolved", childNames: children, prefixValue: children.length === 1 ? literal(i.prefix, s) : undefined } }))
  const prefixes = (name: string, active = new Set<string>()): string[] | undefined => {
    const router = routerDeclarations.find(r => r.name === name)
    if (!router || router.prefix === undefined || active.has(name)) return undefined
    const parents = mounts.filter(m => m.childNames.includes(name))
    if (!parents.length) return [router.prefix]
    const next = new Set(active).add(name), paths: string[] = []
    for (const parent of parents) {
      const values = prefixes(parent.parent, next)
      if (!values || parent.prefixValue === undefined) return undefined
      paths.push(...values.map(p => p + parent.prefixValue + router.prefix))
    }
    return paths
  }
  for (const scope of pythonScopes) for (const d of scope.decorators) {
    const c = scope.rawCalls.find(r => r.call.id === d.callId)!.call, names = routerNames(qualified(d.receiver, scope)), routerName = names.length === 1 ? names[0]! : "$unresolved", router = routerDeclarations.find(r => r.name === routerName), ps = prefixes(routerName), value = literal(d.path, scope)
    const code = !router ? "route-router-unresolved" : !ps ? "route-prefix-dynamic" : value === undefined ? "route-path-dynamic" : d.wrapped ? "route-wrapper-unresolved" : undefined
    if (code) { diagnostics.push({ path: scope.path, line: c.startLine, code }); continue }
    const handler = symbols.find(s => s.id === d.handlerId)!
    for (const [mount, prefix] of ps!.entries()) {
      const route: StructureRoute = { id: `route-${hash([c.id, prefix, mount]).slice(0, 24)}`, sourceCallId: c.id, sourcePath: scope.path, startLine: c.startLine, endLine: c.endLine, method: d.verb.toUpperCase(), path: prefix + value!, handlerExpression: handler.name, candidateIds: [handler.id], middlewareExpressions: d.middleware, dependencyExpressions: d.dependencies.filter(dep => ["fastapi.Depends", "fastapi.params.Depends", "fastapi.Security", "fastapi.params.Security"].includes(qualified(dep.constructor, scope)) && /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(dep.expression)).map(dep => dep.expression), model: "fastapi-source-router/v1" }
      routes.push(route)
      symbols.push({ id: route.id, path: c.path, sha256: c.sha256, name: `${route.method} ${route.path}`, qualifiedName: `${scope.module}.route@${c.startLine}`, module: scope.module, language: scope.language, kind: "function", startLine: c.startLine, endLine: c.endLine, boundary: "complete", parameters: [], returns: [], bases: [], attributes: { routeModel: route.model, handlerExpression: handler.name } })
    }
  }
  for (const scope of scopes) for (const raw of scope.rawCalls) {
    const c = raw.call, verb = c.expression.split(".").at(-1)!.trim(), goRoute = scope.language === "go" && ["Get", "Post", "Put", "Patch", "Delete", "Head", "Options"].includes(verb), drf = scope.language === "python" && verb === "register"
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
  const candidateRevision = (className: string, method: string) => hash([linearize(className), lookupMethod(className, method).map(s => [s.id, s.sha256]), scopes.map(s => [s.path, s.aliases]), moduleInstances])
  const relatedCalls = (symbolId: string, receiverClass?: string) => { const route = routes.find(r => r.id === symbolId); return scopes.flatMap(f => f.rawCalls.filter(r => route ? r.call.path === route.sourcePath && r.call.id !== route.sourceCallId && r.call.startLine >= route.startLine && r.call.endLine <= route.endLine : r.call.ownerId === symbolId).map(r => resolveCall(r, f, receiverClass))) }
  const resolveName = (text: string, sourcePath: string) => { const scope = scopes.find(f => f.path === sourcePath); return scope ? matching(qualified(text, scope)) : [] }
  const parserVersion = "@vscode/tree-sitter-wasm@0.3.1", relationshipVersion = "source-bindings/v4"
  const withSymbolSyntax = <T>(symbolId: string, visit: (root: Node, symbol: StructureSymbol) => T): Promise<T> => {
    const symbol = symbols.find(s => s.id === symbolId), file = symbol && files.find(f => f.path === symbol.path)
    if (!symbol || !file || hash(file.content) !== symbol.sha256) throw new Error("structure-source-missing")
    return withSourceSyntax(file.content, symbol.language, root => visit(root, symbol))
  }
  return { schemaVersion: "authorization-structure-index/v1" as const, parser: parserVersion, relationshipVersion, symbols, calls, routes, diagnostics, lookupMethod, attribute, linearize, candidateRevision, relatedCalls, resolveName, withSymbolSyntax,
    revision: hash([sourceIdentity, parserVersion, relationshipVersion, symbols, calls, routes, diagnostics]), preparation: { files: files.length, bytes: files.reduce((s, f) => s + Buffer.byteLength(f.content), 0), durationMs: performance.now() - started, targetExecutions: 0 } }
}
export type StructureIndex = Awaited<ReturnType<typeof buildStructureIndex>>
