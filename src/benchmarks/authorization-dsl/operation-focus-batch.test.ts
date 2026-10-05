import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
import { createControlSlice } from "../../task-dsl/authorization/control-slice.ts"
import { createInquiryTools } from "./inquiry-tools.ts"
import { createInquiryDomainRuntime } from "./inquiry-domain-runtime.ts"
import { createInquiryWorklist } from "./inquiry-worklist.ts"
import { createInquiryFocus } from "./inquiry-focus.ts"
import { lowerIntoControlSlice } from "./inquiry-semantic.ts"
import { inquiryStepSchemas, normalizeFocusedControlEnvelope } from "./inquiry-wire.ts"

const body = { start: "body", complete: true, fallthrough: "allow", parameters: [], blocks: [{ name: "body", steps: [{ kind: "return", name: "done", claim: "Original return", value: true, outcome: "allow" }] }] }
test("direct focused payload with explicit calls and also is losslessly routed through the current step", () => {
  const calls = [{ name: "source_read", arguments: { path: "anonymous.py", startLine: 1, endLine: 2 } }]
  const focused = { kind: "interpret", schemaVersion: "authorization-focused-update/v1", focusId: "focus", unit: body }
  const raw = { ...focused, calls, controlDelta: { also: [] } }, expected = { kind: "tool", calls, controlDelta: { ...focused, also: [] } }
  const normalized = normalizeFocusedControlEnvelope(raw)
  expect(normalized.value).toEqual(expected)
  expect(normalized.normalization?.code).toBe("focused-update-at-step-root")
  expect(inquiryStepSchemas("operation-evidence-v1", false, "behavior", "interpret").schema.safeParse(raw).success).toBe(true)
})
test("matching duplicate step container is unwrapped without inventing calls or discarding meaning", () => {
  const value = { kind: "tool", calls: [{ name: "source_read", arguments: { path: "anonymous.py", startLine: 1, endLine: 2 } }] }, raw = { kind: "tool", value }
  expect(normalizeFocusedControlEnvelope(raw).value).toEqual(value)
  expect(inquiryStepSchemas("operation-evidence-v1", false, "behavior", "interpret").schema.safeParse(raw).success).toBe(true)
  for (const conflict of [{ ...raw, kind: "control" }, { ...raw, calls: value.calls }, { ...raw, value: { ...value, answer: "Unsupported answer" } }]) expect(normalizeFocusedControlEnvelope(conflict).value).toEqual(conflict)
})
test("routing recovery does not merge conflicting focused payloads or fabricate missing focus identity", () => {
  const focused = { kind: "interpret", schemaVersion: "authorization-focused-update/v1", focusId: "focus", unit: body }
  for (const raw of [{ ...focused, controlDelta: { unit: body } }, { ...focused, also: [], controlDelta: { also: [] } }, { kind: "interpret", unit: body }]) expect(normalizeFocusedControlEnvelope(raw).value).toEqual(raw)
})
test("batch contract is advertised only by the opt-in operation strategy", () => {
  const step = { kind: "control", controlDelta: { schemaVersion: "authorization-focused-update/v1", focusId: "focus", kind: "interpret", unit: body, also: [{ itemId: "peer", unit: body }] } }
  expect(inquiryStepSchemas("focused-closure-v1", false, "behavior", "interpret").modelSchema.safeParse(step).success).toBe(false)
  expect(inquiryStepSchemas("operation-evidence-v1", false, "behavior", "interpret").modelSchema.safeParse(step).success).toBe(true)
})
const declaration = (two = false) => compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "Inspect entry", entryHint: "entry" }, ...(two ? [{ id: "other", request: "Inspect foreign", entryHint: "foreign" }] : [])], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect entry", premises: [] }, ...(two ? [{ id: "f", operationId: "other", intent: "behavior", request: "Inspect foreign", premises: [] }] : [])] })
async function toolsFor(source: string) {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "au-batch-"))
  await writeFile(path.join(sourceRoot, "app.py"), source)
  const tools = await createInquiryTools({ sourceRoot, repository: "fixture", sourceRef: "r", allowedPaths: ["."], structure: true })
  await tools.execute("source_read", { path: "app.py", startLine: 1, endLine: source.trimEnd().split("\n").length })
  return tools
}

