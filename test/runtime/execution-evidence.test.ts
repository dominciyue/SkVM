import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Solidifier } from "../../src/jit-boost/solidifier.ts"
import { executeSubworkflow } from "../../src/runtime/subworkflow.ts"
import { BareAgentAdapter } from "../../src/adapters/bare-agent.ts"
import { checkArtifacts, prepareArtifactValidation } from "../../src/runtime/artifact-checks.ts"

let root: string
beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), "skvm-evidence-")) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
const candidate = () => ({ purposeId: "sum", keywords: ["sum"], codeSignature: "sum", functionTemplate: "sum", params: {}, materializationType: "shell" as const,
  validation: { outputs: [{ path: "summary.json", format: "json", requiredKeys: ["total"] }], checks: [{ id: "sum", kind: "json-number", path: "summary.json", pointer: "/total", source: "rows.json", sourcePointer: "/values", operation: "sum" }] } })

test("requested signatures alone never promote in the default policy", async () => {
  const s = new Solidifier([candidate() as any], { promotionThreshold: 1 })
  await s.createAfterLLMHook()({ workDir: root, iteration: 1, response: { text: "", toolCalls: [{ id: "a", name: "execute_command", arguments: { command: "sum" } }], tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, durationMs: 1, stopReason: "tool_use" } })
  expect(s.getEntries()[0]!.state.promoted).toBe(false)
  expect(s.getEntries()[0]!.state.hitCount).toBe(0)
})

test("promotion requires a matching executed receipt and independently checked contents", async () => {
  await Bun.write(path.join(root, "rows.json"), '{"values":[1,2,3]}')
  const s = new Solidifier([candidate() as any], { promotionThreshold: 2 })
  expect(typeof (s as any).createBeforeToolHook).toBe("function")
  const before = (s as any).createBeforeToolHook(), after = (s as any).createAfterToolHook()
  const observe = async (id: string, value: number, exitCode = 0) => {
    const call = { id, name: "execute_command", arguments: { command: "sum" } }
    await before({ toolCall: call, workDir: root, iteration: 1, prompt: "sum" })
    await Bun.write(path.join(root, "summary.json"), JSON.stringify({ total: value }))
    await after({ toolCall: { id, name: call.name, input: call.arguments, output: "done", exitCode, durationMs: 2 }, workDir: root, iteration: 1 })
  }
  await observe("failed-process", 6, 2)
  await observe("wrong-result", 99)
  expect(s.getEntries()[0]!.state.promoted).toBe(false)
  expect(s.getEntries()[0]!.state.hitCount).toBe(0)
  await observe("ok1", 6)
  expect(s.getEntries()[0]!.state.promoted).toBe(false)
  await observe("ok2", 6)
  expect(s.getEntries()[0]!.state.promoted).toBe(true)
  expect((s.getEntries()[0]!.state as any).evidence.validation.status).toBe("passed")
  expect((s.getEntries()[0]!.state as any).evidence.validation.artifacts[0].bytes).toBeGreaterThan(0)
  // Replayed or foreign receipts do not count as another execution.
  await after({ toolCall: { id: "ok2", name: "execute_command", input: { command: "sum" }, exitCode: 0 }, workDir: root, iteration: 1 })
  expect(s.getEntries()[0]!.state.hitCount).toBe(2)
})

test.each(["numeric", "preserve", "semantic-unavailable"])("content check %s returns recover and removes the bad output", async kind => {
  await Bun.write(path.join(root, "rows.json"), '{"values":[1,2,3]}')
  await Bun.write(path.join(root, "source.txt"), 'Hello {{name}} and {{name}}')
  const checks = kind === "numeric" ? [{ id: "total", kind: "json-number", path: "result.json", pointer: "/total", source: "rows.json", sourcePointer: "/values", operation: "sum" }]
    : kind === "preserve" ? [{ id: "variables", kind: "preserve", source: "source.txt", path: "result.json", pattern: "\\{\\{[^}]+\\}\\}" }]
    : [{ id: "meaning", kind: "command", scope: "semantic", argv: [process.execPath, "-e", "console.log(JSON.stringify({status:'unknown',details:'Reviewer unavailable'}))"] }]
  const result = await executeSubworkflow("contents", { bindings: [], remainingTask: "Fix result and finish", steps: [{ id: "bad", argv: [process.execPath, "-e", "require('fs').writeFileSync('result.json',JSON.stringify({total:99,text:'Hello {{name}}'}))"], outputs: [{ path: "result.json", format: "json", requiredKeys: ["total"] }], checks }] } as any, { prompt: "finish", workDir: root, iteration: 1, previousToolCalls: [] }, {})
  expect(result.checkpoint.status).toBe("recover")
  expect(await Bun.file(path.join(root, "result.json")).exists()).toBe(false)
  const report = (result.checkpoint as any).validations[0]
  expect(report.status).toBe(kind === "semantic-unavailable" ? "unknown" : "failed")
  expect(report.checks[0].scope).toBe(kind === "numeric" ? "numeric" : kind === "preserve" ? "preservation" : "semantic")
})

