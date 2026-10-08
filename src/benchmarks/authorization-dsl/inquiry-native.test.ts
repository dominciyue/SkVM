import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile, readFile, copyFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { createNativeInquiryRuntime } from "./inquiry-native.ts"
import { AuthorizationInquirySchema } from "../../task-dsl/authorization/inquiry.ts"
test("ordinary skill receives the current declaration and independent policy from its input", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ao-native-policy-")); await mkdir(path.join(root, "source"))
  await writeFile(path.join(root, "source/entry.ts"), "export function entry() { return false; }\n")
  const inputFile = path.join(root, "input.json")
  const policy = { text: "Only the addressed document's reviewer may approve it.", origin: "user", location: "current-policy/v2" }
  const brief = "Can an ordinary member approve another member's document?"
  await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "current", repository: "synthetic", sourceRef: "fixed", sourceRoot: "source", allowedPaths: ["."], mode: "conformance", policy, brief }))
  const natural = await createNativeInquiryRuntime({ inputFile, workDir: root, domainTools: true })
  expect(natural.system).toContain(JSON.stringify({ brief, mode: "conformance", policy }))
  const inquiry = { schemaVersion: "authorization-inquiry/v1", mode: "conformance", policy, questions: [{ id: "review", request: brief, premises: [] }] }
  await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "current", repository: "synthetic", sourceRef: "fixed", sourceRoot: "source", allowedPaths: ["."], inquiry }))
  const declared = await createNativeInquiryRuntime({ inputFile, workDir: root, domainTools: false })
  expect(declared.system).toContain(JSON.stringify({ inquiry: AuthorizationInquirySchema.parse(inquiry) }))
})
test("ordinary skill runtime restricts common tools and actually executes domain checks", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ao-native-")); await mkdir(path.join(root, "source"))
  await writeFile(path.join(root, "source/entry.ts"), "export function entry() { return false; }\n")
  const input = path.join(root, "input.json")
  await writeFile(input, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "one", repository: "synthetic", sourceRef: "fixed", sourceRoot: "source", allowedPaths: ["."], brief: "Can anyone call entry?" }))
  const common = await createNativeInquiryRuntime({ inputFile: input, workDir: root, domainTools: false })
  expect(common.definitions.map(d => d.name)).not.toContain("authorization_compile")
  expect((await common.execute({ id: "no", name: "execute_command", arguments: {} })).exitCode).toBe(1)
  const traceDir = path.join(root, "trace")
  const domain = await createNativeInquiryRuntime({ inputFile: input, workDir: root, domainTools: true, traceDir })
  const inquiry = { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q1", request: "Can anyone call entry?", premises: [] }] }
  await domain.execute({ id: "compile", name: "authorization_compile", arguments: { inquiry } })
  const read = JSON.parse((await domain.execute({ id: "read", name: "source_read", arguments: { path: "entry.ts", startLine: 1, endLine: 1 } })).output)
  const result = { schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q1", behavior: { disposition: "deny", explanation: "Entry denies." }, branches: [], missing: [], evidenceIds: [read.evidence[0].id] }], observations: [], scope: "entry only" }
  const checked = JSON.parse((await domain.execute({ id: "check", name: "authorization_check_result", arguments: { result } })).output)
  expect(checked.valid).toBe(true)
  expect(checked.semanticSupport).toBe("unreviewed")
  expect(domain.report().domainCalls).toBe(2)
  expect(domain.report().result).toEqual(result)
  await domain.beforeDispatch({ messages: [{ role: "user", content: "current task" }] })
  expect(JSON.parse(await readFile(path.join(traceDir, "request-1.json"), "utf8")).params.messages[0].content).toBe("current task")
  expect((await readFile(path.join(traceDir, "tools.jsonl"), "utf8")).trim().split("\n").length).toBe(3)
  await expect(createNativeInquiryRuntime({ inputFile: input, workDir: root, domainTools: false, traceDir: path.join(root, "source/trace") })).rejects.toThrow("outside")
})

