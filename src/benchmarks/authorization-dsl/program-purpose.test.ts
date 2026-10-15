import { describe, expect, test } from "bun:test"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createNativeInquiryRuntime } from "./inquiry-native.ts"
import { inquiryStepSchemas } from "./inquiry-wire.ts"
import { runAuthorizationInquiry } from "./inquiry-run.ts"
import { emptyTokenUsage } from "../../core/types.ts"

describe("directed program purpose", () => {
  for (const mode of ["edit", "consume"] as const) test(`${mode} exposes only its actual work without property preparation`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "program-purpose-"))
    try {
      await writeFile(path.join(root, "app.py"), "def fetch(actor):\n    return actor.allowed\n")
      const inputFile = path.join(root, "input.json")
      await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "purpose", repository: "purpose", sourceRef: "test", sourceRoot: ".", allowedPaths: ["app.py"], inquiry: { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Explain whether fetch allows the actor", premises: [] }, { id: "other", request: "Explain remaining deployment limits", premises: [] }] } }))
      const runtime = await createNativeInquiryRuntime({ inputFile, workDir: root, domainTools: true, strategy: "question-checked-v1", method: "M", programContext: "directed", programMode: mode })
      const names = runtime.definitions.map(t => t.name)
      expect(names).toContain("authorization_program_details")
      expect(names).toContain("source_read")
      for (const name of ["authorization_prepare_properties", "authorization_declare", "authorization_check_properties", "authorization_question"]) expect(names).not.toContain(name)
      for (const name of ["authorization_program", "authorization_program_patch", "authorization_program_trial"]) expect(names.includes(name)).toBe(mode === "edit")
      const context: any = await runtime.accountContext()
      expect(context.purpose).toBe(mode === "edit" ? "author" : "consume")
      expect(context.remainingDuties.map((q: any) => q.questionId)).toEqual(["q", "other"])
      expect(context.taskPreparation).toBeUndefined()
      expect(context.questionWorkflow).toBeUndefined()
      expect(context.sourceWindows).toBeUndefined()
      expect(runtime.system).not.toContain("Prepare undeclared task properties")
      const read = await runtime.execute({ id: "read", name: "source_read", arguments: { path: "app.py", startLine: 1, endLine: 2 } })
      expect(read.exitCode).toBe(0)
      expect(read.output).toContain("return actor.allowed")
      const index = await runtime.execute({ id: "index", name: "authorization_program_details", arguments: { catalog: "source-index" } })
      expect(index.exitCode).toBe(0)
      expect(JSON.parse(index.output).items[0].path).toBe("app.py")
      const denied = await runtime.execute({ id: "old", name: "authorization_prepare_properties", arguments: {} })
      expect(denied.exitCode).toBe(1)
      await runtime.close()
      const input = JSON.parse(await (await import("node:fs/promises")).readFile(inputFile, "utf8"))
      const result = { schemaVersion: "authorization-inquiry-result/v1", questions: input.inquiry.questions.map((q: any) => ({ questionId: q.id, behavior: { disposition: "unknown", explanation: "Source has not been interpreted" }, branches: [], evidenceIds: [], missing: [{ kind: "interpretation-gap", detail: "Source interpretation remains" }] })), observations: [], scope: "Supplied original questions only" }
      const provider: any = { name: "purpose-test", async complete(params: any) { return { text: "", toolCalls: [{ id: "final", name: params.tools[0].name, arguments: { kind: "final", result } }], tokens: emptyTokenUsage(), stopReason: "tool_use", durationMs: 0 } }, async completeWithToolResults() { throw new Error("unused") } }
      const run = await runAuthorizationInquiry({ ...input, sourceRoot: root, provider, method: "M", strategy: "question-checked-v1", programContext: "directed", programMode: mode, maxAuthorContinuations: 0, maxDispatches: 6 })
      expect(run.taskPreparationAttempts).toEqual([])
      expect(run.validation?.valid).toBe(true)
      expect(run.requests[0]!.phase).toBe("analysis")
      const wire = JSON.stringify(run.requests[0]!.params)
      expect(wire).not.toContain("controlDelta")
      expect(wire).not.toContain("Domain execution state")
      expect(wire).toContain("Explain remaining deployment limits")
      const sent: any[] = [], packets: any[] = []
      const transportFactory: any = () => { let receive = (_m: any) => {}, line = 1; const read = () => receive({ id: `source-${line}`, method: "item/tool/call", params: { threadId: "purpose", turnId: "turn", callId: `read-${line}`, tool: "source_read", arguments: { path: "app.py", startLine: line, endLine: line } } }); return { isolation: { kind: "test-transport" }, onMessage(fn: any) { receive = fn }, onExit() {}, close() {}, send(m: any) {
        sent.push(m)
        if (m.method === "initialize") receive({ id: m.id, result: {} })
        if (m.method === "thread/start") receive({ id: m.id, result: { thread: { id: "purpose" }, model: "gpt-5.6-sol" } })
        if (m.method === "turn/start") { packets.push(JSON.parse(m.params.input[0].text.split("Current local explanation context: ")[1])); receive({ id: m.id, result: { turn: { id: "turn" } } }); queueMicrotask(read) }
        if (typeof m.id === "string" && m.id.startsWith("source-") && m.result) { packets.push(JSON.parse(m.result.contentItems[0].text)); if (line++ === 1) queueMicrotask(read); else receive({ method: "turn/completed", params: { threadId: "purpose", turn: { id: "turn", status: "completed", items: [{ type: "agentMessage", phase: "final_answer", text: "All original duties remain explicitly unresolved" }] } } }) }
      } } }
      const { runCodexAccountInquiry } = await import("../../adapters/codex-account.ts")
      const account = await runCodexAccountInquiry({ inputFile, workDir: root, model: "gpt-5.6-sol", skillContent: "Full original skill marker", strategy: "question-checked-v1", programMode: mode, programContext: "directed", maxAuthorContinuations: 0, timeoutMs: 5000, transportFactory })
      expect(account.account.status).toBe("completed")
      const thread = sent.find(m => m.method === "thread/start"), turn = sent.find(m => m.method === "turn/start")
      expect(thread.params.dynamicTools.map((t: any) => t.name)).toEqual(names)
      expect(JSON.stringify(thread)).toContain("Full original skill marker")
      expect(turn.params.input[0].text).not.toContain("questionWorkflow")
      expect(turn.params.input[0].text).toContain("Explain remaining deployment limits")
      const { resolveInquiryContext } = await import("./inquiry-context.ts")
      const restored = resolveInquiryContext(packets[2], packets.slice(0, 2))
      expect(restored.currentContext.sourceIndex).toHaveLength(2)
      expect(restored.currentContext.sourceWindows).toBeUndefined()
      expect(packets[2].currentContext.sourceIndex.sourceIndexDelta.upsert).toHaveLength(1)
      expect(packets[2].currentContext.sourceIndex.sourceIndexDelta.removed).toEqual([])
    } finally { await rm(root, { recursive: true, force: true }) }
  })
  test("structured purpose schemas remove legacy actions and consumer writes", () => {
    const schema = (purpose: "author" | "consume") => inquiryStepSchemas("question-checked-v1", false, "behavior", undefined, purpose).schema
    const action = (name: string) => ({ kind: "program", name, arguments: {} })
    expect(schema("author").safeParse(action("authorization_program_patch")).success).toBe(true)
    expect(schema("consume").safeParse(action("authorization_program_details")).success).toBe(true)
    expect(schema("consume").safeParse(action("authorization_program_patch")).success).toBe(false)
    expect(schema("author").safeParse({ kind: "control", controlDelta: {} }).success).toBe(false)
  })
})
