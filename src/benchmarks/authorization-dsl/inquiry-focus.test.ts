import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
import { createInquiryTools } from "./inquiry-tools.ts"
import { createInquiryDomainRuntime } from "./inquiry-domain-runtime.ts"
import { inquiryStepSchemas, inquiryNativeDefinitions } from "./inquiry-wire.ts"
import { zodToJsonSchema } from "../../providers/structured.ts"
import { runAuthorizationInquiry } from "./inquiry-run.ts"
import { createNativeInquiryRuntime } from "./inquiry-native.ts"
import { emptyTokenUsage } from "../../core/types.ts"

async function setup(count = 3) {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "at-focus-"))
  await writeFile(path.join(sourceRoot, "entry.ts"), "export function entry(actor: string) { return gate(actor); }\n")
  await writeFile(path.join(sourceRoot, "helper.ts"), "export function gate(actor: string) { return true; }\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["."] })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: Array.from({ length: count }, (_, i) => ({ id: `q${i}`, request: "Inspect entry and its caller/control/effect conditions", entryHint: "entry", premises: [] })) })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "focused-closure-v1" as any })
  await runtime.sync()
  return { runtime, tools, sourceRoot, program }
}
const body = { start: "main", complete: true, blocks: [{ name: "main", steps: [{ kind: "return", name: "ok", claim: "Source returns successfully without a mutation", outcome: "allow", value: true }] }] }
const interpret = (focusId: string, unit: unknown = body) => ({ schemaVersion: "authorization-focused-update/v1", focusId, kind: "interpret", unit })

