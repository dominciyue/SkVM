import path from "node:path"
import { createHash } from "node:crypto"
import { Parser, Language, type Node } from "@vscode/tree-sitter-wasm"
import type { DiscoverySymbol } from "./discovery.ts"
import type { FiniteValue } from "../../../task-dsl/authorization/control-evaluation.ts"
import { sourceArgumentBindings } from "./source-arguments.ts"

export interface StructureSymbol extends DiscoverySymbol {
  qualifiedName: string; module: string; language: "python" | "go"; className?: string; receiver?: string;
  parameters: Array<{ name: string; type?: string; kind?: "positional-only" | "keyword-only" | "variadic-positional" | "variadic-keyword"; stableForwardPack?: boolean; defaultExpression?: string; defaultLiteralKnown?: boolean; defaultLiteralValue?: FiniteValue }>; returns: string[]; bases: string[]; attributes: Record<string, string>
  decorators?: Array<{ id: string; sourceCallId?: string; expression: string; startLine: number; endLine: number; arguments: Array<{ parameter?: string; expression: string; literalKnown: boolean; literalValue?: FiniteValue }> }>
  localCallable?: {
    schemaVersion: "source-local-callable/v1"; ownerId: string; ownerSha256: string;
    captures: Array<{ name: string; use: { startLine: number; endLine: number; startIndex: number; endIndex: number } }>;
    gap?: string;
  }
  returnedCallable?: { schemaVersion: "source-returned-callable/v1"; ownerId: string; ownerSha256: string; captures: NonNullable<StructureSymbol["localCallable"]>["captures"]; gap?: string }
}
export interface StructureBindingSource { path: string; sha256: string; startLine: number; endLine: number; name: string; target: string }
export interface StructureCallableBinding {
  schemaVersion: "source-returned-callable/v1"; name: string; targetId: string; factoryId: string; factorySha256: string; creationCallId: string;
  source: { path: string; sha256: string; startLine: number; endLine: number };
  captures: Array<{ parameter: string; expression: string; literalKnown: boolean; literalValue?: FiniteValue }>;
}
export interface StructureCall {
  id: string; ownerId?: string; path: string; sha256: string; startLine: number; endLine: number; startIndex?: number; endIndex?: number;
  expression: string; receiver?: string; receiverClass?: string; arguments: string[]; candidateIds: string[]; resolution: "resolved" | "ambiguous" | "unresolved";
  basis: string[]; gap?: string; resultNames: string[]; syntaxRole: "condition" | "return" | "argument-default" | "body" | "source-context"
  receiverBinding?: { schemaVersion: "source-module-instance/v1"; name: string; className: string; classSha256: string; source: { path: string; sha256: string; startLine: number; endLine: number } }
  argumentFacts?: Array<{ expression: string; parameterName?: string; spread?: "positional" | "keyword"; literalKnown: boolean; literalValue?: FiniteValue; sourceCallId?: string }>
  bindingSources?: StructureBindingSource[];
  callableBinding?: StructureCallableBinding;
}
export interface StructureRoute { id: string; sourceCallId: string; sourcePath: string; startLine: number; endLine: number; method: string; path: string; handlerExpression: string; candidateIds: string[]; middlewareExpressions: string[]; dependencyExpressions?: string[]; dependencyCallIds?: string[]; bindingGap?: string; bindingSources?: Array<{ path: string; sha256: string; startLine: number; endLine: number }>; model: string }
export interface StructureRequestDependency {
  id: string; sourceCallId: string; ownerId: string; parameter?: string; constructor: string; expression: string; candidateIds: string[];
  resolution: "resolved" | "ambiguous" | "unresolved"; model: "fastapi-source-injection/v1"; gap?: string;
  bindingSources?: StructureBindingSource[];
}
export interface StructureRequestMiddleware {
  id: string; sourceCallId: string; routerName: string; expression: string; qualifiedName: string; arguments: string[];
  source: { path: string; sha256: string; startLine: number; endLine: number };
  registrationContext: Array<{ kind: string; expression: string; startLine: number; endLine: number }>;
  candidateIds: string[]; receiverClass?: string; methodCandidates: Array<{ method: string; candidateId: string }>;
  sources: Array<{ id: string; path: string; sha256: string }>; registrationBinding: "resolved" | "possible"; executionOrder: "unproven"; model: "fastapi-source-asgi/v1"; gap?: string;
  bindingSources?: StructureBindingSource[];
}
export interface StructureRequestAction {
  id: string; receiverClass: string; actionName: string; sourceId: string; sourceCallId: string; constructor: string; arguments: string[];
  source: { path: string; sha256: string; startLine: number; endLine: number }; detail?: boolean; urlPath?: string;
  methodMappings: Array<{ method: string; actionName: string; candidateIds: string[]; declarationId: string; sourceId: string }>;
  routeIds: string[]; sourceCandidates: Array<{ role: string; candidateId: string; receiverClass?: string }>;
  sources: Array<{ id: string; path: string; sha256: string }>; mappingBinding: "unproven"; invocation: "unproven"; model: "drf-source-action/v1"; gap?: string;
  bindingSources?: StructureBindingSource[];
}
export interface StructureClassDecorator {
  id: string; receiverClass: string; declaringClass: string; sourceId: string; declarationId: string; sourceCallId?: string; expression: string; arguments: string[];
  source: { path: string; sha256: string; startLine: number; endLine: number };
  sourceCandidates: Array<{ role: "factory" | "decorator" | "returned-callable" | "argument-call" | "helper"; candidateId: string }>;
  sources: Array<{ id: string; path: string; sha256: string }>; invocation: "unproven"; transformation: "unproven"; model: "source-class-decorator/v1"; gap?: string;
  bindingSources?: StructureBindingSource[];
}
interface FileScope { path: string; sha256: string; parsePartial: boolean; module: string; language: "python" | "go"; aliases: Record<string, string>; moduleAliases: Record<string, string>; moduleAliasSources: Record<string, StructureBindingSource>; symbols: StructureSymbol[]; rawCalls: Array<{ call: StructureCall; types: Record<string, string>; localNames: string[]; groupPaths: string[]; registrationContext: StructureRequestMiddleware["registrationContext"]; callableResult?: { name: string; stable: boolean; stableParameters: string[] } }>; routerAliases: Array<{ name: string; value: string; ownerId?: string; localNames: string[] }>; moduleAssignments: Record<string, number>; moduleAttributeWrites: string[]; constants: Record<string, string>; routers: Array<{ name: string; constructor: string; prefix: string; repeated: boolean; requestOptionsUnmodeled: boolean; startLine: number; endLine: number }>; decorators: Array<{ callId: string; handlerId: string; receiver: string; verb: string; path: string; middleware: string[]; dependencies: Array<{ constructor: string; expression: string; sourceCallId: string; parameter?: string }>; wrapped: boolean }>; includes: Array<{ callId: string; receiver: string; child: string; prefix: string; requestOptionsUnmodeled: boolean }> }
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
  const started = performance.now(), loaded = await languages(), scopes: FileScope[] = [], diagnostics: Array<{ path: string; code: string; line?: number; handlerId?: string }> = [], returnedCallables = new Map<string, string[]>()
  for (const file of [...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) {
    const language = file.path.endsWith(".py") ? "python" : file.path.endsWith(".go") ? "go" : undefined
    if (!language) { diagnostics.push({ path: file.path, code: "structure-language-unsupported" }); continue }
    const parser = new Parser(); parser.setLanguage(loaded.get(language)!)
    const tree = parser.parse(file.content)!
    try {
      const root = tree.rootNode, sha256 = hash(file.content), module = moduleName(file.path, language), aliases: Record<string, string> = {}, moduleAliases: Record<string, string> = {}, moduleAliasSources: Record<string, StructureBindingSource> = {}, symbols: StructureSymbol[] = []
      if (root.hasError) diagnostics.push({ path: file.path, code: "structure-parse-partial" })
      if (language === "python") for (const n of descendants(root, ["import_statement", "import_from_statement"])) {
        const from = field(n, "module_name")?.text
        const imported = children(n).filter(c => c.type === "aliased_import" || c.type === "dotted_name" && c.id !== field(n, "module_name")?.id)
        for (const v of imported) {
          const name = field(v, "name")?.text ?? v.text, alias = field(v, "alias")?.text ?? (from ? name : name.split(".")[0]!)
          const qualified = from ? `${from}.${name}` : field(v, "alias") ? name : name.split(".")[0]!
          aliases[alias] = qualified.startsWith(".") ? `${module.split(".").slice(0, -1).join(".")}${qualified}` : qualified
          if (n.parent?.id === root.id) {
            moduleAliases[alias] = aliases[alias]!
            moduleAliasSources[alias] = { path: file.path, sha256, startLine: n.startPosition.row + 1, endLine: n.endPosition.row + 1, name: `${module}.${alias}`, target: from?.startsWith(".") ? `${from}.${name}` : aliases[alias]! }
          }
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
        let keywordOnly = false
        if (parametersNode) for (const param of children(parametersNode)) {
          if (language === "python") {
            if (param.type === "positional_separator") { for (const p of parameters) p.kind = "positional-only"; continue }
            if (param.type === "keyword_separator") { keywordOnly = true; continue }
            const pattern = children(param)[0], name = field(param, "name")?.text ?? (param.type === "identifier" ? param.text : pattern && ["list_splat_pattern", "dictionary_splat_pattern"].includes(pattern.type) ? children(pattern)[0]?.text : pattern?.text)
            const defaultNode = field(param, "value"), literal = sourceLiteral(defaultNode)
            const kind = /^\*\*/.test(param.text) ? "variadic-keyword" : /^\*/.test(param.text) ? "variadic-positional" : keywordOnly ? "keyword-only" : undefined
            if (kind?.startsWith("variadic")) keywordOnly = true
            const body = field(n, "body"), uses = body ? descendants(body, ["identifier"]).filter(i => i.text === name && !(i.parent?.type === "attribute" && field(i.parent, "attribute")?.id === i.id)) : []
            const stableForwardPack = kind?.startsWith("variadic") ? uses.every(i => {
              let owner = i.parent; while (owner && !["function_definition", "class_definition", "lambda"].includes(owner.type)) owner = owner.parent
              return owner?.id === n.id && i.parent?.type === (kind === "variadic-positional" ? "list_splat" : "dictionary_splat")
            }) : undefined
            if (name && /^[A-Za-z_]\w*$/.test(name)) parameters.push({ name, ...(kind ? { kind } : {}), ...(stableForwardPack !== undefined ? { stableForwardPack } : {}), ...(field(param, "type") ? { type: field(param, "type")!.text } : {}), ...(defaultNode ? { defaultExpression: defaultNode.text, defaultLiteralKnown: literal.literalKnown, ...(literal.literalKnown ? { defaultLiteralValue: literal.literalValue! } : {}) } : {}) })
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
          if (n.type === "function_definition" && n.children.some(c => c?.type === "async")) attributes.callableAsync = "true"
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
        if (language === "python" && n.parent?.type === "decorated_definition") s.decorators = children(n.parent).filter(d => d.type === "decorator").map(d => {
          const expression = children(d)[0]!, call = expression.type === "call" ? expression : undefined
          return { id: `decorator-${hash([sourceIdentity, file.path, sha256, d.startIndex]).slice(0, 24)}`, ...(call ? { sourceCallId: `call-${hash([sourceIdentity, file.path, sha256, call.startIndex]).slice(0, 24)}` } : {}), expression: call ? field(call, "function")!.text : expression.text, startLine: d.startPosition.row + 1, endLine: d.endPosition.row + 1, arguments: children(call && field(call, "arguments")).map(a => { const value = a.type === "keyword_argument" ? field(a, "value")! : a, literal = sourceLiteral(value); return { ...(a.type === "keyword_argument" ? { parameter: field(a, "name")!.text } : {}), expression: value.text, ...literal } }) }
        })
        byNode.set(n.id, s); symbols.push(s)
      }
      if (language === "python") for (const n of definitions.filter(d => d.type === "function_definition")) {
        const symbol = byNode.get(n.id)!, body = field(n, "body")
        if (!symbol || !body) continue
        const owned = (node: Node) => { let parent = node.parent; while (parent && !["function_definition", "class_definition", "lambda"].includes(parent.type)) parent = parent.parent; return parent?.id === n.id }
        const writes = descendants(body, ["assignment", "augmented_assignment", "named_expression", "for_statement", "as_pattern", "delete_statement", "import_statement", "import_from_statement", "function_definition", "class_definition"]).filter(owned)
        const result = new Set<string>()
        for (const ret of descendants(body, ["return_statement"]).filter(owned)) {
          const value = children(ret)[0]
          if (value?.type !== "identifier") continue
          const declarations = children(body).map(d => d.type === "decorated_definition" ? children(d).find(c => c.type === "function_definition") : d).filter((d): d is Node => !!d && d.type === "function_definition" && field(d, "name")?.text === value.text && d.endIndex < ret.startIndex)
          const bindings = writes.filter(w => { const target = field(w, "left") ?? field(w, "name") ?? field(w, "alias"); return target?.text === value.text || target && descendants(target, ["identifier"]).some(i => i.text === value.text) || ["delete_statement", "import_statement", "import_from_statement"].includes(w.type) && descendants(w, ["identifier", "dotted_name"]).some(i => i.text === value.text) })
          if (declarations.length === 1 && bindings.length === 1) result.add(byNode.get(declarations[0]!.id)!.id)
        }
        returnedCallables.set(symbol.id, [...result])
      }
      const localNames = new Map<string, Set<string>>(), localWrites = new Map<string, Map<string, number>>(), lexicalNames = new Map<string, Set<string>>(), moduleAssignments: Record<string, number> = {}, globalNames = new Map<string, Set<string>>()
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
        else if (symbol.kind === "function") {
          const bound = localNames.get(symbol.id) ?? new Set<string>(), writes = localWrites.get(symbol.id) ?? new Map<string, number>()
          bound.add(name); writes.set(name, (writes.get(name) ?? 0) + 1); localNames.set(symbol.id, bound); localWrites.set(symbol.id, writes)
        }
      }
      // A local declaration is a source call edge only while its identity and
      // captured cells are fixed. Returned/passed closures need separate actual
      // invocation evidence; finding a nested body does not execute its factory.
      if (language === "python") for (const n of definitions.filter(d => d.type === "function_definition")) {
        const symbol = byNode.get(n.id), body = field(n, "body")
        let parent = n.parent; while (parent && !byNode.has(parent.id)) parent = parent.parent
        const owner = parent && byNode.get(parent.id)
        if (!symbol || !body || owner?.kind !== "function") continue
        const ownerBody = field(parent!, "body")!, declaration = n.parent?.type === "decorated_definition" ? n.parent : n
        const owned = (node: Node, definition: Node) => { let p = node.parent; while (p && !["function_definition", "class_definition", "lambda"].includes(p.type)) p = p.parent; return p?.id === definition.id }
        const captureNames = new Set<string>(), captures: NonNullable<StructureSymbol["localCallable"]>["captures"] = []
        let gap: string | undefined
        if (n.hasError || declaration.parent?.id !== ownerBody.id || symbol.attributes.callableAsync || symbol.attributes.bindingWrapped || symbol.parameters.some(p => p.type || p.defaultExpression && !p.defaultLiteralKnown) || symbol.returns.length || descendants(body, ["yield"]).some(i => owned(i, n))) gap = "source-local-callable-definition-unmodeled"
        else if (owner.parameters.some(p => p.name === symbol.name) || localWrites.get(owner.id)?.get(symbol.name) !== 1) gap = "source-local-callable-binding-unresolved"
        const definitionGap = gap
        let captureGap: string | undefined
        const captureIssue = (reason: string) => { gap ??= reason; captureGap ??= reason }
        const references = descendants(ownerBody, ["identifier"]).filter(i => i.text === symbol.name && i.id !== field(n, "name")?.id && !(n.startIndex <= i.startIndex && i.endIndex <= n.endIndex) && !(i.parent?.type === "attribute" && field(i.parent, "attribute")?.id === i.id) && !(i.parent?.type === "keyword_argument" && field(i.parent, "name")?.id === i.id))
        if (!gap && references.some(i => !owned(i, parent!) || i.parent?.type !== "call" || field(i.parent, "function")?.id !== i.id)) gap = "source-local-callable-escape-unmodeled"
        if (descendants(body, ["nonlocal_statement", "global_statement"]).some(i => owned(i, n))) captureIssue("source-local-capture-scope-unmodeled")
        for (const i of descendants(body, ["identifier"]).filter(i => owned(i, n))) {
          if (i.parent?.type === "attribute" && field(i.parent, "attribute")?.id === i.id || i.parent?.type === "keyword_argument" && field(i.parent, "name")?.id === i.id || symbol.parameters.some(p => p.name === i.text) || localNames.get(symbol.id)?.has(i.text)) continue
          let ancestor: Node | null = parent, binding: StructureSymbol | undefined
          while (ancestor) {
            const scope = byNode.get(ancestor.id)
            if (scope?.kind === "function" && (scope.parameters.some(p => p.name === i.text) || localNames.get(scope.id)?.has(i.text))) { binding = scope; break }
            ancestor = ancestor.parent
          }
          if (!binding) continue
          captureNames.add(i.text)
          if (binding.id !== owner.id || !owner.parameters.some(p => p.name === i.text)) { captureIssue("source-local-capture-value-unresolved"); continue }
          if (descendants(ownerBody, ["match_statement"]).some(i => owned(i, parent!)) || descendants(ownerBody, ["nonlocal_statement"]).some(s => children(s).some(c => c.text === i.text))) { captureIssue("source-local-capture-scope-unmodeled"); continue }
          if (localWrites.get(owner.id)?.has(i.text)) { captureIssue("source-local-capture-rebound"); continue }
          if (!captures.some(c => c.name === i.text)) captures.push({ name: i.text, use: { startLine: i.startPosition.row + 1, endLine: i.endPosition.row + 1, startIndex: i.startIndex, endIndex: i.endIndex } })
        }
        lexicalNames.set(symbol.id, captureNames)
        symbol.localCallable = { schemaVersion: "source-local-callable/v1", ownerId: owner.id, ownerSha256: owner.sha256, captures, ...(gap ? { gap } : {}) }
        if (descendants(ownerBody, ["return_statement"]).filter(i => owned(i, parent!)).some(i => children(i)[0]?.type === "identifier" && children(i)[0]!.text === symbol.name)) {
          const returns = descendants(ownerBody, ["return_statement"]).filter(i => owned(i, parent!)), last = children(ownerBody).filter(i => i.type !== "comment").at(-1)
          const returnedGap = definitionGap || captureGap ? `source-returned-callable-${(definitionGap ?? captureGap)!.replace(/^source-local-(?:callable-)?/, "")}`
            : descendants(body, ["function_definition", "class_definition", "lambda"]).length ? "source-returned-callable-nested-scope-unmodeled"
            : owner.attributes.callableAsync || owner.attributes.bindingWrapped || owner.boundary !== "complete" || descendants(ownerBody, ["yield"]).some(i => owned(i, parent!)) ? "source-returned-callable-factory-unmodeled"
            : returns.length !== 1 || returns[0]!.id !== last?.id || children(last!)[0]?.text !== symbol.name ? "source-returned-callable-return-unmodeled"
            : references.some(i => !owned(i, parent!) || i.parent?.id !== last?.id) ? "source-returned-callable-escape-unmodeled" : undefined
          symbol.returnedCallable = { schemaVersion: "source-returned-callable/v1", ownerId: owner.id, ownerSha256: owner.sha256, captures: structuredClone(captures), ...(returnedGap ? { gap: returnedGap } : {}) }
        }
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
          const right = field(assignment, "right"), target = field(assignment, "left"), left = language === "python" && !["pattern_list", "tuple_pattern", "list_pattern"].includes(target?.type ?? "") ? [target?.text ?? ""] : children(target).length ? children(target).map(c => c.text) : [target?.text ?? ""]
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
        const argumentFacts = language === "python" ? children(field(n, "arguments")).map(a => { const value = a.type === "keyword_argument" ? field(a, "value")! : a; return { expression: boundedText(value), ...(value.type === "call" ? { sourceCallId: `call-${hash([sourceIdentity, file.path, sha256, value.startIndex]).slice(0, 24)}` } : {}), ...(a.type === "keyword_argument" ? { parameterName: field(a, "name")!.text } : {}), ...(a.type === "list_splat" ? { spread: "positional" as const } : a.type === "dictionary_splat" ? { spread: "keyword" as const } : {}), ...sourceLiteral(value) } }) : undefined
        let callableResult: FileScope["rawCalls"][number]["callableResult"]
        if (language === "python" && symbol?.kind === "function" && resultNames.length === 1 && assignment) {
          const name = resultNames[0]!, body = field(owner!, "body"), declaration = assignment.parent?.type === "expression_statement" ? assignment.parent : assignment
          const references = body ? descendants(body, ["identifier"]).filter(i => i.text === name && i.id !== field(assignment!, "left")?.id && !(i.parent?.type === "attribute" && field(i.parent, "attribute")?.id === i.id) && !(i.parent?.type === "keyword_argument" && field(i.parent, "name")?.id === i.id)) : []
          const direct = (i: Node) => { let p = i.parent; while (p && !["function_definition", "class_definition", "lambda"].includes(p.type)) p = p.parent; return p?.id === owner?.id && i.parent?.type === "call" && field(i.parent, "function")?.id === i.id }
          const stable = !root.hasError && assignment.type === "assignment" && field(assignment, "left")?.type === "identifier" && field(assignment, "right")?.id === n.id && declaration.parent?.id === body?.id && !symbol.parameters.some(p => p.name === name) && localWrites.get(symbol.id)?.get(name) === 1 && references.every(direct)
          const stableParameters = symbol.parameters.filter(p => !localWrites.get(symbol.id)?.has(p.name) && !body?.descendantsOfType("match_statement").length && !descendants(body!, ["nonlocal_statement"]).some(s => children(s).some(c => c.text === p.name))).map(p => p.name)
          callableResult = { name, stable, stableParameters }
        }
        rawCalls.push({ types, localNames: language === "python" && symbol?.kind === "function" ? [...new Set([...symbol.parameters.map(p => p.name), ...localNames.get(symbol.id) ?? [], ...lexicalNames.get(symbol.id) ?? []])] : [], groupPaths, registrationContext, ...(callableResult ? { callableResult } : {}), call: { id: `call-${hash([sourceIdentity, file.path, sha256, n.startIndex]).slice(0, 24)}`, ...(symbol ? { ownerId: symbol.id } : {}), path: file.path, sha256, startLine: n.startPosition.row + 1, endLine: n.endPosition.row + 1, startIndex: n.startIndex, endIndex: n.endIndex, expression, ...(expression.includes(".") ? { receiver: expression.slice(0, expression.lastIndexOf(".")) } : {}), arguments: args, ...(argumentFacts ? { argumentFacts } : {}), candidateIds: [], resolution: "unresolved", basis: [], resultNames, syntaxRole } })
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
      scopes.push({ path: file.path, sha256, parsePartial: root.hasError, module, language, aliases, moduleAliases, moduleAliasSources, symbols, rawCalls, routerAliases, moduleAssignments, moduleAttributeWrites, constants, routers, decorators, includes })
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
  const lexicalMatching = (text: string) => {
    if (matchingCache.has(text)) return matchingCache.get(text)!
    const candidates = [...(exactNames.get(text) ?? [])], parts = text.replaceAll("/", ".").split(".")
    if (!candidates.length) candidates.push(...(pythonSuffixes.get(text) ?? []))
    // Import paths include a repository prefix that relative file modules omit.
    // Stop at the longest existing module, never union shorter homonyms.
    if (!candidates.length) for (let i = 0; i < parts.length; i++) { const found = goNames.get(parts.slice(i).join(".")); if (found?.length) { candidates.push(...found); break } }
    const found = [...new Map(candidates.map(c => [c.id, c])).values()]; matchingCache.set(text, found); return found
  }
  const nameFactsCache = new Map<string, { candidates: StructureSymbol[]; sources: StructureBindingSource[]; gap?: string }>()
  const uniqueBindingSources = (sources: StructureBindingSource[]) => [...new Map(sources.map(s => [JSON.stringify(s), s])).values()]
  const importWrites = (name: string) => scopes.some(s => s.moduleAttributeWrites.some(write => write === name || name.startsWith(`${write}.`)))
  // Follow only source-qualified public module imports. The chain contributes
  // dependency bytes; importing/executing a module is never simulated here.
  const nameFacts = (text: string, active = new Set<string>()): { candidates: StructureSymbol[]; sources: StructureBindingSource[]; gap?: string } => {
    if (!active.size && nameFactsCache.has(text)) return nameFactsCache.get(text)!
    if (active.has(text)) return { candidates: [], sources: [], gap: "source-import-reexport-cycle" }
    const direct = lexicalMatching(text), parts = text.split(".")
    let modules: FileScope[] = [], root = "", suffix: string[] = []
    for (let i = parts.length - 1; i > 0; i--) {
      const module = parts.slice(0, i).join("."), exact = scopes.filter(s => s.language === "python" && s.module === module), found = exact.length ? exact : scopes.filter(s => s.language === "python" && s.module.endsWith(`.${module}`))
      if (found.length) { modules = found; root = parts[i]!; suffix = parts.slice(i + 1); break }
    }
    let facts: { candidates: StructureSymbol[]; sources: StructureBindingSource[]; gap?: string } = { candidates: direct, sources: [] }
    if (modules.length > 1) facts = { candidates: [], sources: modules.flatMap(s => s.moduleAliasSources[root] ?? []), gap: "source-import-reexport-ambiguous" }
    else if (modules.length === 1 && Object.hasOwn(modules[0]!.aliases, root)) {
      const scope = modules[0]!, source = scope.moduleAliasSources[root], target = source?.target
      const sources = source ? [source] : []
      if (!source || scope.parsePartial || target?.startsWith(".") || scope.moduleAssignments[root] !== 1 || scope.moduleAliases[root] !== target || importWrites(`${scope.module}.${root}`) || importWrites(target!)) facts = { candidates: [], sources, gap: target?.startsWith(".") ? "source-import-reexport-relative-unmodeled" : "source-import-reexport-binding-unresolved" }
      else {
        const next = nameFacts([target, ...suffix].join("."), new Set(active).add(text)), terminalBound = next.candidates.every(s => !scopeFor(s).parsePartial && s.attributes.moduleBinding === "unconditional" && !s.attributes.bindingWrapped && s.boundary === "complete" && stableSourceBinding(s.name, scopeFor(s)))
        facts = { candidates: terminalBound && !next.gap ? next.candidates : [], sources: uniqueBindingSources([...sources, ...next.sources]), ...(next.gap || !terminalBound || !next.candidates.length ? { gap: next.gap ?? (!terminalBound ? "source-import-reexport-target-unresolved" : "source-import-reexport-target-missing") } : {}) }
      }
    }
    if (!active.size) nameFactsCache.set(text, facts)
    return facts
  }
  const matching = (text: string) => nameFacts(text).candidates
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
    if (!match) {
      if (nameFacts(unknown).sources.length && !stableSourceBinding(text, scope)) return `source-import-reexport-unresolved:${unknown}`
      const classes = matching(unknown).filter(s => s.kind === "class")
      return classes.length === 1 ? classes[0]!.qualifiedName : unknown
    }
    if (!stableSourceBinding(match[1]!, scope)) return unknown
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
  const classBindingSources = (className: string): StructureBindingSource[] => {
    const owners = linearize(className) ?? [className]
    return structuredClone(uniqueBindingSources([...nameFacts(className).sources, ...owners.flatMap(owner => matching(owner).filter(s => s.kind === "class").flatMap(cls => cls.bases.flatMap(base => nameFacts(qualified(base, scopeFor(cls))).sources)))]))
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
    if (nameFacts(moduleQualified(r.constructor, scope)).sources.length && !stableSourceBinding(r.constructor, scope)) return []
    const candidates = matching(moduleQualified(r.constructor, scope)).filter(s => s.kind === "class")
    return candidates.length === 1 ? [{ name: `${scope.module}.${r.name}`, className: candidates[0]!.qualifiedName, path: scope.path, sha256: scope.sha256, classSha256: candidates[0]!.sha256, bindingSources: nameFacts(moduleQualified(r.constructor, scope)).sources, source: { path: scope.path, sha256: scope.sha256, startLine: r.startLine, endLine: r.endLine } }] : []
  })).filter(instance => !scopes.some(scope => scope.moduleAttributeWrites.some(write => instance.name === write || instance.name.endsWith(`.${write}`) || write.startsWith(`${instance.name}.`) || instance.name.split(".").some((_, i, parts) => write.startsWith(`${parts.slice(i).join(".")}.`)))))
  const instanceBinding = (name: string) => {
    const exact = moduleInstances.filter(v => v.name === name), candidates = exact.length ? exact : moduleInstances.filter(v => v.name.endsWith(`.${name}`))
    return candidates.length === 1 ? candidates[0] : undefined
  }
  const returnedInstances = new Map<string, { targetId: string; creationEndLine: number; binding?: StructureCallableBinding; bindingSources: StructureBindingSource[]; gap?: string }>()
  function resolveCall(raw: FileScope["rawCalls"][number], scope: FileScope, receiverClass?: string): StructureCall {
    const call = structuredClone(raw.call), parts = call.expression.split("."), name = parts.pop()!, root = parts[0], owner = symbols.find(s => s.id === call.ownerId)
    let candidates: StructureSymbol[] = [], basis: string[] = []
    const returned = !parts.length && owner && returnedInstances.get(`${owner.id}:${name}`)
    if (returned) {
      if (returned.binding && call.startLine > returned.creationEndLine) { candidates = symbols.filter(s => s.id === returned.targetId); call.callableBinding = structuredClone(returned.binding) }
      else call.gap = returned.gap ?? "source-returned-callable-before-creation"
      if (returned.bindingSources.length) call.bindingSources = structuredClone(returned.bindingSources)
      basis = ["AST unique current factory result, subsequent direct invocation and stable captured parameter environment"]
    }
    else if (scope.language === "python" && /^super\(\)\.[A-Za-z_]\w*$/.test(call.expression) && owner?.className) {
      const mro = linearize(receiverClass ?? owner.className), position = mro?.indexOf(owner.className) ?? -1
      if (mro && position >= 0) for (const cls of mro.slice(position + 1)) {
        candidates = symbols.filter(s => s.className === cls && s.name === name)
        if (candidates.length) break
      }
      basis = ["AST zero-argument super after defining class in actual C3 receiver"]
      if (candidates.length && mro) call.receiverClass = mro[0]
    }
    else if (!parts.length && scope.language === "python" && raw.localNames.includes(name)) {
      const local = scope.symbols.filter(s => s.name === name && s.localCallable?.ownerId === owner?.id)
      if (local.length === 1 && !local[0]!.localCallable!.gap && call.startLine > local[0]!.endLine) candidates = local
      else call.gap = local.length === 1 ? local[0]!.localCallable!.gap ?? "source-local-callable-before-definition" : "source-local-callable-binding-unresolved"
      basis = ["AST local binding shadows module/import scope; direct callable and stable parameter captures required"]
    }
    else if (!parts.length) {
      const facts = nameFacts(qualified(name, scope))
      candidates = facts.candidates.filter(s => !s.className); basis = ["AST unqualified name in module/import scope"]
      if (facts.sources.length) call.bindingSources = structuredClone(facts.sources)
      call.gap = facts.gap
      if (facts.sources.length && !stableSourceBinding(name, scope)) { candidates = []; call.gap = "source-import-reexport-consumer-binding-unresolved" }
    }
    else if (root && raw.localNames.includes(root) && !raw.types[root]) { basis = ["AST local or parameter shadows module receiver without a bound type"] }
    else if (root && (raw.types[root] || root === "self" && receiverClass)) {
      const sourceType = (text: string, from: FileScope) => {
        const type = qualified(text, from), facts = nameFacts(type)
        if (facts.sources.length) call.bindingSources = uniqueBindingSources([...call.bindingSources ?? [], ...facts.sources])
        if (facts.sources.length && Object.hasOwn(from.aliases, cleanType(text).split(".")[0]!) && !stableSourceBinding(text, from)) { call.gap = "source-import-reexport-consumer-binding-unresolved"; return "" }
        return type
      }
      let type = root === "self" && receiverClass ? receiverClass : sourceType(raw.types[root]!, scope)
      for (const p of parts.slice(1)) { const a = attribute(type, p); type = a ? sourceType(a.value, a.scope) : "" }
      const facts = nameFacts(type), classes = facts.candidates.filter(s => s.kind === "class")
      if (facts.sources.length) call.bindingSources = uniqueBindingSources([...call.bindingSources ?? [], ...facts.sources])
      call.gap ??= facts.gap
      if (classes.length === 1) type = classes[0]!.qualifiedName
      candidates = type ? lookupMethod(type, name) : []; basis = ["AST parameter/receiver type and explicit field chain", ...(owner?.className ? ["C3 inheritance/override lookup"] : [])]
      if (candidates.length && type) call.receiverClass = type
    } else if (scope.language === "python" && root && scope.moduleAliases[root] && scope.moduleAssignments[root] !== 1) {
      basis = ["AST module import alias is reassigned; the original instance is not a current receiver proof"]
    } else {
      const facts = nameFacts(scope.language === "python" ? moduleQualified(call.expression, scope) : qualified(call.expression, scope))
      candidates = facts.candidates; basis = [scope.aliases[root ?? ""] ? "AST import/alias binding" : "AST qualified source binding"]
      if (facts.sources.length) call.bindingSources = structuredClone(facts.sources)
      call.gap = facts.gap
      const instance = !candidates.length && scope.language === "python" && call.receiver ? instanceBinding(moduleQualified(call.receiver, scope)) : undefined
      if (instance) {
        candidates = lookupMethod(instance.className, name); basis.push("AST unique unreassigned module constructor instance and C3 method lookup")
        if (instance.bindingSources.length) call.bindingSources = uniqueBindingSources([...call.bindingSources ?? [], ...instance.bindingSources])
        if (candidates.length === 1) { call.receiverClass = instance.className; call.receiverBinding = { schemaVersion: "source-module-instance/v1", name: instance.name, className: instance.className, classSha256: instance.classSha256, source: instance.source } }
        else if (candidates.length) call.receiverClass = instance.className
      }
    }
    if (call.receiverClass) {
      const sources = uniqueBindingSources([...call.bindingSources ?? [], ...classBindingSources(call.receiverClass)])
      if (sources.length) call.bindingSources = sources
    }
    call.candidateIds = candidates.map(c => c.id); call.resolution = candidates.length === 1 ? "resolved" : candidates.length > 1 ? "ambiguous" : "unresolved"; call.basis = basis
    if (!candidates.length) call.gap ??= "receiver/import/value binding unavailable; unique lexical name is not a call edge"
    return call
  }
  // Declared return types and explicit constructor assignments are bounded
  // source bindings. Dynamic/unannotated returns do not inherit a unique name.
  for (const scope of scopes) {
    const locals = new Map<string, Record<string, string>>()
    for (const raw of scope.rawCalls) {
      const key = raw.call.ownerId ?? "$module", known = locals.get(key) ?? {}; Object.assign(raw.types, known)
      const resolved = resolveCall(raw, scope), target = resolved.candidateIds.length === 1 ? symbols.find(s => s.id === resolved.candidateIds[0]) : undefined
      const returnedTargets = target ? symbols.filter(s => s.returnedCallable?.ownerId === target.id) : []
      if (raw.callableResult && target && returnedTargets.length) {
        const callable = returnedTargets.length === 1 ? returnedTargets[0] : undefined, proof = callable?.returnedCallable
        const arguments_ = sourceArgumentBindings({ symbols, relatedCalls: (id, receiver) => scopes.flatMap(s => s.rawCalls.filter(r => r.call.ownerId === id).map(r => resolveCall(r, s, receiver))) }, resolved, target)
        const captures = proof?.captures.map(c => arguments_.bindings.find(b => b.parameter === c.name)) ?? []
        const gap = !callable || !proof ? "source-returned-callable-return-ambiguous" : proof.gap
          ?? (!raw.callableResult.stable ? "source-returned-callable-instance-binding-unresolved"
            : target.localCallable || !stableSourceBinding(target.name, scopeFor(target)) || !stableSourceBinding(raw.call.expression, scope) ? "source-returned-callable-factory-binding-unresolved"
            : arguments_.gap ? `source-returned-callable-${arguments_.gap}`
            : captures.some(c => !c || !c.literalKnown && !raw.callableResult!.stableParameters.includes(c.expression)) ? "source-returned-callable-capture-value-unresolved" : undefined)
        const binding: StructureCallableBinding | undefined = !gap && callable && proof ? { schemaVersion: "source-returned-callable/v1", name: raw.callableResult.name, targetId: callable.id, factoryId: target.id, factorySha256: target.sha256, creationCallId: raw.call.id, source: { path: raw.call.path, sha256: raw.call.sha256, startLine: raw.call.startLine, endLine: raw.call.endLine }, captures: captures.map(c => ({ parameter: c!.parameter, expression: c!.expression, literalKnown: c!.literalKnown, ...(c!.literalKnown ? { literalValue: c!.literalValue! } : {}) })) } : undefined
        returnedInstances.set(`${key}:${raw.callableResult.name}`, { targetId: callable?.id ?? "", creationEndLine: raw.call.endLine, bindingSources: resolved.bindingSources ?? [], ...(binding ? { binding } : {}), ...(gap ? { gap } : {}) })
      }
      const returned = target?.kind === "class" ? target.qualifiedName : target?.returns.length === 1 && !/[(),]/.test(target.returns[0]!) ? qualified(target.returns[0]!, scopeFor(target)) : undefined
      for (const name of raw.call.resultNames.filter(name => /^[A-Za-z_]\w*$/.test(name))) if (returned) known[name] = returned; else delete known[name]
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
    const classSources = symbols.filter(s => s.kind === "class" && owners.includes(s.qualifiedName)).map(s => [s.id, s.path, s.sha256])
    return hash([mro, classSources, lookupMethod(className, method).map(s => [s.id, s.sha256]), classBindingSources(className), relevant.map(s => [s.path, s.aliases]), moduleInstances.filter(i => owners.includes(i.className) || relevant.some(s => s.path === i.path))])
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
      const bindingSources = uniqueBindingSources([...nameFacts(constructor).sources, ...names ? nameFacts(qualified(argument, scope)).sources : []])
      const gap = syntaxGap ?? (!stableSourceBinding(call.expression, scope) ? "framework-constructor-rebound"
        : constructor.endsWith("Security") || call.arguments.length !== 1 ? "framework-dependency-options-unsupported"
        : !names ? "framework-dependency-target-dynamic"
        : candidates.some(s => s.attributes.moduleBinding !== "unconditional") ? "framework-dependency-target-binding-unresolved"
        : !stableSourceBinding(argument, scope) || candidates.some(s => !stableSourceBinding(s.name, scopeFor(s))) ? "framework-dependency-target-rebound"
        : candidates.some(s => s.attributes.bindingWrapped && !routes.some(r => r.candidateIds.includes(s.id) && !r.bindingGap)) ? "framework-dependency-target-wrapper-unmodeled"
        : candidates.length !== 1 ? candidates.length ? "framework-dependency-target-ambiguous" : "framework-dependency-target-missing" : undefined)
      return [{ id: `framework-${hash([symbolId, call.id, parameter]).slice(0, 24)}`, sourceCallId: call.id, ownerId: symbolId, ...(parameter ? { parameter } : {}), constructor, expression: argument, candidateIds: candidates.map(s => s.id), resolution: gap ? candidates.length > 1 ? "ambiguous" as const : "unresolved" as const : "resolved" as const, model: "fastapi-source-injection/v1" as const, ...(bindingSources.length ? { bindingSources } : {}), ...(gap ? { gap } : {}) }]
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
      const bindingSources = uniqueBindingSources([...nameFacts(name).sources, ...cls ? classBindingSources(cls.qualifiedName) : []])
      const middlewareBases = matching("starlette.middleware.base.BaseHTTPMiddleware").filter(s => s.kind === "class").map(s => s.qualifiedName)
      const methodCandidates = cls ? ["__init__", "__call__", ...(mro?.some(owner => middlewareBases.includes(owner)) ? ["dispatch"] : [])].flatMap(method => lookupMethod(cls.qualifiedName, method).map(s => ({ method, candidateId: s.id }))) : []
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
      return { id: `middleware-${hash([routeId, call.id]).slice(0, 24)}`, sourceCallId: call.id, routerName, expression, qualifiedName: cls?.qualifiedName ?? name, arguments: call.arguments.filter((_, i) => i !== targetIndex), source: { path: call.path, sha256: call.sha256, startLine: call.startLine, endLine: call.endLine }, registrationContext: structuredClone(registrationContext), candidateIds: candidates.map(s => s.id), ...(cls ? { receiverClass: cls.qualifiedName } : {}), methodCandidates, sources: classSources.map(s => ({ id: s.id, path: s.path, sha256: s.sha256 })), ...(bindingSources.length ? { bindingSources } : {}), registrationBinding, executionOrder: "unproven", model: "fastapi-source-asgi/v1", ...(gap ? { gap } : {}) }
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
      const bindingSources = classBindingSources(receiverClass)
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
        if (router) bindingSources.push(...router.bindingSources, ...classBindingSources(router.className))
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
      facts.push({ id: `action-${hash([receiverClass, method.id, decorator.id]).slice(0, 24)}`, receiverClass, actionName: method.name, sourceId: method.id, sourceCallId: decorator.sourceCallId, constructor: decorator.expression, arguments: decorator.arguments.map(a => a.parameter ? `${a.parameter}=${a.expression}` : a.expression), source: { path: method.path, sha256: method.sha256, startLine: decorator.startLine, endLine: decorator.endLine }, ...(typeof detail?.literalValue === "boolean" ? { detail: detail.literalValue } : {}), ...(typeof url?.literalValue === "string" ? { urlPath: url.literalValue } : {}), methodMappings, routeIds, sourceCandidates, sources: [...sourceSymbols.values()].map(s => ({ id: s.id, path: s.path, sha256: s.sha256 })), ...(bindingSources.length ? { bindingSources } : {}), mappingBinding: "unproven", invocation: "unproven", model: "drf-source-action/v1", ...(gap ? { gap } : {}) })
    }
    actionCache.set(receiverClass, facts); return structuredClone(facts)
  }
  const classDecoratorCache = new Map<string, StructureClassDecorator[]>()
  /** Declarative source work only: a factory returning a local callable does
   * not establish the class identity, mutations, exceptions or invocation. */
  const classDecorators = (receiverClass: string): StructureClassDecorator[] => {
    if (classDecoratorCache.has(receiverClass)) return structuredClone(classDecoratorCache.get(receiverClass)!)
    const facts: StructureClassDecorator[] = [], mro = linearize(receiverClass), owners = mro ?? [receiverClass], receiverSources = owners.flatMap(owner => matching(owner).filter(s => s.kind === "class"))
    const receiverBound = !!mro && owners.every(owner => matching(owner).filter(s => s.kind === "class").length === 1) && receiverSources.every(s => stableSourceBinding(s.name, scopeFor(s)))
    for (const cls of receiverSources) for (const declaration of cls.decorators ?? []) {
      const scope = scopeFor(cls), sourceSymbols = new Map<string, StructureSymbol>(), sourceCandidates: StructureClassDecorator["sourceCandidates"] = []
      const retain = (s: StructureSymbol) => sourceSymbols.set(s.id, s)
      const offer = (role: StructureClassDecorator["sourceCandidates"][number]["role"], candidates: StructureSymbol[]) => { for (const s of candidates) { retain(s); if (!sourceCandidates.some(c => c.role === role && c.candidateId === s.id)) sourceCandidates.push({ role, candidateId: s.id }) } }
      receiverSources.forEach(retain)
      const named = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(declaration.expression), factoryCall = declaration.sourceCallId && calls.find(c => c.id === declaration.sourceCallId)
      const bindingSources = uniqueBindingSources([...classBindingSources(receiverClass), ...named ? nameFacts(qualified(declaration.expression, scope)).sources : []])
      const definitionsBound = cls.attributes.moduleBinding === "unconditional", candidates = named && definitionsBound ? matching(qualified(declaration.expression, scope)).filter(s => s.kind === "function" && !s.className) : []
      const role = declaration.sourceCallId ? "factory" : "decorator"
      offer(role, candidates)
      const returned = candidates.flatMap(c => returnedCallables.get(c.id) ?? []).flatMap(id => symbols.filter(s => s.id === id))
      if (declaration.sourceCallId) offer("returned-callable", returned)
      if (definitionsBound) for (const call of calls.filter(c => c.path === cls.path && c.startLine >= declaration.startLine && c.endLine <= declaration.endLine && c.id !== declaration.sourceCallId)) if (call.resolution === "resolved" && /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(call.expression) && stableSourceBinding(call.expression, scope)) { offer("argument-call", call.candidateIds.flatMap(id => symbols.filter(s => s.id === id))); bindingSources.push(...call.bindingSources ?? []) }
      for (const source of [...candidates, ...returned]) for (const call of relatedCalls(source.id)) if (call.resolution === "resolved") { offer("helper", call.candidateIds.flatMap(id => symbols.filter(s => s.id === id))); bindingSources.push(...call.bindingSources ?? []) }
      const gap = !definitionsBound ? "source-class-decorator-definition-binding-unresolved"
        : !named ? "source-class-decorator-target-dynamic"
        : !stableSourceBinding(declaration.expression, scope) || candidates.some(s => !stableSourceBinding(s.name, scopeFor(s))) ? "source-class-decorator-target-rebound"
        : candidates.length !== 1 ? candidates.length ? "source-class-decorator-source-ambiguous" : "source-class-decorator-source-missing"
        : candidates.some(s => s.attributes.bindingWrapped || s.attributes.callableAsync || s.boundary !== "complete") ? "source-class-decorator-callable-binding-unresolved"
        : !receiverBound ? "source-class-decorator-receiver-binding-unresolved"
        : declaration.sourceCallId && (!factoryCall || factoryCall.resolution !== "resolved" || !returned.length) ? "source-class-decorator-return-unresolved" : undefined
      facts.push({ id: `class-decorator-${hash([receiverClass, cls.id, declaration.id]).slice(0, 24)}`, receiverClass, declaringClass: cls.qualifiedName, sourceId: cls.id, declarationId: declaration.id, ...(declaration.sourceCallId ? { sourceCallId: declaration.sourceCallId } : {}), expression: declaration.expression, arguments: declaration.arguments.map(a => a.parameter ? `${a.parameter}=${a.expression}` : a.expression), source: { path: cls.path, sha256: cls.sha256, startLine: declaration.startLine, endLine: declaration.endLine }, sourceCandidates, sources: [...sourceSymbols.values()].map(s => ({ id: s.id, path: s.path, sha256: s.sha256 })), ...(bindingSources.length ? { bindingSources: uniqueBindingSources(bindingSources) } : {}), invocation: "unproven", transformation: "unproven", model: "source-class-decorator/v1", ...(gap ? { gap } : {}) })
    }
    classDecoratorCache.set(receiverClass, facts); return structuredClone(facts)
  }
  const parserVersion = "@vscode/tree-sitter-wasm@0.3.1", relationshipVersion = "source-bindings/v14"
  const withSymbolSyntax = <T>(symbolId: string, visit: (root: Node, symbol: StructureSymbol) => T): Promise<T> => {
    const symbol = symbols.find(s => s.id === symbolId), file = symbol && files.find(f => f.path === symbol.path)
    if (!symbol || !file || hash(file.content) !== symbol.sha256) throw new Error("structure-source-missing")
    return withSourceSyntax(file.content, symbol.language, root => visit(root, symbol))
  }
  return { schemaVersion: "authorization-structure-index/v1" as const, parser: parserVersion, relationshipVersion, symbols, calls, routes, diagnostics, lookupMethod, attribute, linearize, classBindingSources, candidateRevision, relatedCalls, resolveName, qualifySourceName, requestDependencies, requestMiddleware, requestActions, classDecorators, withSymbolSyntax,
    revision: hash([sourceIdentity, parserVersion, relationshipVersion, symbols, calls, routes, diagnostics]), preparation: { files: files.length, bytes: files.reduce((s, f) => s + Buffer.byteLength(f.content), 0), durationMs: performance.now() - started, targetExecutions: 0 } }
}
export type StructureIndex = Awaited<ReturnType<typeof buildStructureIndex>>
