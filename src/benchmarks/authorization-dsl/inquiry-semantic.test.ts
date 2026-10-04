import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
import { createInquiryTools } from "./inquiry-tools.ts"
import { createInquiryDomainRuntime } from "./inquiry-domain-runtime.ts"
import { inquiryStepSchemas, inquiryNativeDefinitions, inquiryNativeSchemas } from "./inquiry-wire.ts"
import { runAuthorizationInquiry } from "./inquiry-run.ts"
import { createNativeInquiryRuntime } from "./inquiry-native.ts"
import { planInquiryReuse } from "./inquiry-reuse.ts"
import { emptyTokenUsage } from "../../core/types.ts"
async function fixture() {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "as-semantic-"))
  await writeFile(path.join(sourceRoot, "entry.ts"), "export function entry() { return false; }\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["entry.ts"] })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: ["q", "other"].map(id => ({ id, request: "Can entry proceed?", entryHint: "entry", premises: [] })) })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "semantic-flow-v1" })
  await runtime.sync()
  const context = runtime.modelContext()
  const u = (questionId: string, extra = {}) => ({ itemId: context.tasks.find(t => t.question.id === questionId)!.itemId, handle: "entry", op: "add", role: "entry", start: "main", complete: true, blocks: [{ name: "main", steps: [{ kind: "reject", name: "stop", claim: "Source terminates" }] }], ...extra })
  return { runtime, context, u, tools, sourceRoot, program }
}
const supplement = (revision: number, extra = {}) => ({ schemaVersion: "authorization-semantic-result/v1", revision, questions: [{ questionId: "q", explanation: "The shown source rejects the request.", ...extra }, { questionId: "other", explanation: "Other source rejects." }], scope: "local" })
test("both public wire schemas expose the same source-local semantic contract", () => {
  const wire = inquiryStepSchemas("semantic-flow-v1").modelSchema as any
  expect(wire.options.find((s: any) => s.shape.kind.value === "control").shape.controlDelta.shape.semanticBlocks).toBeDefined()
  const native = inquiryNativeSchemas("semantic-flow-v1") as any
  expect(native.authorization_observe.shape.controlDelta.unwrap().shape.semanticBlocks).toBeDefined()
  expect(JSON.stringify(inquiryNativeDefinitions("semantic-flow-v1"))).toContain("authorization-semantic-result/v1")
})
test("bad semantic sibling cannot discard another question; raw failure and accepted blocks are retained", async () => {
  const { runtime, u } = await fixture()
  const proposed: any = await runtime.propose({ schemaVersion: "authorization-semantic-update/v1", semanticBlocks: [u("q"), u("other", { unexpected: true })] })
  expect(proposed.diagnostics.map((d: any) => d.code)).toContain("semantic-block-schema")
  expect(runtime.report().slice.rules.some(r => r.questionId === "q" && r.kind === "reject")).toBe(true)
  expect((runtime.report() as any).semantic.units).toHaveLength(1)
  expect(runtime.report().proposals[0]!.delta).toMatchObject({ semanticBlocks: expect.any(Array) })
})
test("current accepted rejection supplies result branches and diagnoses renamed unknown and stale final", async () => {
  const { runtime, u } = await fixture()
  await runtime.propose({ schemaVersion: "authorization-semantic-update/v1", semanticBlocks: [u("q"), u("other")] })
  const revision = runtime.feedback().revision
  expect(typeof (runtime as any).assembleResult).toBe("function")
  const assembled: any = (runtime as any).assembleResult(supplement(revision, { disposition: "unknown" }))
  expect(assembled.result.questions[0].behavior.disposition).toBe("deny")
  expect(assembled.diagnostics.map((d: any) => d.code)).toContain("semantic-disposition-conflict")
  expect(assembled.result.questions[0].branches[0].id).toBe(runtime.feedback().paths[0]!.pathKey)
  const checked = await runtime.validate(assembled.result)
  expect(checked.ruleConsistency).toBe(false)
  const current = (runtime as any).assembleResult(supplement(revision))
  expect((await runtime.validate(current.result)).ruleConsistency).toBe(true)
  runtime.modelContext()
  await runtime.propose({ schemaVersion: "authorization-semantic-update/v1", semanticBlocks: [u("q", { op: "replace", blocks: [{ name: "main", steps: [{ kind: "return", name: "ok", claim: "Corrected source interpretation", outcome: "allow", value: true }] }] })] })
  expect(runtime.report().check).toBeUndefined()
  expect((runtime as any).assembleResult(supplement(revision)).diagnostics.map((d: any) => d.code)).toContain("semantic-result-stale")
})
test("effect assertion cannot turn a successful no-op return into a protected write", async () => {
  const { runtime, u } = await fixture()
  await runtime.propose({ schemaVersion: "authorization-semantic-update/v1", semanticBlocks: [u("q", { blocks: [{ name: "main", steps: [{ kind: "return", name: "ok", claim: "Success no mutation", outcome: "allow", value: true }] }] }), u("other")] })
  const pathId = runtime.feedback().paths.find(p => p.questionId === "q")!.pathKey
  const assembled: any = (runtime as any).assembleResult(supplement(runtime.feedback().revision, { paths: [{ pathId, explanation: "It performs the mutation", protectedEffect: "performed" }] }))
  expect(assembled.diagnostics.map((d: any) => d.code)).toContain("semantic-effect-conflict")
  expect(assembled.paths.find((p: any) => p.questionId === "q").protectedEffect).toBe("none")
})
test("requested counterfactual cites the retained excluded source without reviving it as a current branch", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "as-counterfactual-"))
  await writeFile(path.join(sourceRoot, "entry.ts"), "export function entry(flag: boolean) { if (flag) return false; return true; }\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["entry.ts"] })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect entry and explain the false-flag counterfactual.", entryHint: "entry", premises: [{ text: "Flag is true.", origin: "user" }] }] })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "semantic-flow-v1" })
  await runtime.sync(); const offered = runtime.modelContext().tasks[0]!
  await runtime.propose({ schemaVersion: "authorization-semantic-update/v1", premiseValues: [{ op: "add", questionId: "q", targetKey: "flag", status: "known", value: true, text: "Flag is true." }], semanticBlocks: [{ itemId: offered.itemId, handle: "entry", op: "add", role: "entry", start: "main", complete: true, blocks: [
    { name: "main", steps: [{ kind: "choose", name: "flag-choice", claim: "Explicit flag branch", cases: [{ condition: { op: "eq", left: { binding: "flag" }, right: { literal: true } }, body: "deny" }], otherwise: "allow" }] },
    { name: "deny", steps: [{ kind: "return", name: "false", claim: "Rejects when flag is true", value: false, outcome: "deny" }] },
    { name: "allow", steps: [{ kind: "return", name: "true", claim: "Permits otherwise", value: true, outcome: "allow" }] },
  ] }] })
  const excluded = runtime.feedback().paths.find(p => p.state === "inapplicable")!
  const assembled = runtime.assembleResult({ schemaVersion: "authorization-semantic-result/v1", revision: runtime.feedback().revision, questions: [{ questionId: "q", explanation: "The current flag rejects.", counterfactuals: [{ pathId: excluded.pathKey, explanation: "The false flag would permit." }] }], scope: "local" })
  const question = (assembled.result as any).questions[0]
  expect(question.behavior.disposition).toBe("deny")
  expect(question.branches.some((p: any) => p.id === excluded.pathKey)).toBe(false)
  expect(question.behavior.explanation).toContain(offered.evidenceIds[0]!)
  expect(question.evidenceIds).toContain(offered.evidenceIds[0]!)
})
async function semanticRun() {
  const { sourceRoot, program } = await fixture(), inquiry = { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: program.questions }
  let calls = 0
  const run = await runAuthorizationInquiry({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["entry.ts"], inquiry, method: "M", strategy: "semantic-flow-v1", provider: { name: "mock", async complete(p) {
    const prompt = p.messages[0]!.content, context = JSON.parse(prompt.split("Current local explanation context: ")[1]!.split("\n\nRemaining dispatches:")[0]!)
    const state = JSON.parse(prompt.split("\nDomain execution state: ")[1]!.split("\n\nCurrent local explanation context:")[0]!)
    const value = calls++ === 0 ? { kind: "control", controlDelta: { schemaVersion: "authorization-semantic-update/v1", semanticBlocks: context.tasks.map((t: any) => ({ itemId: t.itemId, handle: "entry", op: "add", role: "entry", start: "main", complete: true, blocks: [{ name: "main", steps: [{ kind: "reject", name: "stop", claim: "Source rejection" }] }] })) } } : { kind: "final", result: supplement(state.revision) }
    return { text: "", toolCalls: [{ id: "mock", name: p.tools![0]!.name, arguments: value }], tokens: emptyTokenUsage(), durationMs: 0, stopReason: "tool_use" as const }
  }, async completeWithToolResults() { throw new Error("Unused") } } })
  return { run, inquiry, sourceRoot, calls }
}
test("ordinary inquiry uses semantic source work and current assembly within existing calls", async () => {
  const { run, calls } = await semanticRun()
  expect(run.status).toBe("completed")
  expect(calls).toBe(2)
  expect(run.result!.questions.map(q => q.behavior.disposition)).toEqual(["deny", "deny"])
  expect(run.domain!.semantic!.assemblies).toHaveLength(1)
})
test("native original-skill tools share host compilation, semantic source work and assembly", async () => {
  const { sourceRoot, program } = await fixture(), inputFile = path.join(sourceRoot, "scope.json")
  await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "test", sourceRoot: ".", repository: "neutral", sourceRef: "fixed", allowedPaths: ["entry.ts"], inquiry: { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: program.questions } }))
  const native = await createNativeInquiryRuntime({ inputFile, workDir: sourceRoot, domainTools: true, strategy: "semantic-flow-v1", skillContent: "Original skill responsibilities" })
  expect(native.report().compilationOrigin).toBe("host-input")
  const params: any = { messages: [{ role: "user", content: "Inspect original source" }] }
  await native.beforeDispatch(params)
  const context = JSON.parse(params.messages.find((m: any) => m.content.startsWith("Current local explanation context: ")).content.slice("Current local explanation context: ".length))
  const semanticBlocks = context.tasks.map((t: any) => ({ itemId: t.itemId, handle: "entry", op: "add", role: "entry", start: "main", complete: true, blocks: [{ name: "main", steps: [{ kind: "reject", name: "stop", claim: "Source rejection" }] }] }))
  expect((await native.execute({ id: "observe", name: "authorization_observe", arguments: { controlDelta: { schemaVersion: "authorization-semantic-update/v1", semanticBlocks } } })).exitCode).toBe(0)
  await native.beforeDispatch(params)
  const state = JSON.parse(params.messages.find((m: any) => m.content.startsWith("Current local explanation context: ")).content.slice("Current local explanation context: ".length)).state
  const checked = await native.execute({ id: "check", name: "authorization_check_result", arguments: { result: supplement(state.revision) } })
  expect(JSON.parse(checked.output).valid).toBe(true)
  expect((native.report().result as any).questions[0].behavior.disposition).toBe("deny")
  expect(native.report().domain!.semantic!.assemblies).toHaveLength(1)
  native.close()
})
test("same-strategy previous retains source semantic units but never answers; source change still blocks before dispatch", async () => {
  const { run, inquiry } = await semanticRun()
  expect(run.status).toBe("completed")
  const input: any = { schemaVersion: "authorization-inquiry-input/v1", taskId: "test", sourceRoot: ".", repository: "neutral", sourceRef: "fixed", allowedPaths: ["entry.ts"], inquiry }
  const currentInput = structuredClone(input); currentInput.inquiry.questions[0].premises.push({ text: "Flag is true.", origin: "user" })
  const args: any = { currentInput, previousInput: input, previousRun: run, previousSessionId: "old", currentFiles: run.sourceFiles, currentMethod: "M", previousMethod: "M", currentStrategy: "semantic-flow-v1", previousStrategy: "semantic-flow-v1", currentModel: "mock", previousModel: "mock" }
  const reuse = planInquiryReuse(args)
  expect(reuse.status).toBe("reusable")
  expect(reuse.seed!.semanticUnits).toHaveLength(2)
  expect(JSON.stringify(reuse.seed)).not.toContain("The shown source rejects the request.")
  expect(planInquiryReuse({ ...args, previousStrategy: "guided-evidence-v2" }).status).toBe("needs-fresh-analysis")
  expect(planInquiryReuse({ ...args, currentFiles: run.sourceFiles.map(f => ({ ...f, sha256: "changed" })) }).status).toBe("needs-fresh-analysis")
})
test("a newly interpreted helper replaces its residual dependency rather than leaving an obsolete open queue entry", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "as-helper-"))
  await writeFile(path.join(sourceRoot, "entry.ts"), "export function entry() { return gate(); }\n")
  await writeFile(path.join(sourceRoot, "helper.ts"), "export function gate() { return true; }\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["."] })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect entry", entryHint: "entry", premises: [] }] })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "semantic-flow-v1" })
  await runtime.sync(); const offered = runtime.modelContext().tasks[0]!
  await runtime.propose({ schemaVersion: "authorization-semantic-update/v1", semanticBlocks: [{ itemId: offered.itemId, handle: "entry", op: "add", role: "entry", start: "main", complete: true, fallthrough: "allow", blocks: [{ name: "main", steps: [{ kind: "call", name: "gate", symbol: "gate", callee: "gate", claim: "Relevant call" }] }] }] })
  const task = runtime.modelContext().tasks.find(t => t.duty.symbol === "gate")!
  expect(task).toBeDefined()
  await runtime.propose({ schemaVersion: "authorization-semantic-update/v1", semanticBlocks: [{ itemId: task.itemId, handle: "gate", op: "add", role: "helper", start: "main", complete: true, blocks: [{ name: "main", steps: [{ kind: "return", name: "ok", value: true, claim: "Returns success" }] }] }] })
  expect(runtime.report().dependencies).toEqual([])
  expect(runtime.report().slice.dependencies).toEqual([])
  const result = runtime.assembleResult({ schemaVersion: "authorization-semantic-result/v1", revision: runtime.feedback().revision, questions: [{ questionId: "q", explanation: "Shown source returns success without a protected effect" }], scope: "local" })
  expect((await runtime.validate(result.result)).ruleConsistency).toBe(true)
})
test("retiring an interpreted dependency removes its lexical descendants and retains actual reads", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "as-helper-descendants-"))
  await writeFile(path.join(sourceRoot, "entry.ts"), 'import * as helper from "./helper";\nexport function entry() { return helper["gate"](); }\n')
  await writeFile(path.join(sourceRoot, "helper.ts"), "export function gate() { note(); return true; }\n")
  await writeFile(path.join(sourceRoot, "note.ts"), "export function note() { return 0; }\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["."] })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect entry", entryHint: "entry", premises: [] }] })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "semantic-flow-v1" })
  await runtime.sync(); const offered = runtime.modelContext().tasks[0]!
  await runtime.propose({ schemaVersion: "authorization-semantic-update/v1", semanticBlocks: [{ itemId: offered.itemId, handle: "entry", op: "add", role: "entry", start: "main", complete: true, fallthrough: "allow", blocks: [{ name: "main", steps: [{ kind: "call", name: "gate", symbol: "gate", callee: "gate", claim: "Helper property call" }] }] }] })
  const helper = runtime.modelContext().tasks.find(t => t.duty.symbol === "gate")!
  const child = runtime.report().worklist!.items.find(item => item.symbol === "note")!
  expect(child.parentId).toBe(helper.itemId)
  const reads = [...tools.history]
  await runtime.propose({ schemaVersion: "authorization-semantic-update/v1", semanticBlocks: [{ itemId: helper.itemId, handle: "gate", op: "add", role: "helper", start: "main", complete: true, blocks: [{ name: "main", steps: [{ kind: "return", name: "ok", value: true, claim: "Returns success" }] }] }] })
  const report = runtime.report()
  expect(report.dependencies).toEqual([])
  expect(report.worklist!.items.some(item => item.id === helper.itemId || item.id === child.id)).toBe(false)
  expect(report.worklist!.items.every(item => !item.parentId || report.worklist!.items.some(parent => parent.id === item.parentId))).toBe(true)
  expect(tools.history).toEqual(reads)
})