test("rendering keeps one source/version focus; rejected interpretation remains repairable at the same focus", async () => {
  const { runtime } = await setup()
  const first: any = runtime.modelContext()
  expect(first.focus?.stage).toBe("interpret")
  for (let i = 0; i < 5; i++) expect((runtime.modelContext() as any).focus).toEqual(first.focus)
  const rejected = await runtime.propose(interpret(first.focus.id, { ...body, unrelated: true }))
  expect(rejected.diagnostics.length).toBeGreaterThan(0)
  expect((runtime.modelContext() as any).focus.id).toBe(first.focus.id)
  await runtime.propose(interpret(first.focus.id))
  expect(runtime.report().semantic?.units).toHaveLength(1)
  expect(runtime.report().semantic?.units[0]?.questionId).toBe(first.focus.questionId)
  expect((runtime.modelContext() as any).focus.id).not.toBe(first.focus.id)
})
test("host owns unit identity and update operation; exact duplicate submission is idempotent", async () => {
  const { runtime } = await setup(1)
  const current: any = runtime.modelContext()
  expect(current.focus).toBeDefined()
  const raw = interpret(current.focus.id)
  await runtime.propose(raw)
  const revision = runtime.report().slice.revision
  await runtime.propose(raw)
  expect(runtime.report().slice.revision).toBe(revision)
  expect(runtime.report().semantic?.units).toHaveLength(1)
  expect(runtime.report().semantic?.records[0]?.raw).toBeDefined()
})
test("actually read decisive helper becomes the next interpretation instead of being closed by a citation", async () => {
  const { runtime, tools } = await setup(1)
  const first: any = runtime.modelContext()
  expect(first.focus).toBeDefined()
  await runtime.propose(interpret(first.focus.id, { ...body, fallthrough: "allow", parameters: [{ name: "actor", type: "principal" }], blocks: [{ name: "main", steps: [{ kind: "call", name: "check", symbol: "gate", claim: "This helper decides the request", arguments: [{ parameter: "actor", object: "actor" }] }] }] }))
  const next: any = runtime.modelContext()
  expect(next.focus.stage).toBe("interpret")
  expect(next.tasks[0]?.duty.symbol).toBe("gate")
  expect(tools.history.some(h => h.name === "source_read" && (h.arguments as any).path === "helper.ts")).toBe(true)
  expect(runtime.report().dependencies.some(d => d.symbol === "gate" && d.state !== "checked")).toBe(true)
})
test("failed helper proposal preserves accepted work in a different question", async () => {
  const { runtime } = await setup(2)
  const first: any = runtime.modelContext()
  expect(first.focus).toBeDefined()
  await runtime.propose(interpret(first.focus.id))
  const accepted = structuredClone(runtime.report().semantic?.units)
  const next: any = runtime.modelContext()
  await runtime.propose(interpret(next.focus.id, { ...body, blocks: [] }))
  expect(runtime.report().semantic?.units).toEqual(accepted)
  expect((runtime.modelContext() as any).focus.id).toBe(next.focus.id)
})
test("source invalidation retires the focus and refuses replies from its earlier source version", async () => {
  const { runtime, tools, sourceRoot } = await setup(1)
  const first: any = runtime.modelContext()
  expect(first.focus).toBeDefined()
  await writeFile(path.join(sourceRoot, "entry.ts"), "export function entry() { return false; }\n")
  await tools.execute("source_read", { path: "entry.ts", startLine: 1, endLine: 1 })
  await runtime.sync(false)
  const rejected = await runtime.propose(interpret(first.focus.id))
  expect(rejected.diagnostics.some(d => /source-invalidated|focus-stale/.test(d.code))).toBe(true)
  expect(runtime.report().semantic?.units).toHaveLength(0)
})
test("explicit defer rotates work once and leaves the deferred source addressable", async () => {
  const { runtime } = await setup(2)
  const first: any = runtime.modelContext()
  expect(first.focus).toBeDefined()
  await runtime.propose({ schemaVersion: "authorization-focused-update/v1", focusId: first.focus.id, kind: "defer", reason: "Need another source before deciding this relationship" })
  const next: any = runtime.modelContext()
  expect(next.focus.questionId).not.toBe(first.focus.questionId)
  expect((runtime.report() as any).focus.history.some((h: any) => h.reason?.includes("another source"))).toBe(true)
  await runtime.propose(interpret(next.focus.id))
  expect((runtime.modelContext() as any).focus.questionId).toBe(first.focus.questionId)
})
test("answer numeric paths address the displayed current per-question snapshot", async () => {
  const { runtime } = await setup(1)
  const first: any = runtime.modelContext()
  await runtime.propose(interpret(first.focus.id, { ...body, blocks: [{ name: "main", steps: [{ kind: "choose", name: "choice", claim: "Two source branches", cases: [{ condition: { op: "eq", left: { binding: "flag" }, right: { literal: true } }, body: "yes" }], otherwise: "no" }] }, { name: "yes", steps: body.blocks[0]!.steps }, { name: "no", steps: [{ kind: "return", name: "no", claim: "Other source branch", outcome: "deny", value: false }] }] }))
  const answer: any = runtime.modelContext()
  expect(answer.focus.stage).toBe("answer")
  expect(answer.answerSnapshot.map((p: any) => p.path)).toEqual([0, 1])
  const assembled = runtime.assembleResult({ schemaVersion: "authorization-focused-result/v1", focusId: answer.focus.id, answers: [{ explanation: "Source has two conditional outcomes", paths: [{ path: 0, explanation: "First condition" }, { path: 1, explanation: "Alternative condition" }] }], scope: "Original source only" })
  expect(assembled.diagnostics).toEqual([])
})
test("a reviewed helper remains correctable after its dependency work item retires", async () => {
  const { runtime } = await setup(1)
  const first: any = runtime.modelContext()
  await runtime.propose(interpret(first.focus.id, { ...body, blocks: [{ name: "main", steps: [{ kind: "call", name: "check", symbol: "gate", claim: "Decisive helper", arguments: [] }] }] }))
  const helper: any = runtime.modelContext()
  await runtime.propose(interpret(helper.focus.id))
  let next: any = runtime.modelContext()
  if (next.focus.stage === "link") {
    await runtime.propose({ schemaVersion: "authorization-focused-update/v1", focusId: next.focus.id, kind: "link", links: next.links.map((l: any) => ({ caller: l.caller, call: l.call, target: l.targets[0].handle })) })
    next = runtime.modelContext()
  }
  expect(next.focus.stage).toBe("review")
  await runtime.propose({ schemaVersion: "authorization-focused-update/v1", focusId: next.focus.id, kind: "defer", reason: "Revise the helper summary", revisit: helper.focus.handle })
  const revisited: any = runtime.modelContext()
  expect(revisited.focus.stage).toBe("interpret")
  expect(revisited.focus.source).toEqual(helper.focus.source)
  expect(revisited.tasks).toHaveLength(1)
})
test("focused interpret schemas omit host metadata and advertise only the current narrow phase", () => {
  const model: any = inquiryStepSchemas("focused-closure-v1" as any, false, "behavior", "interpret" as any).modelSchema
  const schema = JSON.stringify(zodToJsonSchema(model))
  expect(schema).not.toContain("authorization-control-slice/v1")
  expect(schema).toContain("authorization-focused-update/v1")
  expect(schema).not.toContain("repairsDraftId")
  expect(JSON.stringify(inquiryNativeDefinitions("focused-closure-v1" as any, "behavior", "interpret" as any))).toContain("focusId")
})
test("ambiguous entries keep real candidates addressable during the locate phase", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "at-locate-"))
  await writeFile(path.join(sourceRoot, "a.ts"), "export function entry() { return true; }\n")
  await writeFile(path.join(sourceRoot, "b.ts"), "export function entry() { return false; }\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["."] })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect entry", entryHint: "entry", premises: [] }] })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "focused-closure-v1" })
  await runtime.sync()
  const location: any = runtime.modelContext()
  expect(location.focus.stage).toBe("locate")
  expect(location.locationTasks[0]?.candidates).toHaveLength(2)
  await runtime.propose({ schemaVersion: "authorization-focused-update/v1", focusId: location.focus.id, kind: "select", candidateId: location.locationTasks[0].candidates[0].id })
  expect((runtime.modelContext() as any).focus.stage).toBe("interpret")
})
test("correcting a mistaken entry source replaces its accepted unit instead of adding another entry", async () => {
  const { runtime, tools } = await setup(1)
  const first: any = runtime.modelContext()
  await runtime.propose(interpret(first.focus.id))
  const next: any = runtime.modelContext()
  await tools.execute("source_symbol", { name: "gate", path: "helper.ts" })
  const candidate = tools.locateSymbols("gate")[0]!
  await runtime.propose({ schemaVersion: "authorization-semantic-update/v1", workSelections: [{ questionId: first.focus.questionId, itemId: first.focus.itemId, candidateId: candidate.id }] })
  await runtime.propose({ schemaVersion: "authorization-focused-update/v1", focusId: next.focus.id, kind: "defer", reason: "Correct the selected source" })
  const corrected: any = runtime.modelContext()
  await runtime.propose(interpret(corrected.focus.id))
  expect(runtime.report().semantic?.units.filter(u => u.role === "entry")).toHaveLength(1)
  expect(runtime.report().semantic?.units[0]?.source?.path).toBe("helper.ts")
})
test("public inquiry loop advances the advertised phase and derives its final result from that focus", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "at-loop-"))
  await writeFile(path.join(sourceRoot, "entry.ts"), "export function entry() { return true; }\n")
  let calls = 0
  const run = await runAuthorizationInquiry({ sourceRoot, allowedPaths: ["."], repository: "neutral", sourceRef: "fixed", method: "D1", strategy: "focused-closure-v1", maxDispatches: 8, inquiry: { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect entry", entryHint: "entry", premises: [] }] }, provider: { name: "mock", async complete(params) {
    calls++
    const text = params.messages.map(m => m.content).join("\n"), match = /Current local explanation context: (.*)\n\nRemaining dispatches:/.exec(text)
    const context: any = match ? JSON.parse(match[1]!) : {}
    expect(context.focus).toBeDefined()
    const value = context.focus.stage === "interpret" ? { kind: "control", controlDelta: interpret(context.focus.id) } : { kind: "final", result: { schemaVersion: "authorization-focused-result/v1", focusId: context.focus.id, answers: [{ explanation: "The shown entry permits return without a protected mutation" }], scope: "Current original entry" } }
    return { text: "", toolCalls: [{ id: `c${calls}`, name: params.tools![0]!.name, arguments: value }], stopReason: "tool_use", tokens: emptyTokenUsage(), durationMs: 0 }
  }, async completeWithToolResults() { throw new Error("Unexpected native continuation") } } })
  expect(run.validation?.valid).toBe(true)
  expect(run.status).toBe("completed")
  expect(calls).toBe(2)
  expect(run.domain?.semantic?.units).toHaveLength(1)
})
test("native dispatch advertises the same narrow phase and supplies checked source answer to prose delivery", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "at-native-"))
  await writeFile(path.join(root, "entry.ts"), "export function entry() { return true; }\n")
  const inputFile = path.join(root, "input.json")
  await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "one", repository: "neutral", sourceRef: "fixed", sourceRoot: ".", allowedPaths: ["entry.ts"], inquiry: { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect entry", entryHint: "entry", premises: [] }] } }))
  const runtime = await createNativeInquiryRuntime({ inputFile, workDir: root, domainTools: true, strategy: "focused-closure-v1", maxProviderCalls: 8 })
  const params: any = { messages: [{ role: "user", content: "Original skill task" }] }
  await runtime.beforeDispatch(params)
  const context = () => JSON.parse(params.messages.find((m: any) => m.content.startsWith("Current local explanation context: ")).content.slice("Current local explanation context: ".length))
  expect(context().focus.stage).toBe("interpret")
  expect(JSON.stringify(params.tools.find((t: any) => t.name === "authorization_observe"))).not.toContain('"const":"link"')
  expect((await runtime.execute({ id: "interpret", name: "authorization_observe", arguments: { controlDelta: interpret(context().focus.id) } })).exitCode).toBe(0)
  await runtime.beforeDispatch(params)
  expect(context().focus.stage).toBe("answer")
  const checked = await runtime.execute({ id: "answer", name: "authorization_check_result", arguments: { result: { schemaVersion: "authorization-focused-result/v1", focusId: context().focus.id, answers: [{ explanation: "Current source permits return without a protected mutation" }], scope: "Current original entry" } } })
  expect(JSON.parse(checked.output).valid).toBe(true)
  await runtime.beforeDispatch(params)
  expect(params.tools).toEqual([])
  expect(params.messages.some((m: any) => m.content.includes("Current source permits return without a protected mutation"))).toBe(true)
})
