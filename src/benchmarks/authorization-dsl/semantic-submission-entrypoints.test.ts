import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { runAuthorizationInquiry } from "./inquiry-run.ts"
import { createNativeInquiryRuntime } from "./inquiry-native.ts"
import { runCodexAccountInquiry } from "../../adapters/codex-account.ts"
import { resolveInquiryContext } from "./inquiry-context.ts"
import { emptyTokenUsage } from "../../core/types.ts"
import type { LLMProvider } from "../../providers/types.ts"

const brief = "Inspect app.entry: authorization before the item write and its remaining limits"
const inquiry = { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: brief, premises: [], properties: [{ id: "auth", kind: "authorization-before-effect", requirement: "authorization before the item write" }] }] }
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ba-public-binding-")), sourceRoot = path.join(root, "source"); await mkdir(sourceRoot)
  await writeFile(path.join(sourceRoot, "app.py"), "def entry(actor, item):\n    if not actor.allowed:\n        return False\n    item.sent = True\n    return True\n")
  const inputFile = path.join(root, "input.json"); await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "t", repository: "anonymous", sourceRef: "fixed", sourceRoot: "source", allowedPaths: ["app.py"], inquiry }))
  return { root, sourceRoot, inputFile }
}
function action(context: any) {
  if (context.focus.stage === "locate") return { schemaVersion: "authorization-focused-update/v1", kind: "select", focusId: context.focus.id, candidateId: context.locationTasks[0].candidates[0].id }
  if (context.focus.stage === "interpret") {
    const task = context.tasks[0], anchors = task.sourceSkeleton.anchors
    const actor = anchors.find((a: any) => a.kind === "parameter" && a.name === "actor"), item = anchors.find((a: any) => a.kind === "parameter" && a.name === "item"), guard = anchors.find((a: any) => a.kind === "condition"), effect = anchors.find((a: any) => a.fieldWrite?.field === "sent")
    expect(actor && item && guard && effect).toBeTruthy()
    const annotations = [{ anchorId: actor.id, role: "principal", explanation: "Source actor parameter" }, { anchorId: item.id, role: "resource", explanation: "Source item parameter" }, { anchorId: guard.id, role: "condition", explanation: "False allowed value returns before the write", condition: { op: "not", arg: { op: "truthy", language: "python", value: { binding: "actor.allowed" } } }, guardBranch: "false", principalAnchorId: actor.id, resourceAnchorId: item.id }, { anchorId: effect.id, role: "effect", explanation: "Actual item.sent write", principalAnchorId: actor.id, resourceAnchorId: item.id, authorizedByAnchorIds: [guard.id] }, ...anchors.filter((a: any) => a.kind === "return").map((a: any) => ({ anchorId: a.id, role: "context", explanation: "Literal source return", returnOutcome: a.valueExpression === "False" ? "deny" : "allow" }))]
    return { ...task.sourceEdit.template, edits: [...annotations.flatMap(({ anchorId, ...fields }) => Object.entries(fields).map(([field, value]) => ({ anchorId, field, value }))), { field: "propertyBindings", value: [{ propertyId: "auth", effectAnchorId: effect.id, guardAnchorId: guard.id }] }] }
  }
  if (context.focus.stage === "review") return { schemaVersion: "authorization-focused-update/v1", kind: "review", focusId: context.focus.id, claims: context.claims.map((c: any) => ({ claim: c.id, verdict: "confirmed", explanation: "The displayed source has this local relation" })) }
  if (context.focus.stage !== "answer") throw new Error(`Unexpected public phase ${context.focus.stage}`)
  return { kind: "final", ...context.answerTemplate, answers: [{ explanation: "The false branch returns before the item write. External state remains unspecified.", missing: [{ kind: "premise-unknown", detail: "actor.allowed is not supplied" }] }], scope: "Only the shown app.entry body" }
}
function assertAdoption(domain: any) {
  expect(domain.sourceWorkMetrics.acceptedSourceUnits).toBe(1)
  expect(domain.sourceMaterials.materials).toHaveLength(1)
  expect(domain.materialUses).toHaveLength(1)
  const queries = domain.propertyAnalysis.demands.flatMap((d: any) => d.dependencies?.propertyQueries?.queries ?? [])
  expect(queries.some((q: any) => q.id === "auth" && q.state === "bound")).toBe(true)
  const checked = domain.propertyAnalysis.checks.questions[0].properties[0]
  expect(checked.status).toBe("checked")
  expect(checked.trace.length).toBeGreaterThan(0)
  expect(domain.checkHistory.length).toBeGreaterThan(0)
}
test("official static tools consume public source edits, bind a query and inspect adopted control", async () => {
  const f = await fixture(), packets: any[] = [], replies: any[] = []; let receive = (_m: any) => {}, serial = 0, checking = false
  const sendAction = (packet: any) => {
    const context = resolveInquiryContext(packet, packets); packets.push(packet)
    const next: any = action(context), final = next.kind === "final", { kind: _kind, ...result } = next
    checking = final
    queueMicrotask(() => receive({ id: `rpc-${++serial}`, method: "item/tool/call", params: { threadId: "t", turnId: "turn", callId: `call-${serial}`, tool: final ? "authorization_check_result" : "authorization_observe", arguments: final ? { result } : { controlDelta: next } } }))
  }
  const transport: any = { isolation: { kind: "test-transport", reason: "Public contract driven static-tool fixture" }, onMessage(f: any) { receive = f }, onExit() {}, close() {}, send(m: any) {
    if (m.method === "initialize") receive({ id: m.id, result: {} })
    if (m.method === "thread/start") receive({ id: m.id, result: { thread: { id: "t" }, model: "gpt-5.6-sol" } })
    if (m.method === "turn/start") { receive({ id: m.id, result: { turn: { id: "turn" } } }); const text = m.params.input[0].text; sendAction(JSON.parse(text.split("Current local explanation context: ")[1])) }
    if (m.result?.contentItems) { const reply = JSON.parse(m.result.contentItems[0].text); replies.push(reply.toolResult); if (checking || serial >= 8) receive({ method: "turn/completed", params: { threadId: "t", turn: { id: "turn", status: "completed", items: [{ type: "agentMessage", text: "The source condition guards the item write; external state is unknown." }] } } }); else sendAction(reply.currentContext) }
  } }
  const run = await runCodexAccountInquiry({ ...f, inputFile: f.inputFile, workDir: f.root, model: "gpt-5.6-sol", method: "M", strategy: "operation-evidence-v6", skillContent: "FULL_ORIGINAL_TAIL", transportFactory: () => transport, timeoutMs: 5000 })
  expect(run.account.status).toBe("completed"); expect(run.account.toolRejections).toEqual([])
  expect(run.account.tools.some(t => t.name === "authorization_check_result")).toBe(true)
  expect(replies.flatMap(r => r.controlDiagnostics ?? r.diagnostics ?? []).filter(d => /source-edit-|source-interpretation-|schema|stale/.test(d.code))).toEqual([])
  assertAdoption(run.native.domain)
})
test("ordinary structured inquiry consumes the same public edit without injected semantic units", async () => {
  const f = await fixture(); let calls = 0
  const provider: LLMProvider = { name: "mock", complete: async params => {
    expect(params.system).toContain("FULL_ORIGINAL_TAIL")
    const prefix = "Current local explanation context: ", text = params.messages.at(-1)!.content, context = JSON.parse(text.slice(text.indexOf(prefix) + prefix.length).split("\n\nRemaining dispatches:")[0]!)
    return { text: "", toolCalls: [{ id: `step-${++calls}`, name: "submit_inquiry_step", arguments: action(context) }], tokens: emptyTokenUsage(), durationMs: 0, stopReason: "tool_use" }
  }, completeWithToolResults: async () => { throw new Error("Unused") } }
  const run = await runAuthorizationInquiry({ ...f, sourceRoot: f.sourceRoot, repository: "anonymous", sourceRef: "fixed", allowedPaths: ["app.py"], inquiry, brief, provider, method: "M", strategy: "operation-evidence-v6", skillContent: "FULL_ORIGINAL_TAIL", maxDispatches: 12 })
  expect(run.wireFailures).toEqual([])
  assertAdoption(run.domain)
})

test("natural and declaration frontends retain an identical host program from common facts", async () => {
  const f = await fixture(), m = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "operation-evidence-v6", method: "M" }), d = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "operation-evidence-v6", method: "D1" })
  try {
    expect(m.report().program).toEqual(d.report().program)
    expect(m.system).toContain('"naturalTask"')
    expect(d.system).toContain('"inquiry"')
    expect(m.system).toContain(brief); expect(d.system).toContain(brief)
    expect(m.definitions).toEqual(d.definitions)
  } finally { await m.close(); await d.close() }
})
