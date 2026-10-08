import { createHash } from "node:crypto"
import type { Node } from "@vscode/tree-sitter-wasm"
import type { InquiryEvidence } from "../inquiry-tools.ts"
import type { StructureCall, StructureIndex, StructureSymbol, StructureMethodStore, StructureMethodCapture, StructureCallableValue, StructureCallableDefinition, StructureClassValue, StructureClassDefinition } from "./structure-index.ts"
import { sourceLiteral, structureClassDefinition } from "./structure-index.ts"
import { sourceCallableValueResult, sourceClassValueResult, sourceMethodCaptureResult, sourceSuperMethodResult, sourceSyntaxAnchorId } from "./source-identities.ts"
import { sourceArgumentBindings } from "./source-arguments.ts"
import type { SourceSelector } from "./source-selector.ts"
import type { FiniteValue } from "../../../task-dsl/authorization/control-evaluation.ts"

export interface SourceAnchor {
  id: string; selector: SourceSelector; sourceSha256: string;
  kind: "parameter" | "assignment" | "condition" | "call" | "return" | "raise" | "control";
  text: string; syntax: string; name?: string; valueExpression?: string; valueAnchorId?: string; defaultExpression?: string;
  literalKnown?: boolean; literalValue?: FiniteValue;
  interpretationRequired?: boolean;
  exceptionType?: string;
  dependencyFacts?: { reads: string[]; writes: string[]; pureLocal: boolean };
  capture?: { ownerId: string; ownerSha256: string };
  callableValue?: StructureCallableValue;
  classValue?: StructureClassValue;
  classDefinition?: { targetId: string; targetSha256: string; definition: StructureClassDefinition };
  classDecoratorValue?: { definitionAnchorId: string; decoratorId: string };
  classBinding?: string;
  callableDefinition?: { targetId: string; targetSha256: string; definition: StructureCallableDefinition };
  fieldWrite?: { object: string; field: string };
  methodStore?: StructureMethodStore;
  methodCapture?: StructureMethodCapture;
  superMethod?: StructureCall["superMethod"];
  call?: { sourceCallId?: string; expression: string; receiver?: string; receiverClass?: string; receiverBinding?: StructureCall["receiverBinding"]; callableBinding?: StructureCall["callableBinding"]; classConstructor?: StructureCall["classConstructor"]; bindingGap?: string; arguments: Array<{ expression: string; parameterName?: string; spread?: boolean; literalKnown?: boolean; literalValue?: FiniteValue; sourceCallId?: string }>; candidateIds: string[]; resultNames: string[]; resultBinding: string }
}
export interface SourceFlow {
  kind: "step" | "branch" | "gap" | "try" | "with" | "loop" | "break" | "continue" | "short-circuit";
  anchorId: string; then?: SourceFlow[]; otherwise?: SourceFlow[]; body?: SourceFlow[]; finally?: SourceFlow[];
  handlers?: Array<{ anchorId: string; exceptionTypes: string[]; catchesAll: boolean; body: SourceFlow[]; bindingName?: string; unknownType?: boolean }>;
  targetName?: string; iterableExpression?: string; iterableValue?: FiniteValue; conditionExpression?: string;
  enter?: SourceFlow[]; exitUnknown?: boolean;
  operator?: "and" | "or"; language?: "python" | "go"; leftExpression?: string; rightExpression?: string;
  leftLiteral?: FiniteValue; rightLiteral?: FiniteValue; resultBinding?: string;
  leftValueAnchorId?: string; rightValueAnchorId?: string; iterableValueAnchorId?: string;
}
export interface SourceSkeleton {
  schemaVersion: "authorization-source-skeleton/v1" | "authorization-source-skeleton/v2"; sourceId: string; revision: string;
  controlSemantics?: "finite-control/v1";
  propertySemantics?: "property-control/v1" | "question-control/v1";
  context?: "route-registration" | "module-initialization";
  source: { id: string; path: string; sha256: string; startLine: number; endLine: number }; modelCovered: boolean; evidenceIds: string[];
  anchors: SourceAnchor[]; flow: SourceFlow[]; edges: Array<{ from: string; to: string; branch: "next" | "true" | "false" }>;
  gaps: Array<{ code: string; selector: SourceSelector; reason: string }>
}
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex")
const kids = (n?: Node | null) => (n?.namedChildren ?? []).filter((c): c is Node => !!c)
const field = (n: Node, name: string) => n.childForFieldName(name)
const descendants = (n: Node, types: string[]) => n.descendantsOfType(types).filter((c): c is Node => !!c)
/** Read coverage is independent of AST indexing. No source meaning is inferred. */
export async function buildSourceSkeleton(index: StructureIndex, source: StructureSymbol, windows: readonly InquiryEvidence[], receiverClass?: string, controlSemantics?: "finite-control/v1", propertyDirected = false, questionDirected = false): Promise<SourceSkeleton> {
  const selected = windows.filter(e => e.path === source.path && e.sha256 === source.sha256 && e.startLine <= source.endLine && e.endLine >= source.startLine)
  let through = source.startLine - 1
  for (const e of [...selected].sort((a, b) => a.startLine - b.startLine)) if (e.startLine <= through + 1) through = Math.max(through, e.endLine)
  const selector = { path: source.path, startLine: source.startLine, endLine: source.endLine, candidateId: source.id }
  const skeleton: SourceSkeleton = { schemaVersion: controlSemantics ? "authorization-source-skeleton/v2" : "authorization-source-skeleton/v1", ...(controlSemantics ? { controlSemantics } : {}), ...(propertyDirected ? { propertySemantics: questionDirected ? "question-control/v1" as const : "property-control/v1" as const } : {}), sourceId: source.id, source: { id: source.id, path: source.path, sha256: source.sha256, startLine: source.startLine, endLine: source.endLine }, revision: "", modelCovered: through >= source.endLine, evidenceIds: selected.map(e => e.id), anchors: [], flow: [], edges: [], gaps: [] }
  if (!skeleton.modelCovered) skeleton.gaps.push({ code: "skeleton-source-unread", selector, reason: "The complete current function is not available in shown original windows; indexing is not model interpretation." })
  else await index.withSymbolSyntax(source.id, root => {
    const registration = index.routes.find(r => r.id === source.id)
    const fn = source.kind === "module" && source.language === "python" ? root : descendants(root, registration ? ["call", "call_expression"] : ["function_definition", "function_declaration", "method_declaration"]).find(n => n.startPosition.row + 1 === source.startLine && n.endPosition.row + 1 === source.endLine)
    if (!fn) { skeleton.gaps.push({ code: "skeleton-function-unavailable", selector, reason: "This candidate is source context rather than an exact function body." }); return }
    if (registration) skeleton.context = "route-registration"
    else if (source.kind === "module") skeleton.context = "module-initialization"
    const positions = new Map<string, number>()
    // Syntax facts only: attribute paths are reads, not object/alias identities.
    const reads = (n?: Node | null): string[] => {
      if (!n) return []
      if (["function_definition", "lambda", "function_literal"].includes(n.type)) return []
      if (n.type === "identifier") return [n.text]
      if (["attribute", "selector_expression"].includes(n.type)) return [...(/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+$/.test(n.text) ? [n.text] : []), ...reads(field(n, "object") ?? field(n, "operand") ?? kids(n)[0])]
      if (n.type === "keyword_argument") return reads(field(n, "value"))
      return [...new Set(kids(n).flatMap(reads))]
    }
    const located = (n: Node): SourceSelector => ({ path: source.path, startLine: n.startPosition.row + 1, endLine: n.endPosition.row + 1, candidateId: source.id })
    const add = (n: Node, kind: SourceAnchor["kind"], extra: Partial<SourceAnchor> = {}) => {
      const id = sourceSyntaxAnchorId(source.id, n.startIndex, n.endIndex, kind, extra.name)
      const existing = skeleton.anchors.find(a => a.id === id)
      if (existing) return existing
      const anchor: SourceAnchor = { id, selector: located(n), sourceSha256: source.sha256, kind, text: n.text, syntax: n.type, interpretationRequired: false, ...extra }
      if (questionDirected) {
        const assignment = kind === "assignment" && ["assignment", "short_var_declaration", "assignment_statement", "augmented_assignment"].includes(n.type), right = assignment ? field(n, "right") : kind === "return" || kind === "raise" ? kids(n)[0] : n
        const literal = sourceLiteral(right), directCall = assignment && right && ["call", "call_expression"].includes(right.type)
        const fieldResult = anchor.fieldWrite && directCall ? skeleton.anchors.find(a => a.id === anchor.valueAnchorId)?.call?.resultBinding : undefined
        anchor.dependencyFacts = { reads: kind === "parameter" ? [] : [...new Set([...reads(right), ...anchor.fieldWrite ? [anchor.fieldWrite.object] : [], ...fieldResult ? [fieldResult] : []])], writes: kind === "parameter" && anchor.name ? [anchor.name] : kind === "call" ? [...new Set([...(anchor.call?.resultNames ?? []).filter(name => /^[A-Za-z_]\w*$/.test(name)), ...(anchor.call ? [anchor.call.resultBinding] : [])])] : assignment && anchor.name && (!directCall || anchor.fieldWrite) ? [anchor.name] : [], pureLocal: !!assignment && n.type !== "augmented_assignment" && !!anchor.name && /^[A-Za-z_]\w*$/.test(anchor.name) && literal.literalKnown && (literal.literalValue === null || typeof literal.literalValue !== "object") }
      }
      skeleton.anchors.push(anchor); positions.set(id, n.startIndex); return anchor
    }
    const gap = (n: Node, code: string, reason: string) => { if (!skeleton.gaps.some(g => g.code === code && g.selector.startLine === n.startPosition.row + 1)) skeleton.gaps.push({ code, selector: located(n), reason }) }
    const captureProof = source.classMethod ?? (source.valueCallable && !source.valueCallable.gap ? source.valueCallable : source.localCallable && !source.localCallable.gap ? source.localCallable : undefined)
    if (questionDirected && source.localCallable?.gap && !(source.valueCallable && !source.valueCallable.gap)) gap(fn, source.localCallable.gap, "This local body has no proved direct callable/capture binding in its owner; reading it does not supply its invocation.")
    const actualCalls = [...index.relatedCalls(source.id, receiverClass), ...index.calls.filter(c => c.id === registration?.sourceCallId)]
    const fieldStores = questionDirected ? index.fieldStores(source.id, receiverClass) : []
    const methodStores = questionDirected ? index.methodStores(source.id, receiverClass) : []
    const belongsToScope = (n: Node) => {
      if (n.id === fn.id) return true
      let owner = n.parent
      while (owner && owner.id !== fn.id && !["class_definition", "function_definition", "function_declaration", "method_declaration", "function_literal", "lambda"].includes(owner.type)) owner = owner.parent
      return owner?.id === fn.id
    }
    for (const n of descendants(fn, ["attribute", "selector_expression", "subscript", "index_expression"]).filter(belongsToScope)) add(n, "assignment", { name: n.text, valueExpression: n.text })
    const callAnchor = (n: Node) => {
      const expression = field(n, "function")?.text ?? n.text
      const sourceCall = (value: Node) => {
        const candidates = actualCalls.filter(c => c.startIndex !== undefined ? c.startIndex === value.startIndex && c.endIndex === value.endIndex : c.startLine === value.startPosition.row + 1 && c.endLine === value.endPosition.row + 1 && c.expression === (field(value, "function")?.text ?? value.text))
        return candidates.length === 1 ? candidates[0] : undefined
      }
      const actual = sourceCall(n)
      const arguments_: NonNullable<SourceAnchor["call"]>["arguments"] = kids(field(n, "arguments")).map(a => { const value = a.type === "keyword_argument" ? field(a, "value")! : a, literal = sourceLiteral(value), child = ["call", "call_expression"].includes(value.type) ? sourceCall(value) : undefined; return { expression: value.text, ...(child ? { sourceCallId: child.id } : {}), ...(a.type === "keyword_argument" ? { parameterName: field(a, "name")!.text } : {}), ...(["list_splat", "dictionary_splat", "variadic_argument"].includes(a.type) ? { spread: true } : {}), ...(literal.literalKnown ? literal : {}) } })
      if (!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(expression) && !/^super\(\)\.[A-Za-z_]\w*$/.test(expression)) gap(n, "skeleton-call-dynamic", "The actual function expression is dynamic; no unique callee or receiver is invented.")
      const callableGap = actual?.gap && /^(?:source-module-|source-local-|source-callable-|source-returned-callable-|source-method-alias-|source-method-choice-|source-method-lookup-|source-field-method-|source-class-constructor-|source-class-instance-|source-class-super-)/.test(actual.gap) ? actual.gap : undefined
      if (questionDirected && callableGap) gap(n, callableGap, "The current lexical callable/capture binding is unresolved regardless of its proposed domain role.")
      if (arguments_.some(a => a.spread)) {
        const targets = actual && (actual.methodChoices || actual.methodLookup || actual.methodField || actual.candidateIds.length === 1) ? actual.candidateIds.flatMap(id => index.symbols.filter(s => s.id === id && s.kind === "function")) : []
        const bindings = actual ? targets.map(target => sourceArgumentBindings(index, actual, target)) : []
        if (!questionDirected || !bindings.length || bindings.some(b => b.gap)) gap(n, "skeleton-arguments-dynamic", `Expanded arguments require a source-supported mapping; ${bindings.find(b => b.gap)?.gap || "positions are not guessed"}.`)
      }
      const fieldResult = questionDirected && source.language === "python" && n.parent?.type === "assignment" && field(n.parent, "right")?.id === n.id && field(n.parent, "left")?.type === "attribute"
      return add(n, "call", { call: { sourceCallId: actual?.id, expression, receiver: actual?.receiver, receiverClass: actual?.receiverClass, ...(questionDirected && actual?.receiverBinding ? { receiverBinding: actual.receiverBinding } : {}), ...(questionDirected && actual?.callableBinding ? { callableBinding: actual.callableBinding } : {}), ...(questionDirected && actual?.classConstructor ? { classConstructor: actual.classConstructor } : {}), ...(questionDirected && callableGap ? { bindingGap: callableGap } : {}), arguments: arguments_, candidateIds: actual?.candidateIds ?? [], resultNames: actual?.resultNames ?? [], resultBinding: !fieldResult && actual?.resultNames[0] || `result-${hash([source.id, n.startIndex]).slice(0, 16)}` } })
    }
    const callsIn = (n: Node) => descendants(n, source.language === "python" ? ["call"] : ["call_expression"]).filter(belongsToScope).sort((a, b) => a.endIndex - b.endIndex || b.startIndex - a.startIndex)
    for (const p of kids(field(fn, "parameters"))) {
      const names = source.language === "go" ? kids(p).filter(n => n.type === "identifier").map(n => n.text) : [field(p, "name")?.text ?? (p.type === "identifier" ? p.text : kids(p)[0]?.text)].filter((n): n is string => !!n).map(name => name.replace(/^\*+/, ""))
      for (const name of names) add(p, "parameter", { name, defaultExpression: field(p, "value")?.text })
    }
    const receiver = field(fn, "receiver")
    if (receiver) for (const p of descendants(receiver, ["parameter_declaration"])) for (const name of kids(p).filter(n => n.type === "identifier")) add(p, "parameter", { name: name.text })
    if (questionDirected && captureProof) for (const capture of captureProof.captures) {
      const use = descendants(fn, ["identifier"]).find(n => n.text === capture.name && n.startIndex === capture.use.startIndex && n.endIndex === capture.use.endIndex)
      if (use) add(use, "parameter", { name: capture.name, syntax: "source_capture", capture: capture.binding ?? { ownerId: captureProof.ownerId, ownerSha256: captureProof.ownerSha256 } })
      else gap(fn, "skeleton-local-capture-unavailable", "The implicit capture must point to its current original source use.")
    }
    if (questionDirected && source.classMethod?.classCell) {
      const cell = source.classMethod.classCell, use = descendants(fn, ["identifier"]).find(n => ["__class__", "super"].includes(n.text) && n.startIndex === cell.startIndex && n.endIndex === cell.endIndex)
      if (use) add(use, "parameter", { name: "__class__", syntax: "source_class_cell" })
      else gap(fn, "skeleton-class-cell-unavailable", "The implicit class cell must point to its current original source use.")
    }
    const stepsForCalls = (n: Node) => callsIn(n).map(c => ({ kind: "step" as const, anchorId: callAnchor(c).id }))
    const valueAnchor = (n: Node | null | undefined, flow: SourceFlow[]): string | undefined => n && (["call", "call_expression"].includes(n.type) || ["and", "or", "&&", "||"].includes(field(n, "operator")?.text ?? "")) ? flow.at(-1)?.anchorId : undefined
    const expressionFlow = (n: Node, resultBinding?: string): SourceFlow[] => {
      if (questionDirected && source.language === "python" && n.type === "expression_statement") return kids(n).flatMap(a => expressionFlow(a, resultBinding))
      if (questionDirected && source.language === "python" && n.type === "keyword_argument") return field(n, "value") ? expressionFlow(field(n, "value")!) : []
      if (questionDirected && source.language === "python" && n.type === "await") return kids(n).flatMap(a => expressionFlow(a, resultBinding))
      const superMethod = questionDirected && actualCalls.find(c => c.superMethod?.source.startIndex === n.startIndex && c.superMethod.source.endIndex === n.endIndex)?.superMethod
      if (superMethod) {
        const anchor = add(n, "assignment", { name: sourceSuperMethodResult(superMethod.sourceCallId), syntax: "source_super_method", superMethod })
        anchor.dependencyFacts = { reads: [superMethod.classCell, superMethod.receiver], writes: [anchor.name!], pureLocal: false }
        return [{ kind: "step", anchorId: anchor.id }]
      }
      const classValue = questionDirected && actualCalls.flatMap(c => c.argumentFacts?.flatMap(a => a.classValue ? [a.classValue] : []) ?? []).find(p => p.source.startIndex === n.startIndex && p.source.endIndex === n.endIndex)
      if (classValue) {
        const anchor = add(n, "assignment", { name: sourceClassValueResult(source.id, classValue), syntax: "source_class_value", valueExpression: n.text, classValue })
        anchor.dependencyFacts = { reads: [n.text], writes: [anchor.name!], pureLocal: false }
        return [{ kind: "step", anchorId: anchor.id }]
      }
      const callableValue = questionDirected && actualCalls.flatMap(c => c.argumentFacts?.flatMap(a => a.callableValue?.kind === "module" ? [a.callableValue] : []) ?? []).find(p => p.source.startIndex === n.startIndex && p.source.endIndex === n.endIndex)
      if (callableValue) {
        const anchor = add(n, "assignment", { name: sourceCallableValueResult(source.id, callableValue), syntax: "source_callable_value", valueExpression: n.text, callableValue })
        anchor.dependencyFacts = { reads: [n.text], writes: [anchor.name!], pureLocal: false }
        return [{ kind: "step", anchorId: anchor.id }]
      }
      const capture = questionDirected && n.type === "call" ? actualCalls.find(c => c.startIndex === n.startIndex && c.endIndex === n.endIndex)?.methodCapture : undefined
      if (questionDirected && source.language === "python" && n.type === "call") {
        const prefix: SourceFlow[] = []
        if (capture) {
          const anchor = add(field(n, "function")!, "assignment", { name: sourceMethodCaptureResult(capture.sourceCallId), syntax: "source_method_capture", valueExpression: `${capture.receiver}.${capture.method}`, methodCapture: capture })
          anchor.dependencyFacts = { reads: [capture.receiver, `${capture.receiver}.${capture.method}`], writes: [anchor.name!], pureLocal: false }
          prefix.push({ kind: "step", anchorId: anchor.id })
        } else if (field(n, "function")) prefix.push(...expressionFlow(field(n, "function")!))
        return [...prefix, ...kids(field(n, "arguments")).flatMap(a => expressionFlow(a)), { kind: "step", anchorId: callAnchor(n).id }]
      }
      const left = field(n, "left"), right = field(n, "right"), op = field(n, "operator")?.text
      if (controlSemantics && left && right && ["and", "or", "&&", "||"].includes(op ?? "")) {
        const leftLiteral = sourceLiteral(left), rightLiteral = sourceLiteral(right)
        const anchor = add(n, "control", { name: resultBinding ?? `expression-${hash([source.id, n.startIndex]).slice(0, 16)}`, valueExpression: n.text })
        const leftFlow = expressionFlow(left), rightFlow = expressionFlow(right)
        return [...leftFlow, { kind: "short-circuit", anchorId: anchor.id, operator: op === "and" || op === "&&" ? "and" : "or", language: source.language, leftExpression: left.text, rightExpression: right.text, leftValueAnchorId: valueAnchor(left, leftFlow), rightValueAnchorId: valueAnchor(right, rightFlow), ...(leftLiteral.literalKnown ? { leftLiteral: leftLiteral.literalValue } : {}), ...(rightLiteral.literalKnown ? { rightLiteral: rightLiteral.literalValue } : {}), resultBinding: anchor.name, body: rightFlow }]
      }
      // Nested booleans in a call argument also execute before the outer call.
      if (controlSemantics) {
        const nested = descendants(n, ["boolean_operator", "binary_expression"]).filter(c => c.id !== n.id && ["and", "or", "&&", "||"].includes(field(c, "operator")?.text ?? ""))
        const booleans = nested.filter(c => !nested.some(parent => parent.id !== c.id && parent.startIndex <= c.startIndex && parent.endIndex >= c.endIndex))
        if (booleans.length) return [...booleans.flatMap(c => expressionFlow(c)), ...callsIn(n).filter(c => !booleans.some(b => c.startIndex >= b.startIndex && c.endIndex <= b.endIndex)).map(c => ({ kind: "step" as const, anchorId: callAnchor(c).id }))]
      }
      return stepsForCalls(n)
    }
    const visitList = (n?: Node | null): SourceFlow[] => kids(n).flatMap(visit)
    const branchFor = (n: Node, alternatives: Node[]): SourceFlow[] => {
      const condition = field(n, "condition")!, anchor = add(condition, "condition", propertyDirected ? sourceLiteral(condition) : {}), alternative = alternatives[0]
      const other = alternative ? ["if_statement", "elif_clause"].includes(alternative.type) ? branchFor(alternative, alternatives.slice(1)) : visitList(field(alternative, "body") ?? alternative) : []
      const shortCircuit = descendants(condition, ["boolean_operator", "binary_expression"]).some(c => /^(and|or|&&|\|\|)$/.test(field(c, "operator")?.text ?? kids(c).find(k => k.type === "operator")?.text ?? c.children.find(k => k && ["and", "or", "&&", "||"].includes(k.type))?.text ?? "")) && callsIn(condition).length > 0
      let calls: SourceFlow[]
      if (controlSemantics) calls = expressionFlow(condition)
      else if (shortCircuit) { gap(condition, "skeleton-short-circuit-call", "Short-circuit call execution needs a local interpretation; right-hand calls were not made unconditional."); for (const c of callsIn(condition)) callAnchor(c); calls = [] }
      else calls = stepsForCalls(condition)
      const initializer = field(n, "initializer")
      return [...(initializer ? visit(initializer) : []), ...calls, { kind: "branch", anchorId: anchor.id, then: visitList(field(n, "consequence")), otherwise: other }]
    }
    const visit = (n: Node): SourceFlow[] => {
      if (n.type === "comment" || n.type === "pass_statement") return []
      if (n.type === "block" || n.type === "statement_list") return visitList(n)
      const classNode = n.type === "class_definition" ? n : n.type === "decorated_definition" ? kids(n).find(c => c.type === "class_definition") : undefined
      if (questionDirected && classNode) {
        const symbol = index.symbols.find(s => { const proof = structureClassDefinition(s); return s.kind === "class" && s.path === source.path && proof?.ownerId === source.id && proof.source.startIndex === n.startIndex && proof.source.endIndex === n.endIndex }), proof = structureClassDefinition(symbol)
        if (symbol && proof) {
          const created = add(n, "assignment", { name: symbol.name, syntax: "source_class_definition", classDefinition: { targetId: symbol.id, targetSha256: symbol.sha256, definition: proof } })
          if (proof.gap) { gap(n, proof.gap, "This actual class definition needs its current base, namespace or decorator semantics."); return [{ kind: "gap", anchorId: created.id }] }
          const nodes = kids(n).filter(c => c.type === "decorator"), flow: SourceFlow[] = []
          for (const decorator of proof.decorators) {
            const node = nodes.find(d => d.startIndex === decorator.source.startIndex && d.endIndex === decorator.source.endIndex)!, expression = kids(node)[0]!
            if (decorator.factoryCallId) flow.push(...expressionFlow(expression))
            else {
              const value = add(node, "assignment", { name: decorator.valueResult, valueExpression: decorator.expression, syntax: "source_class_decorator_value", classDecoratorValue: { definitionAnchorId: proof.anchorId, decoratorId: decorator.id } })
              value.dependencyFacts = { reads: [decorator.expression], writes: [decorator.valueResult], pureLocal: false }; flow.push({ kind: "step", anchorId: value.id })
            }
          }
          created.dependencyFacts = { reads: [...proof.bases.map(base => base.expression), ...proof.methods.flatMap(method => method.captures.map(c => c.name))], writes: [`class-original-${proof.anchorId}`], pureLocal: false }; flow.push({ kind: "step", anchorId: created.id })
          let result = `class-original-${proof.anchorId}`
          for (const decorator of [...proof.decorators].reverse()) {
            const actual = actualCalls.find(c => c.id === decorator.applicationCallId)!, node = nodes.find(d => d.startIndex === decorator.source.startIndex && d.endIndex === decorator.source.endIndex)!
            const anchor = add(node, "call", { syntax: "source_class_decorator_application", call: { sourceCallId: actual.id, expression: actual.expression, arguments: [{ expression: result }], candidateIds: actual.candidateIds, resultNames: actual.resultNames, resultBinding: actual.resultNames[0]!, ...(actual.callableBinding ? { callableBinding: actual.callableBinding } : {}) } })
            anchor.dependencyFacts = { reads: [decorator.valueResult, result], writes: [anchor.call!.resultBinding], pureLocal: false }; flow.push({ kind: "step", anchorId: anchor.id }); result = anchor.call!.resultBinding
          }
          const bound = add(field(classNode, "name")!, "assignment", { name: symbol.name, valueExpression: result, syntax: "source_class_binding", classBinding: proof.anchorId })
          bound.dependencyFacts = { reads: [result], writes: [symbol.name], pureLocal: false }; flow.push({ kind: "step", anchorId: bound.id })
          return flow
        }
      }
      if (["function_definition", "function_declaration", "method_declaration", "class_definition"].includes(n.type)) {
        const symbol = index.symbols.find(s => s.path === source.path && s.startLine === n.startPosition.row + 1 && s.endLine === n.endPosition.row + 1), local = symbol?.localCallable
        const moduleFunction = source.moduleInitialization?.functions.find(f => f.targetId === symbol?.id && f.targetSha256 === symbol.sha256 && f.definition.source.startIndex === n.startIndex && f.definition.source.endIndex === n.endIndex)
        if (questionDirected && moduleFunction) {
          const proof = moduleFunction.definition, anchor = add(n, "assignment", { name: symbol!.name, syntax: "source_callable_value_definition", callableDefinition: { targetId: symbol!.id, targetSha256: symbol!.sha256, definition: proof } })
          anchor.dependencyFacts = { reads: [], writes: [symbol!.name], pureLocal: false }
          if (proof.gap) { gap(n, proof.gap, "This module function declaration has unexecuted initialization actions or an unresolved binding."); return [{ kind: "gap", anchorId: anchor.id }] }
          return [{ kind: "step", anchorId: anchor.id }]
        }
        if (questionDirected && n.type === "function_definition" && symbol?.valueCallable && !symbol.valueCallable.gap && symbol.valueCallable.ownerId === source.id && symbol.valueCallable.ownerSha256 === source.sha256) {
          const anchor = add(n, "assignment", { name: symbol.name, syntax: "source_callable_value_definition", callableDefinition: { targetId: symbol.id, targetSha256: symbol.sha256, definition: symbol.valueCallable } })
          anchor.dependencyFacts = { reads: symbol.valueCallable.captures.map(c => c.name), writes: [symbol.name], pureLocal: false }
          return [{ kind: "step", anchorId: anchor.id }]
        }
        if (questionDirected && n.type === "function_definition" && local?.ownerId === source.id && local.ownerSha256 === source.sha256 && !local.gap) return []
        gap(n, "skeleton-local-definition", local?.gap ?? "Nested definitions are not executed as the surrounding function."); return [{ kind: "gap", anchorId: add(n, "assignment").id }]
      }
      if (["if_statement", "elif_clause"].includes(n.type)) {
        const alternatives = kids(n).filter(c => ["elif_clause", "else_clause"].includes(c.type) || c.id === field(n, "alternative")?.id)
        return branchFor(n, alternatives)
      }
      if (["return_statement", "raise_statement"].includes(n.type)) {
        const value = kids(n)[0], raised = value?.type === "call" ? field(value, "function")?.text : value?.text
        const values = value ? expressionFlow(value) : []
        return [...values, { kind: "step", anchorId: add(n, n.type === "return_statement" ? "return" : "raise", { valueExpression: value?.text, valueAnchorId: valueAnchor(value, values), ...sourceLiteral(value), ...(controlSemantics && n.type === "raise_statement" && raised && /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(raised) ? { exceptionType: raised } : {}) }).id }]
      }
      if (controlSemantics && n.type === "try_statement") {
        const handlers = kids(n).filter(c => c.type === "except_clause").map(c => {
          const value = field(c, "value"), type = value?.type === "as_pattern" ? kids(value)[0] : value
          const types = type?.type === "tuple" ? kids(type).map(t => t.text) : type ? [type.text] : []
          const unknownType = types.some(t => !/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(t))
          if (unknownType) gap(c, "skeleton-exception-type-unknown", "The exception handler type is not a finite named type; subtype and dynamic matching are not inferred.")
          return { anchorId: add(c, "control").id, exceptionTypes: types, catchesAll: !value, ...(value?.type === "as_pattern" ? { bindingName: kids(value)[1]?.text } : {}), ...(unknownType ? { unknownType } : {}), body: visitList(kids(c).find(k => k.type === "block")) }
        })
        const otherwise = kids(n).find(c => c.type === "else_clause"), final = kids(n).find(c => c.type === "finally_clause")
        return [{ kind: "try", anchorId: add(n, "control").id, body: visitList(field(n, "body")), handlers, otherwise: visitList(otherwise ? field(otherwise, "body") : null), finally: visitList(final ? kids(final).find(c => c.type === "block") : null) }]
      }
      if (controlSemantics && n.type === "with_statement") {
        gap(n, "skeleton-context-exit-unknown", "Context entry/exit may raise or suppress an exception; no runtime context protocol behavior is inferred.")
        let body = visitList(field(n, "body"))
        for (const manager of [...descendants(n, ["with_item"]).filter(c => c.parent?.parent?.id === n.id)].reverse()) {
          const value = field(manager, "value"), expr = value?.type === "as_pattern" ? kids(value)[0] : value
          body = [{ kind: "with", anchorId: add(manager, "control").id, enter: expr ? expressionFlow(expr) : [], ...(value?.type === "as_pattern" ? { targetName: kids(value)[1]?.text } : {}), body, exitUnknown: true }]
        }
        return body
      }
      if (controlSemantics && ["for_statement", "while_statement"].includes(n.type) && source.language === "python") {
        const iterable = field(n, "right"), literal = sourceLiteral(iterable), alternative = field(n, "alternative"), values = iterable ? expressionFlow(iterable) : []
        return [...values, { kind: "loop", anchorId: add(n, "control").id, targetName: field(n, "left")?.text, iterableExpression: iterable?.text, iterableValueAnchorId: valueAnchor(iterable, values), ...(literal.literalKnown ? { iterableValue: literal.literalValue } : {}), conditionExpression: field(n, "condition")?.text, body: visitList(field(n, "body")), otherwise: visitList(alternative ? field(alternative, "body") : null) }]
      }
      if (controlSemantics && ["break_statement", "continue_statement"].includes(n.type)) return [{ kind: n.type === "break_statement" ? "break" : "continue", anchorId: add(n, "control").id }]
      if (["for_statement", "while_statement", "try_statement", "with_statement", "switch_statement", "expression_switch_statement", "type_switch_statement", "select_statement", "defer_statement", "go_statement", "break_statement", "continue_statement", "match_statement"].includes(n.type)) {
        gap(n, "skeleton-control-unsupported", `The ${n.type} control structure needs a local interpretation; its body was not flattened into unconditional execution.`)
        for (const c of callsIn(n)) callAnchor(c)
        return [{ kind: "gap", anchorId: add(n, "assignment").id }]
      }
      if (questionDirected && source.language === "python" && n.type === "delete_statement" && descendants(n, ["attribute", "subscript"]).length) {
        gap(n, "skeleton-field-write-unmodeled", "Field deletion needs its source protocol and current identity effect; it is not an ordinary value store.")
        return [{ kind: "gap", anchorId: add(n, "assignment").id }]
      }
      if (["expression_statement", "assignment", "short_var_declaration", "assignment_statement", "augmented_assignment", "inc_statement", "dec_statement"].includes(n.type)) {
        const assignment = n.type === "expression_statement" ? kids(n).find(c => c.type === "assignment" || c.type === "augmented_assignment") : n
        const target = assignment && field(assignment, "left"), right = assignment && field(assignment, "right"), match = target?.type === "attribute" && /^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\.([A-Za-z_]\w*)$/.exec(target.text)
        const fieldWrite = questionDirected && source.language === "python" && match ? { object: match[1]!, field: match[2]! } : undefined
        const calls = expressionFlow(right ?? n, fieldWrite ? `field-result-${hash([source.id, assignment!.startIndex]).slice(0, 16)}` : target?.text)
        if (questionDirected && source.language === "python" && assignment && target && (target.type !== "identifier" || right?.type === "assignment") && (!fieldWrite || assignment.type !== "assignment" || right?.type === "assignment")) {
          gap(assignment, "skeleton-field-write-unmodeled", "Only a simple current attribute store is modeled; augmented, indexed, unpacked and chained targets require their own source semantics.")
          return [...calls, { kind: "gap", anchorId: add(assignment, "assignment", { name: target.text }).id }]
        }
        if (fieldWrite && source.className && fieldWrite.object === source.parameters[0]?.name) {
          const classes = index.linearize(receiverClass ?? source.className) ?? [source.className]
          if (index.symbols.some(s => s.className && classes.includes(s.className) && (s.name === "__setattr__" || s.name === fieldWrite.field && s.decorators?.some(d => d.expression === "property" || /\.(?:setter|deleter)$/.test(d.expression))))) {
            gap(assignment!, "skeleton-field-setter-unmodeled", "A visible custom setter or descriptor cannot be replaced by an ordinary field store.")
            return [...calls, { kind: "gap", anchorId: add(assignment!, "assignment", { name: target!.text }).id }]
          }
        }
        const protocol = fieldWrite && fieldStores.find(s => s.startIndex === assignment!.startIndex && s.endIndex === assignment!.endIndex)
        if (protocol?.gap) {
          gap(assignment!, protocol.gap, "A current function or method source may participate in this attribute store. Its callable/descriptor protocol and function-body changes cannot be replaced by an ordinary data transform.")
          return [...calls, { kind: "gap", anchorId: add(assignment!, "assignment", { name: target!.text, fieldWrite }).id }]
        }
        const methodStore = assignment && methodStores.find(s => s.source.startIndex === assignment.startIndex && s.source.endIndex === assignment.endIndex)
        return assignment && target ? [...calls, { kind: "step", anchorId: add(assignment, "assignment", { name: target.text, valueExpression: right?.text, valueAnchorId: valueAnchor(right, calls), ...sourceLiteral(right), ...(fieldWrite ? { fieldWrite } : {}), ...(methodStore ? { methodStore } : {}) }).id }] : calls
      }
      gap(n, "skeleton-statement-unsupported", `The ${n.type} statement remains explicit rather than being silently deleted.`)
      return [{ kind: "gap", anchorId: add(n, "assignment").id }]
    }
    skeleton.flow = registration ? [...callsIn(fn).filter(n => n.id !== fn.id), fn].map(n => ({ kind: "step", anchorId: callAnchor(n).id })) : visitList(source.kind === "module" ? fn : field(fn, "body"))
    if (fn.hasError) gap(fn, "skeleton-parse-partial", "The original function has parser errors; coverage is bounded.")
    const connect = (flow: SourceFlow[], next?: string) => {
      for (const [i, node] of flow.entries()) {
        const following = flow[i + 1]?.anchorId ?? next, anchor = skeleton.anchors.find(a => a.id === node.anchorId)!
        if (node.kind !== "gap" && ["condition", "call", "return", "raise"].includes(anchor.kind)) anchor.interpretationRequired = true
        const edge = (to: string | undefined, branch: "next" | "true" | "false") => { if (to) skeleton.edges.push({ from: node.anchorId, to, branch }) }
        if (node.kind === "branch") { edge(node.then?.[0]?.anchorId ?? following, "true"); edge(node.otherwise?.[0]?.anchorId ?? following, "false"); connect(node.then ?? [], following); connect(node.otherwise ?? [], following) }
        else if (node.kind === "try") { edge(node.body?.[0]?.anchorId, "next"); connect(node.body ?? [], node.otherwise?.[0]?.anchorId ?? node.finally?.[0]?.anchorId ?? following); for (const handler of node.handlers ?? []) connect(handler.body, node.finally?.[0]?.anchorId ?? following); connect(node.otherwise ?? [], node.finally?.[0]?.anchorId ?? following); connect(node.finally ?? [], following) }
        else if (node.kind === "with" || node.kind === "loop" || node.kind === "short-circuit") { connect(node.enter ?? [], node.body?.[0]?.anchorId); connect(node.body ?? [], following); connect(node.otherwise ?? [], following) }
        else if (node.kind !== "gap" && anchor.kind !== "return" && anchor.kind !== "raise") edge(following, "next")
      }
    }
    connect(skeleton.flow)
    skeleton.anchors.sort((a, b) => positions.get(a.id)! - positions.get(b.id)! || a.id.localeCompare(b.id))
  })
  skeleton.revision = hash([index.parser, index.relationshipVersion, ...(controlSemantics ? [controlSemantics] : []), ...(propertyDirected ? [skeleton.propertySemantics] : []), skeleton.source, skeleton.context, skeleton.modelCovered, skeleton.anchors, skeleton.flow, skeleton.edges, skeleton.gaps])
  return skeleton
}
