import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "../../benchmarks/authorization-dsl/inquiry-tools.ts"
import { lowerSourceInterpretation } from "./source-interpretation.ts"
import { predicateDiagnostics } from "./control-evaluation.ts"
import { compileAuthorizationInquiry } from "./inquiry-program.ts"
import { createInquiryDomainRuntime } from "../../benchmarks/authorization-dsl/inquiry-domain-runtime.ts"
import { inquiryNativeSchemas, inquiryNativeDefinitions, inquiryStepSchemas } from "../../benchmarks/authorization-dsl/inquiry-wire.ts"
import Ajv from "ajv"
const api = await import("./source-edit.ts").catch(() => ({})) as any

async function fixture() {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ba-source-edit-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def entry(flag):\n    if not flag:\n        return False\n    return True\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "anonymous", sourceRef: "r", allowedPaths: ["app.py"], structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  const source = tools.structure!.symbols.find(s => s.name === "entry")!
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id))!
  return { tools, skeleton, transactionId: "transaction-current", condition: skeleton.anchors.find(a => a.kind === "condition")! }
}
const payload = (transactionId: string, edits: unknown[]) => ({ schemaVersion: "authorization-source-edit/v1", kind: "edit", transactionId, edits })

test("field/value edits retain a partial role and compile after a later explanation", async () => {
  expect(typeof api.compileSourceEdit).toBe("function")
  const f = await fixture(), first = api.compileSourceEdit(f.skeleton, payload(f.transactionId, [{ anchorId: f.condition.id, field: "role", value: "condition" }]), { transactionId: f.transactionId })
  expect(first.acceptedEdits).toBe(1)
  expect(first.draft.annotations[0].role).toBe("condition")
  expect(first.interpretation).toBeUndefined()
  expect(first.diagnostics[0].code).toBe("source-edit-draft-incomplete")
  const second = api.compileSourceEdit(f.skeleton, payload(f.transactionId, [{ anchorId: f.condition.id, field: "explanation", value: "The shown false flag branch returns" }]), { transactionId: f.transactionId, previous: first.draft })
  expect(second.interpretation.annotations[0].role).toBe("condition")
  expect(second.interpretation.revision).toBe(f.skeleton.revision)
  const lowered = lowerSourceInterpretation(f.skeleton, second.interpretation, { itemId: "entry", handle: "entry", questionId: "q", role: "entry", propertyDirected: true })
  expect(lowered.unit).toBeUndefined()
  expect(lowered.diagnostics.some(d => d.code === "source-interpretation-condition-required")).toBe(true)
})

test("editor rejects unknown enum meanings, empty explanations and invalid finite predicates without coercion", async () => {
  expect(typeof api.compileSourceEdit).toBe("function")
  const f = await fixture()
  for (const [field, value] of [["role", "guard"], ["role", "delegate"], ["returnOutcome", "delegated"], ["explanation", " "], ["condition", { op: "and", args: [] }], ["failureKind", "operation-failure"]]) {
    const result = api.compileSourceEdit(f.skeleton, payload(f.transactionId, [{ anchorId: f.condition.id, field, value }]), { transactionId: f.transactionId })
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.acceptedEdits).toBe(0)
    expect(result.interpretation).toBeUndefined()
  }
})

test("empty draft, named unknown and explicit source predicate are distinct", async () => {
  expect(typeof api.compileSourceEdit).toBe("function")
  const f = await fixture(), empty = api.compileSourceEdit(f.skeleton, payload(f.transactionId, []), { transactionId: f.transactionId })
  expect(empty.acceptedEdits).toBe(0)
  expect(empty.interpretation.annotations).toEqual([])
  const unknown = api.compileSourceEdit(f.skeleton, payload(f.transactionId, [{ anchorId: f.condition.id, field: "unresolved", value: "The source condition is not yet expressed" }]), { transactionId: f.transactionId })
  expect(unknown.interpretation.unresolved).toEqual([{ anchorId: f.condition.id, reason: "The source condition is not yet expressed" }])
  const precise = api.compileSourceEdit(f.skeleton, payload(f.transactionId, [{ anchorId: f.condition.id, field: "role", value: "condition" }, { anchorId: f.condition.id, field: "explanation", value: "False flag enters the return" }, { anchorId: f.condition.id, field: "condition", value: { op: "not", arg: { op: "truthy", language: "python", value: { binding: "flag" } } } }]), { transactionId: f.transactionId, previous: unknown.draft })
  expect(precise.interpretation.unresolved).toEqual([])
  expect(precise.interpretation.annotations[0].condition.op).toBe("not")
})

