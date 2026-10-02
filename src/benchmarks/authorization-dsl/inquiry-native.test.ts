import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises"
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
