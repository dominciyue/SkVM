import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { runCodexAccountInquiry } from "./codex-account.ts"
import { resolveInquiryContext } from "../benchmarks/authorization-dsl/inquiry-context.ts"

test("official static validation diagnoses only AZ's selected source protocol", async () => {
  const fixture = JSON.parse(await readFile(path.resolve(import.meta.dir, "../../results/skill-ir/skill-dsl-research/development/authorization-semantic-submission-v1/fixtures/az-original.json"), "utf8"))
  const raw = fixture.entries.find((e: any) => e.attemptId === "single-download/format-contract-1").toolRejections[1].call.arguments
  const directory = await mkdtemp(path.join(os.tmpdir(), "ba-account-diagnostics-")); await mkdir(path.join(directory, "source"))
  await writeFile(path.join(directory, "source/app.py"), "def entry():\n    return False\n")
  const inputFile = path.join(directory, "input.json")
  await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "t", repository: "anonymous", sourceRef: "r", sourceRoot: "source", allowedPaths: ["app.py"], brief: "Inspect app.entry" }))
  let receive = (_message: any) => {}, diagnosticReply: any
  const transport: any = { isolation: { kind: "test-transport", reason: "Static official argument validation only" }, onMessage(f: any) { receive = f }, onExit() {}, close() {}, send(m: any) {
    if (m.method === "initialize") receive({ id: m.id, result: {} })
    if (m.method === "thread/start") receive({ id: m.id, result: { thread: { id: "t" }, model: "gpt-5.6-sol" } })
    if (m.method === "turn/start") { receive({ id: m.id, result: { turn: { id: "turn" } } }); queueMicrotask(() => receive({ id: "tool-rpc", method: "item/tool/call", params: { threadId: "t", turnId: "turn", callId: "original-guard", tool: "authorization_observe", arguments: raw } })) }
    if (m.result?.contentItems) { diagnosticReply = JSON.parse(m.result.contentItems[0].text); receive({ method: "turn/completed", params: { threadId: "t", turn: { id: "turn", status: "completed", items: [{ type: "agentMessage", text: "Original failure retained" }] } } }) }
  } }
  const run = await runCodexAccountInquiry({ inputFile, workDir: directory, model: "gpt-5.6-sol", method: "M", strategy: "operation-evidence-v6", transportFactory: () => transport, timeoutMs: 5000 })
  expect(run.account.toolRejections).toHaveLength(1)
  const diagnostics = run.account.toolRejections[0]!.diagnostics
  expect(diagnostics).toHaveLength(1)
  expect(diagnostics[0]!.path).toBe("/controlDelta/interpretation/annotations/0/role")
  expect(diagnostics[0]!.expected).toEqual({ allowedValues: ["principal", "resource", "permission", "condition", "effect", "context"] })
  expect(JSON.stringify(diagnosticReply.toolResult.diagnostics)).not.toMatch(/candidateId|required.*unit|focused-update/)
})