test("malformed reserved checks consume check slots without stealing exploration or losing the current answer contract", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ay-check-fields-")); await mkdir(path.join(root, "source"))
  await writeFile(path.join(root, "source/app.py"), "def entry():\n    return True\n")
  const inputFile = path.join(root, "input.json")
  await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "reserved", repository: "anonymous", sourceRef: "r", sourceRoot: "source", allowedPaths: ["."], brief: "Inspect app.entry" }))
  const runtime = await createNativeInquiryRuntime({ inputFile, workDir: root, domainTools: true, method: "M", strategy: "operation-evidence-v5", maxToolCalls: 3 })
  await runtime.accountContext()
  const call = { id: "bad-check", name: "authorization_check_result", arguments: { result: { answers: [{ summary: "Wrong field" }] } } }
  const diagnostics = [{ path: "/result/answers/0", keyword: "required", message: "explanation required", expected: { missingProperty: "explanation" } }]
  const first = JSON.parse((await runtime.rejectArguments(call, diagnostics)).output)
  expect(first.toolBudget).toMatchObject({ totalUsed: 2, checksUsed: 1, checksRemaining: 1, explorationUsed: 1, explorationRemaining: 0 })
  const context: any = await runtime.accountContext(false)
  expect(context.focus.stage).toBe("answer")
  expect(context.answerContract).toMatchObject({ focusId: context.focus.id, questionOrder: ["q1"], pathReference: "current per-question numeric path index", hostOwnedFields: ["questionId", "evidenceIds", "pathId", "conditions"] })
  expect(context.answerContract).toMatchObject({ answerDisposition: ["allow", "deny", "conditional", "unknown"], pathDisposition: ["allow", "deny", "unknown"], protectedEffect: ["none", "performed", "unresolved"], requiredPathFields: ["path", "explanation"], pathIndex: { type: "integer", minimum: 0 } })
  const second = JSON.parse((await runtime.rejectArguments({ ...call, id: "bad-check-repair" }, diagnostics)).output)
  expect(second.toolBudget).toMatchObject({ totalUsed: 3, checksUsed: 2, checksRemaining: 0, explorationUsed: 1, explorationRemaining: 0 })
  expect((await runtime.accountContext(false) as any).focus.id).toBe(context.focus.id)
  expect(runtime.report().domain!.checkHistory).toEqual([])
  await runtime.close()
})

