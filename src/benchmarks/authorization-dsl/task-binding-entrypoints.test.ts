import { test, expect } from "bun:test"
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { runAuthorizationInquiry } from "./inquiry-run.ts"
import { createNativeInquiryRuntime } from "./inquiry-native.ts"
import { emptyTokenUsage } from "../../core/types.ts"
import type { LLMProvider } from "../../providers/types.ts"

const proposal = { schemaVersion: "authorization-property-intent/v1", questions: [
  { questionId: "q", state: "proposed", properties: [{ kind: "authorization-before-effect", requirement: "authorization before returning the file" }] },
  { questionId: "scope", state: "residual", reason: "Evidence limits remain a full reporting duty." },
] }
export async function taskFixture(source = "def entry(user, document):\n    return document\n") {
  const root = await mkdtemp(path.join(os.tmpdir(), "bc-task-binding-")), sourceRoot = path.join(root, "source"); await mkdir(sourceRoot)
  await writeFile(path.join(sourceRoot, "app.py"), source)
  const inquiry = { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [
    { id: "q", request: "Check authorization before returning the file.", premises: [] },
    { id: "scope", request: "State missing deployment facts.", premises: [] },
  ] }
  const inputFile = path.join(root, "inquiry.json"); await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "fixture", repository: "anonymous", sourceRef: "r", sourceRoot: "source", allowedPaths: ["app.py"], inquiry }))
  return { root, sourceRoot, inputFile, inquiry }
}
test("ordinary inquiry prepares the current undeclared tasks before any source interpretation", async () => {
  const f = await taskFixture(), before = await readFile(f.inputFile), requests: any[] = []
  const provider: LLMProvider = { name: "mock", async complete(params) {
    requests.push(params)
    if (params.tools?.some(t => t.name === "submit_task_properties")) return { text: "", toolCalls: [{ id: "prepare", name: "submit_task_properties", arguments: proposal }], tokens: emptyTokenUsage(), durationMs: 0, stopReason: "tool_use" }
    throw new Error("bounded fixture ends after preparation")
  }, async completeWithToolResults() { throw new Error("unused") } }
  const run = await runAuthorizationInquiry({ ...f, repository: "anonymous", sourceRef: "r", allowedPaths: ["app.py"], provider, method: "D1", strategy: "task-binding-v1" as any, maxDispatches: 3 })
  expect((run as any).taskPreparation.questions.map((q: any) => q.questionId)).toEqual(["q", "scope"])
  expect((run as any).taskPreparation.questions[0].properties.length).toBeGreaterThan(0)
  expect(run.requests[0]!.phase as string).toBe("prepare")
  expect(run.inquiry!.questions).toHaveLength(2)
  expect(run.domain).toBeDefined()
  expect(requests[0].messages.map((m: any) => m.content).join("\n")).not.toContain("sourceSkeleton")
  expect(requests.every(r => !JSON.stringify(r).includes("EVALUATOR_SENTINEL"))).toBe(true)
  expect(await readFile(f.inputFile)).toEqual(before)
})
test("task preparation uses only one targeted revision and archives both rejected proposals", async () => {
  const f = await taskFixture(); let calls = 0
  const provider: LLMProvider = { name: "mock", async complete() {
    calls++; return { text: "", toolCalls: [{ id: `bad-${calls}`, name: "submit_task_properties", arguments: { ...proposal, questions: [proposal.questions[0]] } }], tokens: emptyTokenUsage(), durationMs: 0, stopReason: "tool_use" }
  }, async completeWithToolResults() { throw new Error("unused") } }
  const run = await runAuthorizationInquiry({ ...f, repository: "anonymous", sourceRef: "r", allowedPaths: ["app.py"], provider, method: "D1", strategy: "task-binding-v1" as any, maxDispatches: 12 })
  expect(calls).toBe(2)
  expect(run.status).toBe("completed-with-diagnostics")
  expect((run as any).taskPreparationAttempts).toHaveLength(2)
  expect(run.domain).toBeUndefined()
  expect(run.error).toContain("task-property-preparation")
})
test("native task preparation is exposed before the source queue and shares the host admission", async () => {
  const f = await taskFixture(), before = await readFile(f.inputFile)
  const runtime = await createNativeInquiryRuntime({ ...f, workDir: f.root, domainTools: true, strategy: "task-binding-v1" as any })
  try {
    expect(runtime.definitions.some(t => t.name === "authorization_prepare_properties")).toBe(true)
    expect((await runtime.accountContext() as any).taskPreparation.state).toBe("pending")
    expect(runtime.report().domain).toBeUndefined()
    const result = await runtime.execute({ id: "prepare", name: "authorization_prepare_properties", arguments: proposal })
    expect(result.exitCode).toBe(0)
    expect((runtime.report() as any).taskPreparation.questions.map((q: any) => q.questionId)).toEqual(["q", "scope"])
    expect(runtime.report().domain).toBeDefined()
    expect(runtime.report().toolBudget.totalUsed).toBe(1)
    expect(await readFile(f.inputFile)).toEqual(before)
  } finally { await runtime.close() }
})
test("native malformed preparation has one revision, no source adoption and no semantic check", async () => {
  const f = await taskFixture(), runtime = await createNativeInquiryRuntime({ ...f, workDir: f.root, domainTools: true, strategy: "task-binding-v1" })
  try {
    const blocked = await runtime.execute({ id: "read-before-prepare", name: "source_read", arguments: { path: "app.py", startLine: 1, endLine: 2 } })
    expect(blocked.exitCode).toBe(1)
    for (let i = 0; i < 2; i++) await runtime.rejectArguments({ id: `bad-${i}`, name: "authorization_prepare_properties", arguments: {} }, [{ path: "/questions", keyword: "required", message: "Required", expected: null }])
    expect(runtime.report().taskPreparationFailed).toBe(true)
    expect(runtime.report().taskPreparationAttempts).toHaveLength(2)
    expect(runtime.report().domain).toBeUndefined()
    expect(runtime.report().toolBudget.checksUsed).toBe(0)
    expect((await runtime.accountContext() as any).taskPreparation.state).toBe("frontend-failed")
  } finally { await runtime.close() }
})
