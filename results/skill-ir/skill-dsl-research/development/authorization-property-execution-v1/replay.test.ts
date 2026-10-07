import { expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { execFileSync } from "node:child_process"
import { runCodexAccountInquiry } from "../../../../../src/adapters/codex-account.ts"

const api = await import("./replay.ts").catch(() => ({} as any))
test("strict account replay reexecutes the archived source call and detects changed retained evidence", async () => {
  expect(typeof api.replayAccountCalls).toBe("function")
  const root = await mkdtemp(path.join(os.tmpdir(), "ax-account-replay-"))
  try {
    await mkdir(path.join(root, "source")); await writeFile(path.join(root, "source/app.py"), "def entry():\n    return False\n")
    const inputFile = path.join(root, "input.json")
    await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "replay", repository: "anonymous", sourceRef: "r", sourceRoot: "source", allowedPaths: ["app.py"], brief: "Inspect entry." }))
    let receive = (_message: any) => {}, called = false
    const transport: any = { isolation: { kind: "test-transport", reason: "Anonymous recorded-source fixture" }, onMessage(fn: any) { receive = fn }, onExit() {}, close() {}, send(message: any) {
      if (message.method === "initialize") receive({ id: message.id, result: {} })
      else if (message.method === "thread/start") receive({ id: message.id, result: { thread: { id: "t" }, model: "gpt-5.6-sol" } })
      else if (message.method === "turn/start") { receive({ id: message.id, result: { turn: { id: "u" } } }); queueMicrotask(() => receive({ id: "rpc-1", method: "item/tool/call", params: { threadId: "t", turnId: "u", callId: "read-1", tool: "source_read", arguments: { path: "app.py", startLine: 1, endLine: 2 } } })) }
      else if (message.result?.contentItems && !called) { called = true; receive({ method: "item/completed", params: { threadId: "t", turnId: "u", item: { type: "agentMessage", phase: "final_answer", text: "The source returns False." } } }); receive({ method: "turn/completed", params: { threadId: "t", turn: { id: "u", status: "completed", items: [] } } }) }
    } }
    const options = { inputFile, workDir: root, model: "gpt-5.6-sol", domainTools: false, strategy: "legacy" as const, maxToolCalls: 8, timeoutMs: 1000 }
    const original = JSON.parse(JSON.stringify(await runCodexAccountInquiry({ ...options, transportFactory: () => transport })))
    const replay = await api.replayAccountCalls(options, original)
    expect(replay).toMatchObject({ status: "verified", newInference: 0, callbacks: 1, targetExecutions: 0 })
    const changed = structuredClone(original); changed.native.evidence[0]!.text += "changed retained source"
    expect(await api.replayAccountCalls(options, changed)).toMatchObject({ status: "mismatch", newInference: 0 })
    const changedCall = structuredClone(original); changedCall.native.history[0].call.arguments.path = "other.py"
    await expect(api.replayAccountCalls(options, changedCall)).rejects.toThrow("Archived callback")
  } finally { await rm(root, { recursive: true, force: true }) }
})
test("replay equality removes only host computation duration and keeps model semantic fields", () => {
  expect(typeof api.stableNative).toBe("function")
  const value = { domain: { computation: { durationMs: 3, pathEvaluations: 2 }, structure: { preparation: { durationMs: 7, files: 2 } }, semantic: { units: [{ durationMs: "model value" }] } } }
  expect(api.stableNative(value)).toEqual({ domain: { computation: { pathEvaluations: 2 }, structure: { preparation: { files: 2 } }, semantic: { units: [{ durationMs: "model value" }] } } })
})
test("frozen production replay refuses modified and untracked source before reading HEAD tree", async () => {
  expect(typeof api.assertCleanSource).toBe("function")
  const root = await mkdtemp(path.join(os.tmpdir(), "ax-frozen-source-")), git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { stdio: "pipe" })
  try {
    git("init"); await mkdir(path.join(root, "src")); await writeFile(path.join(root, "src/core.ts"), "original\n"); git("add", "src"); git("-c", "user.name=Fixture", "-c", "user.email=fixture@invalid", "commit", "-m", "fixture")
    expect(() => api.assertCleanSource(root)).not.toThrow()
    await writeFile(path.join(root, "src/core.ts"), "modified\n")
    expect(() => api.assertCleanSource(root)).toThrow("dirty production src")
    git("restore", "src/core.ts"); await writeFile(path.join(root, "src/extra.ts"), "untracked\n")
    expect(() => api.assertCleanSource(root)).toThrow("dirty production src")
  } finally { await rm(root, { recursive: true, force: true }) }
})