async function budgetFixture(domainTools = true, maxToolCalls?: number) {
  const root = await mkdtemp(path.join(os.tmpdir(), "native-budget-"))
  await mkdir(path.join(root, "source"))
  await writeFile(path.join(root, "source/entry.ts"), "export function entry() { return false; }\n")
  await mkdir(path.join(root, ".skvm/skills/sample/references"), { recursive: true })
  await writeFile(path.join(root, ".skvm/skills/sample/references/guide.md"), "Use original source evidence.\n")
  const inputFile = path.join(root, "input.json")
  await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "budget", repository: "synthetic", sourceRef: "fixed", sourceRoot: "source", allowedPaths: ["."], brief: "Can anyone call entry?" }))
  const runtime = await createNativeInquiryRuntime({ inputFile, workDir: root, domainTools, maxToolCalls, skillContent: "<runtime-resource-root>.skvm/skills/sample</runtime-resource-root>" })
  let calls = 0
  const execute = async (name: string, args: Record<string, unknown> = {}) => {
    const returned = await runtime.execute({ id: `call-${++calls}`, name, arguments: args })
    return { ...returned, value: JSON.parse(returned.output) }
  }
  const inquiry = { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q1", request: "Can anyone call entry?", premises: [] }] }
  const result = (id: string) => ({ schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q1", behavior: { disposition: "deny", explanation: "Entry returns false." }, branches: [], missing: [], evidenceIds: [id] }], observations: [], scope: "entry only" })
  return { root, runtime, execute, inquiry, result }
}
test("v6 separates two malformed corrections from semantic checks inside one total budget and withdraws stale results", async () => {
  const { root } = await budgetFixture(), runtime = await createNativeInquiryRuntime({ inputFile: path.join(root, "input.json"), workDir: root, domainTools: true, method: "M", strategy: "operation-evidence-v6" as any, maxToolCalls: 8 })
  await runtime.execute({ id: "list", name: "source_list", arguments: {} })
  await runtime.accountContext()
  const call = { id: "bad", name: "authorization_check_result", arguments: {} }, diagnostics = [{ path: "/result", keyword: "required", message: "result required", expected: {} }]
  for (let n = 0; n < 3; n++) await runtime.rejectArguments({ ...call, id: `bad-${n}` }, diagnostics)
  expect(runtime.report().toolBudget).toMatchObject({ totalLimit: 8, totalUsed: 4, checksUsed: 0, checksRemaining: 2, formatRejections: 3, formatCorrectionsRemaining: 0, finalOnly: true, deliveryClosed: false })
  const context: any = await runtime.accountContext(false)
  const result = { schemaVersion: "authorization-focused-result/v1", focusId: context.focus.id, answers: [{ explanation: "Current source remains unresolved.", disposition: "unknown", paths: [], missing: [{ kind: "source-gap", detail: "Entry source interpretation remains incomplete." }] }], scope: "entry only" }
  for (let n = 0; n < 2; n++) await runtime.execute({ ...call, id: `semantic-${n}`, arguments: { result } })
  expect(runtime.report().toolBudget.checksUsed).toBe(2)
  expect(runtime.report().result).toBeDefined()
  expect(runtime.report().toolBudget.totalUsed).toBe(6)
  await runtime.rejectArguments({ ...call, id: "third" }, diagnostics)
  expect(runtime.report().result).toBeUndefined()
  expect((runtime.report().history.at(-1)!.output as any).code).toBe("delivery-closed")
  expect(runtime.report().toolBudget.totalUsed).toBeLessThanOrEqual(8)
  await runtime.close()
})
test("native source routing survives a moved directory with spaces and isolates its original workspace", async () => {
  const { root } = await budgetFixture(false), moved = path.join(await mkdtemp(path.join(os.tmpdir(), "az moved ")), "new workspace")
  await mkdir(path.join(moved, "source"), { recursive: true })
  await copyFile(path.join(root, "input.json"), path.join(moved, "input.json"))
  await copyFile(path.join(root, "source/entry.ts"), path.join(moved, "source/entry.ts"))
  const runtime = await createNativeInquiryRuntime({ inputFile: path.join(moved, "input.json"), workDir: moved, domainTools: false, maxToolCalls: 3 })
  const good = JSON.parse((await runtime.execute({ id: "current", name: "source_read", arguments: { path: "entry.ts", startLine: 1, endLine: 1 } })).output)
  expect(good.evidence[0].text).toContain("return false")
  const outside = JSON.parse((await runtime.execute({ id: "old", name: "source_read", arguments: { path: path.join(root, "source/entry.ts"), startLine: 1, endLine: 1 } })).output)
  expect(outside.evidence).toEqual([])
  expect(outside.code).toBe("source-out-of-scope")
  await runtime.close()
})
test("native output limit bounds every actual request while preserving a stricter caller limit and the old default", async () => {
  const { root } = await budgetFixture(false), base = { inputFile: path.join(root, "input.json"), workDir: root, domainTools: false }
  const runtime = await createNativeInquiryRuntime({ ...base, maxOutputTokens: 777 } as any)
  for (const maxTokens of [32768, 100, undefined]) {
    const params: any = { messages: [{ role: "user", content: "Original task" }], ...(maxTokens === undefined ? {} : { maxTokens }) }
    await runtime.beforeDispatch(params)
    expect(params.maxTokens).toBe(maxTokens === 100 ? 100 : 777)
  }
  expect(runtime.report().requests.map((r: any) => r.params.maxTokens)).toEqual([777, 100, 777])
  const legacy = await createNativeInquiryRuntime(base), params = { messages: [{ role: "user" as const, content: "Original task" }], maxTokens: 32768 }
  await legacy.beforeDispatch(params)
  expect(params.maxTokens).toBe(32768)
  for (const maxOutputTokens of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) await expect(createNativeInquiryRuntime({ ...base, maxOutputTokens } as any)).rejects.toThrow("positive safe integer")
})
test("native closing source snapshot withdraws an earlier checked result after source changes", async () => {
  const { root, runtime, execute, inquiry, result } = await budgetFixture()
  await execute("authorization_compile", { inquiry })
  const read = await execute("source_read", { path: "entry.ts", startLine: 1, endLine: 1 })
  expect((await execute("authorization_check_result", { result: result(read.value.evidence[0].id) })).value.valid).toBe(true)
  await writeFile(path.join(root, "source/entry.ts"), "export function entry() { return true; }\n")
  await runtime.close()
  expect(runtime.report().result).toBeUndefined()
  expect((runtime.report() as any).sourceVerification).toMatchObject({ valid: false, code: "source-changed" })
})

test("guided native window allocation reaches reserved prose without exhausting repeated source display", async () => {
  const { root, execute, inquiry } = await budgetFixture()
  const read = await execute("source_read", { path: "entry.ts", startLine: 1, endLine: 1 }), limit = read.value.evidence[0].bytes * 3
  const inputFile = path.join(root, "input.json"), input = JSON.parse(await readFile(inputFile, "utf8"))
  delete input.brief; input.inquiry = { ...inquiry, questions: [{ ...inquiry.questions[0], entryHint: "entry" }] }
  await writeFile(inputFile, JSON.stringify(input))
  const runtime = await createNativeInquiryRuntime({ inputFile, workDir: root, domainTools: true, strategy: "guided-evidence-v2", maxProviderCalls: 4, maxDisplayBytes: limit })
  const params: any = { messages: [{ role: "user", content: "Inspect entry" }] }
  for (let turn = 0; turn < 4; turn++) await runtime.beforeDispatch(params)
  expect(runtime.report().requests).toHaveLength(4)
  expect(runtime.report().sourceAccounting.cumulativeModelSourceBytes).toBeLessThanOrEqual(limit)
  expect(runtime.report().toolBudget.checksUsed).toBe(0)
  expect(params.tools).toEqual([])
  expect(runtime.report().requests[0]).toMatchObject({ params: { messages: expect.arrayContaining([expect.objectContaining({ content: expect.stringContaining('"reason":"source-window-budget"') })]) } })
  runtime.close()
  await expect(runtime.beforeDispatch(params)).rejects.toThrow("session-closed")
})

test("domain runtime reserves two checks inside the total 24 calls after mixed exploration reaches 22", async () => {
  const { runtime, execute, inquiry, result } = await budgetFixture()
  const compiled = await execute("authorization_compile", { inquiry })
  const read = await execute("source_read", { path: "entry.ts", startLine: 1, endLine: 1 }), id = read.value.evidence[0].id
  await execute("skill_reference_read", { path: "references/guide.md" })
  await execute("authorization_observe", { observations: [{ questionId: "q1", kind: "guard", subject: "entry", claim: "Entry returns false.", state: "observed", evidenceIds: [id] }] })
  for (let n = 0; n < 18; n++) await execute("source_list")
  const rejected = await execute("source_list")
  expect(rejected.exitCode).toBe(1)
  expect(rejected.value.code).toBe("exploration-budget")
  expect(rejected.value.toolBudget).toMatchObject({ totalUsed: 22, totalRemaining: 2, explorationRemaining: 0, checksRemaining: 2 })
  expect(compiled.value.toolBudget).toMatchObject({ totalLimit: 24, explorationLimit: 22, checkLimit: 2 })
  expect(runtime.system).toContain('"explorationLimit":22')
  for (let n = 0; n < 2; n++) expect((await execute("source_list")).exitCode).toBe(1)
  expect((await execute("authorization_observe", { observations: [] })).exitCode).toBe(1)
  const first = await execute("authorization_check_result", { result: result("not-shown") })
  expect(first.value.valid).toBe(false)
  expect(runtime.report().result).toBeUndefined()
  expect(first.value.toolBudget).toMatchObject({ totalUsed: 23, checksRemaining: 1, explorationRemaining: 0 })
  expect((await execute("source_list")).exitCode).toBe(1)
  const repaired = await execute("authorization_check_result", { result: result(id) })
  expect(repaired.value.valid).toBe(true)
  expect(runtime.report().result).toEqual(result(id))
  expect((await execute("authorization_check_result", { result: result(id) })).value.code).toBe("delivery-repair-budget")
  expect(runtime.report().toolBudget).toMatchObject({ totalUsed: 24, totalRemaining: 0, explorationUsed: 22, checksUsed: 2, checksRemaining: 0 })
  expect(runtime.report().history.filter(entry => entry.executed)).toHaveLength(24)
  expect(runtime.report().rejectedToolCalls).toBe(6)
})

test("missing compilation and two invalid checks never yield a result or allow a third repair", async () => {
  const { runtime, execute, inquiry, result } = await budgetFixture()
  expect((await execute("authorization_check_result", { result: result("not-shown") })).value.code).toBe("inquiry-not-compiled")
  expect(runtime.report().result).toBeUndefined()
  await execute("authorization_compile", { inquiry })
  const read = await execute("source_read", { path: "entry.ts", startLine: 1, endLine: 1 })
  for (let n = 0; n < 2; n++) expect((await execute("authorization_check_result", { result: result("not-shown") })).value.valid).toBe(false)
  expect((await execute("authorization_check_result", { result: result(read.value.evidence[0].id) })).value.code).toBe("delivery-repair-budget")
  expect(runtime.report().result).toBeUndefined()
  expect(runtime.report().toolBudget.checksUsed).toBe(2)
  expect(runtime.report().history.filter(entry => entry.executed)).toHaveLength(4)
})

test("a failed second check clears an earlier checked result instead of exposing stale validity", async () => {
  const { runtime, execute, inquiry, result } = await budgetFixture()
  await execute("authorization_compile", { inquiry })
  const read = await execute("source_read", { path: "entry.ts", startLine: 1, endLine: 1 })
  expect((await execute("authorization_check_result", { result: result(read.value.evidence[0].id) })).value.valid).toBe(true)
  expect((await execute("authorization_check_result", { result: result("not-shown") })).value.valid).toBe(false)
  expect(runtime.report().result).toBeUndefined()
})

test("domain tiny budgets fail explicitly while common-only tools retain their original budget", async () => {
  for (const limit of [1, 2]) await expect(budgetFixture(true, limit)).rejects.toThrow("tool-budget")
  const { runtime, execute } = await budgetFixture(false, 2)
  expect((await execute("source_list")).exitCode).toBe(0)
  expect((await execute("source_list")).exitCode).toBe(0)
  expect((await execute("source_list")).value.code).toBe("tool-budget")
  expect(runtime.report().toolBudget).toMatchObject({ totalLimit: 2, totalUsed: 2, explorationLimit: 2, checkLimit: 0 })
})

test("reserved checks still reject unshown source and isolated reference paths", async () => {
  const { runtime, execute, inquiry, result } = await budgetFixture()
  await execute("authorization_compile", { inquiry })
  const outside = await execute("source_read", { path: "../input.json", startLine: 1, endLine: 1 })
  expect(outside.value.code).toBe("source-out-of-scope")
  expect((await execute("skill_reference_read", { path: "../../input.json" })).exitCode).toBe(1)
  const checked = await execute("authorization_check_result", { result: result("not-shown") })
  expect(checked.value.valid).toBe(false)
  expect(checked.value.diagnostics.some((item: { code: string }) => item.code === "evidence-not-shown")).toBe(true)
  expect(runtime.report().result).toBeUndefined()
  expect(runtime.report().evidence).toHaveLength(0)
})

test("native domain strategy uses shared scheduler/evaluator, preserves two checks and invalidates old success on rule revision", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "aq-native-")); await mkdir(path.join(root, "source"))
  await writeFile(path.join(root, "source/entry.ts"), "export function entry() { return guard(); }\n")
  await writeFile(path.join(root, "source/helper.ts"), "export function guard() { return false; }\n")
  const inputFile = path.join(root, "input.json")
  await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "current", repository: "neutral", sourceRef: "fixed", sourceRoot: "source", allowedPaths: ["."], brief: "Can anyone call entry?" }))
  const runtime = await createNativeInquiryRuntime({ inputFile, workDir: root, domainTools: true, strategy: "domain-evidence-v1", maxToolCalls: 7 } as any)
  const invoke = async (name: string, args: any = {}) => JSON.parse((await runtime.execute({ id: name, name, arguments: args })).output)
  await invoke("authorization_compile", { inquiry: { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q1", request: "Can anyone call entry?", premises: [] }] } })
  const read = await invoke("source_read", { path: "entry.ts", startLine: 1, endLine: 1 }), ev = read.evidence[0].id
  const observed = await invoke("authorization_observe", { controlDelta: { schemaVersion: "authorization-control-slice/v1", rules: [{ key: "entry", questionId: "q1", pathKey: "p", kind: "entry", after: [], claim: "Calls guard", evidenceIds: [ev] }], dependencies: [{ key: "guard", questionId: "q1", pathKey: "p", from: "entry", symbol: "guard", kind: "control", decisive: true, evidenceIds: [ev], reason: "Decision in helper" }] } })
  expect(observed.autoReads[0].evidence[0].text).toContain("return false")
  expect(observed.toolBudget).toMatchObject({ explorationUsed: 4, checksRemaining: 2 })
  const helperId = observed.autoReads[0].evidence[0].id
  const terminal = { key: "stop", questionId: "q1", pathKey: "p", kind: "reject", after: ["entry"], complete: true, claim: "Guard returns false", evidenceIds: [helperId] }
  const result = { schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q1", behavior: { disposition: "deny", explanation: "Guard rejects" }, branches: [], evidenceIds: [helperId], missing: [] }], observations: [], scope: "local" }
  expect((await invoke("authorization_check_result", { result, controlDelta: { schemaVersion: "authorization-control-slice/v1", rules: [terminal] } })).valid).toBe(true)
  expect(runtime.report().result).toBeDefined()
  const s = (runtime.report() as any).domain.slice.rules.find((r: any) => r.key === "stop")
  await invoke("authorization_observe", { controlDelta: { schemaVersion: "authorization-control-slice/v1", rules: [{ ...terminal, kind: "effect", revisionOf: s.digest, revisionReason: "Correct old extraction" }] } })
  expect(runtime.report().result).toBeUndefined()
  expect((await invoke("authorization_check_result", { result })).valid).toBe(false)
  const checks = (runtime.report() as any).domain.checkHistory
  expect(checks).toHaveLength(2)
  expect(checks[0].slice.rules.find((r: any) => r.key === "stop").kind).toBe("reject")
  expect(checks[1].slice.rules.find((r: any) => r.key === "stop").kind).toBe("effect")
  expect(checks[0].check.ruleConsistency).toBe(true)
  expect(checks[1].check.ruleConsistency).toBe(false)
  expect(runtime.report().toolBudget).toMatchObject({ totalUsed: 7, explorationUsed: 5, checksUsed: 2 })
  await (runtime as any).close()
  expect((await invoke("source_list")).code).toBe("session-closed")
})

test("invalid strategy/native tools combinations are rejected before any dispatch", async () => {
  const { root } = await budgetFixture()
  await expect(createNativeInquiryRuntime({ inputFile: path.join(root, "input.json"), workDir: root, domainTools: false, strategy: "domain-evidence-v1" } as any)).rejects.toThrow("strategy-requires-domain-tools")
  await expect(createNativeInquiryRuntime({ inputFile: path.join(root, "input.json"), workDir: root, domainTools: true, strategy: "wrong" } as any)).rejects.toThrow("strategy")
})

test("native guided inquiry uses the same partial local updates without digest transcription", async () => {
  const { root, inquiry, result } = await budgetFixture()
  const runtime = await createNativeInquiryRuntime({ inputFile: path.join(root, "input.json"), workDir: root, domainTools: true, strategy: "guided-evidence-v2", maxToolCalls: 8 } as any)
  const invoke = async (name: string, args: any = {}) => JSON.parse((await runtime.execute({ id: name, name, arguments: args })).output)
  await invoke("authorization_compile", { inquiry })
  const read = await invoke("source_read", { path: "entry.ts", startLine: 1, endLine: 1 }), id = read.evidence[0].id
  await runtime.beforeDispatch({ messages: [{ role: "user", content: "Can anyone call entry?" }] })
  const item = (targetKey: string, extra = {}) => ({ op: "add", questionId: "q1", targetKey, pathKey: "p", kind: "entry", after: [], evidenceIds: [id], claim: "Entry", ...extra })
  const first = await invoke("authorization_check_result", { result: result(id), controlDelta: { schemaVersion: "authorization-control-update/v1", rules: [item("entry"), item("stop", { kind: "reject", after: ["entry"], complete: true }), item("bad", { after: "malformed" })] } })
  expect(first.valid).toBe(false)
  expect((runtime.report() as any).domain.slice.rules).toHaveLength(2)
  const repaired = await invoke("authorization_check_result", { result: result(id), controlDelta: { schemaVersion: "authorization-control-update/v1", rules: [item("bad")] } })
  expect(repaired.valid).toBe(true)
  expect((runtime.report() as any).domain.proposals[0].rejected[0]).toMatchObject({ questionId: "q1", targetKey: "bad" })
  expect(runtime.report().toolBudget.checksUsed).toBe(2)
  expect(runtime.report().result).toBeDefined()
  expect(runtime.system).toContain("guided-evidence-v2 local interface")
})

test("native guided dispatch offers actual original windows and accepts the same narrow extraction", async () => {
  const { root, inquiry, result } = await budgetFixture()
  const runtime = await createNativeInquiryRuntime({ inputFile: path.join(root, "input.json"), workDir: root, domainTools: true, strategy: "guided-evidence-v2" })
  await runtime.execute({ id: "compile", name: "authorization_compile", arguments: { inquiry } })
  const params: any = { messages: [{ role: "user", content: "Can anyone call entry?" }] }
  await runtime.beforeDispatch(params)
  const context = JSON.parse(params.messages.at(-1).content.split("Current local explanation context: ")[1])
  expect(context.sourceWindows[0].text).toContain("return false")
  const controlDelta = { schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: context.tasks[0].itemId, rules: [{ op: "add", targetKey: "entry", pathKey: "p", kind: "entry", after: [], claim: "Entry returns false" }, { op: "add", targetKey: "stop", pathKey: "p", kind: "reject", after: ["entry"], claim: "Rejects", complete: true }] }] }
  const checked = JSON.parse((await runtime.execute({ id: "check", name: "authorization_check_result", arguments: { result: result(context.sourceWindows[0].id), controlDelta } })).output)
  expect(checked.valid).toBe(true)
  expect(checked).not.toHaveProperty("domainCheck")
  expect(checked.questionChecks[0]).not.toHaveProperty("trace")
  expect(runtime.report().history.at(-1)!.output).toHaveProperty("domainCheck")
  await runtime.beforeDispatch(params)
  expect(params.messages.filter((m: any) => m.content.startsWith("Current local explanation context: "))).toHaveLength(1)
  expect(runtime.report().domain!.localExtractions).toHaveLength(1)
  const current = JSON.parse(params.messages.at(-1).content.split("Current local explanation context: ")[1])
  expect(current.state.rules.map((r: any) => r.key)).toEqual(["entry", "stop"])
  expect(current.sourceWindows).toEqual([])
  expect(runtime.report().sourceAccounting.cumulativeModelSourceBytes).toBe(context.sourceWindows[0].bytes)
})