test("a first explicit dependency gets its receiver from the actual caller before structural work exists", async () => {
  const tools = await toolsFor("class Base:\n    def gate(self):\n        return True\nclass View(Base):\n    pass\ndef entry(view: View):\n    return view.gate()\n")
  const program = declaration(), source = tools.structure!.symbols.find(s => s.name === "entry")!, gate = tools.structure!.symbols.find(s => s.name === "gate")!
  const unit: any = { ...body, role: "entry", op: "add", questionId: "q", handle: "caller", itemId: "q::entry", evidenceIds: tools.evidence.map(e => e.id), source, blocks: [{ name: "body", steps: [{ kind: "call", name: "check", symbol: "gate", claim: "Actual view.gate call", arguments: [] }] }] }
  const slice = lowerIntoControlSlice(createControlSlice(), [unit], program, { questionIds: ["q"], shownEvidenceIds: unit.evidenceIds }, true).state
  const dependency = slice.dependencies[0]!
  const work = createInquiryWorklist({ program, tools, structural: true, semanticUnits: () => [unit], dependencyStates: () => [{ ...dependency, state: "read", candidates: [gate], evidenceIds: unit.evidenceIds, semanticSupport: "unreviewed" } as any] })
  const first = work.sync(slice).find(i => i.origin === "explicit-dependency")!
  expect(first.receiverClass).toBe("app.View")
})

test("revisit replaces the accepted handle even when its original work item is retained", async () => {
  const tools = await toolsFor("def entry():\n    return True\n")
  const program = declaration(), source = tools.structure!.symbols.find(s => s.name === "entry")!
  const item: any = { id: "retained-source", questionId: "q", kind: "guard", origin: "structure-relation", question: "Original body", state: "awaiting-verification", selected: source, candidates: [source], evidenceIds: tools.evidence.map(e => e.id), callsiteEvidenceIds: [], nextAction: { kind: "check", itemId: "retained-source" } }
  const unit: any = { ...body, role: "helper", op: "add", handle: "accepted-handle", itemId: item.id, questionId: "q", evidenceIds: item.evidenceIds, source }
  const focus = createInquiryFocus({ program, tools, structural: true, items: () => [item], units: () => [unit], slice: createControlSlice, dependencies: () => [], diagnostics: () => [] })
  focus.sync()
  expect(focus.prepare({ schemaVersion: "authorization-focused-update/v1", focusId: focus.current()!.id, kind: "defer", reason: "Correct this original", revisit: unit.handle }, []).diagnostics).toEqual([])
  expect(focus.current()!.handle).toBe("accepted-handle")
  const context = focus.context()
  const prepared = focus.prepare({ schemaVersion: "authorization-focused-update/v1", focusId: focus.current()!.id, kind: "interpret", unit: body }, context.tasks)
  expect((prepared.delta!.semanticBlocks as any[])[0].op).toBe("replace")
})

test("operation focus offers and accepts several distinct bodies sharing an original read in one dispatch", async () => {
  const tools = await toolsFor("def entry():\n    gate()\n    return audit()\ndef gate():\n    return True\ndef audit():\n    return True\n")
  const runtime = createInquiryDomainRuntime({ program: declaration(), tools, strategy: "operation-evidence-v1" })
  await runtime.sync()
  const context: any = runtime.modelContext(), primary = context.tasks[0], extra = context.tasks.filter((t: any) => t.itemId !== primary.itemId)
  expect(extra).toHaveLength(2)
  const calls = tools.toolCalls
  const accepted = await runtime.propose({ schemaVersion: "authorization-focused-update/v1", focusId: context.focus.id, kind: "interpret", unit: body, also: extra.map((t: any) => ({ itemId: t.itemId, unit: body })) })
  expect(accepted.diagnostics).toEqual([])
  expect(runtime.report().semantic!.units).toHaveLength(3)
  expect(tools.toolCalls).toBe(calls)
  expect((runtime.modelContext() as any).tasks).toEqual([])
})

test("batch interpretation rejects an unseen body without accepting the current transaction", async () => {
  const tools = await toolsFor("def entry():\n    return True\n")
  const runtime = createInquiryDomainRuntime({ program: declaration(), tools, strategy: "operation-evidence-v1" })
  await runtime.sync()
  const context: any = runtime.modelContext()
  const rejected = await runtime.propose({ schemaVersion: "authorization-focused-update/v1", focusId: context.focus.id, kind: "interpret", unit: body, also: [{ itemId: "invented", unit: body }] })
  expect(rejected.diagnostics.some(d => d.code === "focus-batch-work-not-offered")).toBe(true)
  expect(runtime.report().semantic!.units).toEqual([])
})

