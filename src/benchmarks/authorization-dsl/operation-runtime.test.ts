import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "./inquiry-tools.ts"
import { createInquiryDomainRuntime } from "./inquiry-domain-runtime.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
import { inquiryStepSchemas, inquiryNativeSchemas } from "./inquiry-wire.ts"
import { zodToJsonSchema } from "../../providers/structured.ts"
import type { SourceSkeleton } from "./evidence-preparation/source-skeleton.ts"

test("operation structured result is direct while native keeps the same focused result and v2 declaration core", () => {
  const schemas = inquiryStepSchemas("operation-evidence-v1", true, "behavior", "answer")
  expect((zodToJsonSchema(schemas.modelSchema) as any).properties.schemaVersion.const).toBe("authorization-focused-result/v1")
  expect((zodToJsonSchema(inquiryNativeSchemas("operation-evidence-v1").authorization_check_result) as any).properties.result.properties.schemaVersion.const).toBe("authorization-focused-result/v1")
  expect((zodToJsonSchema(inquiryNativeSchemas("operation-evidence-v1").authorization_compile) as any).properties.inquiry.properties.schemaVersion.const).toBe("authorization-inquiry/v2")
})
test("one accepted current source body projects to every original question without sharing premise values", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "au-runtime-"))
  await writeFile(path.join(sourceRoot, "view.py"), "def create(caller, item):\n    return item\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "fixture", sourceRef: "r", allowedPaths: ["."], structure: true })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "create", request: "create", entryHint: "create" }], questions: [{ id: "a", operationId: "create", intent: "behavior", request: "Describe create with flag true.", premises: [] }, { id: "b", operationId: "create", intent: "scope", request: "Explain scope with flag false.", premises: [] }] })
  const domain = createInquiryDomainRuntime({ program, tools, strategy: "operation-evidence-v1", suppliedUserText: program.questions.map(q => q.request) })
  await domain.sync()
  const context = domain.modelContext(), focus = (context as any).focus
  expect(focus.stage).toBe("interpret")
  const result = await domain.propose({ schemaVersion: "authorization-focused-update/v1", focusId: focus.id, kind: "interpret", unit: { start: "body", complete: true, parameters: [{ name: "caller", type: "principal" }, { name: "item", type: "resource" }], blocks: [{ name: "body", steps: [{ kind: "return", name: "ret", claim: "returns without mutation", outcome: "allow" }] }] }, values: [{ key: "flag", value: true, text: "flag true.", questionId: "a" }, { key: "flag", value: false, text: "flag false.", questionId: "b" }] })
  expect(result.diagnostics).toEqual([])
  const report = domain.report()
  expect(report.slice.rules.filter(r => r.kind === "entry").map(r => r.questionId)).toEqual(["a", "b"])
  expect(report.slice.bindings.map(b => [b.questionId, b.key, b.value])).toEqual([["a", "flag", true], ["b", "flag", false]])
  expect(report.operationFacts!.identities[0]!.entrySymbolId).toBe(tools.locateSymbols("create")[0]!.id)
  expect(report.operationFacts!.facts[0]!.semanticSupport).toBe("unreviewed")
  expect(report.semantic!.units).toHaveLength(1)
})

test("correcting an operation entry retires every old projection and helper before interpreting the new entry", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "au-rebind-"))
  await writeFile(path.join(sourceRoot, "view.py"), "def wrong():\n    return helper()\ndef helper():\n    return True\ndef right():\n    return False\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "fixture", sourceRef: "r", allowedPaths: ["."], structure: true })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "Inspect right", entryHint: "wrong" }], questions: [{ id: "a", operationId: "op", intent: "behavior", request: "Inspect right", premises: [] }, { id: "b", operationId: "op", intent: "scope", request: "Explain scope", premises: [] }] })
  const domain = createInquiryDomainRuntime({ program, tools, strategy: "operation-evidence-v1" })
  await domain.sync()
  const body = (entry: boolean) => ({ start: "body", complete: true, blocks: [{ name: "body", steps: [{ kind: "return", name: "ret", claim: "original return", ...(entry ? { outcome: "allow" } : { value: true }) }] }] })
  let context: any = domain.modelContext()
  await domain.propose({ schemaVersion: "authorization-focused-update/v1", focusId: context.focus.id, kind: "interpret", unit: body(true) })
  context = domain.modelContext()
  await domain.propose({ schemaVersion: "authorization-focused-update/v1", focusId: context.focus.id, kind: "interpret", unit: body(false) })
  expect(domain.report().semantic!.units).toHaveLength(2)
  const oldRecords = domain.report().semantic!.records.length
  const found = await tools.execute("source_symbol", { name: "right" }), entry = domain.report().worklist!.items.find(i => i.origin === "question-duty" && i.kind === "entry")!
  domain.beginStep()
  await domain.propose({ schemaVersion: "authorization-control-update/v1", workSelections: [{ questionId: "a", itemId: entry.id, candidateId: found.candidates[0]!.id }] })
  expect(domain.report().operationFacts!.facts.filter(f => f.current)).toEqual([])
  expect(domain.report().slice.rules).toEqual([])
  expect(domain.report().semantic!.units).toEqual([])
  expect(domain.report().semantic!.records).toHaveLength(oldRecords)
  context = domain.modelContext()
  expect(context.focus.stage).toBe("interpret")
  expect(context.focus.source.id).toBe(found.candidates[0]!.id)
})

