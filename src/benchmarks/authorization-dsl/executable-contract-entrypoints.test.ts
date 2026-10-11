import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { runAuthorizationInquiryCli } from "../../cli/authorization-inquiry.ts"
import { createNativeInquiryRuntime } from "./inquiry-native.ts"
import { checkAuthorizationInquiry, executeLocalInquiryRun, inspectLocalInquiry, compareLocalInquiry } from "./inquiry-local.ts"
const source = "def local(actor, target):\n    return perform(actor, target)\n\ndef perform(who, item):\n    if not who.allowed:\n        return False\n    item.sent = True\n    return item\n"
const at = (startLine: number, endLine = startLine, text?: string) => ({ path: "app.py", startLine, endLine, ...(text ? { text } : {}) })
export async function contractFiles() {
  const root = await mkdtemp(path.join(os.tmpdir(), "bf-contract-entry-")); await mkdir(path.join(root, "source")); await writeFile(path.join(root, "source/app.py"), source)
  const inquiry = { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect local: Authorization before the target write", premises: [], properties: [{ id: "auth", kind: "authorization-before-effect", requirement: "Authorization before the target write" }] }, { id: "other", request: "Retain the other original duty", premises: [] }] }
  const contract = { schemaVersion: "authorization-executable-contract/v1", id: "authored-local", scope: { kind: "function-contract", questionId: "q", root: at(1, 2), upstream: ["Request authentication is outside this local contract"] }, sourceDeclarations: [
    { schemaVersion: "authorization-question-declaration/v1", source: at(1, 2), statements: [{ kind: "object", expression: "actor", as: "principal", because: "Actual formal" }, { kind: "object", expression: "target", as: "resource", because: "Actual formal" }, { kind: "dependency", at: at(2, 2, "perform(actor, target)"), because: "Actual call" }, { kind: "statement", at: at(2, 2, "return perform(actor, target)"), because: "Actual return" }] },
    { schemaVersion: "authorization-question-declaration/v1", source: at(4, 8), statements: [{ kind: "object", expression: "who", as: "principal", because: "Actual formal" }, { kind: "object", expression: "item", as: "resource", because: "Actual formal" }, { kind: "condition", at: at(5, 5, "not who.allowed"), test: { op: "not", arg: { op: "truthy", language: "python", value: { binding: "who.allowed" } } }, authorizes: { principal: "who", resource: "item", when: "false" }, because: "Source control before write" }, { kind: "statement", at: at(6), because: "Refusal return" }, { kind: "effect", at: at(7), principal: "who", resource: "item", because: "Actual write" }, { kind: "statement", at: at(8), because: "Object return" }] },
  ], queries: [{ property: "auth", effect: at(7, 7, "item.sent = True"), guard: at(5, 5, "not who.allowed") }], assumptions: [] }
  const inputFile = path.join(root, "input.json"), domainProgramFile = path.join(root, "program.json")
  await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "anonymous", repository: "anonymous", sourceRef: "r", sourceRoot: "source", allowedPaths: ["app.py"], inquiry }))
  await writeFile(domainProgramFile, JSON.stringify(contract)); return { root, inputFile, domainProgramFile, contract }
}
test("ordinary check imports a source contract with zero model calls and real read accounting", async () => {
  const f = await contractFiles(), output: string[] = []
  const code = await runAuthorizationInquiryCli(["check", `--input=${f.inputFile}`, "--strategy=question-checked-v1", `--domain-program=${f.domainProgramFile}`], { stdout: (text: string) => output.push(text), stderr: () => {} })
  expect(code).toBe(0)
  const checked = JSON.parse(output[0]!)
  expect(checked.providerCalls).toBe(0)
  expect(checked.executableContract.evaluation.questions.find((q: any) => q.questionId === "q").properties[0].status).toBe("checked")
  expect(checked.executableContract.materialUses.some((u: any) => u.kind === "call")).toBe(true)
  expect(checked.sourceAccounting.toolCalls).toBeGreaterThan(0)
  expect(checked.executableContract.sourceMaterials.materials.every((m: any) => m.interpretationSource === "authored-file")).toBe(true)
})