test("validation preserves the pre-execution source, even when a command overwrites it", async () => {
  await Bun.write(path.join(root, "source.txt"), "original")
  const r = await executeSubworkflow("preserve", { bindings: [], remainingTask: "finish", steps: [{ id: "write", argv: [process.execPath, "-e", "require('fs').writeFileSync('source.txt','changed')"], outputs: [{ path: "source.txt", format: "text" }], checks: [{ id: "content", kind: "preserve", source: "source.txt", path: "source.txt" }] }] } as any, { prompt: "finish", workDir: root, iteration: 1, previousToolCalls: [] }, {})
  expect(r.checkpoint.status).toBe("recover")
  expect(await Bun.file(path.join(root, "source.txt")).text()).toBe("original")
})

test("an old valid artifact plus a no-op receipt does not establish production evidence", async () => {
  await Bun.write(path.join(root, "rows.json"), '{"values":[1,2,3]}')
  await Bun.write(path.join(root, "summary.json"), '{"total":6}')
  const s = new Solidifier([candidate() as any], { promotionThreshold: 1 })
  await s.createBeforeToolHook()({ toolCall: { id: "noop", name: "execute_command", arguments: { command: "sum" } }, workDir: root, iteration: 1, prompt: "sum" })
  await s.createAfterToolHook()({ toolCall: { id: "noop", name: "execute_command", input: { command: "sum" }, exitCode: 0 }, workDir: root, iteration: 1 })
  expect(s.getEntries()[0]!.state.promoted).toBe(false)
  expect(s.getEntries()[0]!.state.evidence?.diagnostic).toContain("artifact")
})

test("bare-agent checks each completed mutation before another tool overwrites the same artifact", async () => {
  await Bun.write(path.join(root, "rows.json"), '{"values":[1,2,3]}')
  const c = { ...candidate(), codeSignature: "total", monitoredTools: ["write_file"] }
  const s = new Solidifier([c as any], { promotionThreshold: 2 })
  const response = (toolCalls: any[]) => ({ text: "done", toolCalls, tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, durationMs: 1, stopReason: toolCalls.length ? "tool_use" : "end_turn" })
  const provider: any = { name: "test", complete: async () => response([99, 6].map((n, i) => ({ id: `write-${i}`, name: "write_file", arguments: { path: "summary.json", content: JSON.stringify({ total: n }) } }))), completeWithToolResults: async () => response([]) }
  const adapter = new BareAgentAdapter(() => provider, { beforeTool: [s.createBeforeToolHook()], afterTool: [s.createAfterToolHook()], afterLLM: [s.createAfterLLMHook()] })
  await adapter.setup({ model: "test/test", timeoutMs: 5000, maxSteps: 3 })
  const result = await adapter.run({ prompt: "sum", workDir: root })
  expect(result.runStatus).toBe("ok")
  expect(s.getEntries()[0]!.state.hitCount).toBe(1)
  expect(s.getEntries()[0]!.state.promoted).toBe(false)
})

test.each(["passed", "failed", "unknown", "invalid"])("semantic evaluator %s remains separate from structural validity", async status => {
  await Bun.write(path.join(root, "out.txt"), "some text")
  const prepared = await prepareArtifactValidation({ outputs: [{ path: "out.txt", format: "text" }], checks: [{ id: "meaning", kind: "command", scope: "semantic", argv: [process.execPath, "-e", status === "invalid" ? "console.log('ok')" : `console.log(JSON.stringify({status:'${status}',details:'Declared rubric verdict',usage:{input:8,output:2}}))`] }] }, root)
  const result = await checkArtifacts(prepared)
  expect(result.artifacts[0]!.status).toBe("passed")
  expect(result.status).toBe(status === "invalid" ? "unknown" : status)
  if (status !== "invalid") expect(result.checks[0]!.usage).toEqual({ input: 8, output: 2 })
})

test("old signature-only saved promotion is not silently treated as verified", () => {
  const s = new Solidifier([candidate() as any])
  s.getEntries()[0]!.state.promoted = true
  const restored = new Solidifier([], { savedState: s.exportState("test") })
  expect(restored.getEntries()[0]!.state.promoted).toBe(false)
})

test("changing one output cannot certify another stale declared output", async () => {
  await Bun.write(path.join(root, "rows.json"), '{"values":[1,2,3]}')
  await Bun.write(path.join(root, "summary.json"), '{"total":6}')
  const c = candidate()
  c.validation.outputs.push({ path: "other.json", format: "json", requiredKeys: [] })
  const s = new Solidifier([c as any], { promotionThreshold: 1 })
  await s.createBeforeToolHook()({ toolCall: { id: "partial", name: "execute_command", arguments: { command: "sum" } }, workDir: root, iteration: 1, prompt: "sum" })
  await Bun.write(path.join(root, "other.json"), '{}')
  await s.createAfterToolHook()({ toolCall: { id: "partial", name: "execute_command", input: { command: "sum" }, exitCode: 0 }, workDir: root, iteration: 1 })
  expect(s.getEntries()[0]!.state.promoted).toBe(false)
})