test("native reserves checking and prose within the existing provider budget", async () => {
  const { root, inquiry } = await budgetFixture()
  const runtime = await createNativeInquiryRuntime({ inputFile: path.join(root, "input.json"), workDir: root, domainTools: true, strategy: "guided-evidence-v2", maxProviderCalls: 5 } as any)
  await runtime.execute({ id: "compile", name: "authorization_compile", arguments: { inquiry } })
  const params: any = { messages: [{ role: "user", content: "Can anyone call entry?" }] }
  for (let turn = 1; turn <= 5; turn++) {
    await runtime.beforeDispatch(params)
    if (turn < 3) expect(params.tools.map((t: any) => t.name)).toContain("source_read")
    else if (turn < 5) expect(params.tools.map((t: any) => t.name)).toEqual(["authorization_check_result"])
    else {
      expect(params.tools).toEqual([])
      expect(params.toolChoice).toBeUndefined()
      expect(params.messages.some((m: any) => m.content.includes("No checked result"))).toBe(true)
    }
  }
  expect(runtime.report().requests).toHaveLength(5)
  expect(runtime.report().toolBudget.checksUsed).toBe(0)
})

test("guided native compiles the supplied inquiry before the first dispatch without spending a tool call", async () => {
  const { root, inquiry, result } = await budgetFixture()
  const inputFile = path.join(root, "input.json"), input = JSON.parse(await readFile(inputFile, "utf8"))
  delete input.brief; input.inquiry = { ...inquiry, questions: [{ ...inquiry.questions[0], entryHint: "entry" }] }
  await writeFile(inputFile, JSON.stringify(input))
  const runtime = await createNativeInquiryRuntime({ inputFile, workDir: root, domainTools: true, strategy: "guided-evidence-v2", skillContent: "<runtime-resource-root>.skvm/skills/sample</runtime-resource-root>" })
  expect(runtime.report().program?.questions[0]?.request).toBe(inquiry.questions[0]!.request)
  expect(runtime.report()).toMatchObject({ compilationOrigin: "host-input", compilationToolCalls: 0, domainCalls: 0 })
  expect(runtime.definitions.map(d => d.name)).not.toContain("authorization_compile")
  expect(runtime.definitions.map(d => d.name)).toContain("skill_reference_read")
  expect(runtime.system).toContain("already compiled by the host")
  const params: any = { messages: [{ role: "user", content: inquiry.questions[0]!.request }] }
  await runtime.beforeDispatch(params)
  const context = JSON.parse(params.messages.at(-1).content.split("Current local explanation context: ")[1]), task = context.tasks[0]
  expect(context.sourceWindows[0].text).toContain("return false")
  const controlDelta = { schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: task.itemId, rules: [{ op: "add", targetKey: "entry", kind: "entry", pathKey: "p", after: [], claim: "Entry" }, { op: "add", targetKey: "stop", kind: "reject", pathKey: "p", after: ["entry"], complete: true, claim: "Entry rejects" }] }] }
  const checked = JSON.parse((await runtime.execute({ id: "check", name: "authorization_check_result", arguments: { result: result(task.evidenceIds[0]), controlDelta } })).output)
  expect(checked.valid).toBe(true)
  expect(runtime.report().toolBudget).toMatchObject({ totalUsed: 2, explorationUsed: 1, checksUsed: 1 })
  runtime.close()
})

