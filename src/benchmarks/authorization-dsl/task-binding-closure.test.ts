import { test, expect } from "bun:test"
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { runAuthorizationInquiry } from "./inquiry-run.ts"
import { runCodexAccountInquiry } from "../../adapters/codex-account.ts"
import { resolveInquiryContext } from "./inquiry-context.ts"
import { emptyTokenUsage } from "../../core/types.ts"
import type { LLMProvider } from "../../providers/types.ts"
import { publicFixture } from "./interprocedural-property-entrypoints.test.ts"

const proposal = { schemaVersion: "authorization-property-intent/v1", questions: [{ questionId: "q", state: "proposed", properties: [{ kind: "authorization-before-effect", requirement: "authorization before the write" }] }] }
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "bc-public-closure-")), sourceRoot = path.join(root, "source"); await mkdir(sourceRoot)
  await writeFile(path.join(sourceRoot, "entry.py"), "from helper import perform\ndef entry(user, document):\n    return perform(user, document)\n")
  await writeFile(path.join(sourceRoot, "helper.py"), "def perform(actor, target):\n    if not actor.allowed:\n        return False\n    target.sent = True\n    return target\n")
  const inquiry = { schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "Inspect entry", entryHint: "entry.py entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect authorization before the write. In this anonymous test actor.allowed permits the supplied target write; retain exceptional and deployment limits.", entryHint: "entry.py entry", premises: [] }] }
  const inputFile = path.join(root, "inquiry.json"); await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "anonymous", repository: "anonymous", sourceRef: "r", sourceRoot: "source", allowedPaths: ["."], inquiry }))
  return { root, sourceRoot, inputFile, inquiry }
}
/** Test-authored source meaning, submitted only through public model tools. */
function action(context: any) {
  if (context.taskPreparation?.state === "pending") return { kind: "prepare", proposal }
  if (context.focus.stage === "locate") return { schemaVersion: "authorization-focused-update/v1", kind: "select", focusId: context.focus.id, candidateId: context.locationTasks[0].candidates.find((s: any) => s.name === "entry").id }
  if (context.focus.stage === "interpret") {
    const task = context.tasks[0], anchors = task.sourceSkeleton.anchors, principal = anchors.find((a: any) => a.kind === "parameter" && /^(user|actor)$/.test(a.name)), resource = anchors.find((a: any) => a.kind === "parameter" && /^(document|target)$/.test(a.name)), annotations: any[] = []
    for (const a of anchors) {
      if (a.kind === "parameter") annotations.push({ anchorId: a.id, role: a.id === principal.id ? "principal" : "resource", explanation: "Test-authored meaning of the actual parameter" })
      if (a.kind === "condition") annotations.push({ anchorId: a.id, role: "condition", explanation: "Actual failed check returns before writing", condition: { op: "not", arg: { op: "truthy", language: "python", value: { binding: "actor.allowed" } } }, guardBranch: "false", principalAnchorId: principal.id, resourceAnchorId: resource.id })
      if (a.fieldWrite || a.kind === "call") annotations.push({ anchorId: a.id, role: "effect", ...(a.kind === "call" ? { facets: ["context"] } : {}), explanation: "Actual write or helper invocation; callee controls occurrence", principalAnchorId: principal.id, resourceAnchorId: resource.id })
      if (a.kind === "return") annotations.push({ anchorId: a.id, role: "context", explanation: "Actual source return with bounded outcome", returnOutcome: a.valueExpression === "False" ? "deny" : "unknown" })
    }
    const refs = context.propertyReferences, effect = refs.find((r: any) => r.kind === "call" && r.text.startsWith("perform(")), guard = refs.find((r: any) => r.kind === "condition" && r.text.includes("actor.allowed")), query = task.propertyDemand.propertyQueries.queries[0]
    return { ...task.sourceEdit.template, edits: [...annotations.flatMap(({ anchorId, ...fields }) => Object.entries(fields).map(([field, value]) => ({ anchorId, field, value }))), ...(effect && guard ? [{ field: "propertyBindings", value: [{ propertyId: query.id, effectRef: effect.ref, guardRef: guard.ref }] }] : [])] }
  }
  if (context.focus.stage === "review") return { schemaVersion: "authorization-focused-update/v1", kind: "review", focusId: context.focus.id, claims: context.claims.map((c: any) => ({ claim: c.id, verdict: "confirmed", explanation: "Current anonymous source supports this test interpretation" })) }
  if (context.focus.stage !== "answer") throw new Error(`Unexpected public phase ${context.focus.stage}`)
  return { kind: "final", ...context.answerTemplate, answers: [{ explanation: "The called helper checks the same supplied objects before its write; exceptional and deployment duties remain explicit.", missing: [{ kind: "interpretation-gap", detail: "Unspecified exceptions and deployment facts" }] }], scope: "Current two-file anonymous source" }
}
function assertClosure(report: any) {
  expect(report.taskPreparation.questions.map((q: any) => q.questionId)).toEqual(["q"])
  expect(report.taskPreparation.questions[0].properties).toHaveLength(1)
  const domain = report.domain, property = domain.propertyAnalysis.checks.questions[0].properties[0]
  expect(domain.sourceWorkMetrics.acceptedSourceUnits).toBe(2)
  expect(domain.materialUses.some((u: any) => u.kind === "call")).toBe(true)
  expect(property.status).toBe("checked")
  expect(new Set(property.traceDetails.flatMap((r: any) => r.source ? [r.source.id] : [])).size).toBe(2)
  expect(property.traceDetails.some((r: any) => r.kind === "call")).toBe(true)
  expect(domain.propertyAnalysis.checks.wholeTaskCertified).toBe(false)
  expect(domain.semantic.units.flatMap((u: any) => u.blocks.flatMap((b: any) => b.steps)).find((s: any) => s.kind === "call").domainRoles).toEqual(["effect", "context"])
}
test("ordinary inquiry closes a prepared natural property through current cross-file source tools", async () => {
  const f = await fixture(), original = await readFile(f.inputFile), requests: any[] = []; let calls = 0
  const provider: LLMProvider = { name: "mock", async complete(params) {
    requests.push(params)
    const preparing = params.tools?.some(t => t.name === "submit_task_properties"), prefix = "Current local explanation context: ", text = params.messages.at(-1)!.content
    const next = preparing ? proposal : action(JSON.parse(text.slice(text.indexOf(prefix) + prefix.length).split("\n\nRemaining dispatches:")[0]!))
    return { text: "", toolCalls: [{ id: `step-${++calls}`, name: preparing ? "submit_task_properties" : "submit_inquiry_step", arguments: next }], tokens: emptyTokenUsage(), durationMs: 0, stopReason: "tool_use" }
  }, async completeWithToolResults() { throw new Error("Unused") } }
  const run = await runAuthorizationInquiry({ ...f, provider, repository: "anonymous", sourceRef: "r", allowedPaths: ["."], method: "M", strategy: "task-binding-v1", skillContent: "FULL_ORIGINAL_SKILL", maxDispatches: 18 })
  expect(run.wireFailures).toEqual([]); assertClosure(run)
  expect(run.requests[0]!.phase).toBe("prepare")
  expect(requests.every(r => !JSON.stringify(r).includes("EVALUATOR_SENTINEL"))).toBe(true)
  expect(await readFile(f.inputFile)).toEqual(original)
})
test("official native static tools close the same unprepared natural task without injected units", async () => {
  const f = await fixture(), original = await readFile(f.inputFile), packets: any[] = []; let receive = (_m: any) => {}, serial = 0, final = false
  const sendAction = (packet: any) => {
    const context = resolveInquiryContext(packet, packets); packets.push(packet); const next: any = action(context), { kind, ...result } = next; final = kind === "final"
    queueMicrotask(() => receive({ id: `rpc-${++serial}`, method: "item/tool/call", params: { threadId: "t", turnId: "turn", callId: `call-${serial}`, tool: kind === "prepare" ? "authorization_prepare_properties" : final ? "authorization_check_result" : "authorization_observe", arguments: kind === "prepare" ? next.proposal : final ? { result } : { controlDelta: next } } }))
  }
  const transport: any = { isolation: { kind: "test-transport", reason: "Task-only preparation and current cross-file source closure" }, onMessage(f: any) { receive = f }, onExit() {}, close() {}, send(m: any) {
    if (m.method === "initialize") receive({ id: m.id, result: {} })
    if (m.method === "thread/start") receive({ id: m.id, result: { thread: { id: "t" }, model: "gpt-5.6-sol" } })
    if (m.method === "turn/start") { receive({ id: m.id, result: { turn: { id: "turn" } } }); sendAction(JSON.parse(m.params.input[0].text.split("Current local explanation context: ")[1])) }
    if (m.result?.contentItems) { const reply = JSON.parse(m.result.contentItems[0].text); if (final || serial >= 18) receive({ method: "turn/completed", params: { threadId: "t", turn: { id: "turn", status: "completed", items: [{ type: "agentMessage", text: "The current two-file source checks before writing; deployment and exception limits remain." }] } } }); else sendAction(reply.currentContext) }
  } }
  const run = await runCodexAccountInquiry({ ...f, workDir: f.root, model: "gpt-5.6-sol", method: "M", strategy: "task-binding-v1", skillContent: "FULL_ORIGINAL_SKILL", transportFactory: () => transport, timeoutMs: 5000 })
  expect(run.account.status).toBe("completed"); expect(run.account.toolRejections).toEqual([]); assertClosure(run.native)
  expect(run.native.toolBudget.checksUsed).toBeGreaterThan(0)
  expect(await readFile(f.inputFile)).toEqual(original)
})
test("offline ingestion shape keeps input-file permission separate from target-collection permission", async () => {
  // Hand-authored reduction of OWUI retrieval.py:1559-1569 and collection checks at 1781/1824.
  // It is engineering evidence, not a model-derived OWUI result.
  const f = await publicFixture({ id: "separate-input-and-target", source: "def entry(actor, target, other):\n    if not actor.allowed:\n        return False\n    return perform(actor, other)\n\ndef perform(who, item):\n    item.sent = True\n    return item\n", guard: "entry", status: "violated" }, { strategy: "task-binding-v1" })
  try { expect(f.report.propertyAnalysis!.checks!.questions[0]!.properties[0]!.status).toBe("violated") } finally { f.runtime.close() }
})
test("an offline unregistered middleware guard cannot authorize the ingestion effect", async () => {
  const f = await publicFixture({ id: "unknown-middleware", source: "def entry(actor, target):\n    target.sent = True\n    return True\n\ndef AuthMiddleware(actor, target):\n    if not actor.allowed:\n        return False\n    return True\n", guard: "AuthMiddleware", status: "unknown" }, { strategy: "task-binding-v1" })
  try { expect(f.report.propertyAnalysis!.checks!.questions[0]!.properties[0]!.status).toBe("unknown") } finally { f.runtime.close() }
})
