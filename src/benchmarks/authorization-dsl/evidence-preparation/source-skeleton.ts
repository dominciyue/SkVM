import { createHash } from "node:crypto"
import type { Node } from "@vscode/tree-sitter-wasm"
import type { InquiryEvidence } from "../inquiry-tools.ts"
import type { StructureIndex, StructureSymbol } from "./structure-index.ts"
import { sourceLiteral } from "./structure-index.ts"
import type { SourceSelector } from "./source-selector.ts"
import type { FiniteValue } from "../../../task-dsl/authorization/control-evaluation.ts"

export interface SourceAnchor {
  id: string; selector: SourceSelector; sourceSha256: string;
  kind: "parameter" | "assignment" | "condition" | "call" | "return" | "raise";
  text: string; syntax: string; name?: string; valueExpression?: string; defaultExpression?: string;
  literalKnown?: boolean; literalValue?: FiniteValue;
  call?: { sourceCallId?: string; expression: string; receiver?: string; receiverClass?: string; arguments: Array<{ expression: string; parameterName?: string; spread?: boolean; literalKnown?: boolean; literalValue?: FiniteValue }>; candidateIds: string[]; resultNames: string[]; resultBinding: string }
}
export interface SourceFlow { kind: "step" | "branch" | "gap"; anchorId: string; then?: SourceFlow[]; otherwise?: SourceFlow[] }
export interface SourceSkeleton {
  schemaVersion: "authorization-source-skeleton/v1"; sourceId: string; revision: string;
  context?: "route-registration";
  source: { id: string; path: string; sha256: string; startLine: number; endLine: number }; modelCovered: boolean; evidenceIds: string[];
  anchors: SourceAnchor[]; flow: SourceFlow[]; edges: Array<{ from: string; to: string; branch: "next" | "true" | "false" }>;
  gaps: Array<{ code: string; selector: SourceSelector; reason: string }>
}
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex")
const kids = (n?: Node | null) => (n?.namedChildren ?? []).filter((c): c is Node => !!c)
const field = (n: Node, name: string) => n.childForFieldName(name)
const descendants = (n: Node, types: string[]) => n.descendantsOfType(types).filter((c): c is Node => !!c)
/** Read coverage is independent of AST indexing. No source meaning is inferred. */
export async function buildSourceSkeleton(index: StructureIndex, source: StructureSymbol, windows: readonly InquiryEvidence[], receiverClass?: string): Promise<SourceSkeleton> {
  const selected = windows.filter(e => e.path === source.path && e.sha256 === source.sha256 && e.startLine <= source.endLine && e.endLine >= source.startLine)
  let through = source.startLine - 1
  for (const e of [...selected].sort((a, b) => a.startLine - b.startLine)) if (e.startLine <= through + 1) through = Math.max(through, e.endLine)
  const selector = { path: source.path, startLine: source.startLine, endLine: source.endLine, candidateId: source.id }
  const skeleton: SourceSkeleton = { schemaVersion: "authorization-source-skeleton/v1", sourceId: source.id, source: { id: source.id, path: source.path, sha256: source.sha256, startLine: source.startLine, endLine: source.endLine }, revision: "", modelCovered: through >= source.endLine, evidenceIds: selected.map(e => e.id), anchors: [], flow: [], edges: [], gaps: [] }
  if (!skeleton.modelCovered) skeleton.gaps.push({ code: "skeleton-source-unread", selector, reason: "The complete current function is not available in shown original windows; indexing is not model interpretation." })
  else await index.withSymbolSyntax(source.id, root => {
    const registration = index.routes.find(r => r.id === source.id)
    const fn = descendants(root, registration ? ["call", "call_expression"] : ["function_definition", "function_declaration", "method_declaration"]).find(n => n.startPosition.row + 1 === source.startLine && n.endPosition.row + 1 === source.endLine)
    if (!fn) { skeleton.gaps.push({ code: "skeleton-function-unavailable", selector, reason: "This candidate is source context rather than an exact function body." }); return }
    if (registration) skeleton.context = "route-registration"
    const positions = new Map<string, number>()
    const located = (n: Node): SourceSelector => ({ path: source.path, startLine: n.startPosition.row + 1, endLine: n.endPosition.row + 1, candidateId: source.id })
    const add = (n: Node, kind: SourceAnchor["kind"], extra: Partial<SourceAnchor> = {}) => {
      const id = `anchor-${hash([source.id, n.startIndex, n.endIndex, kind, extra.name]).slice(0, 24)}`
      const existing = skeleton.anchors.find(a => a.id === id)
      if (existing) return existing
      const anchor: SourceAnchor = { id, selector: located(n), sourceSha256: source.sha256, kind, text: n.text, syntax: n.type, ...extra }
      skeleton.anchors.push(anchor); positions.set(id, n.startIndex); return anchor
    }
    const gap = (n: Node, code: string, reason: string) => { if (!skeleton.gaps.some(g => g.code === code && g.selector.startLine === n.startPosition.row + 1)) skeleton.gaps.push({ code, selector: located(n), reason }) }
    const actualCalls = [...index.relatedCalls(source.id, receiverClass), ...index.calls.filter(c => c.id === registration?.sourceCallId)]
    const belongsToScope = (n: Node) => {
      if (n.id === fn.id) return true
      let owner = n.parent
      while (owner && owner.id !== fn.id && !["function_definition", "function_declaration", "method_declaration", "function_literal", "lambda"].includes(owner.type)) owner = owner.parent
      return owner?.id === fn.id
    }
    for (const n of descendants(fn, ["attribute", "selector_expression", "subscript", "index_expression"]).filter(belongsToScope)) add(n, "assignment", { name: n.text, valueExpression: n.text })
    const callAnchor = (n: Node) => {
      const expression = field(n, "function")?.text ?? n.text, actual = actualCalls.find(c => c.startLine === n.startPosition.row + 1 && c.endLine === n.endPosition.row + 1 && c.expression === expression)
      const arguments_: NonNullable<SourceAnchor["call"]>["arguments"] = kids(field(n, "arguments")).map(a => { const value = a.type === "keyword_argument" ? field(a, "value")! : a, literal = sourceLiteral(value); return { expression: value.text, ...(a.type === "keyword_argument" ? { parameterName: field(a, "name")!.text } : {}), ...(["list_splat", "dictionary_splat", "variadic_argument"].includes(a.type) ? { spread: true } : {}), ...(literal.literalKnown ? literal : {}) } })
      if (!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(expression) && !/^super\(\)\.[A-Za-z_]\w*$/.test(expression)) gap(n, "skeleton-call-dynamic", "The actual function expression is dynamic; no unique callee or receiver is invented.")
      if (arguments_.some(a => a.spread)) gap(n, "skeleton-arguments-dynamic", "Expanded arguments require a source-supported mapping; positions are not guessed.")
      return add(n, "call", { call: { sourceCallId: actual?.id, expression, receiver: actual?.receiver, receiverClass: actual?.receiverClass, arguments: arguments_, candidateIds: actual?.candidateIds ?? [], resultNames: actual?.resultNames ?? [], resultBinding: actual?.resultNames[0] ?? `result-${hash([source.id, n.startIndex]).slice(0, 16)}` } })
    }
    const callsIn = (n: Node) => descendants(n, source.language === "python" ? ["call"] : ["call_expression"]).filter(belongsToScope).sort((a, b) => a.endIndex - b.endIndex || b.startIndex - a.startIndex)
    for (const p of kids(field(fn, "parameters"))) {
      const names = source.language === "go" ? kids(p).filter(n => n.type === "identifier").map(n => n.text) : [field(p, "name")?.text ?? (p.type === "identifier" ? p.text : kids(p)[0]?.text)].filter((n): n is string => !!n)
      for (const name of names) add(p, "parameter", { name, defaultExpression: field(p, "value")?.text })
    }
    const receiver = field(fn, "receiver")
    if (receiver) for (const p of descendants(receiver, ["parameter_declaration"])) for (const name of kids(p).filter(n => n.type === "identifier")) add(p, "parameter", { name: name.text })
    const stepsForCalls = (n: Node) => callsIn(n).map(c => ({ kind: "step" as const, anchorId: callAnchor(c).id }))
    const visitList = (n?: Node | null): SourceFlow[] => kids(n).flatMap(visit)
    const branchFor = (n: Node, alternatives: Node[]): SourceFlow[] => {
      const condition = field(n, "condition")!, anchor = add(condition, "condition"), alternative = alternatives[0]
      const other = alternative ? ["if_statement", "elif_clause"].includes(alternative.type) ? branchFor(alternative, alternatives.slice(1)) : visitList(field(alternative, "body") ?? alternative) : []
      const shortCircuit = descendants(condition, ["boolean_operator", "binary_expression"]).some(c => /^(and|or|&&|\|\|)$/.test(field(c, "operator")?.text ?? kids(c).find(k => k.type === "operator")?.text ?? c.children.find(k => k && ["and", "or", "&&", "||"].includes(k.type))?.text ?? "")) && callsIn(condition).length > 0
      let calls: SourceFlow[]
      if (shortCircuit) { gap(condition, "skeleton-short-circuit-call", "Short-circuit call execution needs a local interpretation; right-hand calls were not made unconditional."); for (const c of callsIn(condition)) callAnchor(c); calls = [] }
      else calls = stepsForCalls(condition)
      const initializer = field(n, "initializer")
      return [...(initializer ? visit(initializer) : []), ...calls, { kind: "branch", anchorId: anchor.id, then: visitList(field(n, "consequence")), otherwise: other }]
    }
    const visit = (n: Node): SourceFlow[] => {
      if (n.type === "comment" || n.type === "pass_statement") return []
      if (n.type === "block" || n.type === "statement_list") return visitList(n)
      if (["function_definition", "function_declaration", "method_declaration", "class_definition"].includes(n.type)) { gap(n, "skeleton-local-definition", "Nested definitions are not executed as the surrounding function."); return [{ kind: "gap", anchorId: add(n, "assignment").id }] }
      if (["if_statement", "elif_clause"].includes(n.type)) {
        const alternatives = kids(n).filter(c => ["elif_clause", "else_clause"].includes(c.type) || c.id === field(n, "alternative")?.id)
        return branchFor(n, alternatives)
      }
      if (["return_statement", "raise_statement"].includes(n.type)) return [...stepsForCalls(n), { kind: "step", anchorId: add(n, n.type === "return_statement" ? "return" : "raise", { valueExpression: kids(n)[0]?.text, ...sourceLiteral(kids(n)[0]) }).id }]
      if (["for_statement", "while_statement", "try_statement", "with_statement", "switch_statement", "expression_switch_statement", "type_switch_statement", "select_statement", "defer_statement", "go_statement", "break_statement", "continue_statement", "match_statement"].includes(n.type)) {
        gap(n, "skeleton-control-unsupported", `The ${n.type} control structure needs a local interpretation; its body was not flattened into unconditional execution.`)
        for (const c of callsIn(n)) callAnchor(c)
        return [{ kind: "gap", anchorId: add(n, "assignment").id }]
      }
      if (["expression_statement", "assignment", "short_var_declaration", "assignment_statement", "augmented_assignment", "inc_statement", "dec_statement"].includes(n.type)) {
        const assignment = n.type === "expression_statement" ? kids(n).find(c => c.type === "assignment" || c.type === "augmented_assignment") : n
        const calls = stepsForCalls(n)
        return assignment && field(assignment, "left") ? [...calls, { kind: "step", anchorId: add(assignment, "assignment", { name: field(assignment, "left")!.text, valueExpression: field(assignment, "right")?.text, ...sourceLiteral(field(assignment, "right")) }).id }] : calls
      }
      gap(n, "skeleton-statement-unsupported", `The ${n.type} statement remains explicit rather than being silently deleted.`)
      return [{ kind: "gap", anchorId: add(n, "assignment").id }]
    }
    skeleton.flow = registration ? [...callsIn(fn).filter(n => n.id !== fn.id), fn].map(n => ({ kind: "step", anchorId: callAnchor(n).id })) : visitList(field(fn, "body"))
    if (fn.hasError) gap(fn, "skeleton-parse-partial", "The original function has parser errors; coverage is bounded.")
    const connect = (flow: SourceFlow[], next?: string) => {
      for (const [i, node] of flow.entries()) {
        const following = flow[i + 1]?.anchorId ?? next, anchor = skeleton.anchors.find(a => a.id === node.anchorId)!
        const edge = (to: string | undefined, branch: "next" | "true" | "false") => { if (to) skeleton.edges.push({ from: node.anchorId, to, branch }) }
        if (node.kind === "branch") { edge(node.then?.[0]?.anchorId ?? following, "true"); edge(node.otherwise?.[0]?.anchorId ?? following, "false"); connect(node.then ?? [], following); connect(node.otherwise ?? [], following) }
        else if (node.kind !== "gap" && anchor.kind !== "return" && anchor.kind !== "raise") edge(following, "next")
      }
    }
    connect(skeleton.flow)
    skeleton.anchors.sort((a, b) => positions.get(a.id)! - positions.get(b.id)! || a.id.localeCompare(b.id))
  })
  skeleton.revision = hash([index.parser, index.relationshipVersion, skeleton.source, skeleton.context, skeleton.modelCovered, skeleton.anchors, skeleton.flow, skeleton.edges, skeleton.gaps])
  return skeleton
}
