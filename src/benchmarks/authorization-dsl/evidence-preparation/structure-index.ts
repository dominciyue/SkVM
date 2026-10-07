import path from "node:path"
import { createHash } from "node:crypto"
import { Parser, Language, type Node } from "@vscode/tree-sitter-wasm"
import type { DiscoverySymbol } from "./discovery.ts"
import type { FiniteValue } from "../../../task-dsl/authorization/control-evaluation.ts"

export interface StructureSymbol extends DiscoverySymbol {
  qualifiedName: string; module: string; language: "python" | "go"; className?: string; receiver?: string;
  parameters: Array<{ name: string; type?: string; defaultExpression?: string; defaultLiteralKnown?: boolean; defaultLiteralValue?: FiniteValue }>; returns: string[]; bases: string[]; attributes: Record<string, string>
  decorators?: Array<{ id: string; sourceCallId?: string; expression: string; startLine: number; endLine: number; arguments: Array<{ parameter?: string; expression: string; literalKnown: boolean; literalValue?: FiniteValue }> }>
}
export interface StructureCall {
  id: string; ownerId?: string; path: string; sha256: string; startLine: number; endLine: number;
  expression: string; receiver?: string; receiverClass?: string; arguments: string[]; candidateIds: string[]; resolution: "resolved" | "ambiguous" | "unresolved";
  basis: string[]; gap?: string; resultNames: string[]; syntaxRole: "condition" | "return" | "argument-default" | "body" | "source-context"
  receiverBinding?: { schemaVersion: "source-module-instance/v1"; name: string; className: string; classSha256: string; source: { path: string; sha256: string; startLine: number; endLine: number } }
}
export interface StructureRoute { id: string; sourceCallId: string; sourcePath: string; startLine: number; endLine: number; method: string; path: string; handlerExpression: string; candidateIds: string[]; middlewareExpressions: string[]; dependencyExpressions?: string[]; dependencyCallIds?: string[]; bindingGap?: string; bindingSources?: Array<{ path: string; sha256: string; startLine: number; endLine: number }>; model: string }
export interface StructureRequestDependency {
  id: string; sourceCallId: string; ownerId: string; parameter?: string; constructor: string; expression: string; candidateIds: string[];
  resolution: "resolved" | "ambiguous" | "unresolved"; model: "fastapi-source-injection/v1"; gap?: string;
}
export interface StructureRequestMiddleware {
  id: string; sourceCallId: string; routerName: string; expression: string; qualifiedName: string; arguments: string[];
  source: { path: string; sha256: string; startLine: number; endLine: number };
  registrationContext: Array<{ kind: string; expression: string; startLine: number; endLine: number }>;
  candidateIds: string[]; receiverClass?: string; methodCandidates: Array<{ method: string; candidateId: string }>;
  sources: Array<{ id: string; path: string; sha256: string }>; registrationBinding: "resolved" | "possible"; executionOrder: "unproven"; model: "fastapi-source-asgi/v1"; gap?: string;
}
export interface StructureRequestAction {
  id: string; receiverClass: string; actionName: string; sourceId: string; sourceCallId: string; constructor: string; arguments: string[];
  source: { path: string; sha256: string; startLine: number; endLine: number }; detail?: boolean; urlPath?: string;
  methodMappings: Array<{ method: string; actionName: string; candidateIds: string[]; declarationId: string; sourceId: string }>;
  routeIds: string[]; sourceCandidates: Array<{ role: string; candidateId: string; receiverClass?: string }>;
  sources: Array<{ id: string; path: string; sha256: string }>; mappingBinding: "unproven"; invocation: "unproven"; model: "drf-source-action/v1"; gap?: string;
}
interface FileScope { path: string; sha256: string; module: string; language: "python" | "go"; aliases: Record<string, string>; moduleAliases: Record<string, string>; symbols: StructureSymbol[]; rawCalls: Array<{ call: StructureCall; types: Record<string, string>; localNames: string[]; groupPaths: string[]; registrationContext: StructureRequestMiddleware["registrationContext"] }>; routerAliases: Array<{ name: string; value: string; ownerId?: string; localNames: string[] }>; moduleAssignments: Record<string, number>; moduleAttributeWrites: string[]; constants: Record<string, string>; routers: Array<{ name: string; constructor: string; prefix: string; repeated: boolean; requestOptionsUnmodeled: boolean; startLine: number; endLine: number }>; decorators: Array<{ callId: string; handlerId: string; receiver: string; verb: string; path: string; middleware: string[]; dependencies: Array<{ constructor: string; expression: string; sourceCallId: string; parameter?: string }>; wrapped: boolean }>; includes: Array<{ callId: string; receiver: string; child: string; prefix: string; requestOptionsUnmodeled: boolean }> }
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
  const started = performance.now(), loaded = await languages(), scopes: FileScope[] = [], diagnostics: Array<{ path: string; code: string; line?: number; handlerId?: string }> = []
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
        if (language === "python") {
          const declaration = n.parent?.type === "decorated_definition" ? n.parent : n
          attributes.moduleBinding = declaration.parent?.id === root.id ? "unconditional" : "conditional-or-nested"
          if (n.parent?.type === "decorated_definition") attributes.bindingWrapped = "true"
        }
        if (language === "python" && n.parent?.type === "decorated_definition" && children(n.parent).some(d => d.type === "decorator" && d.text.trim() === "@staticmethod")) attributes.methodBinding = "static"
        if (language === "python" && name === "__class_getitem__" && !n.hasError && !n.children.some(c => c?.type === "async") && n.parent?.type !== "decorated_definition") {
          const body = children(field(n, "body")).filter(s => s.type !== "comment" && !(s.type === "expression_statement" && children(s).every(v => v.type === "string")))
          if (body.length === 1 && body[0]!.type === "return_statement" && children(body[0]!).length === 1 && children(body[0]!)[0]!.type === "identifier" && children(body[0]!)[0]!.text === parameters[0]?.name) attributes.subscriptionClassIdentity = "source-return-only/v1"
        }
        if (n.type === "class_definition") for (const statement of children(field(n, "body"))) for (const assignment of statement.type === "expression_statement" ? children(statement).filter(c => c.type === "assignment") : []) {
          const key = field(assignment, "left")?.text, value = field(assignment, "right")?.text; if (key && value) attributes[key] = value
        }
        if (n.type === "type_spec") for (const declaration of descendants(n, ["field_declaration"])) {
          const type = field(declaration, "type")?.text
          for (const key of children(declaration).filter(c => c.type === "field_identifier")) if (type) attributes[key.text] = type
        }
        const s: StructureSymbol = { id: `struct-${hash([sourceIdentity, file.path, sha256, n.startIndex, qualifiedName]).slice(0, 24)}`, path: file.path, sha256, name, qualifiedName, module, language, kind: n.type === "class_definition" || n.type === "type_spec" ? "class" : "function", startLine: n.startPosition.row + 1, endLine: n.endPosition.row + 1, boundary: n.hasError ? "uncertain" : "complete", ...(className ? { parent: className.split(".").at(-1), className } : {}), ...(receiver ? { receiver } : {}), parameters, returns: field(n, "return_type") || field(n, "result") ? [(field(n, "return_type") ?? field(n, "result"))!.text] : [], bases: children(field(n, "superclasses")).map(c => c.text), attributes }
        if (language === "python" && n.type === "function_definition" && n.parent?.type === "decorated_definition") s.decorators = children(n.parent).filter(d => d.type === "decorator").map(d => {
          const expression = children(d)[0]!, call = expression.type === "call" ? expression : undefined
          return { id: `decorator-${hash([sourceIdentity, file.path, sha256, d.startIndex]).slice(0, 24)}`, ...(call ? { sourceCallId: `call-${hash([sourceIdentity, file.path, sha256, call.startIndex]).slice(0, 24)}` } : {}), expression: call ? field(call, "function")!.text : expression.text, startLine: d.startPosition.row + 1, endLine: d.endPosition.row + 1, arguments: children(call && field(call, "arguments")).map(a => { const value = a.type === "keyword_argument" ? field(a, "value")! : a, literal = sourceLiteral(value); return { ...(a.type === "keyword_argument" ? { parameter: field(a, "name")!.text } : {}), expression: value.text, ...literal } }) }
        })
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
      const moduleAttributeWrites: string[] = [], routerAliases: FileScope["routerAliases"] = []
      if (language === "python") for (const n of descendants(root, ["assignment", "augmented_assignment", "delete_statement"])) {
        let owner = n.parent; while (owner && !byNode.has(owner.id)) owner = owner.parent
        const symbol = owner && byNode.get(owner.id), target = field(n, "left")
        const value = field(n, "right")
        if (n.type === "assignment" && target?.type === "identifier" && value && /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(value.text)) routerAliases.push({ name: target.text, value: value.text, ...(symbol && !globalNames.get(symbol.id)?.has(target.text) ? { ownerId: symbol.id } : {}), localNames: symbol?.kind === "function" ? [...new Set([...symbol.parameters.map(p => p.name), ...localNames.get(symbol.id) ?? []])] : [] })
        for (let left of n.type === "delete_statement" ? children(n) : target ? [target] : []) {
          while (left.type === "subscript" && field(left, "value")) left = field(left, "value")!
          if (left.type !== "attribute" || !/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+$/.test(left.text)) continue
          const [rootName, ...parts] = left.text.split("."), imported = moduleAliases[rootName!] ?? (moduleAssignments[rootName!] ? `${module}.${rootName}` : undefined)
          if (!imported || symbol?.kind === "function" && !globalNames.get(symbol.id)?.has(rootName!) && (symbol.parameters.some(p => p.name === rootName) || localNames.get(symbol.id)?.has(rootName!))) continue
          moduleAttributeWrites.push([imported, ...parts].join("."))
        }
      }
      const rawCalls: FileScope["rawCalls"] = []
      for (const n of descendants(root, language === "python" ? ["call"] : ["call_expression"])) {
        const fn = field(n, "function"); if (!fn) continue
        let owner = n.parent; while (owner && !byNode.has(owner.id)) owner = owner.parent
        const symbol = owner && byNode.get(owner.id), types: Record<string, string> = {}
        for (const p of symbol?.parameters ?? []) if (p.type) types[p.name] = p.type
        if (symbol?.className && language === "python") types.self = symbol.className
        const boundedText = (c: Node) => c.type === "function_literal" || c.type === "lambda" ? `source-function-body@${c.startPosition.row + 1}-${c.endPosition.row + 1}` : c.text.length > 500 ? `${c.text.slice(0, 500)} [structure-text-truncated]` : c.text
        const expression = fn.text, args = children(field(n, "arguments")).map(boundedText), resultNames: string[] = [], groupPaths: string[] = [], registrationContext: StructureRequestMiddleware["registrationContext"] = []
        let surrounding = n.parent
        while (surrounding) {
          if (surrounding.type === "call_expression" && field(surrounding, "function")?.text.endsWith(".Group")) { const p = children(field(surrounding, "arguments"))[0]; if (p && /^"[^"\n]*"$/.test(p.text)) groupPaths.unshift(JSON.parse(p.text)) }
          if (["if_statement", "elif_clause", "else_clause", "try_statement", "except_clause", "finally_clause", "with_statement", "for_statement", "while_statement", "function_definition"].includes(surrounding.type)) registrationContext.unshift({ kind: surrounding.type, expression: field(surrounding, "condition")?.text ?? field(surrounding, "name")?.text ?? field(surrounding, "value")?.text ?? "", startLine: surrounding.startPosition.row + 1, endLine: surrounding.endPosition.row + 1 })
          surrounding = surrounding.parent
        }
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
        rawCalls.push({ types, localNames: language === "python" && symbol?.kind === "function" ? [...new Set([...symbol.parameters.map(p => p.name), ...localNames.get(symbol.id) ?? []])] : [], groupPaths, registrationContext, call: { id: `call-${hash([sourceIdentity, file.path, sha256, n.startIndex]).slice(0, 24)}`, ...(symbol ? { ownerId: symbol.id } : {}), path: file.path, sha256, startLine: n.startPosition.row + 1, endLine: n.endPosition.row + 1, expression, ...(expression.includes(".") ? { receiver: expression.slice(0, expression.lastIndexOf(".")) } : {}), arguments: args, candidateIds: [], resolution: "unresolved", basis: [], resultNames, syntaxRole } })
      }
      const constants: Record<string, string> = {}, routers: FileScope["routers"] = [], decorators: FileScope["decorators"] = [], includes: FileScope["includes"] = []
      if (language === "python") {
        const requestOptionsUnmodeled = (arguments_: Node[]) => arguments_.some(a => a.type === "dictionary_splat" || a.type === "keyword_argument" && ["dependencies", "route_class", "middleware", "dependency_overrides_provider"].includes(field(a, "name")?.text ?? ""))
        const assignments = children(root).flatMap(n => n.type === "expression_statement" ? children(n).filter(c => c.type === "assignment") : [])
        const count = (name: string) => assignments.filter(n => field(n, "left")?.text === name).length
        for (const n of assignments) {
          const name = field(n, "left")?.text, value = field(n, "right")
          if (!name || !value || !/^[A-Za-z_]\w*$/.test(name)) continue
          if (count(name) === 1) constants[name] = value.text
          if (value.type === "call") { const args = children(field(value, "arguments")); routers.push({ name, constructor: field(value, "function")?.text ?? "", prefix: args.find(a => a.type === "keyword_argument" && field(a, "name")?.text === "prefix")?.childForFieldName("value")?.text ?? '""', repeated: count(name) !== 1, requestOptionsUnmodeled: requestOptionsUnmodeled(args), startLine: n.startPosition.row + 1, endLine: n.endPosition.row + 1 }) }
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
            const dependencies = dependencyNodes.flatMap(p => descendants(p, ["call"]).map(c => ({ constructor: field(c, "function")?.text ?? "", expression: (children(field(c, "arguments")).find(a => a.type !== "keyword_argument") ?? children(field(c, "arguments")).find(a => field(a, "name")?.text === "dependency")?.childForFieldName("value"))?.text ?? "", sourceCallId: `call-${hash([sourceIdentity, file.path, sha256, c.startIndex]).slice(0, 24)}`, ...(p.type !== "keyword_argument" ? { parameter: field(p, "name")?.text ?? children(p)[0]?.text } : {}) })))
            if (raw) decorators.push({ callId: raw.call.id, handlerId: handler.id, receiver: expression.slice(0, expression.lastIndexOf(".")), verb, path: (args.find(a => a.type !== "keyword_argument") ?? args.find(a => field(a, "name")?.text === "path")?.childForFieldName("value"))?.text ?? "", middleware: dependencyNodes.filter(p => descendants(p, ["call"]).length).map(p => p.text), dependencies, wrapped: ds.length !== 1 })
          }
        }
        for (const n of descendants(root, ["call"])) {
          const expression = field(n, "function")?.text
          const method = expression?.split(".").at(-1)
          if (!expression || !["include_router", "mount"].includes(method ?? "")) continue
          let ancestor = n.parent
          while (ancestor && !["function_definition", "class_definition", "if_statement", "for_statement", "while_statement"].includes(ancestor.type)) ancestor = ancestor.parent
          const args = children(field(n, "arguments")), raw = rawCalls.find(r => r.call.startLine === n.startPosition.row + 1 && r.call.expression === expression)
          if (raw) includes.push({ callId: raw.call.id, receiver: expression.slice(0, expression.lastIndexOf(".")), child: (args.filter(a => a.type !== "keyword_argument")[method === "mount" ? 1 : 0] ?? args.find(a => field(a, "name")?.text === (method === "mount" ? "app" : "router"))?.childForFieldName("value"))?.text ?? "", prefix: ancestor || method === "mount" ? "$dynamic" : args.find(a => field(a, "name")?.text === "prefix")?.childForFieldName("value")?.text ?? '""', requestOptionsUnmodeled: requestOptionsUnmodeled(args) })
        }
      }
      scopes.push({ path: file.path, sha256, module, language, aliases, moduleAliases, symbols, rawCalls, routerAliases, moduleAssignments, moduleAttributeWrites, constants, routers, decorators, includes })
    } finally { tree.delete(); parser.delete() }
  }
  const symbols = scopes.flatMap(f => f.symbols), scopeFor = (s: StructureSymbol) => scopes.find(f => f.path === s.path)!
  const qualified = (text: string, scope: FileScope) => {
    const value = cleanType(text), parts = value.split("."), aliased = scope.aliases[parts[0]!]
    return aliased ? [aliased, ...parts.slice(1)].join(".") : value.includes(".") ? value : `${scope.module}.${value}`.replace(/^\./, "")
  }
  const stableSourceBinding = (text: string, scope: FileScope, descendantWrites = true) => {
    const name = qualified(text, scope), root = cleanType(text).split(".")[0]!
    const unconditional = Object.hasOwn(scope.moduleAliases, root) || !Object.hasOwn(scope.aliases, root) && (Object.hasOwn(scope.constants, root) || scope.symbols.some(s => s.qualifiedName === `${scope.module}.${root}` && s.attributes.moduleBinding === "unconditional"))
    return unconditional && scope.moduleAssignments[root] === 1 && !scopes.some(s => s.moduleAttributeWrites.some(write => write === name || descendantWrites && write.startsWith(`${name}.`) || name.startsWith(`${write}.`)))
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
    const bases = cls[0]!.bases.map(b => qualifyBase(b, scopeFor(cls[0]!), [...active, name])), lists = bases.map(b => linearize(b, [...active, name]))
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
  function qualifyBase(text: string, scope: FileScope, active: string[]) {
    const unknown = qualified(text, scope), match = /^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\[([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*(?:\s*,\s*[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)*)\]$/.exec(text)
    if (!match || !stableSourceBinding(match[1]!, scope)) return unknown
    const classes = matching(qualified(match[1]!, scope)).filter(s => s.kind === "class")
    if (classes.length !== 1) return unknown
    const cls = classes[0]!, owners = linearize(cls.qualifiedName, active)
    if (!owners || owners.some(owner => /[=\[\]()]/.test(owner) || matching(owner).filter(s => s.kind === "class").some(s => s.attributes.bindingWrapped || Object.hasOwn(s.attributes, "__class_getitem__") || !stableSourceBinding(s.name, scopeFor(s))))) return unknown
    for (const owner of owners) {
      const methods = symbols.filter(s => s.className === owner && s.name === "__class_getitem__")
      if (methods.length) return methods.length === 1 && methods[0]!.attributes.subscriptionClassIdentity === "source-return-only/v1" ? cls.qualifiedName : unknown
    }
    return unknown
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
    return candidates.length === 1 ? [{ name: `${scope.module}.${r.name}`, className: candidates[0]!.qualifiedName, path: scope.path, sha256: scope.sha256, classSha256: candidates[0]!.sha256, source: { path: scope.path, sha256: scope.sha256, startLine: r.startLine, endLine: r.endLine } }] : []
  })).filter(instance => !scopes.some(scope => scope.moduleAttributeWrites.some(write => instance.name === write || instance.name.endsWith(`.${write}`) || write.startsWith(`${instance.name}.`) || instance.name.split(".").some((_, i, parts) => write.startsWith(`${parts.slice(i).join(".")}.`)))))
  const instanceBinding = (name: string) => {
    const exact = moduleInstances.filter(v => v.name === name), candidates = exact.length ? exact : moduleInstances.filter(v => v.name.endsWith(`.${name}`))
    return candidates.length === 1 ? candidates[0] : undefined
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
    } else if (scope.language === "python" && root && scope.moduleAliases[root] && scope.moduleAssignments[root] !== 1) {
      basis = ["AST module import alias is reassigned; the original instance is not a current receiver proof"]
    } else {
      candidates = matching(scope.language === "python" ? moduleQualified(call.expression, scope) : qualified(call.expression, scope)); basis = [scope.aliases[root ?? ""] ? "AST import/alias binding" : "AST qualified source binding"]
      const instance = !candidates.length && scope.language === "python" && call.receiver ? instanceBinding(moduleQualified(call.receiver, scope)) : undefined
      if (instance) {
        candidates = lookupMethod(instance.className, name); basis.push("AST unique unreassigned module constructor instance and C3 method lookup")
        if (candidates.length === 1) { call.receiverClass = instance.className; call.receiverBinding = { schemaVersion: "source-module-instance/v1", name: instance.name, className: instance.className, classSha256: instance.classSha256, source: instance.source } }
        else if (candidates.length) call.receiverClass = instance.className
      }
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
  const routerDeclarations = pythonScopes.flatMap(s => s.routers.filter(r => !r.repeated && ["fastapi.APIRouter", "fastapi.FastAPI", "fastapi.routing.APIRouter", "fastapi.applications.FastAPI"].includes(qualified(r.constructor, s))).map(r => ({ name: `${s.module}.${r.name}`, prefix: literal(r.prefix, s), requestOptionsUnmodeled: r.requestOptionsUnmodeled, stable: stableSourceBinding(r.constructor, s) && stableSourceBinding(r.name, s, false), source: { path: s.path, sha256: s.sha256, startLine: r.startLine, endLine: r.endLine } })))
  const routerNames = (name: string) => { const exact = routerDeclarations.filter(r => r.name === name); return (exact.length ? exact : routerDeclarations.filter(r => r.name.endsWith(`.${name}`))).map(r => r.name) }
  const routerAliasEntries = pythonScopes.flatMap(scope => scope.routerAliases.filter(alias => !alias.ownerId).map(alias => ({ alias, scope, name: `${scope.module}.${alias.name}` })))
  const matchingRouterAliases = (name: string) => {
    const exact = routerAliasEntries.filter(a => a.name === name)
    return exact.length ? exact : routerAliasEntries.filter(a => a.name.endsWith(`.${name}`))
  }
  // Potential aliases are conservative modification leads, never new route proofs.
  const routerReferences = (text: string, scope: FileScope, ownerId?: string, localNames: string[] = [], active = new Set<string>()): string[] => {
    if (!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(text)) return []
    const key = `${scope.path}:${ownerId ?? ""}:${text}`; if (active.has(key)) return []
    const next = new Set(active).add(key), [root, ...parts] = text.split("."), local = !!ownerId && localNames.includes(root!)
    const localAliases = local ? scope.routerAliases.filter(a => a.ownerId === ownerId && a.name === root) : []
    if (local) return [...new Set(localAliases.flatMap(a => routerReferences([a.value, ...parts].join("."), scope, ownerId, a.localNames, next)))]
    const name = qualified(text, scope), direct = routerNames(name), aliases = matchingRouterAliases(name)
    return [...new Set([...direct, ...aliases.flatMap(({ alias, scope: source }) => routerReferences(alias.value, source, undefined, [], next))])]
  }
  const routerReferenceProof = (text: string, scope: FileScope, active = new Set<string>()): string | undefined => {
    const key = `${scope.path}:${text}`; if (active.has(key) || !stableSourceBinding(text, scope, false)) return undefined
    const next = new Set(active).add(key), name = qualified(text, scope), direct = routerNames(name)
    if (direct.length) return direct.length === 1 && routerDeclarations.find(r => r.name === direct[0])?.stable ? direct[0] : undefined
    const aliases = matchingRouterAliases(name)
    if (aliases.length !== 1 || aliases[0]!.scope.constants[aliases[0]!.alias.name] !== aliases[0]!.alias.value) return undefined
    return routerReferenceProof(aliases[0]!.alias.value, aliases[0]!.scope, next)
  }
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
  const routerModifications = new Map<string, Array<{ call: StructureCall; gap: string; scope: FileScope; registrationBinding: StructureRequestMiddleware["registrationBinding"]; registrationContext: StructureRequestMiddleware["registrationContext"] }>>()
  for (const scope of scopes) for (const raw of scope.rawCalls) {
      const receiver = raw.call.receiver, method = raw.call.expression.split(".").at(-1)!
      if (!receiver) continue
      const override = receiver.endsWith(".dependency_overrides") && ["update", "clear", "setdefault", "pop", "popitem", "__setitem__", "__delitem__"].includes(method)
      if (!override && !["add_middleware", "middleware", "add_api_route", "add_route"].includes(method)) continue
      const owner = override ? receiver.slice(0, -".dependency_overrides".length) : receiver
      const proof = raw.localNames.includes(owner.split(".")[0]!) ? undefined : routerReferenceProof(owner, scope)
      for (const name of routerReferences(owner, scope, raw.call.ownerId, raw.localNames)) routerModifications.set(name, [...routerModifications.get(name) ?? [], { call: raw.call, gap: proof !== name ? "framework-router-alias-unresolved" : override ? "framework-dependency-overrides-unmodeled" : "framework-router-options-unmodeled", scope, registrationBinding: proof === name ? "resolved" : "possible", registrationContext: raw.registrationContext }])
  }
  const routeBindingSources = (name: string, active = new Set<string>()): { stable: boolean; gap?: string; sources: NonNullable<StructureRoute["bindingSources"]> } => {
    const router = routerDeclarations.find(r => r.name === name)
    if (!router || active.has(name)) return { stable: false, sources: [] }
    const next = new Set(active).add(name), parents = mounts.filter(m => m.childNames.includes(name)), ancestors = parents.map(parent => routeBindingSources(parent.parent, next))
    const overridden = scopes.some(s => s.moduleAttributeWrites.some(write => write.endsWith(".dependency_overrides") && routerNames(write.slice(0, -".dependency_overrides".length)).includes(name))), modifications = routerModifications.get(name) ?? []
    const gap = router.requestOptionsUnmodeled || parents.some(p => p.requestOptionsUnmodeled) ? "framework-router-options-unmodeled" : overridden ? "framework-dependency-overrides-unmodeled" : modifications[0]?.gap ?? ancestors.find(a => a.gap)?.gap
    return { stable: router.stable && ancestors.every(a => a.stable) && parents.every(parent => { const scope = scopes.find(s => s.rawCalls.some(c => c.call.id === parent.callId))!; return stableSourceBinding(`${parent.receiver}.include_router`, scope) && stableSourceBinding(parent.child, scope, false) }), ...(gap ? { gap } : {}), sources: [router.source, ...ancestors.flatMap(a => a.sources), ...parents.flatMap(parent => { const call = calls.find(c => c.id === parent.callId); return call ? [{ path: call.path, sha256: call.sha256, startLine: call.startLine, endLine: call.endLine }] : [] }), ...modifications.map(({ call }) => ({ path: call.path, sha256: call.sha256, startLine: call.startLine, endLine: call.endLine }))] }
  }
  const routeRouters = new Map<string, string>()
  for (const scope of pythonScopes) for (const d of scope.decorators) {
    const c = scope.rawCalls.find(r => r.call.id === d.callId)!.call, names = routerNames(qualified(d.receiver, scope)), routerName = names.length === 1 ? names[0]! : "$unresolved", router = routerDeclarations.find(r => r.name === routerName), ps = prefixes(routerName), value = literal(d.path, scope)
    const code = !router ? "route-router-unresolved" : !ps ? "route-prefix-dynamic" : value === undefined ? "route-path-dynamic" : d.wrapped ? "route-wrapper-unresolved" : undefined
    if (code) { diagnostics.push({ path: scope.path, line: c.startLine, code, handlerId: d.handlerId }); continue }
    const handler = symbols.find(s => s.id === d.handlerId)!
    const binding = routeBindingSources(routerName), raw = scope.rawCalls.find(r => r.call.id === d.callId)!, receiverRoot = d.receiver.split(".")[0]!, owner = symbols.find(s => s.id === raw.call.ownerId)
    const bindingGap = binding.gap ?? (!binding.stable || !stableSourceBinding(`${d.receiver}.${d.verb}`, scope) || raw.localNames.includes(receiverRoot) || owner?.kind === "class" && Object.hasOwn(owner.attributes, receiverRoot) ? "framework-route-binding-unresolved" : undefined)
    for (const [mount, prefix] of ps!.entries()) {
      const route: StructureRoute = { id: `route-${hash([c.id, prefix, mount]).slice(0, 24)}`, sourceCallId: c.id, sourcePath: scope.path, startLine: c.startLine, endLine: c.endLine, method: d.verb.toUpperCase(), path: prefix + value!, handlerExpression: handler.name, candidateIds: [handler.id], middlewareExpressions: d.middleware, dependencyExpressions: d.dependencies.filter(dep => ["fastapi.Depends", "fastapi.params.Depends", "fastapi.Security", "fastapi.params.Security"].includes(qualified(dep.constructor, scope)) && /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(dep.expression)).map(dep => dep.expression), dependencyCallIds: d.dependencies.filter(dep => !dep.parameter).map(dep => dep.sourceCallId), bindingSources: binding.sources, ...(bindingGap ? { bindingGap } : {}), model: "fastapi-source-router/v1" }
      routes.push(route)
      routeRouters.set(route.id, routerName)
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
    if (drf) {
      const receiver = c.receiver && !raw.localNames.includes(c.receiver.split(".")[0]!) ? instanceBinding(moduleQualified(c.receiver, scope)) : undefined
      if (!receiver || !linearize(receiver.className)?.includes("rest_framework.routers.BaseRouter") || !stableSourceBinding(c.receiver!, scope, false) || !stableSourceBinding(handler, scope) || raw.registrationContext.length || c.arguments.some(a => /^\*/.test(a))) route.bindingGap = "framework-drf-router-binding-unresolved"
    }
    routes.push(route)
    symbols.push({ id: route.id, path: c.path, sha256: c.sha256, name: `${route.method} ${route.path}`, qualifiedName: `${scope.module}.route@${c.startLine}`, module: scope.module, language: scope.language, kind: "function", startLine: c.startLine, endLine: c.endLine, boundary: "complete", parameters: [], returns: [], bases: [], attributes: { routeModel: route.model, handlerExpression: handler } })
  }
  const candidateRevision = (className: string, method: string) => {
    const mro = linearize(className), owners = [className, ...(mro ?? [])]
    const relevant = scopes.filter(s => owners.some(name => name === s.module || name.startsWith(`${s.module}.`)))
    return hash([mro, lookupMethod(className, method).map(s => [s.id, s.sha256]), relevant.map(s => [s.path, s.aliases]), moduleInstances.filter(i => owners.includes(i.className) || relevant.some(s => s.path === i.path))])
  }
  const relatedCalls = (symbolId: string, receiverClass?: string) => { const route = routes.find(r => r.id === symbolId); return scopes.flatMap(f => f.rawCalls.filter(r => route ? r.call.path === route.sourcePath && r.call.id !== route.sourceCallId && r.call.startLine >= route.startLine && r.call.endLine <= route.endLine : r.call.ownerId === symbolId).map(r => resolveCall(r, f, receiverClass))) }
  const resolveName = (text: string, sourcePath: string) => { const scope = scopes.find(f => f.path === sourcePath); return scope ? matching(qualified(text, scope)) : [] }
  const qualifySourceName = (text: string, sourcePath: string) => { const scope = scopes.find(f => f.path === sourcePath); return scope && stableSourceBinding(text, scope) ? qualified(text, scope) : undefined }
  const requestDependencies = (symbolId: string): StructureRequestDependency[] => {
    const symbol = symbols.find(s => s.id === symbolId), route = routes.find(r => r.id === symbolId), scope = symbol && scopeFor(symbol)
    if (!symbol || !scope || symbol.language !== "python" || symbol.className) return []
    const selected: Array<{ call: StructureCall; parameter?: string; syntaxGap?: string }> = [], used = new Set<string>()
    if (route) for (const id of route.dependencyCallIds ?? []) { const call = scope.rawCalls.find(r => r.call.id === id)?.call; if (call) selected.push({ call }) }
    else for (const parameter of symbol.parameters) {
      const call = scope.rawCalls.find(r => r.call.ownerId === symbolId && r.call.syntaxRole === "argument-default" && !used.has(r.call.id) && `${r.call.expression}(${r.call.arguments.join(",")})`.replace(/\s/g, "") === parameter.defaultExpression?.replace(/\s/g, ""))?.call
      if (call) { used.add(call.id); selected.push({ call, parameter: parameter.name }) }
      else for (const { call } of scope.rawCalls.filter(r => r.call.ownerId === symbolId && r.call.syntaxRole === "argument-default" && !used.has(r.call.id) && parameter.type?.replace(/\s/g, "").includes(`${r.call.expression}(${r.call.arguments.join(",")})`.replace(/\s/g, "")))) { used.add(call.id); selected.push({ call, parameter: parameter.name, syntaxGap: "framework-dependency-annotation-unsupported" }) }
    }
    return selected.flatMap(({ call, parameter, syntaxGap }) => {
      const constructor = qualified(call.expression, scope)
      if (!["fastapi.Depends", "fastapi.params.Depends", "fastapi.Security", "fastapi.params.Security"].includes(constructor)) return []
      const root = call.expression.split(".")[0]!, argument = call.arguments[0]?.replace(/^dependency\s*=\s*/, "") ?? "", names = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(argument)
      const candidates = names ? matching(qualified(argument, scope)).filter(s => s.kind === "function" && !s.className) : []
      const gap = syntaxGap ?? (!stableSourceBinding(call.expression, scope) ? "framework-constructor-rebound"
        : constructor.endsWith("Security") || call.arguments.length !== 1 ? "framework-dependency-options-unsupported"
        : !names ? "framework-dependency-target-dynamic"
        : candidates.some(s => s.attributes.moduleBinding !== "unconditional") ? "framework-dependency-target-binding-unresolved"
        : !stableSourceBinding(argument, scope) || candidates.some(s => !stableSourceBinding(s.name, scopeFor(s))) ? "framework-dependency-target-rebound"
        : candidates.some(s => s.attributes.bindingWrapped && !routes.some(r => r.candidateIds.includes(s.id) && !r.bindingGap)) ? "framework-dependency-target-wrapper-unmodeled"
        : candidates.length !== 1 ? candidates.length ? "framework-dependency-target-ambiguous" : "framework-dependency-target-missing" : undefined)
      return [{ id: `framework-${hash([symbolId, call.id, parameter]).slice(0, 24)}`, sourceCallId: call.id, ownerId: symbolId, ...(parameter ? { parameter } : {}), constructor, expression: argument, candidateIds: candidates.map(s => s.id), resolution: gap ? candidates.length > 1 ? "ambiguous" as const : "unresolved" as const : "resolved" as const, model: "fastapi-source-injection/v1" as const, ...(gap ? { gap } : {}) }]
    })
  }
  const middlewareCache = new Map<string, StructureRequestMiddleware[]>()
  const requestMiddleware = (routeId: string): StructureRequestMiddleware[] => {
    if (middlewareCache.has(routeId)) return structuredClone(middlewareCache.get(routeId)!)
    const routerName = routeRouters.get(routeId); if (!routerName) return []
    const ancestors = new Set<string>(), collect = (name: string) => { if (ancestors.has(name)) return; ancestors.add(name); for (const mount of mounts.filter(m => m.childNames.includes(name))) collect(mount.parent) }; collect(routerName)
    const registrations = [...ancestors].flatMap(name => (routerModifications.get(name) ?? []).filter(m => m.call.expression.endsWith(".add_middleware")).map(m => ({ ...m, routerName: name })))
    const facts: StructureRequestMiddleware[] = registrations.map(({ call, scope, registrationContext, registrationBinding, routerName }) => {
      const keywordIndex = call.arguments.findIndex(a => /^middleware_class\s*=/.test(a)), targetIndex = keywordIndex >= 0 ? keywordIndex : call.arguments.findIndex(a => !/^\w+\s*=/.test(a))
      const expression = (call.arguments[targetIndex]?.replace(/^middleware_class\s*=\s*/, "") ?? "").trim(), name = qualified(expression, scope)
      const raw = scope.rawCalls.find(r => r.call.id === call.id)!, shadowed = raw.localNames.includes(expression.split(".")[0]!)
      const candidates = !shadowed && /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(expression) ? matching(name).filter(s => s.kind === "class") : [], cls = candidates.length === 1 ? candidates[0] : undefined
      const mro = cls && linearize(cls.qualifiedName), classSources = [...new Map((mro ?? []).flatMap(owner => matching(owner).filter(s => s.kind === "class")).map(s => [s.id, s])).values()]
      const methodCandidates = cls ? ["__init__", "__call__", ...(mro?.some(owner => ["starlette.middleware.base.BaseHTTPMiddleware"].includes(owner)) ? ["dispatch"] : [])].flatMap(method => lookupMethod(cls.qualifiedName, method).map(s => ({ method, candidateId: s.id }))) : []
      const gap = registrationBinding !== "resolved" ? "framework-middleware-router-alias-unresolved"
        : !/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(expression) ? "framework-middleware-target-dynamic"
        : shadowed ? "framework-middleware-target-shadowed"
        : !stableSourceBinding(expression, scope) || candidates.some(s => !stableSourceBinding(s.name, scopeFor(s))) ? "framework-middleware-target-rebound"
        : candidates.length !== 1 ? candidates.length ? "framework-middleware-target-ambiguous" : "framework-middleware-source-missing"
        : classSources.some(s => s.attributes.bindingWrapped) ? "framework-middleware-target-wrapper-unmodeled"
        : !mro ? "framework-middleware-mro-unresolved"
        : mro.some(owner => matching(owner).filter(s => s.kind === "class").length !== 1) ? "framework-middleware-base-source-missing"
        : classSources.some(s => ["__init__", "__call__", "dispatch"].some(method => Object.hasOwn(s.attributes, method))) ? "framework-middleware-method-binding-unresolved"
        : methodCandidates.some(m => symbols.find(s => s.id === m.candidateId)?.attributes.bindingWrapped) ? "framework-middleware-method-wrapper-unmodeled"
        : !methodCandidates.some(m => m.method === "__call__" || m.method === "dispatch") ? "framework-middleware-entry-missing" : undefined
      return { id: `middleware-${hash([routeId, call.id]).slice(0, 24)}`, sourceCallId: call.id, routerName, expression, qualifiedName: cls?.qualifiedName ?? name, arguments: call.arguments.filter((_, i) => i !== targetIndex), source: { path: call.path, sha256: call.sha256, startLine: call.startLine, endLine: call.endLine }, registrationContext: structuredClone(registrationContext), candidateIds: candidates.map(s => s.id), ...(cls ? { receiverClass: cls.qualifiedName } : {}), methodCandidates, sources: classSources.map(s => ({ id: s.id, path: s.path, sha256: s.sha256 })), registrationBinding, executionOrder: "unproven", model: "fastapi-source-asgi/v1", ...(gap ? { gap } : {}) }
    })
    middlewareCache.set(routeId, facts); return structuredClone(facts)
  }
  const actionCache = new Map<string, StructureRequestAction[]>()
  /** HTTP declarations and source work only. No decorator, router or dispatch
   * behavior is adopted merely because its current source was located. */
  const requestActions = (receiverClass: string): StructureRequestAction[] => {
    if (actionCache.has(receiverClass)) return structuredClone(actionCache.get(receiverClass)!)
    const mro = linearize(receiverClass)
    if (!mro?.some(name => name.startsWith("rest_framework."))) return []
    const methods = [...new Set(symbols.filter(s => s.className && mro.includes(s.className)).map(s => s.name))].flatMap(name => lookupMethod(receiverClass, name))
    const facts: StructureRequestAction[] = []
    for (const method of methods) for (const decorator of method.decorators ?? []) {
      const scope = scopeFor(method)
      if (qualified(decorator.expression, scope) !== "rest_framework.decorators.action" || !decorator.sourceCallId) continue
      const argument = (name: string, position: number) => decorator.arguments.find(a => a.parameter === name) ?? decorator.arguments.filter(a => !a.parameter)[position]
      const declaredMethods = argument("methods", 0), detail = argument("detail", 1), url = argument("url_path", 2)
      const verbs = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE"])
      const httpMethods = declaredMethods?.literalKnown && Array.isArray(declaredMethods.literalValue) && declaredMethods.literalValue.every(v => typeof v === "string" && verbs.has(v.toUpperCase())) ? declaredMethods.literalValue.map(v => (v as string).toUpperCase()) : []
      const sourceCandidates: StructureRequestAction["sourceCandidates"] = [], sourceSymbols = new Map<string, StructureSymbol>()
      const retain = (s: StructureSymbol) => sourceSymbols.set(s.id, s)
      const offer = (role: string, candidates: StructureSymbol[], context?: string) => { for (const s of candidates) { retain(s); if (!sourceCandidates.some(c => c.candidateId === s.id && c.receiverClass === context)) sourceCandidates.push({ role, candidateId: s.id, ...(context ? { receiverClass: context } : {}) }) } }
      for (const owner of mro) for (const cls of matching(owner).filter(s => s.kind === "class")) retain(cls)
      retain(method)
      const factory = matching("rest_framework.decorators.action").filter(s => s.kind === "function" && !s.className), mapper = matching("rest_framework.decorators.MethodMapper").filter(s => s.kind === "class")
      offer("action-factory", factory)
      offer("action-decorator", symbols.filter(s => s.qualifiedName === "rest_framework.decorators.action.decorator"))
      for (const cls of mapper) { retain(cls); offer("method-mapper", lookupMethod(cls.qualifiedName, "__init__"), cls.qualifiedName) }
      const methodMappings: StructureRequestAction["methodMappings"] = httpMethods.map(verb => ({ method: verb, actionName: method.name, candidateIds: lookupMethod(receiverClass, method.name).map(s => s.id), declarationId: decorator.id, sourceId: method.id }))
      let mappingGap: string | undefined
      // The mapping property belongs to the declaring class's function object;
      // the mapped name is subsequently looked up on the actual request class.
      for (const declaration of symbols.filter(s => s.className === method.className)) for (const mapping of declaration.decorators ?? []) {
        const match = /^([A-Za-z_]\w*)\.mapping\.([A-Za-z_]\w*)$/.exec(mapping.expression)
        if (!match || match[1] !== method.name) continue
        const verb = match[2]!.toUpperCase(), targets = lookupMethod(receiverClass, declaration.name)
        retain(declaration); targets.forEach(retain)
        if (!verbs.has(verb) || methodMappings.some(m => m.method === verb) || targets.length !== 1 || (declaration.decorators?.length ?? 0) !== 1) mappingGap = "framework-action-method-mapping-unresolved"
        methodMappings.push({ method: verb, actionName: declaration.name, candidateIds: targets.map(s => s.id), declarationId: mapping.id, sourceId: declaration.id })
        for (const cls of mapper) { offer("method-mapper", lookupMethod(cls.qualifiedName, match[2]!), cls.qualifiedName); offer("method-mapper", lookupMethod(cls.qualifiedName, "_map"), cls.qualifiedName) }
      }
      const routeIds = routes.filter(r => r.model === "drf-source-router/v1" && r.candidateIds.some(id => symbols.find(s => s.id === id)?.qualifiedName === receiverClass)).map(r => r.id)
      for (const routeId of routeIds) {
        const route = routes.find(r => r.id === routeId)!, raw = scopes.flatMap(f => f.rawCalls).find(r => r.call.id === route.sourceCallId)!, ownerScope = scopes.find(f => f.path === route.sourcePath)!
        retain(symbols.find(s => s.id === routeId)!)
        const router = raw.call.receiver && instanceBinding(moduleQualified(raw.call.receiver, ownerScope))
        if (router) for (const name of linearize(router.className) ?? []) for (const cls of matching(name).filter(s => s.kind === "class")) retain(cls)
        if (router) for (const name of ["register", "get_routes", "_get_dynamic_route", "get_method_map", "get_urls"]) offer("router", lookupMethod(router.className, name), router.className)
      }
      for (const name of ["get_extra_actions", "as_view", "initialize_request", "dispatch"]) offer("view-binding", lookupMethod(receiverClass, name), receiverClass)
      const definingClass = symbols.find(s => s.kind === "class" && s.qualifiedName === method.className), receiverClasses = mro.flatMap(owner => matching(owner).filter(s => s.kind === "class"))
      const gap = definingClass && Object.hasOwn(definingClass.attributes, decorator.expression.split(".")[0]!) ? "framework-action-constructor-shadowed"
        : !stableSourceBinding(decorator.expression, scope) ? "framework-action-constructor-rebound"
        : receiverClasses.some(cls => !stableSourceBinding(cls.name, scopeFor(cls)) || cls.attributes.bindingWrapped || Object.hasOwn(cls.attributes, method.name)) ? "framework-action-receiver-binding-unresolved"
        : factory.length !== 1 || mapper.length !== 1 ? "framework-action-source-missing"
        : !stableSourceBinding(factory[0]!.name, scopeFor(factory[0]!)) || factory[0]!.attributes.bindingWrapped || mapper[0]!.attributes.bindingWrapped ? "framework-action-source-binding-unresolved"
        : method.decorators!.length !== 1 ? "framework-action-wrapper-unmodeled"
        : decorator.arguments.some(a => a.parameter ? !["methods", "detail", "url_path", "url_name"].includes(a.parameter) : /^\*/.test(a.expression)) || decorator.arguments.filter(a => !a.parameter).length > 4 ? "framework-action-options-unmodeled"
        : !declaredMethods ? "framework-action-methods-default-uninterpreted"
        : !httpMethods.length || new Set(httpMethods).size !== httpMethods.length ? "framework-action-methods-dynamic"
        : !detail?.literalKnown || typeof detail.literalValue !== "boolean" ? "framework-action-detail-dynamic"
        : url && (!url.literalKnown || typeof url.literalValue !== "string") ? "framework-action-path-dynamic"
        : mappingGap
      facts.push({ id: `action-${hash([receiverClass, method.id, decorator.id]).slice(0, 24)}`, receiverClass, actionName: method.name, sourceId: method.id, sourceCallId: decorator.sourceCallId, constructor: decorator.expression, arguments: decorator.arguments.map(a => a.parameter ? `${a.parameter}=${a.expression}` : a.expression), source: { path: method.path, sha256: method.sha256, startLine: decorator.startLine, endLine: decorator.endLine }, ...(typeof detail?.literalValue === "boolean" ? { detail: detail.literalValue } : {}), ...(typeof url?.literalValue === "string" ? { urlPath: url.literalValue } : {}), methodMappings, routeIds, sourceCandidates, sources: [...sourceSymbols.values()].map(s => ({ id: s.id, path: s.path, sha256: s.sha256 })), mappingBinding: "unproven", invocation: "unproven", model: "drf-source-action/v1", ...(gap ? { gap } : {}) })
    }
    actionCache.set(receiverClass, facts); return structuredClone(facts)
  }
  const parserVersion = "@vscode/tree-sitter-wasm@0.3.1", relationshipVersion = "source-bindings/v8"
  const withSymbolSyntax = <T>(symbolId: string, visit: (root: Node, symbol: StructureSymbol) => T): Promise<T> => {
    const symbol = symbols.find(s => s.id === symbolId), file = symbol && files.find(f => f.path === symbol.path)
    if (!symbol || !file || hash(file.content) !== symbol.sha256) throw new Error("structure-source-missing")
    return withSourceSyntax(file.content, symbol.language, root => visit(root, symbol))
  }
  return { schemaVersion: "authorization-structure-index/v1" as const, parser: parserVersion, relationshipVersion, symbols, calls, routes, diagnostics, lookupMethod, attribute, linearize, candidateRevision, relatedCalls, resolveName, qualifySourceName, requestDependencies, requestMiddleware, requestActions, withSymbolSyntax,
    revision: hash([sourceIdentity, parserVersion, relationshipVersion, symbols, calls, routes, diagnostics]), preparation: { files: files.length, bytes: files.reduce((s, f) => s + Buffer.byteLength(f.content), 0), durationMs: performance.now() - started, targetExecutions: 0 } }
}
export type StructureIndex = Awaited<ReturnType<typeof buildStructureIndex>>