test("foreign anchors, stale transaction, duplicate slots and conflicting host metadata cannot modify a draft", async () => {
  expect(typeof api.compileSourceEdit).toBe("function")
  const f = await fixture(), previous = api.compileSourceEdit(f.skeleton, payload(f.transactionId, [{ anchorId: f.condition.id, field: "role", value: "condition" }]), { transactionId: f.transactionId }).draft
  for (const raw of [payload("old", []), payload(f.transactionId, [{ anchorId: "forged", field: "role", value: "condition" }]), { ...payload(f.transactionId, []), revision: "old" }, { ...payload(f.transactionId, []), focusId: "foreign" }, payload(f.transactionId, [{ anchorId: f.condition.id, field: "role", value: "condition" }, { anchorId: f.condition.id, field: "role", value: "context" }])]) {
    const result = api.compileSourceEdit(f.skeleton, raw, { transactionId: f.transactionId, previous })
    expect(result.acceptedEdits).toBe(0)
    expect(result.draft).toEqual(previous)
    expect(result.diagnostics.length).toBeGreaterThan(0)
  }
})

test("model view exposes schema-derived fields and validated anonymous expression examples", async () => {
  expect(typeof api.sourceEditModelView).toBe("function")
  const f = await fixture(), view = api.sourceEditModelView(f.skeleton, { transactionId: f.transactionId, questionIds: ["q"] })
  expect(api.SourceEditSchema.safeParse(view.template).success).toBe(true)
  expect(view.fields.role.enum).toEqual(["principal", "resource", "permission", "condition", "effect", "context"])
  expect(view.slots.some((s: any) => s.anchorId === f.condition.id && s.field === "condition" && s.source.startLine === 2 && s.source.text.includes("not flag") && s.questionIds[0] === "q")).toBe(true)
  expect(view.expression.examples.every((p: unknown) => predicateDiagnostics(p).length === 0)).toBe(true)
  expect(JSON.stringify(view.template)).not.toMatch(/revision|focusId|permission|deny|allow/)
})

test("the public v6 source transaction adopts incremental edits through wire, lowering and projection", async () => {
  const f = await fixture(), program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect entry and explain its return", premises: [] }] })
  const runtime = createInquiryDomainRuntime({ tools: f.tools, program, strategy: "operation-evidence-v6", sourceAssisted: true })
  await runtime.sync()
  let context: any = runtime.promptContext()
  if (context.focus.stage === "locate") { await runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "select", focusId: context.focus.id, candidateId: f.skeleton.sourceId }); context = runtime.promptContext() }
  const form = context.tasks[0].sourceEdit
  expect(form).toBeDefined()
  const partial = { ...form.template, edits: [{ anchorId: f.condition.id, field: "role", value: "condition" }] }
  const schema = inquiryNativeDefinitions("operation-evidence-v6").find(t => t.name === "authorization_observe")!.inputSchema
  expect(new Ajv({ strict: false }).compile(schema)({ controlDelta: partial })).toBe(true)
  expect(inquiryNativeSchemas("operation-evidence-v6", true).authorization_observe.safeParse({ controlDelta: partial }).success).toBe(true)
  expect(inquiryStepSchemas("operation-evidence-v6", false, "behavior", "interpret").schema.safeParse(partial).success).toBe(true)
  const first = await runtime.propose(partial)
  expect(first.diagnostics.some(d => d.code === "source-edit-draft-incomplete")).toBe(true)
  expect(runtime.report().semantic?.units).toHaveLength(0)
  const current: any = runtime.promptContext()
  expect(current.tasks[0].sourceEdit.retainedDraft.annotations[0].role).toBe("condition")
  const edits = [{ anchorId: f.condition.id, field: "explanation", value: "False flag returns early" }, { anchorId: f.condition.id, field: "condition", value: { op: "eq", left: { binding: "flag" }, right: { literal: false } } }, ...f.skeleton.anchors.filter(a => a.kind === "return").flatMap(a => [{ anchorId: a.id, field: "role", value: "context" }, { anchorId: a.id, field: "explanation", value: "The actual returning path" }, { anchorId: a.id, field: "returnOutcome", value: a.valueExpression === "False" ? "deny" : "allow" }])]
  const second = await runtime.propose({ ...form.template, edits })
  expect(second.diagnostics).toEqual([])
  expect(runtime.report().semantic?.units).toHaveLength(1)
  expect(runtime.report().sourceMaterials?.materials).toHaveLength(1)
  expect(runtime.report().materialUses).toHaveLength(1)
  expect(runtime.report().focus?.sourceInterpretations.some((h: any) => h.event === "edited" && h.generated?.schemaVersion === "source-interpretation/v1")).toBe(true)
  expect(runtime.report().sourceWorkMetrics).toMatchObject({ validSourceEdits: edits.length + 1, retainedSourceDrafts: 1 })
  const answer: any = runtime.promptContext({ finalOnly: true })
  expect(answer.answerContract.mode).toBe("behavior")
  expect(answer.answerContract.missingSchema.items.required).toEqual(["kind", "detail"])
  expect(answer.answerContract.policyAssessmentSchema.properties.status.enum).toEqual(["satisfied", "violated", "undetermined"])
  expect(answer.answerContract.policyInstruction).toContain("omit")
  const old = await runtime.propose(partial)
  expect(old.diagnostics.some(d => /stale/.test(d.code))).toBe(true)
  expect(runtime.report().semantic?.units).toHaveLength(1)
})