test("pending source offers exclude another operation", async () => {
  const tools = await toolsFor("def entry():\n    return gate()\ndef gate():\n    return True\ndef foreign():\n    return other_gate()\ndef other_gate():\n    return False\n")
  const runtime = createInquiryDomainRuntime({ program: declaration(true), tools, strategy: "operation-evidence-v1" })
  await runtime.sync()
  const context: any = runtime.modelContext()
  expect(context.focus.questionId).toBe("q")
  expect(context.pendingSourceWork.some((i: any) => i.questionId === "f")).toBe(false)
})

test("successful source selection retires an earlier rejected selection from the same focus", async () => {
  const tools = await toolsFor("def entry():\n    return gate()\ndef gate():\n    return True\n")
  const runtime = createInquiryDomainRuntime({ program: declaration(), tools, strategy: "operation-evidence-v1" })
  await runtime.sync()
  const context: any = runtime.modelContext(), next = context.pendingSourceWork.find((i: any) => i.symbol === "gate")
  await runtime.propose({ schemaVersion: "authorization-focused-update/v1", focusId: context.focus.id, kind: "defer", reason: "Mistaken selector", nextItemId: "invented" })
  await runtime.propose({ schemaVersion: "authorization-focused-update/v1", focusId: context.focus.id, kind: "defer", reason: "Choose the actually shown helper", nextItemId: next.id })
  expect(runtime.feedback().diagnostics.some(d => d.code === "focus-next-item-unavailable")).toBe(false)
})

test("question projections cannot create another source transaction for a shared operation", async () => {
  const tools = await toolsFor("def entry():\n    return gate()\ndef gate():\n    return True\n")
  const value: any = declaration().originalDeclaration
  value.questions.push({ id: "scope", operationId: "op", intent: "scope", request: "Explain scope", premises: [] })
  const runtime = createInquiryDomainRuntime({ program: compileAuthorizationInquiry(value), tools, strategy: "operation-evidence-v1" })
  await runtime.sync()
  const context: any = runtime.modelContext()
  await runtime.propose({ schemaVersion: "authorization-focused-update/v1", focusId: context.focus.id, kind: "interpret", unit: { ...body, blocks: [{ name: "body", steps: [{ kind: "call", name: "check", symbol: "gate", claim: "Calls the original helper", arguments: [] }] }] } })
  expect(runtime.report().worklist!.items.filter(i => i.origin === "explicit-dependency").every(i => i.questionId === "q")).toBe(true)
})

test("source review correction retains the accepted receiver if live work metadata changes", async () => {
  const tools = await toolsFor("def entry():\n    return True\n"), program = declaration(), source = tools.structure!.symbols.find(s => s.name === "entry")!
  const item: any = { id: "reviewed-source", questionId: "q", kind: "guard", origin: "structure-relation", question: "Original body", receiverClass: "app.Original", state: "awaiting-verification", selected: source, candidates: [source], evidenceIds: tools.evidence.map(e => e.id), callsiteEvidenceIds: [], nextAction: { kind: "check", itemId: "reviewed-source" } }
  const unit: any = { ...body, role: "helper", op: "add", handle: "accepted", receiverClass: "app.Original", itemId: item.id, questionId: "q", evidenceIds: item.evidenceIds, source, blocks: [{ name: "body", steps: [{ kind: "guard", name: "control", claim: "Original control" }] }] }
  const focus = createInquiryFocus({ program, tools, structural: true, items: () => [item], units: () => [unit], slice: createControlSlice, dependencies: () => [], diagnostics: () => [] })
  focus.sync()
  const context: any = focus.context()
  expect(context.focus.stage).toBe("review")
  item.receiverClass = "app.Other"
  expect(focus.prepare({ schemaVersion: "authorization-focused-update/v1", focusId: context.focus.id, kind: "review", claims: [{ claim: context.claims[0].id, verdict: "correct", explanation: "Correct this exact original source" }] }, []).diagnostics).toEqual([])
  expect(focus.current()!.receiverClass).toBe("app.Original")
  expect(focus.current()!.handle).toBe("accepted")
})
