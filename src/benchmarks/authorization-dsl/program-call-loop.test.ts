import { expect, test } from "bun:test"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { runCodexAccountInquiry } from "../../adapters/codex-account.ts"
import { resolveInquiryContext } from "./inquiry-context.ts"

test("account author reads source, diagnoses call, patches, trials and delivers on the current revision", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "call-loop-"))
  try {
    await writeFile(path.join(root, "app.py"), "def work():\n    result = remote()\n    return 7\n\ndef sibling():\n    return None\n")
    const inputFile = path.join(root, "input.json"), at = { path: "app.py", startLine: 1, endLine: 3 }, callAt = { path: "app.py", startLine: 2, endLine: 2 }
    await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "call-loop", repository: "anonymous", sourceRef: "fixed", sourceRoot: ".", allowedPaths: ["app.py"], inquiry: { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Explain call completion and the result", premises: [] }] }, resourceInputs: { q: {} }, externalAssumptions: { q: [{ name: "remote", arguments: {}, value: null, reason: "Normal None return" }] } }))
    const raw: any = { schemaVersion: "authorization-executable-contract/v1", id: "work", scope: { kind: "function-contract", questionId: "q", root: at, upstream: [] }, sourceDeclarations: [{ source: at, statements: [] }], queries: [], assumptions: [], resourceWorkflow: { inputs: [], steps: [{ id: "invoke", op: "external", name: "remote", arguments: {}, source: callAt }, { id: "result", op: "return", value: { literal: 7 }, source: at }] } }
    const packets: any[] = [], results: any[] = [], contexts: any[] = [], advertised: any[] = []
    let receive = (_m: any) => {}, action = 0, current: any
    const decode = (wire: any) => { if (wire.contextSequence === 1) packets.length = 0; const restored = resolveInquiryContext(wire, packets); packets.push(restored); return restored }
    const next = () => {
      let tool = "", args: any
      if (action === 0) { tool = "source_read"; args = at }
      if (action === 1) { tool = "authorization_program"; args = raw }
      if (action === 2) { tool = "authorization_program_patch"; args = { baseRevision: current.authoring.draftRevision, upsertSteps: [{ id: "complete", op: "guard", test: { op: "eq", left: { binding: "invoke" }, right: { binding: "invoke" } }, failure: "normal-completion-unresolved", source: callAt }], stepOrder: ["invoke", "complete", "result"], authoringTarget: { mode: "reusable", coverage: [{ id: "invoke-call", source: callAt, stepIds: ["invoke", "complete"], disposition: "implemented", call: { stepId: "invoke", activation: "always", completion: "required", completionGuardId: "complete", completionMeaning: "normal-return", successorStepIds: ["result"], resultUse: "ignored", reason: "Source ignores the value but must complete the call before return." } }] } } }
      if (action === 3) { tool = "authorization_program_trial"; args = { expectedRevision: current.authoring.draftRevision, cases: [{ id: "normal-false", resourceInputs: {}, externalAssumptions: [{ name: "remote", arguments: {}, value: false, reason: "Normal False return" }] }, { id: "unknown", resourceInputs: {}, externalAssumptions: [] }] } }
      if (action === 4) { tool = "authorization_program_details"; args = { view: "draft", expectedRevision: current.authoring.draftRevision, stepId: "invoke" } }
      if (action === 5) { tool = "authorization_program_details"; args = { questionId: "q" } }
      if (action === 6) { receive({ method: "turn/completed", params: { threadId: "calls", turn: { id: "turn", status: "completed", items: [{ type: "agentMessage", phase: "final_answer", text: "The source returns 7 after remote completes normally. Its False or None value is ignored; without a completion fact the result remains conditional." }] } } }); return }
      receive({ id: `rpc-${action++}`, method: "item/tool/call", params: { threadId: "calls", turnId: "turn", callId: `call-${action}`, tool, arguments: args } })
    }
    const transportFactory: any = () => ({ isolation: { kind: "test-transport" }, onMessage(fn: any) { receive = fn }, onExit() {}, close() {}, send(m: any) {
      if (m.method === "initialize") receive({ id: m.id, result: {} })
      if (m.method === "thread/start") { advertised.push(...m.params.dynamicTools); receive({ id: m.id, result: { thread: { id: "calls" }, model: "gpt-5.6-sol" } }) }
      if (m.method === "turn/start") { current = decode(JSON.parse(m.params.input[0].text.split("Current local explanation context: ")[1])); receive({ id: m.id, result: { turn: { id: "turn" } } }); queueMicrotask(next) }
      if (m.result?.contentItems) { const packet = decode(JSON.parse(m.result.contentItems[0].text)); results.push(packet.toolResult); current = packet.currentContext; contexts.push(current); queueMicrotask(next) }
    } })
    const run = await runCodexAccountInquiry({ inputFile, workDir: root, model: "gpt-5.6-sol", skillContent: "Explain source and remaining conditions", strategy: "question-checked-v1", method: "M", domainTools: true, programMode: "edit", programContext: "directed", executionPolicy: "progressive", maxAuthorContinuations: 0, maxToolCalls: 16, timeoutMs: 10000, transportFactory })
    expect(run.account.status).toBe("completed")
    for (const name of ["authorization_program", "authorization_program_patch"]) {
      const description = advertised.find(t => t.name === name).description
      expect(description).toContain("when:finitePredicate")
      expect(description).toContain("False and None")
      expect(description).toContain("completionGuardId")
      expect(description).toContain("activationDependencyIds")
    }
    expect(advertised.find(t => t.name === "authorization_program_details").description).toContain('format:"raw"')
    expect(contexts[1].authoring.feedbackGroups.callRelations[0].diagnostics).toContain("call-result-unused-completion-unreviewed")
    expect(contexts[2].authoring.feedbackGroups.callRelations).toEqual([])
    expect(contexts[2].authoring.candidatePreviewAvailable, JSON.stringify(results[2])).toBe(true)
    expect(results[3].status, JSON.stringify(results[3])).toBe("completed")
    expect(results[3].cases[0].execution.returned).toBe(7)
    expect(results[3].cases[0].execution.conditions).toEqual([])
    expect(results[3].cases[1].execution.conditions).toHaveLength(1)
    expect(results[3].cases[1].callRelations[0].completionGuard.outcome).toBe("unresolved")
    expect(results[4].callRelations[0].trials.map((t: any) => t.id)).toEqual(["normal-false", "unknown"])
    expect(results[5].format).toBe("overview")
    expect(run.account.text).toContain("conditional")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("rules account maintenance exposes raw/schema only through source patch details and final child", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "rules-loop-"))
  try {
    const at = { path: "app.py", startLine: 1, endLine: 2 }, inputFile = path.join(root, "input.json"), programFile = path.join(root, "program.json")
    await writeFile(path.join(root, "app.py"), "def work():\n    return 7\n\ndef sibling():\n    return None\n")
    await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "rules-loop", repository: "anonymous", sourceRef: "fixed", sourceRoot: ".", allowedPaths: ["app.py"], inquiry: { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Explain the source result and all remaining conditions", premises: [] }] }, resourceInputs: { q: {} } }))
    const raw: any = { schemaVersion: "authorization-executable-contract/v1", id: "work", scope: { kind: "function-contract", questionId: "q", root: at, upstream: [] }, sourceDeclarations: [{ source: at, statements: [] }], queries: [], assumptions: [], resourceWorkflow: { inputs: [], steps: [{ id: "result", op: "return", value: { literal: 7 }, source: at }] } }
    await writeFile(programFile, JSON.stringify(raw))
    const advertised: any[] = [], visible: any[] = [], packets: any[] = []
    let receive = (_m: any) => {}, action = 0, current: any, child = 0
    const decode = (wire: any) => { if (wire.contextSequence === 1) packets.length = 0; const restored = resolveInquiryContext(wire, packets); packets.push(restored); visible.push(restored); return restored }
    const next = () => {
      if (child > 1) { receive({ method: "turn/completed", params: { threadId: "child", turn: { id: "final", status: "completed", items: [{ type: "agentMessage", phase: "final_answer", text: "The authored rule says 8; source says 7. No host computation was supplied." }] } } }); return }
      const calls = [
        ["source_read", at],
        ["authorization_program_details", { view: "draft", format: "raw" }],
        ["authorization_program_patch", { baseRevision: current?.authoring?.draftRevision, upsertSteps: [{ id: "result", op: "return", value: { literal: 8 }, source: at }] }],
        ["authorization_program_details", { view: "draft", format: "overview" }],
      ]
      if (action === calls.length) { receive({ method: "turn/completed", params: { threadId: "rules", turn: { id: "turn", status: "completed", items: [] } } }); return }
      const [tool, args] = calls[action++]!; receive({ id: `rpc-${action}`, method: "item/tool/call", params: { threadId: "rules", turnId: "turn", callId: `call-${action}`, tool, arguments: args } })
    }
    const transportFactory: any = () => ({ isolation: { kind: "test-transport" }, onMessage(fn: any) { receive = fn }, onExit() {}, close() {}, send(m: any) {
      if (m.method === "initialize") receive({ id: m.id, result: {} })
      if (m.method === "thread/start") { child++; advertised.push(m.params); receive({ id: m.id, result: { thread: { id: child > 1 ? "child" : "rules" }, model: "gpt-5.6-sol" } }) }
      if (m.method === "turn/start") { current = decode(JSON.parse(m.params.input[0].text.split("Current local explanation context: ")[1])); receive({ id: m.id, result: { turn: { id: child > 1 ? "final" : "turn" } } }); queueMicrotask(next) }
      if (m.result?.contentItems) { const packet = decode(JSON.parse(m.result.contentItems[0].text)); current = packet.currentContext; queueMicrotask(next) }
    } })
    const run = await runCodexAccountInquiry({ inputFile, domainProgramFile: programFile, workDir: root, model: "gpt-5.6-sol", strategy: "question-checked-v1", method: "M", domainTools: true, programMode: "edit", programSupport: "rules", programContext: "directed", authoringTargetMode: "reusable", executionPolicy: "progressive", maxAuthorContinuations: 0, maxToolCalls: 16, timeoutMs: 10000, transportFactory,
      reuse: { info: {}, seed: { evidence: [], programDraft: { raw, candidate: { resourceExecution: { returned: "LEAK_FROM_PRIOR" } }, trials: [{ result: "LEAK_FROM_PRIOR" }] } } } } as any)
    expect(run.account.status).toBe("completed")
    expect(child).toBe(2)
    expect(advertised[0].dynamicTools.some((t: any) => t.name === "authorization_program_trial")).toBe(false)
    expect(advertised[0].dynamicTools.some((t: any) => t.name === "authorization_program_patch")).toBe(true)
    expect(advertised[1].dynamicTools).toEqual([])
    expect(visible[0].instruction).toContain("A prose-only investigation does not fulfill edit mode")
    expect(visible[0].authoring.target.mode).toBe("reusable")
    expect(visible[0].authoring.target.instruction).not.toContain("authorization_program_trial")
    const text = JSON.stringify(visible)
    expect(text).not.toContain("LEAK_FROM_PRIOR")
    for (const key of ["resourceExecution", "outcome", "events", "computed", "propertyChecks", "candidatePreviewAvailable", "returned"]) expect(text).not.toContain(`"${key}":`)
    expect(text).toContain("authorization-program-rules/v1")
    expect(run.native.domain?.executableContract?.resourceExecution).toBeUndefined()
    expect((run.native.domain as any)?.programDraft?.currentDraft.raw.resourceWorkflow.steps[0].value.literal).toBe(8)
  } finally { await rm(root, { recursive: true, force: true }) }
})