test("a natural guided brief still requires a counted model declaration without inventing source facts", async () => {
  const { root, inquiry } = await budgetFixture()
  const runtime = await createNativeInquiryRuntime({ inputFile: path.join(root, "input.json"), workDir: root, domainTools: true, strategy: "guided-evidence-v2" })
  expect(runtime.report().program).toBeUndefined()
  expect(runtime.definitions.map(d => d.name)).toContain("authorization_compile")
  await runtime.execute({ id: "compile", name: "authorization_compile", arguments: { inquiry } })
  expect(runtime.report()).toMatchObject({ compilationOrigin: "model-tool", compilationToolCalls: 1, domainCalls: 1 })
  runtime.close()
})

test("ordinary operation D1 authoring is selected explicitly and counted in the same native tool budget", async () => {
  const { root } = await budgetFixture(), inputFile = path.join(root, "input.json")
  const runtime = await createNativeInquiryRuntime({ inputFile, workDir: root, domainTools: true, strategy: "operation-evidence-v1", method: "D1" } as any)
  expect(runtime.report().program).toBeUndefined()
  expect(runtime.definitions.map(d => d.name)).toContain("authorization_compile")
  expect(runtime.system).toContain("Reporting responsibilities are not separate operations")
  const inquiry = { schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "Can anyone call entry?", entryHint: "entry" }], questions: [{ id: "behavior", operationId: "op", intent: "behavior", request: "Can anyone call entry?", premises: [] }, { id: "scope", operationId: "op", intent: "scope", request: "What source limits remain?", premises: [] }] }
  expect((await runtime.execute({ id: "compile", name: "authorization_compile", arguments: { inquiry } })).exitCode).toBe(0)
  expect(runtime.report()).toMatchObject({ compilationOrigin: "model-tool", compilationToolCalls: 1, domainCalls: 1 })
  expect(runtime.report().program?.operations).toHaveLength(1)
  expect(runtime.report().program?.questions).toHaveLength(2)
  const params: any = { messages: [{ role: "user", content: "Whole original task" }] }
  await runtime.beforeDispatch(params)
  expect(params.tools.map((t: any) => t.name)).not.toContain("authorization_compile")
  expect(params.messages.some((m: any) => m.content.startsWith("Current local explanation context:"))).toBe(true)
  await runtime.close()
})

test("closing during native source preparation prevents a late request or tool-state write", async () => {
  const { root, inquiry } = await budgetFixture()
  const inputFile = path.join(root, "input.json"), input = JSON.parse(await readFile(inputFile, "utf8"))
  delete input.brief; input.inquiry = inquiry
  await writeFile(inputFile, JSON.stringify(input))
  const runtime = await createNativeInquiryRuntime({ inputFile, workDir: root, domainTools: true, strategy: "guided-evidence-v2" })
  const prepared = runtime.beforeDispatch({ messages: [{ role: "user", content: "Original task" }] }).then(() => undefined, error => error)
  await runtime.close()
  expect((await prepared)?.message).toContain("session-closed")
  expect(runtime.report().requests).toHaveLength(0)
  const references = await createNativeInquiryRuntime({ inputFile, workDir: root, domainTools: false, skillContent: "<runtime-resource-root>.skvm/skills/sample</runtime-resource-root>" })
  const pending = references.execute({ id: "read", name: "skill_reference_read", arguments: { path: "references/guide.md" } })
  await references.close()
  expect((await pending).exitCode).toBe(1)
  expect(references.report().history).toHaveLength(0)
})