test("ordinary file and native entrypoints recompute explicit inputs after moving the package", async () => {
  const f = await contractFiles(), base = JSON.parse(await readFile(f.inputFile, "utf8"))
  base.inquiry.questions[0].request = "Inspect local: Reachability of the target write"
  base.inquiry.questions[0].properties[0] = { id: "auth", kind: "effect-reachability", requirement: "Reachability of the target write" }
  const moved = await mkdtemp(path.join(os.tmpdir(), "bf-contract-moved-"))
  await mkdir(path.join(moved, "source")); await writeFile(path.join(moved, "source/app.py"), source)
  const inputFile = path.join(moved, "input.json"), domainProgramFile = path.join(moved, "program.json")
  await writeFile(domainProgramFile, JSON.stringify(f.contract))
  for (const [value, expected] of [[true, "conditional"], [false, "unreachable"], [undefined, "conditional"]] as const) {
    const contractInputs = value === undefined ? undefined : { q: { actor: { allowed: value } } }
    await writeFile(inputFile, JSON.stringify({ ...base, contractInputs }))
    const checked: any = await checkAuthorizationInquiry(inputFile, "D1", "question-checked-v1", domainProgramFile)
    expect(checked.status, JSON.stringify(checked.diagnostics)).toBe("valid")
    expect(checked.providerCalls).toBe(0)
    expect(checked.executableContract.evaluation.questions[0].properties[0].value).toBe(expected)
    const native = await createNativeInquiryRuntime({ inputFile, workDir: moved, domainTools: true, strategy: "question-checked-v1", method: "D1", domainProgramFile })
    try {
      const report = native.report().domain?.executableContract
      expect(report?.conditions).toEqual(contractInputs?.q ?? {})
      expect(report?.evaluation?.questions[0]?.properties[0]?.value).toBe(expected)
      expect(report?.requestOperationCertified).toBe(false)
    } finally { await native.close() }
  }
  await writeFile(inputFile, JSON.stringify({ ...base, contractInputs: { q: { "$guard": true } } }))
  const invalid: any = await checkAuthorizationInquiry(inputFile, "D1", "question-checked-v1", domainProgramFile)
  expect(invalid.diagnostics.some((d: any) => d.code === "contract-input-parameter")).toBe(true)
})
test("ordinary native file import and model declaration adopt the same contract core", async () => {
  const f = await contractFiles()
  const imported = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "question-checked-v1", method: "D1", domainProgramFile: f.domainProgramFile } as any)
  try {
    const context: any = await imported.accountContext(false)
    expect(context.executableContract.program.id).toBe(f.contract.id)
    const property = imported.report().domain?.executableContract?.evaluation?.questions.find((q: any) => q.questionId === "q")?.properties[0]
    expect(property?.status, JSON.stringify({ gaps: property?.gaps, projection: imported.report().domain?.materialProjection, units: imported.report().domain?.semantic?.units.map(u => ({ questionId: u.questionId, role: u.role, handle: u.handle })), rules: imported.report().domain?.slice.rules.map(r => ({ kind: r.kind, origin: r.sourceOrigin })) })).toBe("checked")
    expect(imported.report().program?.questions.map(q => q.id)).toEqual(["q", "other"])
  } finally { await imported.close() }
  // No authored file is loaded in the model path. It must read original source.
  const model = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "question-checked-v1", method: "D1" })
  try {
    const prepared = await model.execute({ id: "prepare", name: "authorization_prepare_properties", arguments: { schemaVersion: "authorization-property-intent/v1", questions: [{ questionId: "other", state: "residual", reason: "No narrow query was requested" }] } })
    expect(prepared.exitCode).toBe(0)
    const read = await model.execute({ id: "read", name: "source_read", arguments: { path: "app.py", startLine: 1, endLine: 8 } })
    model.accountSent(JSON.stringify({ toolResult: JSON.parse(read.output), currentContext: await model.accountContext(false) }))
    const declared = await model.execute({ id: "declare", name: "authorization_declare", arguments: f.contract })
    expect(JSON.parse(declared.output).controlDiagnostics).toEqual([])
    expect(model.report().domain?.executableContract?.evaluation?.questions.find((q: any) => q.questionId === "q")?.properties[0]?.status).toBe("checked")
  } finally { await model.close() }
})

test("a rejected declaration for another original question preserves the local contract property", async () => {
  const f = await contractFiles()
  const runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "question-checked-v1", method: "D1", domainProgramFile: f.domainProgramFile })
  try {
    const rejected = JSON.parse((await runtime.execute({ id: "unowned-other", name: "authorization_declare", arguments: { schemaVersion: "authorization-question-declaration/v1", questionId: "other", source: at(1, 8), statements: [{ kind: "object", expression: "actor", as: "principal", because: "This broad window has no current owner" }] } })).output)
    await runtime.execute({ id: "check-current", name: "authorization_check_properties", arguments: {} })
    expect(runtime.report().domain?.propertyAnalysis?.checks?.questions.find(q => q.questionId === "q")?.properties[0]?.status).toBe("checked")
    expect(rejected.controlDiagnostics).toContainEqual(expect.objectContaining({ code: "question-source-unread-or-unowned", questionId: "other" }))
    expect(runtime.report().domain?.semantic?.units).toHaveLength(2)
    expect(runtime.report().domain?.delivery?.gaps.some(g => g.questionId === "other" && g.code === "question-source-unread-or-unowned")).toBe(true)
  } finally { await runtime.close() }
})

