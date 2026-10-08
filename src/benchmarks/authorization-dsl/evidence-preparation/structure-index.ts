import path from "node:path"
import { createHash } from "node:crypto"
import { Parser, Language, type Node } from "@vscode/tree-sitter-wasm"
import type { DiscoverySymbol } from "./discovery.ts"
import type { FiniteValue } from "../../../task-dsl/authorization/control-evaluation.ts"
import { sourceArgumentBindings } from "./source-arguments.ts"
import { sourceCallableValueName, sourceClassValueName, sourceMethodCaptureName, sourceSyntaxAnchorId } from "./source-identities.ts"

export interface StructureSymbol extends DiscoverySymbol {
  qualifiedName: string; module: string; language: "python" | "go"; className?: string; receiver?: string;
  parameters: Array<{ name: string; type?: string; kind?: "positional-only" | "keyword-only" | "variadic-positional" | "variadic-keyword"; stableForwardPack?: boolean; defaultExpression?: string; defaultLiteralKnown?: boolean; defaultLiteralValue?: FiniteValue }>; returns: string[]; bases: string[]; attributes: Record<string, string>
  decorators?: Array<{ id: string; sourceCallId?: string; expression: string; startLine: number; endLine: number; arguments: Array<{ parameter?: string; expression: string; literalKnown: boolean; literalValue?: FiniteValue }> }>
  localCallable?: {
    schemaVersion: "source-local-callable/v1"; ownerId: string; ownerSha256: string;
    captures: Array<{ name: string; use: { startLine: number; endLine: number; startIndex: number; endIndex: number }; binding?: { ownerId: string; ownerSha256: string }; callable?: { targetId: string; targetSha256: string }; relay?: Array<{ targetId: string; targetSha256: string }> }>;
    gap?: string;
  }
  returnedCallable?: { schemaVersion: "source-returned-callable/v1"; ownerId: string; ownerSha256: string; captures: NonNullable<StructureSymbol["localCallable"]>["captures"]; returnAnchorId?: string; gap?: string }
  valueCallable?: StructureCallableDefinition;
  classDefinition?: StructureClassDefinition;
  classMethod?: { classId: string; ownerId: string; ownerSha256: string; captures: NonNullable<StructureSymbol["localCallable"]>["captures"] };
}
export interface StructureBindingSource { path: string; sha256: string; startLine: number; endLine: number; name: string; target: string }
export interface StructureCallableBinding {
  schemaVersion: "source-returned-callable/v1"; name: string; targetId: string; factoryId: string; factorySha256: string; creationCallId: string;
  source: StructureMethodBinding["source"]; controls: StructureMethodControl[]; order: StructureMethodStore["order"]; callControls?: StructureMethodControl[];
  captures: Array<{ parameter: string; expression: string; literalKnown: boolean; literalValue?: FiniteValue }>;
}
export interface StructureMethodBinding {
  schemaVersion: "source-method-alias/v1"; name: string; receiver: string; method: string; targetId: string; targetSha256: string;
  source: { path: string; sha256: string; startLine: number; endLine: number; startIndex: number; endIndex: number };
}
export interface StructureMethodStore {
  schemaVersion: "source-field-method/v1"; ownerId: string; receiver: string; receiverClass: string; field: string; method: string; targetId: string; targetSha256: string;
  anchorId: string; source: StructureMethodBinding["source"]; controls: StructureMethodControl[]; order: { before: string[][]; after: string[][] };
}
export interface StructureFieldMethod {
  schemaVersion: "source-field-method/v1"; receiver: string; field: string; controls: StructureMethodControl[];
  choices: Array<{ method: string; targetId: string; targetSha256: string; stores: StructureMethodStore[] }>;
}
export interface StructureMethodCapture {
  schemaVersion: "source-method-capture/v1"; sourceCallId: string; receiver: string; receiverClass: string; method: string; targetId: string; targetSha256: string;
  source: StructureMethodBinding["source"]; controls: StructureMethodControl[]; order: StructureMethodStore["order"]; argumentEvents: string[][];
}
export interface StructureArgumentValue {
  schemaVersion: "source-argument-value/v1"; anchorId: string; result: string; operator: "and" | "or";
  left: { literal?: FiniteValue; binding?: string }; right: { literal?: FiniteValue; binding?: string }; leftCallId?: string; rightCallId?: string;
}
export interface StructureCallableDefinition {
  schemaVersion: "source-callable-definition/v1"; ownerId: string; ownerSha256: string; name: string; anchorId: string;
  captures: NonNullable<StructureSymbol["localCallable"]>["captures"]; source: StructureMethodBinding["source"]; controls: StructureMethodControl[]; order: StructureMethodStore["order"]; gap?: string;
}
export interface StructureCallableValue {
  schemaVersion: "source-callable-value/v1"; kind: "module" | "local" | "returned"; expression: string; targetId: string; targetSha256: string;
  source: StructureMethodBinding["source"]; controls: StructureMethodControl[]; order: StructureMethodStore["order"]; evaluationOrder: StructureMethodStore["order"]; definition?: StructureCallableDefinition; creation?: StructureCallableBinding; bindingSources?: StructureBindingSource[];
}
export interface StructureClassValue {
  schemaVersion: "source-class-value/v1"; expression: string; targetId: string; targetSha256: string;
  source: StructureMethodBinding["source"]; controls: StructureMethodControl[]; order: StructureMethodStore["order"]; evaluationOrder: StructureMethodStore["order"]; bindingSources?: StructureBindingSource[];
}
export interface StructureClassDefinition {
  schemaVersion: "source-class-definition/v1"; ownerId: string; ownerSha256: string; name: string; anchorId: string;
  source: StructureMethodBinding["source"]; classSource: StructureMethodBinding["source"]; controls: StructureMethodControl[]; order: StructureMethodStore["order"];
  fields: Array<{ name: string; value: FiniteValue; anchorId: string }>;
  bases: Array<{ expression: string; targetId: string; targetSha256: string }>;
  methods: Array<{ name: string; targetId: string; targetSha256: string; anchorId: string; source: StructureMethodBinding["source"]; captures: NonNullable<StructureSymbol["localCallable"]>["captures"] }>;
  namespace: Array<{ kind: "field" | "method"; anchorId: string }>;
  decorators: Array<{ id: string; expression: string; source: StructureMethodBinding["source"]; valueResult: string; applicationCallId: string; targetId?: string; targetSha256?: string; factoryCallId?: string }>;
  inactive?: boolean; gap?: string;
}
export interface StructureCallableInput {
  targetId: string; targetSha256: string;
  origins: Array<{ sourceCallId: string; parameter: string; source: { id: string; path: string; sha256: string }; value?: StructureCallableValue }>;
}
export interface StructureCallableParameter {
  schemaVersion: "source-callable-parameter/v1"; name: string; ownerId: string; controls: StructureMethodControl[]; order: StructureMethodStore["order"]; choices: StructureCallableInput[];
}
interface MethodAliasFact extends Omit<StructureMethodBinding, "targetId" | "targetSha256"> { gap?: string }
export interface StructureMethodChoice {
  schemaVersion: "source-method-choice/v1"; name: string; receiver: string;
  choices: Array<{ method: string; targetId: string; targetSha256: string; anchorId: string; source: StructureMethodBinding["source"]; controls: Array<{ anchorId: string; branch: "true" | "false" }> }>;
}
interface MethodChoiceFact extends Omit<StructureMethodChoice, "choices"> { choices: Array<Omit<StructureMethodChoice["choices"][number], "targetId" | "targetSha256">>; gap?: string }
export type StructureMethodControl = { kind: "branch"; anchorId: string; branch: "true" | "false" } | { kind: "try"; anchorId: string; region: "body" | "handler" | "otherwise" | "finally"; handlerIndex?: number }
export interface StructureMethodLookup {
  schemaVersion: "source-method-lookup/v2"; name: string; receiver: string; creationCallId: string; source: StructureMethodBinding["source"];
  controls: StructureMethodControl[]; callControls: StructureMethodControl[];
  alternatives: Array<{ method: string; targetId: string; targetSha256: string; anchorId: string; source: StructureMethodBinding["source"]; controls: StructureMethodControl[] }>;
  selector: NonNullable<StructureCall["argumentFacts"]>[number] & { resultBinding?: string }; fallbackExpression?: string;
  fallbackTarget?: { targetId: string; targetSha256: string };
  choices: Array<{ method: string; targetId: string; targetSha256: string; lookup: boolean }>;
}
interface MethodLookupFact extends Omit<StructureMethodLookup, "choices" | "fallbackTarget" | "alternatives"> { alternatives: Array<Omit<StructureMethodLookup["alternatives"][number], "targetId" | "targetSha256">>; gap?: string }
export interface StructureCall {
  id: string; ownerId?: string; path: string; sha256: string; startLine: number; endLine: number; startIndex?: number; endIndex?: number;
  expression: string; receiver?: string; receiverClass?: string; arguments: string[]; candidateIds: string[]; resolution: "resolved" | "ambiguous" | "unresolved";
  basis: string[]; gap?: string; resultNames: string[]; syntaxRole: "condition" | "return" | "argument-default" | "body" | "source-context"
  receiverBinding?: { schemaVersion: "source-module-instance/v1"; name: string; className: string; classSha256: string; source: { path: string; sha256: string; startLine: number; endLine: number } }
  argumentFacts?: Array<{ expression: string; parameterName?: string; spread?: "positional" | "keyword"; literalKnown: boolean; literalValue?: FiniteValue; sourceCallId?: string; valueFlow?: StructureArgumentValue; callableValue?: StructureCallableValue; classValue?: StructureClassValue }>
  bindingSources?: StructureBindingSource[];
  callableBinding?: StructureCallableBinding;
  methodBinding?: StructureMethodBinding;
  methodChoices?: StructureMethodChoice;
  methodLookup?: StructureMethodLookup;
  methodField?: StructureFieldMethod;
  methodCapture?: StructureMethodCapture;
  callableParameter?: StructureCallableParameter;
  capturedCallable?: { ownerId: string; name: string; targetId: string; targetSha256: string; binding: { ownerId: string; ownerSha256: string } };
  implicitClassDecorator?: { definitionAnchorId: string; decoratorId: string; valueResult: string; targetId: string; targetSha256: string };
  classNamespaceCall?: { classId: string; classSha256: string; targetId: string; targetSha256: string };
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
export interface StructureFieldStore {
  model: "source-field-store/v1"; ownerId: string; object: string; field: string; valueExpression?: string; startLine: number; endLine: number; startIndex: number; endIndex: number;
  functionCandidateIds: string[]; sources: Array<{ id: string; path: string; sha256: string }>; bindingSources?: StructureBindingSource[]; gap?: string;
  controls?: StructureMethodControl[];
  order?: StructureMethodStore["order"];
}
interface FileScope { path: string; sha256: string; parsePartial: boolean; module: string; language: "python" | "go"; aliases: Record<string, string>; moduleAliases: Record<string, string>; moduleAliasSources: Record<string, StructureBindingSource>; symbols: StructureSymbol[]; rawCalls: Array<{ call: StructureCall; types: Record<string, string>; argumentSources?: StructureMethodBinding["source"][]; sourceOrder?: StructureMethodStore["order"]; callableOrder?: StructureMethodStore["order"]; calleeEvents?: string[][]; argumentEvents?: string[][][]; reboundNames: string[]; localNames: string[]; groupPaths: string[]; registrationContext: StructureRequestMiddleware["registrationContext"]; methodAlias?: MethodAliasFact; methodChoices?: MethodChoiceFact; methodLookup?: MethodLookupFact; fieldControls?: StructureMethodControl[]; methodCapture?: Omit<StructureMethodCapture, "schemaVersion" | "receiver" | "receiverClass" | "method" | "targetId" | "targetSha256">; callableResult?: { name: string; stable: boolean } }>; fieldStores: Array<Omit<StructureFieldStore, "model" | "functionCandidateIds" | "sources" | "bindingSources" | "gap"> & { localNames: string[] }>; routerAliases: Array<{ name: string; value: string; ownerId?: string; localNames: string[]; startLine: number; endLine: number }>; moduleAssignments: Record<string, number>; moduleAttributeWrites: string[]; constants: Record<string, string>; routers: Array<{ name: string; constructor: string; prefix: string; repeated: boolean; requestOptionsUnmodeled: boolean; startLine: number; endLine: number }>; decorators: Array<{ callId: string; handlerId: string; receiver: string; verb: string; path: string; middleware: string[]; dependencies: Array<{ constructor: string; expression: string; sourceCallId: string; parameter?: string }>; wrapped: boolean }>; includes: Array<{ callId: string; receiver: string; child: string; prefix: string; requestOptionsUnmodeled: boolean }> }
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
function sourceControlPath(node: Node, body: Node, symbolId: string): StructureMethodControl[] | undefined {
  const controls: StructureMethodControl[] = []
  let block = node.parent
  while (block && block.type !== "block") block = block.parent
  while (block && block.id !== body.id) {
    if (block.type !== "block") return
    const parent = block.parent, outer = parent?.type === "else_clause" || parent?.type === "except_clause" || parent?.type === "finally_clause" ? parent.parent : parent
    if (outer?.type === "if_statement" && !children(outer).some(c => c.type === "elif_clause")) {
      const condition = field(outer, "condition"), branch = parent?.type === "else_clause" ? "false" : field(outer, "consequence")?.id === block.id ? "true" : undefined
      if (!condition || !branch) return
      controls.unshift({ kind: "branch", anchorId: sourceSyntaxAnchorId(symbolId, condition.startIndex, condition.endIndex, "condition"), branch })
    } else if (outer?.type === "try_statement") {
      const region = parent?.type === "except_clause" ? "handler" : parent?.type === "else_clause" ? "otherwise" : parent?.type === "finally_clause" ? "finally" : field(outer, "body")?.id === block.id ? "body" : undefined
      if (!region) return
      controls.unshift({ kind: "try", anchorId: sourceSyntaxAnchorId(symbolId, outer.startIndex, outer.endIndex, "control"), region, ...(region === "handler" ? { handlerIndex: children(outer).filter(c => c.type === "except_clause").findIndex(c => c.id === parent!.id) } : {}) })
    } else return
    block = outer.parent
  }
  return block ? controls : undefined
}
function sourceExpressionEvents(expression: Node | null | undefined, symbolId: string, callId: (node: Node) => string, resultBinding?: string): string[][] {
  const callEvent = (call: Node): string[] => {
    const id = sourceSyntaxAnchorId(symbolId, call.startIndex, call.endIndex, "call")
    return [`call-${id}`, `context-${id}`, `effect-${id}`, `method-choice-${id}`, `method-lookup-call-${id}`, `method-lookup-${callId(call)}`, `field-method-call-${id}`, `function-call-${id}`]
  }
  // These are the expression's outer flow events. Right-hand short-circuit
  // calls remain inside their original control; the parent short event orders
  // the whole expression against the store without pretending they always run.
  const expressionEvents = (expression: Node | null | undefined, resultBinding?: string): string[][] => {
    if (!expression) return []
    const left = field(expression, "left"), right = field(expression, "right"), operator = field(expression, "operator")?.text
    if (left && right && ["and", "or"].includes(operator ?? "")) {
      const name = resultBinding ?? `expression-${hash([symbolId, expression.startIndex]).slice(0, 16)}`
      return [...expressionEvents(left), [`short-${sourceSyntaxAnchorId(symbolId, expression.startIndex, expression.endIndex, "control", name)}`]]
    }
    if (expression.type === "call") return [...expressionEvents(field(expression, "function")), ...children(field(expression, "arguments")).flatMap(a => expressionEvents(a.type === "keyword_argument" ? field(a, "value") : a)), callEvent(expression)]
    return children(expression).flatMap(c => expressionEvents(c))
  }
  return expressionEvents(expression, resultBinding)
}
function sourceArgumentValue(value: Node, symbolId: string, callId: (node: Node) => string): StructureArgumentValue | undefined {
  const operator = field(value, "operator")?.text, leftNode = field(value, "left"), rightNode = field(value, "right")
  if (!["and", "or"].includes(operator ?? "") || !leftNode || !rightNode) return
  const operand = (node: Node) => {
    const literal = sourceLiteral(node)
    if (literal.literalKnown) return { value: { literal: literal.literalValue! } }
    if (node.type === "call" && !descendants(node, ["call"]).some(c => c.id !== node.id)) return { value: { binding: `result-${hash([symbolId, node.startIndex]).slice(0, 16)}` }, callId: callId(node) }
    if (/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(node.text)) return { value: { binding: node.text } }
  }
  const left = operand(leftNode), right = operand(rightNode), result = `expression-${hash([symbolId, value.startIndex]).slice(0, 16)}`
  if (!left || !right) return
  return { schemaVersion: "source-argument-value/v1", anchorId: sourceSyntaxAnchorId(symbolId, value.startIndex, value.endIndex, "control", result), result, operator: operator as "and" | "or", left: left.value, right: right.value, ...(left.callId ? { leftCallId: left.callId } : {}), ...(right.callId ? { rightCallId: right.callId } : {}) }
}
function sourceStoreOrder(node: Node, symbolId: string, callId: (node: Node) => string, localAssignments = false): StructureMethodStore["order"] {
  let statement = node
  while (statement.parent && statement.parent.type !== "block") statement = statement.parent
  const siblings = children(statement.parent), position = siblings.findIndex(s => s.id === statement.id)
  const expressionEvents = (node: Node | null | undefined, resultBinding?: string) => sourceExpressionEvents(node, symbolId, callId, resultBinding)
  const event = (statement: Node): string[][] => {
    const node = statement.type === "expression_statement" ? children(statement)[0] : statement
    if (!node) return []
    const cls = node.type === "class_definition" ? node : node.type === "decorated_definition" ? children(node).find(c => c.type === "class_definition") : undefined
    if (cls) return [[`class-bind-${sourceSyntaxAnchorId(symbolId, node.startIndex, node.endIndex, "assignment", field(cls, "name")!.text)}`]]
    const anchor = (kind: string, name?: string) => sourceSyntaxAnchorId(symbolId, node.startIndex, node.endIndex, kind, name)
    if (node.type === "return_statement" || node.type === "raise_statement") return [...expressionEvents(children(node)[0]), [`${node.type === "return_statement" ? "return" : "raise"}-${anchor(node.type === "return_statement" ? "return" : "raise")}`]]
    if (node.type === "if_statement") { const condition = field(node, "condition"); return condition ? [...expressionEvents(condition), [`choose-${sourceSyntaxAnchorId(symbolId, condition.startIndex, condition.endIndex, "condition")}`]] : [] }
    if (node.type === "try_statement") return [[`try-${anchor("control")}`]]
    if (["for_statement", "while_statement"].includes(node.type)) return [[`loop-${anchor("control")}`]]
    if (node.type === "with_statement") return [[`with-${anchor("control")}`]]
    if (node.type === "assignment") {
      const target = field(node, "left"), isField = target?.type === "attribute", values = expressionEvents(field(node, "right"), isField ? `field-result-${hash([symbolId, node.startIndex]).slice(0, 16)}` : target?.text)
      const right = field(node, "right"), local = localAssignments && target?.type === "identifier" && right?.type !== "call" && !["and", "or"].includes(field(right ?? node, "operator")?.text ?? "")
      return [...values, ...isField ? [[`field-${anchor("assignment", target!.text)}`]] : local ? [[`assign-${anchor("assignment", target!.text)}`, `bind-${anchor("assignment", target!.text)}`]] : []]
    }
    return statement.type === "expression_statement" ? expressionEvents(node) : []
  }
  return { before: siblings.slice(0, position).flatMap(event), after: siblings.slice(position + 1).flatMap(event) }
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
        if (descendants(body, ["yield"]).some(owned)) symbol.attributes.callableGenerator = "true"
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
      const parameterCapture = (use: Node, from: Node | null): { capture?: NonNullable<StructureSymbol["localCallable"]>["captures"][number]; gap?: "value" | "scope" | "rebound" } => {
        const scopes: Node[] = []
        for (let node = from; node; node = node.parent) {
          const binding = byNode.get(node.id)
          if (binding?.kind !== "function") continue
          scopes.push(node)
          if (scopes.length > 16 || globalNames.get(binding.id)?.has(use.text)) return { gap: "scope" }
          if (!binding.parameters.some(p => p.name === use.text) && !localNames.get(binding.id)?.has(use.text)) continue
          if (!binding.parameters.some(p => p.name === use.text)) return { gap: "value" }
          if (localWrites.get(binding.id)?.has(use.text)) return { gap: "rebound" }
          if (scopes.some(scope => descendants(field(scope, "body")!, ["match_statement", "nonlocal_statement", "global_statement"]).some(s => s.type === "match_statement" || children(s).some(c => c.text === use.text)))) return { gap: "scope" }
          return { capture: { name: use.text, use: { startLine: use.startPosition.row + 1, endLine: use.endPosition.row + 1, startIndex: use.startIndex, endIndex: use.endIndex }, binding: { ownerId: binding.id, ownerSha256: binding.sha256 } } }
        }
        return {}
      }
      const classCapture = (use: Node, ownerNode: Node, declaration: Node) => {
        const resolved = parameterCapture(use, ownerNode), owner = byNode.get(ownerNode.id)!
        if (resolved.gap !== "value" || !localNames.get(owner.id)?.has(use.text)) return resolved
        const targets = symbols.filter(s => s.name === use.text && s.valueCallable?.ownerId === owner.id), target = targets.length === 1 ? targets[0] : undefined
        if (!target?.valueCallable || target.valueCallable.gap || target.valueCallable.source.endIndex >= declaration.startIndex || localWrites.get(owner.id)?.get(use.text) !== 1 || owner.parameters.some(p => p.name === use.text)) return resolved
        return { capture: { name: use.text, use: { startLine: use.startPosition.row + 1, endLine: use.endPosition.row + 1, startIndex: use.startIndex, endIndex: use.endIndex }, binding: { ownerId: owner.id, ownerSha256: owner.sha256 }, callable: { targetId: target.id, targetSha256: target.sha256 } } }
      }
      // Function definitions and namespace methods depend on each other's
      // source proofs. Recompute to a fixed point before exposing any call edge.
      const definitionProofs = () => JSON.stringify(symbols.map(s => [s.id, s.classDefinition, s.classMethod, s.localCallable, s.valueCallable, s.returnedCallable]))
      const resolveDefinitionProofs = () => {
      if (language === "python") for (const n of definitions.filter(d => d.type === "class_definition")) {
        let parent = n.parent; while (parent && !byNode.has(parent.id)) parent = parent.parent
        const owner = parent && byNode.get(parent.id), symbol = byNode.get(n.id)!
        if (owner?.kind !== "function") continue
        if (localWrites.get(owner.id)?.get(symbol.name) === 1 && !owner.parameters.some(p => p.name === symbol.name)) symbol.attributes.classNamespaceBinding = "stable"
        const declaration = n.parent?.type === "decorated_definition" ? n.parent : n, ownerBody = field(parent!, "body")!, controls = sourceControlPath(declaration, ownerBody, owner.id)
        const source = (node: Node): StructureMethodBinding["source"] => ({ path: file.path, sha256, startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1, startIndex: node.startIndex, endIndex: node.endIndex })
        const anchorId = sourceSyntaxAnchorId(owner.id, declaration.startIndex, declaration.endIndex, "assignment", symbol.name), fields: StructureClassDefinition["fields"] = [], bases: StructureClassDefinition["bases"] = [], methods: StructureClassDefinition["methods"] = [], namespace: StructureClassDefinition["namespace"] = []
        let gap = n.hasError || owner.boundary !== "complete" || owner.attributes.callableAsync || owner.attributes.callableGenerator || owner.attributes.bindingWrapped ? "source-class-definition-owner-unmodeled" : !controls ? "source-class-definition-control-unmodeled" : symbol.bases.length > 16 || field(n, "type_parameters") ? "source-class-definition-base-unmodeled" : globalNames.get(owner.id)?.has(symbol.name) || descendants(ownerBody, ["nonlocal_statement"]).some(s => children(s).some(c => c.text === symbol.name)) ? "source-class-definition-binding-unmodeled" : undefined
        for (const expression of symbol.bases) {
          const candidates = symbols.filter(s => s.kind === "class" && s.name === expression && s.classDefinition?.ownerId === owner.id), base = candidates.length === 1 ? candidates[0] : undefined
          if (!base || base.classDefinition!.gap || base.classDefinition!.source.endIndex >= declaration.startIndex || localWrites.get(owner.id)?.get(expression) !== 1 || owner.parameters.some(p => p.name === expression) || bases.some(b => b.targetId === base.id)) { gap ??= "source-class-definition-base-unmodeled"; continue }
          bases.push({ expression, targetId: base.id, targetSha256: base.sha256 })
        }
        for (const statement of children(field(n, "body"))) {
          if (["comment", "pass_statement"].includes(statement.type) || statement.type === "expression_statement" && children(statement).length === 1 && children(statement)[0]!.type === "string" && sourceLiteral(children(statement)[0]).literalKnown) continue
          if (statement.type === "function_definition") {
            const method = byNode.get(statement.id)!, body = field(statement, "body")!, captures: NonNullable<StructureSymbol["localCallable"]>["captures"] = []
            delete method.classMethod
            const owned = (node: Node) => { let scope = node.parent; while (scope && !["function_definition", "class_definition", "lambda"].includes(scope.type)) scope = scope.parent; return scope?.id === statement.id }
            let methodGap = statement.hasError || /^__.*__$/.test(method.name) || ["constructor", "prototype"].includes(method.name) || method.attributes.callableAsync || method.attributes.callableGenerator || method.attributes.bindingWrapped || method.parameters.some(p => p.type || p.defaultExpression && (!p.defaultLiteralKnown || p.defaultLiteralValue !== null && typeof p.defaultLiteralValue === "object")) || method.returns.length || field(statement, "type_parameters") || descendants(body, ["function_definition", "class_definition", "lambda", "global_statement", "nonlocal_statement"]).length ? "source-class-definition-method-unmodeled" : undefined
            for (const use of descendants(body, ["identifier"]).filter(owned)) {
              if (use.parent?.type === "attribute" && field(use.parent, "attribute")?.id === use.id || use.parent?.type === "keyword_argument" && field(use.parent, "name")?.id === use.id || method.parameters.some(p => p.name === use.text) || localNames.get(method.id)?.has(use.text)) continue
              if (["super", "__class__"].includes(use.text)) { methodGap ??= "source-class-definition-method-cell-unmodeled"; continue }
              const resolved = classCapture(use, parent!, declaration)
              if (resolved.gap) { methodGap ??= "source-class-definition-method-capture-unmodeled"; continue }
              if (resolved.capture && !captures.some(c => c.name === use.text)) captures.push(resolved.capture)
            }
            if (methodGap || captures.length > 16) { gap ??= methodGap ?? "source-class-definition-method-capture-unmodeled"; continue }
            const methodAnchor = sourceSyntaxAnchorId(owner.id, statement.startIndex, statement.endIndex, "assignment", method.name)
            method.classMethod = { classId: symbol.id, ownerId: owner.id, ownerSha256: owner.sha256, captures: structuredClone(captures) }
            lexicalNames.set(method.id, new Set(captures.map(c => c.name)))
            methods.push({ name: method.name, targetId: method.id, targetSha256: method.sha256, anchorId: methodAnchor, source: source(statement), captures }); namespace.push({ kind: "method", anchorId: methodAnchor }); continue
          }
          const assignment = statement.type === "expression_statement" && children(statement).length === 1 ? children(statement)[0] : undefined, left = assignment && field(assignment, "left"), right = assignment && field(assignment, "right"), value = sourceLiteral(right)
          if (assignment?.type !== "assignment" || left?.type !== "identifier" || field(assignment, "type") || !value.literalKnown || /^__.*__$/.test(left.text) || ["constructor", "prototype"].includes(left.text)) { gap ??= "source-class-definition-body-unmodeled"; continue }
          fields.push({ name: left.text, value: value.literalValue!, anchorId: sourceSyntaxAnchorId(owner.id, assignment.startIndex, assignment.endIndex, "assignment", left.text) })
          namespace.push({ kind: "field", anchorId: fields.at(-1)!.anchorId })
        }
        const decorators = children(declaration).filter(d => d.type === "decorator").map(d => {
          const expression = children(d)[0]!, factory = expression.type === "call", id = `decorator-${hash([sourceIdentity, file.path, sha256, d.startIndex]).slice(0, 24)}`
          return { id, expression: expression.text, source: source(d), valueResult: factory ? `result-${hash([owner.id, expression.startIndex]).slice(0, 16)}` : `class-decorator-${id}`, applicationCallId: `class-application-${hash([owner.id, id]).slice(0, 24)}`, ...(factory ? { factoryCallId: `call-${hash([sourceIdentity, file.path, sha256, expression.startIndex]).slice(0, 24)}` } : {}) }
        })
        if (decorators.some(d => !d.factoryCallId && (owner.parameters.some(p => p.name === d.expression.split(".")[0]) || localNames.get(owner.id)?.has(d.expression.split(".")[0]!)))) gap ??= "source-class-definition-decorator-unresolved"
        let ancestor: Node | null = declaration, inactive = false
        while (ancestor && ancestor.id !== parent!.id) {
          if (ancestor.type === "block") {
            const branch = ancestor.parent, conditional = branch?.type === "else_clause" ? branch.parent : branch
            if (conditional?.type === "if_statement") { const condition = sourceLiteral(field(conditional, "condition")); if (typeof condition.literalValue === "boolean" && condition.literalValue !== (branch?.type !== "else_clause")) inactive = true }
          }
          ancestor = ancestor.parent
        }
        symbol.classDefinition = { schemaVersion: "source-class-definition/v1", ownerId: owner.id, ownerSha256: owner.sha256, name: symbol.name, anchorId, source: source(declaration), classSource: source(n), controls: controls ?? [], order: sourceStoreOrder(declaration, owner.id, call => `call-${hash([sourceIdentity, file.path, sha256, call.startIndex]).slice(0, 24)}`, true), fields, bases, methods, namespace, decorators, ...(inactive ? { inactive } : {}), ...(gap ? { gap } : {}) }
      }
      // A local declaration is a source call edge only while its identity and
      // captured cells are fixed. Returned/passed closures need separate actual
      // invocation evidence; finding a nested body does not execute its factory.
      if (language === "python") for (const symbol of symbols.filter(s => s.kind === "function" && s.className && s.parameters[0])) if (localWrites.get(symbol.id)?.has(symbol.parameters[0]!.name) || globalNames.get(symbol.id)?.has(symbol.parameters[0]!.name)) symbol.attributes.instanceReceiverRebound = "true"
      if (language === "python") for (const n of definitions.filter(d => d.type === "function_definition").reverse()) {
        const symbol = byNode.get(n.id), body = field(n, "body")
        let parent = n.parent; while (parent && !byNode.has(parent.id)) parent = parent.parent
        const owner = parent && byNode.get(parent.id)
        if (!symbol || !body || owner?.kind !== "function") continue
        delete symbol.valueCallable; delete symbol.returnedCallable
        const ownerBody = field(parent!, "body")!, declaration = n.parent?.type === "decorated_definition" ? n.parent : n
        const owned = (node: Node, definition: Node) => { let p = node.parent; while (p && !["function_definition", "class_definition", "lambda"].includes(p.type)) p = p.parent; return p?.id === definition.id }
        const captureNames = new Set<string>(), captures: NonNullable<StructureSymbol["localCallable"]>["captures"] = []
        let gap: string | undefined
        if (n.hasError || declaration.parent?.id !== ownerBody.id || symbol.attributes.callableAsync || symbol.attributes.bindingWrapped || symbol.parameters.some(p => p.type || p.defaultExpression && (!p.defaultLiteralKnown || p.defaultLiteralValue !== null && typeof p.defaultLiteralValue === "object")) || symbol.returns.length || descendants(body, ["yield"]).some(i => owned(i, n))) gap = "source-local-callable-definition-unmodeled"
        else if (owner.parameters.some(p => p.name === symbol.name) || localWrites.get(owner.id)?.get(symbol.name) !== 1) gap = "source-local-callable-binding-unresolved"
        const definitionGap = gap
        let captureGap: string | undefined
        const captureIssue = (reason: string) => { gap ??= reason; captureGap ??= reason }
        const references = descendants(ownerBody, ["identifier"]).filter(i => i.text === symbol.name && i.id !== field(n, "name")?.id && !(n.startIndex <= i.startIndex && i.endIndex <= n.endIndex) && !(i.parent?.type === "attribute" && field(i.parent, "attribute")?.id === i.id) && !(i.parent?.type === "keyword_argument" && field(i.parent, "name")?.id === i.id))
        if (!gap && references.some(i => !owned(i, parent!) || i.parent?.type !== "call" || field(i.parent, "function")?.id !== i.id)) gap = "source-local-callable-escape-unmodeled"
        if (descendants(body, ["nonlocal_statement", "global_statement"]).some(i => owned(i, n))) captureIssue("source-local-capture-scope-unmodeled")
        for (const i of descendants(body, ["identifier"]).filter(i => owned(i, n))) {
          if (i.parent?.type === "attribute" && field(i.parent, "attribute")?.id === i.id || i.parent?.type === "keyword_argument" && field(i.parent, "name")?.id === i.id || symbol.parameters.some(p => p.name === i.text) || localNames.get(symbol.id)?.has(i.text)) continue
          const resolved = parameterCapture(i, parent)
          if (!resolved.capture && !resolved.gap) continue
          captureNames.add(i.text)
          if (resolved.gap) { captureIssue(resolved.gap === "value" ? "source-local-capture-value-unresolved" : resolved.gap === "scope" ? "source-local-capture-scope-unmodeled" : "source-local-capture-rebound"); continue }
          if (!captures.some(c => c.name === i.text)) captures.push(resolved.capture!)
        }
        for (const child of symbols) {
          const proof = child.classMethod?.ownerId === symbol.id && !symbols.find(s => s.id === child.classMethod!.classId)?.classDefinition?.gap ? child.classMethod : child.valueCallable?.ownerId === symbol.id && !child.valueCallable.gap ? child.valueCallable : child.localCallable?.ownerId === symbol.id && !child.localCallable.gap ? child.localCallable : undefined
          if (!proof) continue
          for (const capture of proof.captures) {
            if (capture.binding?.ownerId === symbol.id || !capture.binding) continue
            captureNames.add(capture.name)
            if (!captures.some(c => c.name === capture.name)) captures.push({ ...structuredClone(capture), relay: [{ targetId: child.id, targetSha256: child.sha256 }, ...capture.relay ?? []] })
          }
        }
        if (captures.length > 16 || captures.some(c => (c.relay?.length ?? 0) > 16)) captureIssue("source-local-capture-limit")
        lexicalNames.set(symbol.id, captureNames)
        symbol.localCallable = { schemaVersion: "source-local-callable/v1", ownerId: owner.id, ownerSha256: owner.sha256, captures, ...(gap ? { gap } : {}) }
        const valueUse = (i: Node) => i.parent?.type === "argument_list" && i.parent.parent?.type === "call" || i.parent?.type === "keyword_argument" && field(i.parent, "value")?.id === i.id && i.parent.parent?.parent?.type === "call"
        const classCaptureUse = (use: Node) => {
          if (use.parent?.type !== "call" || field(use.parent, "function")?.id !== use.id) return false
          let methodNode = use.parent.parent; while (methodNode && !byNode.has(methodNode.id)) methodNode = methodNode.parent
          const method = methodNode && byNode.get(methodNode.id)
          if (!methodNode || method?.kind !== "function" || method.parameters.some(p => p.name === use.text) || localNames.get(method.id)?.has(use.text) || globalNames.get(method.id)?.has(use.text)) return false
          let classNode = methodNode.parent; while (classNode && !byNode.has(classNode.id)) classNode = classNode.parent
          if (classNode?.type !== "class_definition") return false
          const classDeclaration = classNode.parent?.type === "decorated_definition" ? classNode.parent : classNode
          let classOwner = classDeclaration.parent; while (classOwner && !byNode.has(classOwner.id)) classOwner = classOwner.parent
          return classOwner?.id === parent!.id && n.endIndex < classDeclaration.startIndex && !descendants(field(methodNode, "body")!, ["nonlocal_statement", "global_statement"]).some(s => children(s).some(c => c.text === use.text))
        }
        const nestedScopeUnmodeled = descendants(body, ["function_definition", "class_definition", "lambda"]).some(d => {
          const nested = byNode.get(d.id)
          if (d.type === "class_definition") return !nested?.classDefinition || !!nested.classDefinition.gap
          if (d.type !== "function_definition" || !nested) return true
          if (nested.classMethod) return !symbols.some(s => s.id === nested.classMethod!.classId && s.classDefinition && !s.classDefinition.gap)
          return !(nested.valueCallable && !nested.valueCallable.gap || nested.localCallable && !nested.localCallable.gap)
        })
        if (references.some(i => valueUse(i) || classCaptureUse(i))) {
          const valueGap = definitionGap ?? captureGap ?? (owner.attributes.callableAsync || owner.attributes.callableGenerator || owner.attributes.bindingWrapped || owner.boundary !== "complete" ? "source-callable-value-owner-unmodeled" : nestedScopeUnmodeled ? "source-callable-value-nested-scope-unmodeled" : references.some(i => !classCaptureUse(i) && (!owned(i, parent!) || !(valueUse(i) || i.parent?.type === "call" && field(i.parent, "function")?.id === i.id))) ? "source-callable-value-escape-unmodeled" : undefined)
          symbol.valueCallable = { schemaVersion: "source-callable-definition/v1", ownerId: owner.id, ownerSha256: owner.sha256, name: symbol.name, anchorId: sourceSyntaxAnchorId(owner.id, n.startIndex, n.endIndex, "assignment", symbol.name), captures: structuredClone(captures), source: { path: file.path, sha256, startLine: n.startPosition.row + 1, endLine: n.endPosition.row + 1, startIndex: n.startIndex, endIndex: n.endIndex }, controls: [], order: sourceStoreOrder(n, owner.id, call => `call-${hash([sourceIdentity, file.path, sha256, call.startIndex]).slice(0, 24)}`), ...(valueGap ? { gap: valueGap } : {}) }
        }
        if (descendants(ownerBody, ["return_statement"]).filter(i => owned(i, parent!)).some(i => children(i)[0]?.type === "identifier" && children(i)[0]!.text === symbol.name)) {
          const returns = descendants(ownerBody, ["return_statement"]).filter(i => owned(i, parent!)), last = children(ownerBody).filter(i => i.type !== "comment").at(-1)
          const returnedGap = definitionGap || captureGap ? `source-returned-callable-${(definitionGap ?? captureGap)!.replace(/^source-local-(?:callable-)?/, "")}`
            : nestedScopeUnmodeled ? "source-returned-callable-nested-scope-unmodeled"
            : owner.attributes.callableAsync || owner.attributes.bindingWrapped || owner.boundary !== "complete" || descendants(ownerBody, ["yield"]).some(i => owned(i, parent!)) ? "source-returned-callable-factory-unmodeled"
            : returns.length !== 1 || returns[0]!.id !== last?.id || children(last!)[0]?.text !== symbol.name ? "source-returned-callable-return-unmodeled"
            : references.some(i => !owned(i, parent!) || !(i.parent?.id === last?.id || valueUse(i) || i.parent?.type === "call" && field(i.parent, "function")?.id === i.id)) ? "source-returned-callable-escape-unmodeled" : undefined
          symbol.returnedCallable = { schemaVersion: "source-returned-callable/v1", ownerId: owner.id, ownerSha256: owner.sha256, captures: structuredClone(captures), ...(last?.type === "return_statement" ? { returnAnchorId: sourceSyntaxAnchorId(owner.id, last.startIndex, last.endIndex, "return") } : {}), ...(returnedGap ? { gap: returnedGap } : {}) }
          if (!returnedGap) symbol.valueCallable = { schemaVersion: "source-callable-definition/v1", ownerId: owner.id, ownerSha256: owner.sha256, name: symbol.name, anchorId: sourceSyntaxAnchorId(owner.id, n.startIndex, n.endIndex, "assignment", symbol.name), captures: structuredClone(captures), source: { path: file.path, sha256, startLine: n.startPosition.row + 1, endLine: n.endPosition.row + 1, startIndex: n.startIndex, endIndex: n.endIndex }, controls: [], order: sourceStoreOrder(n, owner.id, call => `call-${hash([sourceIdentity, file.path, sha256, call.startIndex]).slice(0, 24)}`) }
        }
      }
      }
      let definitionsSettled = language !== "python"
      if (language === "python") for (let pass = 0; pass < 32; pass++) {
        const previous = definitionProofs(); resolveDefinitionProofs()
        if (definitionProofs() === previous) { definitionsSettled = true; break }
      }
      if (!definitionsSettled) for (const symbol of symbols) {
        if (symbol.classDefinition) symbol.classDefinition.gap = "source-class-definition-proof-limit"
        if (symbol.localCallable) symbol.localCallable.gap = "source-local-callable-proof-limit"
        if (symbol.valueCallable) symbol.valueCallable.gap = "source-callable-value-proof-limit"
        if (symbol.returnedCallable) symbol.returnedCallable.gap = "source-returned-callable-proof-limit"
        delete symbol.classMethod
      }
      const moduleAttributeWrites: string[] = [], routerAliases: FileScope["routerAliases"] = [], fieldStores: FileScope["fieldStores"] = []
      if (language === "python") for (const n of descendants(root, ["assignment", "augmented_assignment", "delete_statement"])) {
        let owner = n.parent; while (owner && !byNode.has(owner.id)) owner = owner.parent
        const symbol = owner && byNode.get(owner.id), target = field(n, "left")
        const value = field(n, "right")
        const store = n.type === "assignment" && target?.type === "attribute" && value?.type !== "assignment" && /^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\.([A-Za-z_]\w*)$/.exec(target.text)
        if (symbol?.kind === "function" && store) fieldStores.push({ ownerId: symbol.id, object: store[1]!, field: store[2]!, ...(value && /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(value.text) ? { valueExpression: value.text } : {}), controls: sourceControlPath(n, field(owner!, "body")!, symbol.id), order: sourceStoreOrder(n, symbol.id, call => `call-${hash([sourceIdentity, file.path, sha256, call.startIndex]).slice(0, 24)}`), startLine: n.startPosition.row + 1, endLine: n.endPosition.row + 1, startIndex: n.startIndex, endIndex: n.endIndex, localNames: [...new Set([...symbol.parameters.map(p => p.name), ...localNames.get(symbol.id) ?? [], ...lexicalNames.get(symbol.id) ?? []])] })
        if (n.type === "assignment" && target?.type === "identifier" && value && /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(value.text)) routerAliases.push({ name: target.text, value: value.text, ...(symbol && !globalNames.get(symbol.id)?.has(target.text) ? { ownerId: symbol.id } : {}), localNames: symbol?.kind === "function" ? [...new Set([...symbol.parameters.map(p => p.name), ...localNames.get(symbol.id) ?? []])] : [], startLine: n.startPosition.row + 1, endLine: n.endPosition.row + 1 })
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
        const argumentFacts = language === "python" ? children(field(n, "arguments")).map(a => {
          const value = a.type === "keyword_argument" ? field(a, "value")! : a, valueFlow = symbol?.kind === "function" ? sourceArgumentValue(value, symbol.id, call => `call-${hash([sourceIdentity, file.path, sha256, call.startIndex]).slice(0, 24)}`) : undefined
          return { expression: boundedText(value), ...(value.type === "call" ? { sourceCallId: `call-${hash([sourceIdentity, file.path, sha256, value.startIndex]).slice(0, 24)}` } : {}), ...(a.type === "keyword_argument" ? { parameterName: field(a, "name")!.text } : {}), ...(a.type === "list_splat" ? { spread: "positional" as const } : a.type === "dictionary_splat" ? { spread: "keyword" as const } : {}), ...(valueFlow ? { valueFlow } : {}), ...sourceLiteral(value) }
        }) : undefined
        let methodAlias: MethodAliasFact | undefined, methodChoices: MethodChoiceFact | undefined, methodLookup: MethodLookupFact | undefined
        if (language === "python" && symbol?.kind === "function" && /^[A-Za-z_]\w*$/.test(expression)) {
          const body = field(owner!, "body")!, owned = (node: Node) => { let p = node.parent; while (p && !["function_definition", "class_definition", "lambda"].includes(p.type)) p = p.parent; return p?.id === owner!.id }
          const assignments = descendants(body, ["assignment"]).filter(a => owned(a) && field(a, "left")?.type === "identifier" && field(a, "left")?.text === expression && field(a, "right")?.type === "attribute")
          if (assignments.length) {
            const assignment = assignments[0]!, value = field(assignment, "right")!, receiver = field(value, "object")!.text, method = field(value, "attribute")!.text, declaration = assignment.parent?.type === "expression_statement" ? assignment.parent : assignment
            const references = descendants(body, ["identifier"]).filter(i => i.text === expression && i.id !== field(assignment, "left")?.id && !(i.parent?.type === "attribute" && field(i.parent, "attribute")?.id === i.id) && !(i.parent?.type === "keyword_argument" && field(i.parent, "name")?.id === i.id))
            const mutated = descendants(body, ["assignment", "augmented_assignment", "delete_statement", "call"]).some(a => owned(a) && (a.type === "call" ? ["setattr", "delattr"].includes(field(a, "function")?.text ?? "") && children(field(a, "arguments"))[0]?.text === receiver : !(a.type === "assignment" && field(a, "left")?.type === "attribute") && (a.type === "delete_statement" ? children(a) : [field(a, "left")]).some(target => target?.text === value.text)))
            const gap = root.hasError || assignments.length !== 1 || declaration.parent?.id !== body.id || localWrites.get(symbol.id)?.get(expression) !== 1 || symbol.parameters.some(p => p.name === expression) || globalNames.get(symbol.id)?.has(expression) || descendants(body, ["nonlocal_statement", "match_statement"]).some(owned) ? "source-method-alias-binding-unresolved"
              : symbol.attributes.methodBinding === "static" || symbol.attributes.bindingWrapped || symbol.attributes.callableAsync || symbol.decorators?.length ? "source-method-alias-owner-unmodeled"
              : !symbol.className || receiver !== symbol.parameters[0]?.name || localWrites.get(symbol.id)?.has(receiver) ? "source-method-alias-receiver-unresolved"
              : references.some(i => !owned(i) || i.parent?.type !== "call" || field(i.parent, "function")?.id !== i.id) ? "source-method-alias-escape-unmodeled"
              : mutated ? "source-method-alias-target-rebound" : undefined
            methodAlias = { schemaVersion: "source-method-alias/v1", name: expression, receiver, method, source: { path: file.path, sha256, startLine: assignment.startPosition.row + 1, endLine: assignment.endPosition.row + 1, startIndex: assignment.startIndex, endIndex: assignment.endIndex }, ...(gap ? { gap } : {}) }
            if (assignments.length > 1) {
              let controlGap = false
              const choices = assignments.map(a => {
                const rhs = field(a, "right")!, controls: StructureMethodChoice["choices"][number]["controls"] = []
                let block = (a.parent?.type === "expression_statement" ? a.parent : a).parent
                while (block && block.id !== body.id) {
                  const parent = block.parent, branch = parent?.type === "if_statement" && field(parent, "consequence")?.id === block.id ? "true" : parent?.type === "else_clause" ? "false" : undefined
                  const conditional = branch === "false" ? parent?.parent : parent, condition = conditional && field(conditional, "condition")
                  if (block.type !== "block" || conditional?.type !== "if_statement" || !branch || !condition || children(conditional).some(c => c.type === "elif_clause")) { controlGap = true; break }
                  controls.unshift({ anchorId: sourceSyntaxAnchorId(symbol.id, condition.startIndex, condition.endIndex, "condition"), branch }); block = conditional.parent
                }
                if (!block) controlGap = true
                return { method: field(rhs, "attribute")!.text, anchorId: sourceSyntaxAnchorId(symbol.id, a.startIndex, a.endIndex, "assignment", expression), source: { path: file.path, sha256, startLine: a.startPosition.row + 1, endLine: a.endPosition.row + 1, startIndex: a.startIndex, endIndex: a.endIndex }, controls }
              })
              const leftIds = new Set(assignments.map(a => field(a, "left")!.id)), values = new Set(assignments.map(a => field(a, "right")!.text))
              const choiceGap = root.hasError || assignments.length > 16 || controlGap || localWrites.get(symbol.id)?.get(expression) !== assignments.length || symbol.parameters.some(p => p.name === expression) || globalNames.get(symbol.id)?.has(expression) || descendants(body, ["nonlocal_statement", "match_statement"]).some(owned) ? "source-method-choice-binding-unresolved"
                : symbol.attributes.methodBinding === "static" || symbol.attributes.bindingWrapped || symbol.attributes.callableAsync || symbol.decorators?.length ? "source-method-choice-owner-unmodeled"
                : !symbol.className || receiver !== symbol.parameters[0]?.name || localWrites.get(symbol.id)?.has(receiver) || assignments.some(a => field(field(a, "right")!, "object")!.text !== receiver) ? "source-method-choice-receiver-unresolved"
                : references.some(i => !leftIds.has(i.id) && (!owned(i) || i.parent?.type !== "call" || field(i.parent, "function")?.id !== i.id)) ? "source-method-choice-escape-unmodeled"
                : descendants(body, ["assignment", "augmented_assignment", "delete_statement", "call"]).some(a => owned(a) && (a.type === "call" ? ["setattr", "delattr"].includes(field(a, "function")?.text ?? "") && children(field(a, "arguments"))[0]?.text === receiver : !(a.type === "assignment" && field(a, "left")?.type === "attribute") && (a.type === "delete_statement" ? children(a) : [field(a, "left")]).some(target => !!target && values.has(target.text)))) ? "source-method-choice-target-rebound" : undefined
              methodChoices = { schemaVersion: "source-method-choice/v1", name: expression, receiver, choices, ...(choiceGap ? { gap: choiceGap } : {}) }
            }
          }
        }
        if (language === "python" && symbol?.kind === "function" && /^[A-Za-z_]\w*$/.test(expression)) {
          const body = field(owner!, "body")!, owned = (node: Node) => { let p = node.parent; while (p && !["function_definition", "class_definition", "lambda"].includes(p.type)) p = p.parent; return p?.id === owner!.id }
          const declarations = descendants(body, ["assignment"]).filter(a => owned(a) && field(a, "left")?.type === "identifier" && field(a, "left")?.text === expression && field(a, "right")?.type === "call" && field(field(a, "right")!, "function")?.text === "getattr")
          if (declarations.length) {
            const a = declarations[0]!, creation = field(a, "right")!, args = children(field(creation, "arguments")), receiver = args[0]?.text ?? "", selector = args[1], fallbackExpression = args[2]?.text
            const assignments = descendants(body, ["assignment"]).filter(c => owned(c) && field(c, "left")?.type === "identifier" && field(c, "left")?.text === expression), ordinary = assignments.filter(c => field(c, "right")?.type === "attribute"), leftIds = new Set(assignments.map(c => field(c, "left")!.id))
            const controlPath = (node: Node) => sourceControlPath(node, body, symbol.id)
            const source = (node: Node) => ({ path: file.path, sha256, startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1, startIndex: node.startIndex, endIndex: node.endIndex })
            const controls = controlPath(a), callControls = controlPath(n), alternatives = ordinary.map(c => ({ method: field(field(c, "right")!, "attribute")!.text, anchorId: sourceSyntaxAnchorId(symbol.id, c.startIndex, c.endIndex, "assignment", expression), source: source(c), controls: controlPath(c) }))
            const references = descendants(body, ["identifier"]).filter(i => i.text === expression && !leftIds.has(i.id) && !(i.parent?.type === "attribute" && field(i.parent, "attribute")?.id === i.id) && !(i.parent?.type === "keyword_argument" && field(i.parent, "name")?.id === i.id))
            const gap = root.hasError || declarations.length !== 1 || !controls || !callControls || alternatives.some(c => !c.controls) || alternatives.length > 16 || assignments.length !== ordinary.length + 1 || localWrites.get(symbol.id)?.get(expression) !== assignments.length || symbol.parameters.some(p => p.name === expression) || globalNames.get(symbol.id)?.has(expression) || descendants(body, ["nonlocal_statement", "match_statement"]).some(owned) || !selector || args.length < 2 || args.length > 3 || args.some(c => ["keyword_argument", "list_splat", "dictionary_splat"].includes(c.type)) ? "source-method-lookup-binding-unresolved"
              : symbol.parameters.some(p => p.name === "getattr") || localNames.get(symbol.id)?.has("getattr") || lexicalNames.get(symbol.id)?.has("getattr") || moduleAssignments.getattr || Object.hasOwn(aliases, "getattr") ? "source-method-lookup-builtin-shadowed"
              : symbol.attributes.methodBinding === "static" || symbol.attributes.bindingWrapped || symbol.attributes.callableAsync || symbol.decorators?.length ? "source-method-lookup-owner-unmodeled"
              : !symbol.className || receiver !== symbol.parameters[0]?.name || localWrites.get(symbol.id)?.has(receiver) || ordinary.some(c => field(field(c, "right")!, "object")?.text !== receiver) ? "source-method-lookup-receiver-unresolved"
              : references.some(i => !owned(i) || i.parent?.type !== "call" || field(i.parent, "function")?.id !== i.id) ? "source-method-lookup-escape-unmodeled"
              : references.some(i => JSON.stringify(children(field(i.parent!, "arguments")).map(c => c.text)) !== JSON.stringify(children(field(n, "arguments")).map(c => c.text))) ? "source-method-lookup-call-shape-unmodeled"
              : fallbackExpression && !new RegExp(`^${receiver}\\.[A-Za-z_]\\w*$`).test(fallbackExpression) ? "source-method-lookup-default-unmodeled"
              : descendants(body, ["assignment", "augmented_assignment", "delete_statement", "call"]).some(c => owned(c) && (c.type === "call" ? ["setattr", "delattr"].includes(field(c, "function")?.text ?? "") && children(field(c, "arguments"))[0]?.text === receiver : !(c.type === "assignment" && field(c, "left")?.type === "attribute") && (c.type === "delete_statement" ? children(c) : [field(c, "left")]).some(t => t?.text.startsWith(`${receiver}.`)))) ? "source-method-lookup-target-rebound" : undefined
            methodLookup = { schemaVersion: "source-method-lookup/v2", name: expression, receiver, creationCallId: `call-${hash([sourceIdentity, file.path, sha256, creation.startIndex]).slice(0, 24)}`, source: source(a), controls: controls ?? [], callControls: callControls ?? [], alternatives: alternatives.map(c => ({ ...c, controls: c.controls ?? [] })), selector: { expression: selector?.text ?? "", ...selector ? sourceLiteral(selector) : { literalKnown: false }, ...(selector?.type === "call" ? { sourceCallId: `call-${hash([sourceIdentity, file.path, sha256, selector.startIndex]).slice(0, 24)}`, resultBinding: `result-${hash([symbol.id, selector.startIndex]).slice(0, 16)}` } : {}) }, ...(fallbackExpression ? { fallbackExpression } : {}), ...(gap ? { gap } : {}) }
          }
        }
        let methodCapture: FileScope["rawCalls"][number]["methodCapture"]
        const callId = (call: Node) => `call-${hash([sourceIdentity, file.path, sha256, call.startIndex]).slice(0, 24)}`
        const parent = n.parent, topLevel = parent?.type === "expression_statement" || parent?.type === "return_statement" && children(parent)[0]?.id === n.id || parent?.type === "assignment" && field(parent, "right")?.id === n.id
        if (language === "python" && symbol?.kind === "function" && fn.type === "attribute" && topLevel && descendants(field(n, "arguments")!, ["call"]).length) {
          const controls = sourceControlPath(n, field(owner!, "body")!, symbol.id), callId = (call: Node) => `call-${hash([sourceIdentity, file.path, sha256, call.startIndex]).slice(0, 24)}`
          if (controls) methodCapture = { sourceCallId: callId(n), source: { path: file.path, sha256, startLine: fn.startPosition.row + 1, endLine: fn.endPosition.row + 1, startIndex: fn.startIndex, endIndex: fn.endIndex }, controls, order: sourceStoreOrder(n, symbol.id, callId), argumentEvents: children(field(n, "arguments")).flatMap(a => sourceExpressionEvents(a, symbol.id, callId)) }
        }
        let callableResult: FileScope["rawCalls"][number]["callableResult"]
        if (language === "python" && symbol?.kind === "function" && resultNames.length === 1 && assignment) {
          const name = resultNames[0]!, body = field(owner!, "body"), declaration = assignment.parent?.type === "expression_statement" ? assignment.parent : assignment
          const references = body ? descendants(body, ["identifier"]).filter(i => i.text === name && i.id !== field(assignment!, "left")?.id && !(i.parent?.type === "attribute" && field(i.parent, "attribute")?.id === i.id) && !(i.parent?.type === "keyword_argument" && field(i.parent, "name")?.id === i.id)) : []
          const direct = (i: Node) => { let p = i.parent; while (p && !["function_definition", "class_definition", "lambda"].includes(p.type)) p = p.parent; return p?.id === owner?.id && (i.parent?.type === "call" && field(i.parent, "function")?.id === i.id || i.parent?.type === "argument_list" && i.parent.parent?.type === "call" || i.parent?.type === "keyword_argument" && field(i.parent, "value")?.id === i.id && i.parent.parent?.parent?.type === "call") }
          const stable = !root.hasError && assignment.type === "assignment" && field(assignment, "left")?.type === "identifier" && field(assignment, "right")?.id === n.id && declaration.parent?.id === body?.id && !symbol.parameters.some(p => p.name === name) && localWrites.get(symbol.id)?.get(name) === 1 && references.every(direct)
          callableResult = { name, stable }
        }
        rawCalls.push({ types, ...(language === "python" && symbol?.kind === "function" ? { sourceOrder: sourceStoreOrder(n, symbol.id, callId), callableOrder: sourceStoreOrder(n, symbol.id, callId, true), calleeEvents: sourceExpressionEvents(field(n, "function"), symbol.id, callId), argumentEvents: children(field(n, "arguments")).map(a => sourceExpressionEvents(a.type === "keyword_argument" ? field(a, "value") : a, symbol.id, callId)) } : {}), argumentSources: children(field(n, "arguments")).map(a => { const v = a.type === "keyword_argument" ? field(a, "value")! : a; return { path: file.path, sha256, startLine: v.startPosition.row + 1, endLine: v.endPosition.row + 1, startIndex: v.startIndex, endIndex: v.endIndex } }), reboundNames: [...localWrites.get(symbol?.id ?? "")?.keys() ?? [], ...globalNames.get(symbol?.id ?? "") ?? []], ...(methodCapture ? { methodCapture } : {}), ...(language === "python" && symbol?.kind === "function" ? { fieldControls: sourceControlPath(n, field(owner!, "body")!, symbol.id) } : {}), localNames: language === "python" && symbol?.kind === "function" ? [...new Set([...symbol.parameters.map(p => p.name), ...localNames.get(symbol.id) ?? [], ...lexicalNames.get(symbol.id) ?? []])] : [], groupPaths, registrationContext, ...(methodAlias ? { methodAlias } : {}), ...(methodChoices ? { methodChoices } : {}), ...(methodLookup ? { methodLookup } : {}), ...(callableResult ? { callableResult } : {}), call: { id: `call-${hash([sourceIdentity, file.path, sha256, n.startIndex]).slice(0, 24)}`, ...(symbol ? { ownerId: symbol.id } : {}), path: file.path, sha256, startLine: n.startPosition.row + 1, endLine: n.endPosition.row + 1, startIndex: n.startIndex, endIndex: n.endIndex, expression, ...(expression.includes(".") ? { receiver: expression.slice(0, expression.lastIndexOf(".")) } : {}), arguments: args, ...(argumentFacts ? { argumentFacts } : {}), candidateIds: [], resolution: "unresolved", basis: [], resultNames, syntaxRole } })
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
      scopes.push({ path: file.path, sha256, parsePartial: root.hasError, module, language, aliases, moduleAliases, moduleAliasSources, symbols, rawCalls, fieldStores, routerAliases, moduleAssignments, moduleAttributeWrites, constants, routers, decorators, includes })
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
  const returnedInstances = new Map<string, { targetId: string; binding?: StructureCallableBinding; bindingSources: StructureBindingSource[]; gap?: string }>()
  const methodStoreCache = new Map<string, StructureMethodStore[]>()
  const callableInputs = new Map<string, StructureCallableInput[]>(), callableInputGaps = new Map<string, string>()
  const callableInputKey = (owner: StructureSymbol, name: string) => {
    if (owner.parameters.some(p => p.name === name)) return `${owner.id}:${name}`
    const proof = owner.classMethod ?? (owner.valueCallable && !owner.valueCallable.gap ? owner.valueCallable : owner.localCallable && !owner.localCallable.gap ? owner.localCallable : undefined), capture = proof?.captures.find(c => c.name === name)
    return capture ? `${capture.binding?.ownerId ?? proof!.ownerId}:${name}` : undefined
  }
  const argumentPlacement = (owner: StructureSymbol, raw: FileScope["rawCalls"][number], position: number) => ({ controls: raw.fieldControls!, order: raw.sourceOrder!, evaluationOrder: { before: [...raw.calleeEvents ?? [], ...raw.argumentEvents?.slice(0, position).flat() ?? []], after: [...raw.argumentEvents?.slice(position + 1).flat() ?? [], [`call-${sourceSyntaxAnchorId(owner.id, raw.call.startIndex!, raw.call.endIndex!, "call")}`, `context-${sourceSyntaxAnchorId(owner.id, raw.call.startIndex!, raw.call.endIndex!, "call")}`, `effect-${sourceSyntaxAnchorId(owner.id, raw.call.startIndex!, raw.call.endIndex!, "call")}`, `function-call-${sourceSyntaxAnchorId(owner.id, raw.call.startIndex!, raw.call.endIndex!, "call")}`]] } })
  const classValue = (expression: string, owner: StructureSymbol | undefined, scope: FileScope, raw: FileScope["rawCalls"][number], position: number): StructureClassValue | undefined => {
    const source = raw.argumentSources?.[position]
    if (!owner || !source || !raw.fieldControls || !raw.sourceOrder || !/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(expression) || owner.parameters.some(p => p.name === expression.split(".")[0]) || raw.localNames.includes(expression.split(".")[0]!) || !stableSourceBinding(expression, scope)) return
    const facts = nameFacts(qualified(expression, scope)), candidates = facts.candidates.filter(s => s.kind === "class")
    const target = !facts.gap && candidates.length === 1 ? candidates[0] : undefined
    if (!target || target.language !== "python" || target.className || target.attributes.bindingWrapped || target.attributes.moduleBinding !== "unconditional" || target.boundary !== "complete" || target.bases.length || !stableSourceBinding(target.name, scopeFor(target))) return
    return { schemaVersion: "source-class-value/v1", expression, targetId: target.id, targetSha256: target.sha256, source, ...argumentPlacement(owner, raw, position), ...(facts.sources.length ? { bindingSources: structuredClone(facts.sources) } : {}) }
  }
  const callableValue = (expression: string, owner: StructureSymbol | undefined, scope: FileScope, raw: FileScope["rawCalls"][number], position: number): StructureCallableValue | undefined => {
    const source = raw.argumentSources?.[position]
    if (!owner || !source || !raw.fieldControls || !raw.sourceOrder) return
    const placement = argumentPlacement(owner, raw, position)
    const childId = raw.call.argumentFacts?.[position]?.sourceCallId, child = childId && scope.rawCalls.find(r => r.call.id === childId && r.call.ownerId === owner.id && r.call.startIndex === source.startIndex && r.call.endIndex === source.endIndex)
    const returned = child ? returnedCreation(child, scope, resolveCall(child, scope), child.call.resultNames[0] ?? `result-${hash([owner.id, child.call.startIndex]).slice(0, 16)}`) : returnedInstances.get(`${owner.id}:${expression}`)
    if (returned?.binding && (child || returned.binding.source.endIndex < source.startIndex)) {
      const target = symbols.find(s => s.id === returned.targetId && s.valueCallable && !s.valueCallable.gap)
      if (target) return { schemaVersion: "source-callable-value/v1", kind: "returned", expression, targetId: target.id, targetSha256: target.sha256, source, ...placement, definition: structuredClone(target.valueCallable), creation: structuredClone(returned.binding), ...(returned.bindingSources.length ? { bindingSources: structuredClone(returned.bindingSources) } : {}) }
    }
    if (!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(expression)) return
    const local = scope.symbols.filter(s => s.valueCallable?.ownerId === owner.id && s.name === expression), definition = local.length === 1 ? local[0]!.valueCallable : undefined
    if (definition && !definition.gap && definition.source.endIndex < source.startIndex) return { schemaVersion: "source-callable-value/v1", kind: "local", expression, targetId: local[0]!.id, targetSha256: local[0]!.sha256, source, ...placement, definition: structuredClone(definition) }
    if (owner.parameters.some(p => p.name === expression.split(".")[0]) || scope.rawCalls.some(r => r.call.ownerId === owner.id && r.localNames.includes(expression.split(".")[0]!)) || !stableSourceBinding(expression, scope)) return
    const facts = nameFacts(qualified(expression, scope)), targets = facts.candidates.filter(s => s.kind === "function" && !s.className && !s.localCallable && !s.attributes.bindingWrapped && !s.attributes.callableAsync && !s.attributes.callableGenerator && s.boundary === "complete" && stableSourceBinding(s.name, scopeFor(s)))
    if (facts.gap || targets.length !== 1) return
    return { schemaVersion: "source-callable-value/v1", kind: "module", expression, targetId: targets[0]!.id, targetSha256: targets[0]!.sha256, source, ...placement, ...(facts.sources.length ? { bindingSources: structuredClone(facts.sources) } : {}) }
  }
  const ordinaryFieldClass = (owner: StructureSymbol | undefined, actualClass?: string) => {
    const mro = actualClass ? linearize(actualClass) : undefined, classes = (mro ?? []).flatMap(name => matching(name).filter(s => s.kind === "class"))
    const gap = !owner?.className || owner.attributes.bindingWrapped || owner.attributes.callableAsync || owner.decorators?.length || owner.attributes.instanceReceiverRebound || owner.boundary !== "complete" || scopeFor(owner).parsePartial ? "source-field-method-owner-unmodeled"
      : !actualClass || !mro || !mro.includes(owner.className) || mro.some(name => classes.filter(c => c.qualifiedName === name).length !== 1) || classes.some(c => c.attributes.bindingWrapped || !stableSourceBinding(c.name, scopeFor(c))) ? "source-field-method-class-binding-unresolved"
      : ["__getattribute__", "__getattr__", "__setattr__"].some(name => lookupMethod(actualClass, name).length) ? "source-field-method-descriptor-unmodeled" : undefined
    return { mro: mro ?? [], classes, gap }
  }
  const methodStores = (symbolId: string, receiverClass?: string): StructureMethodStore[] => {
    const key = JSON.stringify([symbolId, receiverClass])
    if (methodStoreCache.has(key)) return structuredClone(methodStoreCache.get(key)!)
    const owner = symbols.find(s => s.id === symbolId), scope = owner && scopeFor(owner), actualClass = receiverClass ?? owner?.className, { classes, gap } = ordinaryFieldClass(owner, actualClass)
    const facts = !owner || !scope || gap ? [] : scope.fieldStores.filter(s => s.ownerId === symbolId && s.controls && s.object === owner.parameters[0]?.name && s.valueExpression?.startsWith(`${s.object}.`)).flatMap(s => {
      const method = s.valueExpression!.slice(s.object.length + 1)
      if (!/^[A-Za-z_]\w*$/.test(method) || classes.some(c => Object.hasOwn(c.attributes, method))) return []
      const targets = lookupMethod(actualClass!, method), target = targets.length === 1 ? targets[0] : undefined
      if (!target || target.attributes.bindingWrapped || target.attributes.callableAsync || target.decorators?.length || target.boundary !== "complete") return []
      const source = { path: scope.path, sha256: scope.sha256, startLine: s.startLine, endLine: s.endLine, startIndex: s.startIndex, endIndex: s.endIndex }
      return [{ schemaVersion: "source-field-method/v1" as const, ownerId: owner.id, receiver: s.object, receiverClass: actualClass!, field: s.field, method, targetId: target.id, targetSha256: target.sha256, source, controls: s.controls!, order: s.order!, anchorId: sourceSyntaxAnchorId(owner.id, s.startIndex, s.endIndex, "assignment", `${s.object}.${s.field}`) }]
    })
    methodStoreCache.set(key, facts); return structuredClone(facts)
  }
  const namespaceMro = (symbol: StructureSymbol, stack: string[] = []): StructureSymbol[] | undefined => {
    if (!symbol.classDefinition || symbol.classDefinition.gap || stack.includes(symbol.id) || stack.length >= 16) return
    const bases = symbol.classDefinition.bases.map(base => symbols.find(s => s.id === base.targetId && s.sha256 === base.targetSha256))
    if (bases.some(base => !base)) return
    const inherited = bases.map(base => namespaceMro(base!, [...stack, symbol.id]))
    if (inherited.some(mro => !mro)) return
    const sequences = [...inherited.map(mro => [...mro!]), [...bases as StructureSymbol[]]], result = [symbol]
    while (sequences.some(sequence => sequence.length)) {
      const head = sequences.map(sequence => sequence[0]).find(head => head && sequences.every(sequence => !sequence.slice(1).some(s => s.id === head.id)))
      if (!head || result.length >= 64) return
      result.push(head); for (const sequence of sequences) if (sequence[0]?.id === head.id) sequence.shift()
    }
    return result
  }
  function resolveCall(raw: FileScope["rawCalls"][number], scope: FileScope, receiverClass?: string): StructureCall {
    const call = structuredClone(raw.call), parts = call.expression.split("."), name = parts.pop()!, root = parts[0], owner = symbols.find(s => s.id === call.ownerId)
    let candidates: StructureSymbol[] = [], basis: string[] = []
    const returned = !parts.length && owner && returnedInstances.get(`${owner.id}:${name}`)
    if (returned) {
      if (returned.binding && call.startIndex! > returned.binding.source.endIndex && raw.fieldControls) { candidates = symbols.filter(s => s.id === returned.targetId); call.callableBinding = { ...structuredClone(returned.binding), callControls: raw.fieldControls } }
      else call.gap = returned.gap ?? "source-returned-callable-before-creation"
      if (returned.bindingSources.length) call.bindingSources = structuredClone(returned.bindingSources)
      basis = ["AST unique current factory result, subsequent direct invocation and stable captured parameter environment"]
    }
    else if (raw.methodLookup) {
      const proof = raw.methodLookup, actualClass = receiverClass ?? owner?.className, mro = actualClass ? linearize(actualClass) : undefined, classes = (mro ?? []).flatMap(name => symbols.filter(s => s.kind === "class" && s.qualifiedName === name))
      const ordinary = (method: string) => { const targets = actualClass ? lookupMethod(actualClass, method) : []; return targets.length === 1 && !classes.some(c => Object.hasOwn(c.attributes, method)) && !targets[0]!.attributes.bindingWrapped && !targets[0]!.attributes.callableAsync && !targets[0]!.decorators?.length ? targets[0] : undefined }
      const compatible = (target?: StructureSymbol) => !!target && !sourceArgumentBindings({ symbols, relatedCalls: () => [] }, { ...call, receiver: proof.receiver }, target).gap
      const choices = [...new Set(symbols.filter(s => mro?.includes(s.className ?? "") && s.kind === "function").map(s => s.name))].flatMap(method => { const target = ordinary(method); return target && compatible(target) ? [{ method, targetId: target.id, targetSha256: target.sha256, lookup: true }] : [] }).filter(c => !proof.selector.literalKnown || c.method === proof.selector.literalValue)
      const alternatives = proof.alternatives.map(a => ({ a, target: ordinary(a.method) }))
      for (const { a, target } of alternatives) if (target && compatible(target) && !choices.some(c => c.targetId === target.id)) choices.push({ method: a.method, targetId: target.id, targetSha256: target.sha256, lookup: false })
      const fallback = proof.fallbackExpression ? ordinary(proof.fallbackExpression.slice(proof.receiver.length + 1)) : undefined
      const gap = proof.gap ?? (!actualClass || !mro || !owner?.className || !mro.includes(owner.className) || mro.some(name => classes.filter(c => c.qualifiedName === name).length !== 1) || classes.some(c => c.attributes.bindingWrapped || !stableSourceBinding(c.name, scopeFor(c))) ? "source-method-lookup-class-binding-unresolved"
        : ["__getattribute__", "__getattr__"].some(name => lookupMethod(actualClass, name).length) ? "source-method-lookup-descriptor-unmodeled"
        : proof.fallbackExpression && !fallback ? "source-method-lookup-default-unmodeled"
        : alternatives.some(c => !compatible(c.target)) ? "source-method-lookup-target-unmodeled"
        : choices.length > 16 ? "source-method-lookup-targets-unmodeled" : undefined)
      if (gap) call.gap = gap
      else { candidates = choices.flatMap(c => symbols.filter(s => s.id === c.targetId)); call.receiver = proof.receiver; call.receiverClass = actualClass!; const { gap: _gap, ...fact } = proof; call.methodLookup = { ...fact, alternatives: alternatives.map(({ a, target }) => ({ ...a, targetId: target!.id, targetSha256: target!.sha256 })), choices, ...(fallback ? { fallbackTarget: { targetId: fallback.id, targetSha256: fallback.sha256 } } : {}) }; if (!choices.length) call.gap = "source-method-lookup-attribute-unmodeled" }
      basis = ["AST current ordinary getattr selector and subsequent direct invocation; other attributes and fallback selection remain unproved"]
    }
    else if (raw.methodChoices) {
      const proof = raw.methodChoices, actualClass = receiverClass ?? owner?.className, mro = actualClass ? linearize(actualClass) : undefined, classes = (mro ?? []).flatMap(name => symbols.filter(s => s.kind === "class" && s.qualifiedName === name)), selected = proof.choices.map(choice => ({ choice, targets: actualClass ? lookupMethod(actualClass, choice.method) : [] }))
      const gap = proof.gap ?? (!actualClass || !mro || !owner?.className || !mro.includes(owner.className) || mro.some(name => classes.filter(c => c.qualifiedName === name).length !== 1) || classes.some(c => c.attributes.bindingWrapped || !stableSourceBinding(c.name, scopeFor(c))) ? "source-method-choice-class-binding-unresolved"
        : ["__getattribute__", "__getattr__"].some(name => lookupMethod(actualClass, name).length) ? "source-method-choice-descriptor-unmodeled"
        : selected.some(({ choice, targets }) => classes.some(c => Object.hasOwn(c.attributes, choice.method)) || targets.length !== 1 || targets[0]!.attributes.bindingWrapped || targets[0]!.attributes.callableAsync || targets[0]!.decorators?.length) ? "source-method-choice-target-unmodeled" : undefined)
      if (gap) call.gap = gap
      else {
        candidates = [...new Map(selected.flatMap(s => s.targets).map(s => [s.id, s])).values()]; call.receiver = proof.receiver; call.receiverClass = actualClass!
        call.methodChoices = { schemaVersion: proof.schemaVersion, name: proof.name, receiver: proof.receiver, choices: selected.map(({ choice, targets }) => ({ ...choice, targetId: targets[0]!.id, targetSha256: targets[0]!.sha256 })) }
      }
      basis = ["AST finite ordinary method values retain their original creation branches and current actual receiver targets"]
    }
    else if (raw.methodAlias) {
      const alias = raw.methodAlias, actualClass = receiverClass ?? owner?.className, mro = actualClass ? linearize(actualClass) : undefined, classes = (mro ?? []).flatMap(name => symbols.filter(s => s.kind === "class" && s.qualifiedName === name)), targets = actualClass ? lookupMethod(actualClass, alias.method) : [], target = targets.length === 1 ? targets[0] : undefined
      const gap = alias.gap ?? ((call.startIndex ?? -1) < alias.source.endIndex ? "source-method-alias-before-creation"
        : !actualClass || !mro || !owner?.className || !mro.includes(owner.className) || mro.some(name => classes.filter(c => c.qualifiedName === name).length !== 1) || classes.some(c => c.attributes.bindingWrapped || !stableSourceBinding(c.name, scopeFor(c))) ? "source-method-alias-class-binding-unresolved"
        : ["__getattribute__", "__getattr__"].some(name => lookupMethod(actualClass, name).length) ? "source-method-alias-descriptor-unmodeled"
        : classes.some(c => Object.hasOwn(c.attributes, alias.method)) || !target || target.attributes.bindingWrapped || target.attributes.callableAsync || target.decorators?.length ? "source-method-alias-target-unmodeled" : undefined)
      if (gap) call.gap = gap
      else if (target) { candidates = [target]; call.receiver = alias.receiver; call.receiverClass = actualClass!; const { gap: _gap, ...proof } = alias; call.methodBinding = { ...proof, targetId: target.id, targetSha256: target.sha256 } }
      basis = ["AST unique ordinary bound method alias, stable actual receiver and subsequent direct invocation"]
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
    else if (!parts.length && scope.language === "python" && owner?.classMethod?.captures.some(c => c.name === name && c.callable)) {
      const capture = owner.classMethod.captures.find(c => c.name === name)!, target = symbols.find(s => s.id === capture.callable!.targetId && s.sha256 === capture.callable!.targetSha256), cls = symbols.find(s => s.id === owner.classMethod!.classId)
      call.gap = !capture.binding || !target?.valueCallable || target.valueCallable.gap || !cls?.classDefinition || cls.classDefinition.gap || raw.reboundNames.includes(name) ? "source-callable-capture-binding-unresolved" : call.argumentFacts?.some(a => a.sourceCallId) || raw.argumentEvents?.some(events => events.length) ? "source-callable-capture-call-order-unmodeled" : undefined
      if (!call.gap) { candidates = [target!]; call.capturedCallable = { ownerId: owner.id, name, ...capture.callable!, binding: structuredClone(capture.binding!) } }
      basis = ["AST stable local function captured by the actual namespace method; invocation requires the original function object and saved environment"]
    }
    else if (!parts.length && scope.language === "python" && owner && callableInputKey(owner, name) && callableInputs.has(callableInputKey(owner, name)!)) {
      const key = callableInputKey(owner, name)!, choices = callableInputs.get(key)!
      call.gap = callableInputGaps.get(key) ?? (raw.reboundNames.includes(name) ? "source-callable-parameter-rebound" : owner.attributes.bindingWrapped || owner.attributes.callableAsync || owner.attributes.callableGenerator || owner.boundary !== "complete" || owner.valueCallable?.gap ? "source-callable-parameter-owner-unmodeled" : !raw.fieldControls ? "source-callable-parameter-control-unmodeled" : undefined)
      if (!call.gap) { candidates = choices.flatMap(c => symbols.filter(s => s.id === c.targetId && s.sha256 === c.targetSha256)); call.callableParameter = { schemaVersion: "source-callable-parameter/v1", name, ownerId: owner.id, controls: raw.fieldControls!, order: raw.sourceOrder!, choices: structuredClone(choices) } }
      basis = ["AST current function-valued inputs are possible targets only; invocation requires the actual passed callable object and captured environment"]
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
    else if (scope.language === "python" && owner?.className && parts.length === 1 && root === owner.parameters[0]?.name && !lookupMethod(receiverClass ?? owner.className, name).length && scopes.some(s => s.fieldStores.some(w => w.field === name && symbols.some(o => o.id === w.ownerId && o.className && (linearize(receiverClass ?? owner.className!) ?? []).includes(o.className))))) {
      const actualClass = receiverClass ?? owner.className, current = ordinaryFieldClass(owner, actualClass), stores = symbols.filter(s => s.kind === "function" && s.className && current.mro.includes(s.className)).flatMap(s => methodStores(s.id, actualClass)).filter(s => s.field === name)
      const choices = [...new Set(stores.map(s => s.targetId))].map(targetId => { const matches = stores.filter(s => s.targetId === targetId), store = matches[0]!; return { method: store.method, targetId, targetSha256: store.targetSha256, stores: matches } }).filter(choice => !sourceArgumentBindings({ symbols, relatedCalls: () => [] }, { ...call, receiver: root }, symbols.find(s => s.id === choice.targetId)!).gap)
      call.gap = current.gap ?? (!raw.fieldControls ? "source-field-method-control-unmodeled" : !choices.length ? "source-field-method-value-unresolved" : choices.length > 16 ? "source-field-method-targets-unmodeled" : undefined)
      if (!call.gap) { candidates = choices.flatMap(choice => symbols.filter(s => s.id === choice.targetId)); call.receiver = root; call.receiverClass = actualClass; call.methodField = { schemaVersion: "source-field-method/v1", receiver: root!, field: name, controls: raw.fieldControls!, choices } }
      basis = ["AST possible ordinary method stores on the same instance; only an actually captured current field value can dispatch"]
    }
    else if (scope.language === "python" && owner && parts.length === 1 && scope.symbols.some(s => s.name === root && s.classDefinition?.ownerId === owner.id)) {
      const matches = scope.symbols.filter(s => s.name === root && s.classDefinition?.ownerId === owner.id), cls = matches.length === 1 ? matches[0] : undefined, mro = cls && namespaceMro(cls)
      call.gap = !cls || !mro || cls.attributes.classNamespaceBinding !== "stable" || cls.classDefinition!.source.endIndex >= call.startIndex! ? "source-class-namespace-binding-unresolved" : call.argumentFacts?.some(a => a.sourceCallId) || raw.argumentEvents?.some(events => events.length) ? "source-class-namespace-call-order-unmodeled" : undefined
      if (!call.gap) for (const base of mro!) {
        const proof = base.classDefinition!, last = [...proof.namespace].reverse().find(entry => entry.kind === "method" ? proof.methods.some(m => m.anchorId === entry.anchorId && m.name === name) : proof.fields.some(f => f.anchorId === entry.anchorId && f.name === name))
        if (!last) continue
        const method = last.kind === "method" && proof.methods.find(m => m.anchorId === last.anchorId), target = method && symbols.find(s => s.id === method.targetId && s.sha256 === method.targetSha256)
        if (target) { candidates = [target]; call.classNamespaceCall = { classId: cls!.id, classSha256: cls!.sha256, targetId: target.id, targetSha256: target.sha256 } }
        break
      }
      basis = ["AST local class namespace C3 candidates; actual class attribute function object and captures required; class access supplies no implicit self"]
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
    call.argumentFacts?.forEach((argument, i) => { const value = callableValue(argument.expression, owner, scope, raw, i), cls = classValue(argument.expression, owner, scope, raw, i); if (value) argument.callableValue = value; if (cls) argument.classValue = cls })
    const captureTarget = candidates.length === 1 ? candidates[0] : undefined, captureClass = call.receiverClass ?? owner?.className
    if (raw.methodCapture && owner?.className && call.receiver === owner.parameters[0]?.name && captureTarget?.className && call.expression === `${call.receiver}.${captureTarget.name}` && !call.gap && !call.methodBinding && !call.methodChoices && !call.methodLookup && !call.methodField && !ordinaryFieldClass(owner, captureClass).gap && !captureTarget.attributes.bindingWrapped && !captureTarget.attributes.callableAsync && !captureTarget.decorators?.length && captureTarget.boundary === "complete" && !(linearize(captureClass!) ?? []).some(name => symbols.some(s => s.kind === "class" && s.qualifiedName === name && Object.hasOwn(s.attributes, captureTarget.name)))) {
      call.receiverClass = captureClass
      call.methodCapture = { schemaVersion: "source-method-capture/v1", ...raw.methodCapture, receiver: call.receiver!, receiverClass: captureClass!, method: captureTarget.name, targetId: captureTarget.id, targetSha256: captureTarget.sha256 }
    }
    call.argumentFacts?.forEach((argument, position) => {
      const value = argument.callableValue ?? argument.classValue
      if (!value || !owner) return
      const events = (from: number, to: number) => call.argumentFacts!.slice(from, to).flatMap((a, i) => [...raw.argumentEvents?.[from + i] ?? [], ...a.callableValue?.kind === "module" ? [[sourceCallableValueName(owner.id, a.callableValue)]] : [], ...a.classValue ? [[sourceClassValueName(owner.id, a.classValue)]] : []])
      value.evaluationOrder.before = [...call.methodCapture ? [[sourceMethodCaptureName(call.id)]] : raw.calleeEvents ?? [], ...events(0, position)]
      value.evaluationOrder.after = [...events(position + 1, call.argumentFacts!.length), ...value.evaluationOrder.after.slice(-1)]
    })
    call.candidateIds = candidates.map(c => c.id); call.resolution = candidates.length === 1 ? "resolved" : candidates.length > 1 ? "ambiguous" : "unresolved"; call.basis = basis
    if (!candidates.length) call.gap ??= "receiver/import/value binding unavailable; unique lexical name is not a call edge"
    return call
  }
  function returnedCreation(raw: FileScope["rawCalls"][number], scope: FileScope, resolved: StructureCall, name: string) {
    const target = resolved.candidateIds.length === 1 ? symbols.find(s => s.id === resolved.candidateIds[0]) : undefined, returnedTargets = target ? symbols.filter(s => s.returnedCallable?.ownerId === target.id) : [], callable = returnedTargets.length === 1 ? returnedTargets[0] : undefined, proof = callable?.returnedCallable
    if (!target || !returnedTargets.length) return
    const arguments_ = sourceArgumentBindings({ symbols, relatedCalls: (id, receiver) => scopes.flatMap(s => s.rawCalls.filter(r => r.call.ownerId === id).map(r => resolveCall(r, s, receiver))) }, resolved, target), captures = proof?.captures.map(c => arguments_.bindings.find(b => b.parameter === c.name)) ?? []
    const owner = symbols.find(s => s.id === raw.call.ownerId)
    const gap = !callable || !proof ? "source-returned-callable-return-ambiguous" : proof.gap
      ?? (raw.callableResult && !raw.callableResult.stable ? "source-returned-callable-instance-binding-unresolved"
        : !owner || owner.attributes.callableAsync || owner.attributes.callableGenerator || owner.attributes.bindingWrapped || !raw.fieldControls || !raw.callableOrder ? "source-returned-callable-creator-unmodeled"
        : target.localCallable || resolved.gap || !stableSourceBinding(target.name, scopeFor(target)) || !stableSourceBinding(raw.call.expression, scope) ? "source-returned-callable-factory-binding-unresolved"
        : arguments_.gap ? `source-returned-callable-${arguments_.gap}`
        : captures.some(c => !c) ? "source-returned-callable-capture-value-unresolved" : undefined)
    const binding: StructureCallableBinding | undefined = !gap && callable && proof ? { schemaVersion: "source-returned-callable/v1", name, targetId: callable.id, factoryId: target.id, factorySha256: target.sha256, creationCallId: raw.call.id, source: { path: raw.call.path, sha256: raw.call.sha256, startLine: raw.call.startLine, endLine: raw.call.endLine, startIndex: raw.call.startIndex!, endIndex: raw.call.endIndex! }, controls: raw.fieldControls!, order: raw.callableOrder!, captures: captures.map(c => ({ parameter: c!.parameter, expression: c!.expression, literalKnown: c!.literalKnown, ...(c!.literalKnown ? { literalValue: c!.literalValue! } : {}) })) } : undefined
    return { targetId: callable?.id ?? "", bindingSources: resolved.bindingSources ?? [], ...(binding ? { binding } : {}), ...(gap ? { gap } : {}) }
  }
  // Declared return types and explicit constructor assignments are bounded
  // source bindings. Dynamic/unannotated returns do not inherit a unique name.
  for (const scope of scopes) {
    const locals = new Map<string, Record<string, string>>()
    for (const raw of scope.rawCalls) {
      const key = raw.call.ownerId ?? "$module", known = locals.get(key) ?? {}; Object.assign(raw.types, known)
      const resolved = resolveCall(raw, scope), target = resolved.candidateIds.length === 1 ? symbols.find(s => s.id === resolved.candidateIds[0]) : undefined
      const creation = raw.callableResult && returnedCreation(raw, scope, resolved, raw.callableResult.name)
      if (creation) returnedInstances.set(`${key}:${raw.callableResult!.name}`, creation)
      const returned = target?.kind === "class" ? target.qualifiedName : target?.returns.length === 1 && !/[(),]/.test(target.returns[0]!) ? qualified(target.returns[0]!, scopeFor(target)) : undefined
      for (const name of raw.call.resultNames.filter(name => /^[A-Za-z_]\w*$/.test(name))) if (returned) known[name] = returned; else delete known[name]
      locals.set(key, known)
    }
  }
  // Monotone possible-input propagation never executes a function. Actual
  // dispatch separately requires the passed callable object's source identity.
  let callableInputsSettled = false
  const argumentIndex = { symbols, relatedCalls: (id: string, receiver?: string) => scopes.flatMap(scope => scope.rawCalls.filter(r => r.call.ownerId === id).map(r => resolveCall(r, scope, receiver))) }
  for (let iteration = 0; iteration < 128; iteration++) {
    let changed = false
    for (const scope of scopes) for (const raw of scope.rawCalls) {
      const owner = symbols.find(s => s.id === raw.call.ownerId)
      if (!owner || owner.language !== "python") continue
      const call = resolveCall(raw, scope)
      for (const target of call.candidateIds.flatMap(id => symbols.filter(s => s.id === id && s.kind === "function" && !s.attributes.bindingWrapped && !s.attributes.callableAsync))) {
        const arguments_ = sourceArgumentBindings(argumentIndex, call, target)
        if (arguments_.gap) continue
        for (const argument of arguments_.bindings.filter(a => target.parameters.some(p => p.name === a.parameter))) {
          const value = argument.callableValue, inputKey = callableInputKey(owner, argument.expression), forwarded = inputKey && !raw.reboundNames.includes(argument.expression) && !callableInputGaps.has(inputKey) ? callableInputs.get(inputKey) : undefined
          const origin = { sourceCallId: call.id, parameter: argument.parameter, source: { id: owner.id, path: owner.path, sha256: owner.sha256 }, ...(value ? { value } : {}) }, inputs = value ? [{ targetId: value.targetId, targetSha256: value.targetSha256, origins: [origin] }] : forwarded?.map(input => ({ ...input, origins: [...input.origins, origin] })) ?? []
          if (!inputs.length) continue
          const key = `${target.id}:${argument.parameter}`, previous = callableInputs.get(key) ?? [], merged = structuredClone(previous)
          for (const input of inputs) {
            const existing = merged.find(c => c.targetId === input.targetId && c.targetSha256 === input.targetSha256)
            const origins = [...new Map([...(existing?.origins ?? []), ...input.origins].map(o => [JSON.stringify(o), o])).entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, o]) => o)
            if (existing) existing.origins = origins
            else merged.push({ ...input, origins })
          }
          merged.sort((a, b) => a.targetId.localeCompare(b.targetId))
          if (merged.length > 16 || merged.some(c => c.origins.length > 128)) { if (!callableInputGaps.has(key)) { callableInputGaps.set(key, "source-callable-parameter-input-limit"); changed = true }; continue }
          if (JSON.stringify(previous) !== JSON.stringify(merged)) { callableInputs.set(key, merged); changed = true }
        }
      }
    }
    if (!changed) { callableInputsSettled = true; break }
  }
  if (!callableInputsSettled) for (const key of callableInputs.keys()) callableInputGaps.set(key, "source-callable-parameter-input-limit")
  const calls = scopes.flatMap(f => f.rawCalls.map(r => resolveCall(r, f))), routes: StructureRoute[] = [], classApplications: StructureCall[] = []
  for (const symbol of symbols.filter(s => s.classDefinition)) {
    const proof = symbol.classDefinition!, owner = symbols.find(s => s.id === proof.ownerId)!, scope = scopeFor(symbol)
    let input = `class-original-${proof.anchorId}`
    for (const decorator of [...proof.decorators].reverse()) {
      let target: StructureSymbol | undefined, binding: StructureCallableBinding | undefined, bindingSources: StructureBindingSource[] = []
      if (decorator.factoryCallId) {
        const raw = scope.rawCalls.find(r => r.call.id === decorator.factoryCallId && r.call.ownerId === owner.id), resolved = raw && resolveCall(raw, scope), returned = raw && resolved && returnedCreation(raw, scope, resolved, decorator.valueResult)
        if (returned?.binding) { target = symbols.find(s => s.id === returned.targetId); binding = { ...returned.binding, callControls: proof.controls }; bindingSources = returned.bindingSources }
      } else {
        const root = decorator.expression.split(".")[0]!, facts = nameFacts(qualified(decorator.expression, scope))
        const shadowed = owner.parameters.some(p => p.name === root) || owner.localCallable?.captures.some(c => c.name === root) || scope.rawCalls.some(r => r.call.ownerId === owner.id && r.localNames.includes(root))
        const targets = !shadowed && /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(decorator.expression) && stableSourceBinding(decorator.expression, scope) && !facts.gap ? facts.candidates.filter(s => s.kind === "function" && !s.className && !s.localCallable && !s.attributes.bindingWrapped && !s.attributes.callableAsync && !s.attributes.callableGenerator && s.attributes.moduleBinding === "unconditional" && s.boundary === "complete" && stableSourceBinding(s.name, scopeFor(s))) : []
        if (targets.length === 1) { target = targets[0]; bindingSources = facts.sources }
      }
      if (!target) { proof.gap ??= "source-class-definition-decorator-unresolved"; continue }
      decorator.targetId = target.id; decorator.targetSha256 = target.sha256
      const result = `class-applied-${decorator.id}`, application: StructureCall = { id: decorator.applicationCallId, ownerId: owner.id, path: symbol.path, sha256: symbol.sha256, startLine: decorator.source.startLine, endLine: decorator.source.endLine, startIndex: decorator.source.startIndex, endIndex: decorator.source.endIndex, expression: decorator.valueResult, arguments: [input], argumentFacts: [{ expression: input, literalKnown: false }], candidateIds: [target.id], resolution: "resolved", basis: ["Actual implicit class decorator application; expression values evaluated before class creation, applied in reverse source order"], resultNames: [result], syntaxRole: "body", implicitClassDecorator: { definitionAnchorId: proof.anchorId, decoratorId: decorator.id, valueResult: decorator.valueResult, targetId: target.id, targetSha256: target.sha256 }, ...(binding ? { callableBinding: binding } : {}), ...(bindingSources.length ? { bindingSources: structuredClone(bindingSources) } : {}) }
      if (sourceArgumentBindings({ symbols, relatedCalls: () => [application] }, application, target).gap) proof.gap ??= "source-class-definition-decorator-arguments-unresolved"
      classApplications.push(application); input = result
    }
  }
  calls.push(...classApplications)
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
  const relatedCalls = (symbolId: string, receiverClass?: string) => { const route = routes.find(r => r.id === symbolId); return [...scopes.flatMap(f => f.rawCalls.filter(r => route ? r.call.path === route.sourcePath && r.call.id !== route.sourceCallId && r.call.startLine >= route.startLine && r.call.endLine <= route.endLine : r.call.ownerId === symbolId).map(r => resolveCall(r, f, receiverClass))), ...classApplications.filter(c => c.ownerId === symbolId).map(c => structuredClone(c))] }
  const resolveName = (text: string, sourcePath: string) => { const scope = scopes.find(f => f.path === sourcePath); return scope ? matching(qualified(text, scope)) : [] }
  const qualifySourceName = (text: string, sourcePath: string) => { const scope = scopes.find(f => f.path === sourcePath); return scope && stableSourceBinding(text, scope) ? qualified(text, scope) : undefined }
  const fieldStoreCache = new Map<string, StructureFieldStore[]>()
  /** Potential function objects are a protocol boundary, not a callable-body
   * rewrite. Retain negative type/MRO sources so a new method retires old data. */
  const fieldStores = (symbolId: string, receiverClass?: string): StructureFieldStore[] => {
    const key = JSON.stringify([symbolId, receiverClass])
    if (fieldStoreCache.has(key)) return structuredClone(fieldStoreCache.get(key)!)
    const owner = symbols.find(s => s.id === symbolId), scope = owner && scopeFor(owner)
    if (!owner || !scope) return []
    const facts = scope.fieldStores.filter(s => s.ownerId === symbolId).map(raw => {
      const sources = new Map<string, StructureSymbol>(), functions = new Set<string>(), bindingSources: StructureBindingSource[] = [], seenClasses = new Set<string>()
      let aliasUnresolved = false
      let bindingWork = 0, bindingLimit = false
      const withinBudget = () => { if (++bindingWork <= 128) return true; bindingLimit = true; return false }
      const retain = (s: StructureSymbol) => sources.set(s.id, s)
      const functionSource = (s: StructureSymbol) => { retain(s); functions.add(s.id) }
      // Possible sources may remain relevant after rebinding. Following these
      // aliases never grants a callable invocation or proves runtime ordering.
      const storeNames = (text: string, active = new Set<string>()): StructureSymbol[] => {
        if (!withinBudget()) return []
        if (active.has(text)) { aliasUnresolved = true; return [] }
        const next = new Set(active).add(text), facts = nameFacts(text), candidates = [...facts.candidates], parts = text.split(".")
        bindingSources.push(...facts.sources)
        for (const source of facts.sources.filter(s => text === s.name || text.startsWith(`${s.name}.`))) if (!source.target.startsWith(".")) candidates.push(...storeNames(source.target + text.slice(source.name.length), next))
        for (let i = 1; i <= parts.length; i++) for (const { alias, scope: aliasScope, name } of matchingRouterAliases(parts.slice(0, i).join("."))) {
          if (active.has(name)) { aliasUnresolved = true; continue }
          bindingSources.push({ path: aliasScope.path, sha256: aliasScope.sha256, startLine: alias.startLine, endLine: alias.endLine, name, target: qualified(alias.value, aliasScope) })
          candidates.push(...storeNames([qualified(alias.value, aliasScope), ...parts.slice(i)].join("."), new Set(next).add(name)))
        }
        return [...new Map(candidates.map(s => [s.id, s])).values()]
      }
      const classPath = (className: string, parts: string[]) => {
        const pending = [{ className, parts, writers: new Set<string>() }]
        while (pending.length) {
          if (!withinBudget()) return
          const current = pending.pop()!, marker = JSON.stringify([current.className, current.parts, [...current.writers].sort()])
          if (seenClasses.has(marker)) continue
          seenClasses.add(marker)
          const mro = linearize(current.className) ?? [current.className], classes = mro.flatMap(name => matching(name).filter(s => s.kind === "class"))
          classes.forEach(retain); bindingSources.push(...classBindingSources(current.className))
          if (!current.parts.length) continue
          const methods = lookupMethod(current.className, current.parts[0]!); methods.forEach(functionSource)
          if (methods.length) continue
          const stored = attribute(current.className, current.parts[0]!)
          if (stored) {
            const declaring = classes.find(c => Object.hasOwn(c.attributes, current.parts[0]!)), local = declaring && /^[A-Za-z_]\w*$/.test(stored.value) ? symbols.filter(s => s.className === declaring.qualifiedName && s.name === stored.value) : []
            if (local.length) local.forEach(functionSource)
            else {
              for (const s of storeNames(qualified(stored.value, stored.scope))) if (s.kind === "function") functionSource(s); else pending.push({ className: s.qualifiedName, parts: current.parts.slice(1), writers: current.writers })
            }
          }
          for (const writerScope of scopes) for (const writer of writerScope.fieldStores.filter(s => s.field === current.parts[0] && s.valueExpression)) {
            const method = writerScope.symbols.find(s => s.id === writer.ownerId)
            if (!method?.className || !mro.includes(method.className) || writer.object !== method.parameters[0]?.name || method.attributes.bindingWrapped || method.attributes.methodBinding === "static") continue
            retain(method)
            const writerKey = `${writer.ownerId}:${writer.startIndex}`
            if (current.writers.has(writerKey)) { aliasUnresolved = true; continue }
            const writers = new Set(current.writers).add(writerKey), [root, ...tail] = writer.valueExpression!.split("."), remaining = current.parts.slice(1)
            if (root === method.parameters[0]?.name) pending.push({ className: current.className, parts: [...tail, ...remaining], writers })
            else {
              const parameter = method.parameters.find(p => p.name === root), local = writer.localNames.includes(root!)
              if (!local || parameter?.type) {
                for (const s of storeNames(qualified(parameter?.type ?? writer.valueExpression!, writerScope))) if (s.kind === "function") functionSource(s); else pending.push({ className: s.qualifiedName, parts: [...parameter ? tail : [], ...remaining], writers })
              }
            }
          }
        }
      }
      const trace = (input: string) => {
        let expression = input
        const active = new Set<string>()
        while (/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(expression)) {
          if (!withinBudget()) return
          const [root, ...parts] = expression.split(".")
          if (active.has(root!)) { aliasUnresolved = true; return }
          active.add(root!)
          const captured = owner.classMethod?.captures.find(c => c.name === root)?.callable, capturedTarget = captured && symbols.find(s => s.id === captured.targetId && s.sha256 === captured.targetSha256)
          if (capturedTarget) functionSource(capturedTarget)
          const inputKey = callableInputKey(owner, root!), inputs = inputKey ? callableInputs.get(inputKey) : undefined
          if (inputKey && callableInputGaps.has(inputKey)) aliasUnresolved = true
          for (const input of inputs ?? []) {
            if (!withinBudget()) return
            const target = symbols.find(s => s.id === input.targetId && s.sha256 === input.targetSha256)
            if (target) functionSource(target)
            for (const origin of input.origins) {
              const source = symbols.find(s => s.id === origin.source.id && s.sha256 === origin.source.sha256)
              if (source) retain(source)
              bindingSources.push(...origin.value?.bindingSources ?? [])
            }
          }
          const aliases = scope.routerAliases.filter(a => a.ownerId === symbolId && a.name === root)
          if (aliases.length > 1) { aliasUnresolved = true; return }
          const returned = returnedInstances.get(`${symbolId}:${root}`), callable = returned && symbols.find(s => s.id === returned.targetId)
          if (callable) { functionSource(callable); bindingSources.push(...returned!.bindingSources) }
          for (const creation of relatedCalls(symbolId, receiverClass).filter(c => c.resultNames.includes(root!))) {
            bindingSources.push(...creation.bindingSources ?? [])
            for (const target of creation.candidateIds.flatMap(id => symbols.filter(s => s.id === id))) {
              retain(target)
              if (target.kind === "class") classPath(target.qualifiedName, parts)
              else if (target.returns.length === 1) {
                const type = nameFacts(qualified(target.returns[0]!, scopeFor(target))); bindingSources.push(...type.sources)
                for (const cls of type.candidates.filter(s => s.kind === "class")) classPath(cls.qualifiedName, parts)
              }
            }
          }
          for (const local of scope.symbols.filter(s => s.kind === "function" && s.qualifiedName === `${owner.qualifiedName}.${root}`)) functionSource(local)
          const captureOwner = owner.localCallable?.captures.some(c => c.name === root) ? symbols.find(s => s.id === owner.localCallable!.ownerId) : undefined
          const parameter = owner.parameters.find(p => p.name === root) ?? captureOwner?.parameters.find(p => p.name === root)
          const instance = root === owner.parameters[0]?.name && owner.className && !owner.attributes.bindingWrapped && owner.attributes.methodBinding !== "static" ? receiverClass ?? owner.className : undefined
          if (instance) classPath(instance, parts)
          else if (parameter?.type) {
            const type = nameFacts(qualified(parameter.type, scope)); bindingSources.push(...type.sources)
            for (const cls of type.candidates.filter(s => s.kind === "class")) classPath(cls.qualifiedName, parts)
          }
          if (!raw.localNames.includes(root!) && !parameter) for (let i = 1; i <= parts.length + 1; i++) {
            for (const s of storeNames(qualified([root, ...parts].slice(0, i).join("."), scope))) if (s.kind === "function") functionSource(s); else classPath(s.qualifiedName, parts.slice(i - 1))
          }
          if (!aliases.length) return
          expression = [aliases[0]!.value, ...parts].join(".")
        }
      }
      trace(raw.object)
      const { localNames: _localNames, ...store } = raw
      return { ...store, model: "source-field-store/v1" as const, functionCandidateIds: [...functions].sort(), sources: [...sources.values()].sort((a, b) => a.id.localeCompare(b.id)).map(s => ({ id: s.id, path: s.path, sha256: s.sha256 })), ...(bindingSources.length ? { bindingSources: uniqueBindingSources(bindingSources) } : {}), ...(functions.size || aliasUnresolved || bindingLimit ? { gap: functions.size ? "skeleton-function-attribute-write-unmodeled" : bindingLimit ? "skeleton-field-store-binding-limit" : "skeleton-field-store-binding-unresolved" } : {}) }
    })
    fieldStoreCache.set(key, facts); return structuredClone(facts)
  }
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
  const callableParameters = (symbolId: string) => {
    const symbol = symbols.find(s => s.id === symbolId)
    const proof = symbol?.classMethod ?? (symbol?.valueCallable && !symbol.valueCallable.gap ? symbol.valueCallable : symbol?.localCallable && !symbol.localCallable.gap ? symbol.localCallable : undefined)
    return symbol ? [...symbol.parameters.map(p => p.name), ...proof?.captures.map(c => c.name) ?? []].flatMap(name => {
      const key = callableInputKey(symbol, name), choices = key && callableInputs.get(key)
      return choices ? [{ name, choices: structuredClone(choices), ...(callableInputGaps.get(key!) ? { gap: callableInputGaps.get(key!) } : {}) }] : []
    }) : []
  }
  const parserVersion = "@vscode/tree-sitter-wasm@0.3.1", relationshipVersion = "source-bindings/v29"
  const withSymbolSyntax = <T>(symbolId: string, visit: (root: Node, symbol: StructureSymbol) => T): Promise<T> => {
    const symbol = symbols.find(s => s.id === symbolId), file = symbol && files.find(f => f.path === symbol.path)
    if (!symbol || !file || hash(file.content) !== symbol.sha256) throw new Error("structure-source-missing")
    return withSourceSyntax(file.content, symbol.language, root => visit(root, symbol))
  }
  return { schemaVersion: "authorization-structure-index/v1" as const, parser: parserVersion, relationshipVersion, symbols, calls, routes, diagnostics, lookupMethod, attribute, linearize, classBindingSources, candidateRevision, relatedCalls, resolveName, qualifySourceName, fieldStores, methodStores, callableParameters, requestDependencies, requestMiddleware, requestActions, classDecorators, withSymbolSyntax,
    revision: hash([sourceIdentity, parserVersion, relationshipVersion, symbols, calls, routes, diagnostics]), preparation: { files: files.length, bytes: files.reduce((s, f) => s + Buffer.byteLength(f.content), 0), durationMs: performance.now() - started, targetExecutions: 0 } }
}
export type StructureIndex = Awaited<ReturnType<typeof buildStructureIndex>>
