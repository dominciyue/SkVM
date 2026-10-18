// Run in its own process: evaluator spies must never contaminate other tests.
import { mock } from "bun:test"
import assert from "node:assert/strict"
import { mkdtemp, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
const resourcePath = path.resolve(import.meta.dir, "../../../../../src/task-dsl/authorization/resource-relations.ts")
const real = await import(resourcePath)
let evaluations = 0
mock.module(resourcePath, () => ({ ...real, executeResourceWorkflow: () => { evaluations++; throw new Error("rules-called-evaluator") } }))
const { runCodexAccountInquiry } = await import("../../../../../src/adapters/codex-account.ts")
const { resolveInquiryContext } = await import("../../../../../src/benchmarks/authorization-dsl/inquiry-context.ts")
const { assertRulesPacket, save, base } = await import("./study.ts")
const root = await mkdtemp(path.join(os.tmpdir(), "br-rules-")), inputFile = path.join(root, "input.json"), rawFile = path.join(root, "raw.json")
await writeFile(path.join(root, "app.py"), "def entry():\n    return 31\n")
await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "anon", repository: "anonymous", sourceRef: "fixed", sourceRoot: ".", allowedPaths: ["app.py"], inquiry: { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Explain the original behavior and all limits", premises: [] }] } }))
const source = { path: "app.py", startLine: 1, endLine: 2 }
await writeFile(rawFile, JSON.stringify({ schemaVersion: "authorization-executable-contract/v1", id: "anon", scope: { kind: "function-contract", questionId: "q", root: source, upstream: [] }, sourceDeclarations: [{ source, statements: [] }], queries: [], assumptions: [], resourceWorkflow: { inputs: [], steps: [{ id: "result", op: "return", value: { literal: 31 }, source }] } }))
let receive = (_m: any) => {}, replies = 0, starts = 0
const packets: any[] = [], transport: any = { isolation: { kind: "test-transport", reason: "Rules wire and evaluator isolation" }, onMessage(fn: any) { receive = fn }, onExit() {}, close() {}, send(m: any) {
  if (m.method === "initialize") receive({ id: m.id, result: {} })
  if (m.method === "thread/start") { assert(!m.params.dynamicTools.some((t: any) => t.name === "authorization_program_trial")); receive({ id: m.id, result: { thread: { id: "t" }, model: "gpt-5.6-sol" } }) }
  if (m.method === "turn/start") {
    starts++; const wire = JSON.parse(m.params.input[0].text.split("Current local explanation context: ")[1]); assertRulesPacket(wire); packets.push(wire)
    assert(JSON.stringify(wire).includes("Explain the original behavior"))
    receive({ id: m.id, result: { turn: { id: "u" } } })
    queueMicrotask(() => receive({ id: "rpc-1", method: "item/tool/call", params: { threadId: "t", turnId: "u", callId: "details", tool: "authorization_program_details", arguments: { view: "active", format: "raw" } } }))
  }
  if (m.result?.contentItems) {
    const wire = JSON.parse(m.result.contentItems[0].text), resolved = wire.contextSequence ? resolveInquiryContext(wire, packets) : wire
    assertRulesPacket(resolved); packets.push(wire); replies++
    assert(JSON.stringify(resolved).includes("literal"))
    receive({ method: "item/completed", params: { threadId: "t", turnId: "u", item: { type: "agentMessage", phase: "final_answer", text: "The authored rule is unreviewed. Original source and limits retained." } } })
    receive({ method: "turn/completed", params: { threadId: "t", turn: { id: "u", status: "completed", items: [] } } })
  }
} }
const result = await runCodexAccountInquiry({ inputFile, domainProgramFile: rawFile, workDir: root, model: "gpt-5.6-sol", method: "D1", domainTools: true, strategy: "question-checked-v1", programMode: "consume", programSupport: "rules", programContext: "directed", transportFactory: () => transport, timeoutMs: 5000, maxToolCalls: 16 })
assert.equal(result.account.status, "completed"); assert.equal(starts, 1); assert.equal(replies, 1); assert.equal(evaluations, 0)
// Prove the spy is effective, separately from the rules run.
assert.throws(() => real.executeResourceWorkflow({} as any, {}), /rules-called-evaluator/)
assert.equal(evaluations, 1)
await save(path.join(base, "verification/rules-isolation.json"), { providerCalls: 0, starts, replies, rulesEvaluations: 0, spyPositiveControl: evaluations, actualWireStructureChecked: true, fixture: root })
console.log("rules isolation passed; zero evaluator calls, positive control caught one")