function contractConsumer(onCheck = (reply: any) => {
  expect(reply.toolResult.executableContract.program.id).toBe("authored-local")
  expect(reply.toolResult.propertyChecks.questions.find((q: any) => q.questionId === "q").properties[0].status).toBe("checked")
}) {
  let receive = (_message: any) => {}
  return () => ({ isolation: { kind: "test-transport" as const, reason: "Anonymous finite contract consumer" }, onMessage(f: any) { receive = f }, onExit() {}, close() {}, send(message: any) {
    if (message.method === "initialize") receive({ id: message.id, result: {} })
    if (message.method === "thread/start") receive({ id: message.id, result: { thread: { id: "thread" }, model: "gpt-5.6-sol" } })
    if (message.method === "turn/start") {
      receive({ id: message.id, result: { turn: { id: "turn" } } })
      queueMicrotask(() => receive({ id: "rpc-check", method: "item/tool/call", params: { threadId: "thread", turnId: "turn", callId: "check", tool: "authorization_check_properties", arguments: {} } }))
    }
    if (message.result?.contentItems) {
      const reply = JSON.parse(message.result.contentItems[0].text)
      onCheck(reply)
      receive({ method: "turn/completed", params: { threadId: "thread", turn: { id: "turn", status: "completed", items: [{ type: "agentMessage", phase: "final_answer", text: "The local authorization guard controls the target write. The other original duty remains unresolved." }] } } })
    }
  } })
}

test("ordinary run archives exact program bytes and previous restores only the current source contract", async () => {
  const f = await contractFiles(), original = await readFile(f.domainProgramFile, "utf8"), outDir = path.join(f.root, "sessions-out")
  const first: any = await executeLocalInquiryRun({ inputFile: f.inputFile, domainProgramFile: f.domainProgramFile, outDir, model: "gpt-5.6-sol", method: "D1", strategy: "question-checked-v1", harness: "codex-account", accountTransportFactory: contractConsumer(), execution: { sessionTimeoutMs: 5000 } } as any)
  expect(first.status).toBe("completed")
  expect(first.domainProgram.sha256).toHaveLength(64)
  expect(await readFile(path.join(first.sessionPath, "domain-program.json"), "utf8")).toBe(original)
  expect((await inspectLocalInquiry(first.sessionPath)).domain.executableContract.evaluation.questions[0].properties[0].status).toBe("checked")
  await writeFile(f.domainProgramFile, "changed external file")
  expect((await inspectLocalInquiry(first.sessionPath)).domainProgram).toEqual(first.domainProgram)
  const next: any = await executeLocalInquiryRun({ inputFile: f.inputFile, previous: first.sessionPath, outDir, model: "gpt-5.6-sol", method: "D1", strategy: "question-checked-v1", harness: "codex-account", accountTransportFactory: contractConsumer(), execution: { sessionTimeoutMs: 5000 } })
  expect(next.status).toBe("completed")
  expect(next.domainProgram.origin).toBe("previous-program")
  expect(next.domain.executableContract.evaluation).toBeDefined()
  expect(next.reuse.answerReused).toBe(false)
  expect(next.reuse.materialsUsed).toBeGreaterThan(0)
  await writeFile(path.join(first.sessionPath, "domain-program.json"), "tampered archive")
  await expect(inspectLocalInquiry(first.sessionPath)).rejects.toThrow("program archive changed")
})

test("previous with an edited program excludes its omitted helper meanings", async () => {
  const f = await contractFiles(), outDir = path.join(f.root, "edited-program-out")
  const common = { inputFile: f.inputFile, outDir, model: "gpt-5.6-sol", method: "D1" as const, strategy: "question-checked-v1" as const, harness: "codex-account" as const, execution: { sessionTimeoutMs: 5000 } }
  const first: any = await executeLocalInquiryRun({ ...common, domainProgramFile: f.domainProgramFile, accountTransportFactory: contractConsumer() })
  expect(first.status).toBe("completed")
  await writeFile(f.domainProgramFile, JSON.stringify({ ...f.contract, sourceDeclarations: [f.contract.sourceDeclarations[0]], queries: [] }))
  const compared: any = await compareLocalInquiry(f.inputFile, first.sessionPath, "question-checked-v1", f.domainProgramFile)
  expect(compared.domainProgramChanged).toBe(true)
  const checkUnknown = (reply: any) => expect(reply.toolResult.propertyChecks.questions.find((q: any) => q.questionId === "q").properties[0].status).toBe("unknown")
  const fresh: any = await executeLocalInquiryRun({ ...common, domainProgramFile: f.domainProgramFile, accountTransportFactory: contractConsumer(checkUnknown) })
  const previous: any = await executeLocalInquiryRun({ ...common, previous: first.sessionPath, domainProgramFile: f.domainProgramFile, accountTransportFactory: contractConsumer(checkUnknown) })
  expect(previous.status).toBe("completed")
  expect(previous.domain.semantic.units).toEqual(fresh.domain.semantic.units)
  expect(previous.domain.materialUses).toEqual(fresh.domain.materialUses)
  expect(previous.domain.semantic.units).toHaveLength(1)
  expect(previous.reuse.layers.R0.available).toBe(true)
  expect(previous.domain.delivery.obligations.some((d: any) => d.questionId === "other")).toBe(true)
  expect(previous.reuse.answerReused).toBe(false)
})

