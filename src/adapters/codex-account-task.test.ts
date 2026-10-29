import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { CodexAccountAdapter } from "./codex-account.ts"
import { Solidifier } from "../jit-boost/solidifier.ts"
import { createAgentToolExecutor } from "../core/agent-tools.ts"

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
function transport(exceedBudget = false) {
  let receive = (_message: any) => {}
  const sent: any[] = []
  const api: any = { isolation: { kind: "test-transport" }, onMessage(fn: any) { receive = fn }, onExit() {}, close() {}, send(m: any) {
    sent.push(m)
    if (m.method === "initialize") receive({ id: m.id, result: {} })
    if (m.method === "thread/start") receive({ id: m.id, result: { thread: { id: "generic-thread" }, model: "gpt-5.6-sol" } })
    if (m.method === "turn/start") {
      receive({ id: m.id, result: { turn: { id: "generic-turn" } } })
      queueMicrotask(() => receive({ id: "call", method: "item/tool/call", params: { threadId: "generic-thread", turnId: "generic-turn", callId: "write", tool: "write_file", arguments: { path: "final.txt", content: "finished" } } }))
    }
    if (m.id === "call" && m.result && exceedBudget) {
      receive({ id: "over-budget", method: "item/tool/call", params: { threadId: "generic-thread", turnId: "generic-turn", callId: "extra", tool: "write_file", arguments: { path: "extra.txt", content: "unwanted" } } }); return
    }
    if ((m.id === "call" || m.id === "over-budget") && m.result) {
      receive({ method: "thread/tokenUsage/updated", params: { threadId: "generic-thread", turnId: "generic-turn", tokenUsage: { total: { inputTokens: 100, outputTokens: 20, cachedInputTokens: 10, cacheWriteInputTokens: 0, totalTokens: 120 } } } })
      receive({ method: "turn/completed", params: { threadId: "generic-thread", turn: { id: "generic-turn", status: "completed", items: [{ type: "agentMessage", phase: "final_answer", text: "Completed the report." }] } } })
    }
  } }
  return { api, sent }
}

test.each([false, true])("ordinary account task continues from the actual prefix boundary (invalid=%s)", async invalid => {
  const root = await mkdtemp(path.join(tmpdir(), "skvm-account-task-")); roots.push(root)
  await Bun.write(path.join(root, "rows.json"), '{"values":[1,2,3]}')
  const s = new Solidifier([{ purposeId: "report", keywords: ["report"], codeSignature: "", functionTemplate: "", params: {}, materializationType: "shell", subworkflow: {
    bindings: [], remainingTask: "Write final.txt after checking summary", steps: [{ id: "sum", argv: [process.execPath, "-e", `require('fs').writeFileSync('summary.json',JSON.stringify({total:${invalid ? 99 : 6}}))`], outputs: [{ path: "summary.json", format: "json" }], checks: [{ id: "total", kind: "json-number", path: "summary.json", pointer: "/total", source: "rows.json", sourcePointer: "/values", operation: "sum", tolerance: 0 }] }],
  } }])
  s.getEntries()[0]!.state.promoted = true
  const t = transport(), adapter = new CodexAccountAdapter(() => t.api)
  await adapter.setup({ model: "gpt-5.6-sol", timeoutMs: 5000, maxSteps: 10 })
  expect(typeof (adapter as any).setHooks).toBe("function")
  const calls: string[] = []
  ;(adapter as any).setHooks({ beforeLLM: [s.createBeforeLLMHook()], beforeTool: [async (c: any) => calls.push("before:" + c.toolCall.id)], afterTool: [async (c: any) => calls.push("after:" + c.toolCall.id)] })
  const result = await adapter.run({ prompt: "Finish report", workDir: root, skill: { content: "Read the rows and prepare a report.", mode: "inject", meta: { name: "reports", description: "Reports" } } } as any)
  expect(result.runStatus).toBe("ok")
  expect(await Bun.file(path.join(root, "final.txt")).text()).toBe("finished")
  expect(await Bun.file(path.join(root, "summary.json")).exists()).toBe(!invalid)
  expect(t.sent.filter(m => m.method === "turn/start")).toHaveLength(1)
  expect(t.sent.find(m => m.method === "thread/start").params.dynamicTools.some((t: any) => t.name.startsWith("authorization_"))).toBe(false)
  const prompt = t.sent.find(m => m.method === "turn/start").params.input[0].text
  expect(prompt).toContain(invalid ? '"status":"recover"' : '"status":"completed"')
  expect(prompt).toContain("Write final.txt")
  expect(calls).toContain("before:write")
  expect(calls).toContain("after:write")
  expect(result.steps.flatMap(s => s.toolCalls).filter(t => t.output !== undefined).map(t => t.id)).toContain("write")
  expect((result as any).accountSession.lifecycle.providerTerminalObserved).toBe(true)
  expect(result.tokens.input).toBe(100)
  expect((result as any).accountSession.actualUsd).toBeNull()
})

test("ordinary tool results distinguish a missing file from a completed write", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "skvm-tool-status-")); roots.push(root)
  const execute = createAgentToolExecutor(root)
  expect((await execute({ id: "missing", name: "read_file", arguments: { path: "missing" } })).exitCode).toBe(1)
  expect((await execute({ id: "write", name: "write_file", arguments: { path: "ok.txt", content: "ok" } })).exitCode).toBe(0)
})

test("ordinary tool budget preserves final answer opportunity without extra execution", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "skvm-budget-")); roots.push(root)
  const t = transport(true), adapter = new CodexAccountAdapter(() => t.api)
  await adapter.setup({ model: "gpt-5.6-sol", maxSteps: 1, timeoutMs: 5000 })
  const result = await adapter.run({ prompt: "Write final.txt", workDir: root } as any)
  expect(result.runStatus).toBe("ok")
  expect(await Bun.file(path.join(root, "extra.txt")).exists()).toBe(false)
  expect(result.accountSession?.terminalStatus).toBe("completed")
  expect(JSON.stringify(t.sent.find(m => m.id === "call" && m.result))).toContain("Remaining host tool calls: 0")
})