test("direct first selection advances an ambiguous operation location to its actual source interpretation", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "au-locate-"))
  await writeFile(path.join(sourceRoot, "a.py"), "def create():\n    return True\n")
  await writeFile(path.join(sourceRoot, "b.py"), "def create():\n    return False\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "fixture", sourceRef: "r", allowedPaths: ["."], structure: true })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "Inspect create", entryHint: "create" }], questions: [{ id: "a", operationId: "op", intent: "behavior", request: "Inspect create", premises: [] }] })
  const domain = createInquiryDomainRuntime({ program, tools, strategy: "operation-evidence-v1" })
  await domain.sync()
  const context: any = domain.modelContext()
  expect(context.focus.stage).toBe("locate")
  await domain.propose({ schemaVersion: "authorization-control-update/v1", workSelections: [{ questionId: "a", itemId: context.focus.itemId, candidateId: tools.locateSymbols("create")[0]!.id }] })
  expect((domain.modelContext() as any).focus.stage).toBe("interpret")
})

async function sourcePremiseFixture() {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "av-source-premise-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def entry(flag):\n    if flag:\n        return True\n    return False\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "anonymous", sourceRef: "fixed", allowedPaths: ["app.py"], structure: true })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "Inspect entry", entryHint: "entry" }], questions: [
    { id: "known", operationId: "op", intent: "behavior", request: "Explain the current entry with flag true.", premises: [] },
    { id: "unknown", operationId: "op", intent: "scope", request: "Explain the alternatives with flag unspecified.", premises: [] },
  ] })
  const domain = createInquiryDomainRuntime({ program, tools, strategy: "operation-evidence-v2", sourceAssisted: true, suppliedUserText: program.questions.map(q => q.request) })
  await domain.sync()
  let context: any = domain.modelContext()
  if (context.focus.stage === "locate") {
    await domain.propose({ schemaVersion: "authorization-focused-update/v1", kind: "select", focusId: context.focus.id, candidateId: context.locationTasks[0].candidates[0].id })
    context = domain.modelContext()
  }
  const skeleton = context.tasks[0].sourceSkeleton as SourceSkeleton
  expect(context.focus.stage).toBe("interpret")
  const proposal = { schemaVersion: "authorization-source-update/v1", kind: "interpret", focusId: context.focus.id, interpretation: { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations: skeleton.anchors.filter(a => a.kind === "condition" || a.kind === "return").map(a => a.kind === "condition" ? { anchorId: a.id, role: "condition", explanation: "The actual branch tests flag", condition: { op: "eq", left: { binding: "flag" }, right: { literal: true } } } : { anchorId: a.id, role: "context", explanation: "The actual source return", returnOutcome: a.literalValue === true ? "allow" : "deny" }), unresolved: [] } }
  return { domain, context, proposal }
}

test("source-assisted explicit user values select a finite branch without sharing unknown question premises", async () => {
  const { domain, proposal } = await sourcePremiseFixture()
  const raw = { ...proposal, values: [{ key: "flag", value: true, text: "flag true.", questionId: "known" }] }
  const accepted = await domain.propose(raw)
  expect(accepted.diagnostics).toEqual([])
  expect(domain.report().slice.bindings.map(b => [b.questionId, b.key, b.value])).toEqual([["known", "flag", true]])
  const paths = domain.feedback().paths
  expect(paths.filter(p => p.questionId === "known" && p.state !== "inapplicable").map(p => p.disposition)).toEqual(["allow"])
  expect(paths.filter(p => p.questionId === "unknown" && p.state !== "inapplicable")).toHaveLength(2)
  expect(domain.deliverySnapshot().gaps).toContainEqual(expect.objectContaining({ kind: "premise-unknown", questionId: "unknown" }))
  expect(domain.report().sourceWorkMetrics?.lowLevelFallbacks).toBe(0)
  expect(inquiryStepSchemas("operation-evidence-v2", false, "behavior", "interpret").modelSchema.safeParse(raw).success).toBe(true)
  expect(inquiryNativeSchemas("operation-evidence-v2", false, "interpret").authorization_observe.safeParse({ controlDelta: raw }).success).toBe(true)
})

for (const supplied of [false, true]) test(`source-assisted values reject ${supplied ? "an unspecified user value" : "a source constant presented as a user premise"} in the same source transaction`, async () => {
  const { domain, context, proposal } = await sourcePremiseFixture()
  const rejected = await domain.propose({ ...proposal, values: [{ key: "flag", value: true, text: supplied ? "flag unspecified." : "SOURCE_CONSTANT", questionId: supplied ? "unknown" : "known" }] })
  expect(rejected.diagnostics.some(d => d.code === (supplied ? "premise-value-unspecified" : "premise-not-supplied"))).toBe(true)
  expect((domain.modelContext() as any).focus.id).toBe(context.focus.id)
  expect(domain.report().slice.bindings).toEqual([])
  expect(domain.report().semantic?.units).toHaveLength(0)
  expect((await domain.propose(proposal)).diagnostics).toEqual([])
  expect(domain.report().slice.bindings).toEqual([])
  expect(domain.report().sourceWorkMetrics?.lowLevelFallbacks).toBe(0)
})

test("flattened native user context cannot lend another question's known span to an unspecified question", async () => {
  const { domain, context, proposal } = await sourcePremiseFixture()
  const rejected = await domain.propose({ ...proposal, values: [{ key: "flag", value: true, text: "flag true.", questionId: "unknown" }] })
  expect(rejected.diagnostics.some(d => d.code === "premise-not-supplied")).toBe(true)
  expect((domain.modelContext() as any).focus.id).toBe(context.focus.id)
  expect(domain.report().slice.bindings).toEqual([])
  expect(domain.report().semantic?.units).toHaveLength(0)
})