test("replacing a native program retires only the old program's source units", async () => {
  const f = await contractFiles()
  const runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "question-checked-v1", method: "D1", domainProgramFile: f.domainProgramFile })
  try {
    expect(runtime.report().domain?.semantic?.units).toHaveLength(2)
    const result = await runtime.execute({ id: "replace", name: "authorization_declare", arguments: { ...f.contract, sourceDeclarations: [f.contract.sourceDeclarations[0]], queries: [] } })
    expect(JSON.parse(result.output).controlDiagnostics).toEqual([])
    expect(runtime.report().domain?.semantic?.units).toHaveLength(1)
    expect(runtime.report().domain?.materialUses).toHaveLength(1)
    expect(runtime.report().domain?.sourceMaterials?.materials.filter(m => m.current)).toHaveLength(1)
    expect(runtime.report().domain?.sourceMaterials?.retired.some(m => m.reason === "domain-program-replaced")).toBe(true)
    expect(runtime.report().program?.questions.map(q => q.id)).toEqual(["q", "other"])
  } finally { await runtime.close() }
})

test("compare detects program edits and final source verification withdraws a stale contract verdict", async () => {
  const f = await contractFiles(), output: string[] = []
  const code = await runAuthorizationInquiryCli(["run", `--input=${f.inputFile}`, `--out=${path.join(f.root, "cli-out")}`, "--model=unused", "--strategy=question-checked-v1", `--domain-program=${f.domainProgramFile}`], { stdout: (text: string) => output.push(text), stderr: () => {}, providerFactory: () => { throw new Error("offline provider") } })
  expect(code).toBe(1)
  const report = JSON.parse(output[0]!)
  expect(report.domainProgram.sha256).toHaveLength(64)
  await writeFile(f.domainProgramFile, JSON.stringify({ ...f.contract, id: "edited" }))
  const compared: any = await compareLocalInquiry(f.inputFile, report.sessionPath, "question-checked-v1", f.domainProgramFile)
  expect(compared.domainProgramChanged).toBe(true)
  expect(compared.providerCalls).toBe(0)
  expect(compared.status).toBe("needs-review")
  const runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "question-checked-v1", method: "D1", domainProgramFile: f.domainProgramFile })
  await writeFile(path.join(f.root, "source/app.py"), source.replace("item.sent = True", "item.sent = False"))
  await runtime.close()
  expect(runtime.report().sourceVerification?.valid).toBe(false)
  expect(runtime.report().domain?.executableContract?.status).toBe("invalidated")
  expect(runtime.report().domain?.executableContract?.evaluation).toBeUndefined()
})

test("compare exposes condition-only recomputation on the same archived program without dispatch", async () => {
  const f = await contractFiles(), input = JSON.parse(await readFile(f.inputFile, "utf8")), output: string[] = []
  input.inquiry.questions[0].request = "Inspect local: Reachability of the target write"
  input.inquiry.questions[0].properties[0] = { id: "auth", kind: "effect-reachability", requirement: "Reachability of the target write" }
  input.contractInputs = { q: { actor: { allowed: true } } }
  await writeFile(f.inputFile, JSON.stringify(input))
  await runAuthorizationInquiryCli(["run", `--input=${f.inputFile}`, `--out=${path.join(f.root, "compare-out")}`, "--model=unused", "--strategy=question-checked-v1", `--domain-program=${f.domainProgramFile}`], { stdout: (text: string) => output.push(text), stderr: () => {}, providerFactory: () => { throw new Error("offline provider") } })
  const prior = JSON.parse(output[0]!)
  input.contractInputs.q.actor.allowed = false
  await writeFile(f.inputFile, JSON.stringify(input))
  const compared: any = await compareLocalInquiry(f.inputFile, prior.sessionPath, "question-checked-v1")
  expect(compared.contractInputsChanged).toBe(true)
  expect(compared.contractInputsOnly).toBe(true)
  expect(compared.domainProgramChanged).toBe(false)
  expect(compared.affectedComputation).toContain("function-entry-values")
  expect(compared.executableContract.evaluation.questions[0].properties[0].value).toBe("unreachable")
  expect(compared.providerCalls).toBe(0)
  expect(compared.answerReused).toBe(false)
})
