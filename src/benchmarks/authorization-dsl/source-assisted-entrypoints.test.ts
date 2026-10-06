import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { runAuthorizationInquiry } from "./inquiry-run.ts"
import { BareAgentAdapter } from "../../adapters/bare-agent.ts"
import { emptyTokenUsage } from "../../core/types.ts"
import type { LLMProvider, CompletionParams, LLMResponse } from "../../providers/types.ts"
import type { InquiryStrategy } from "../../task-dsl/authorization/control-slice.ts"
import type { SourceSkeleton } from "./evidence-preparation/source-skeleton.ts"
import { ProviderNetworkError } from "../../providers/errors.ts"

const strategy = "operation-evidence-v2" as InquiryStrategy
const brief = "Inspect entry and explain its source authorization outcome and limits."
const inquiry = { schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "inspect", request: brief }], questions: [{ id: "q", operationId: "inspect", intent: "behavior", request: brief, premises: [] }] }
const response = (text: string, toolCalls: LLMResponse["toolCalls"] = []): LLMResponse => ({ text, toolCalls, tokens: emptyTokenUsage(), durationMs: 0, stopReason: toolCalls.length ? "tool_use" : "end_turn" })
interface MockContext { focus: { id: string; stage: string }; locationTasks: Array<{ candidates: Array<{ id: string }> }>; tasks: Array<{ sourceSkeleton: SourceSkeleton }>; questions: Array<{ id: string }>; answerSnapshot?: Array<{ path: number }>; claims?: Array<{ id: string }> }
function currentContext(params: CompletionParams) {
  const prefix = "Current local explanation context: "
  const message = [...params.messages].reverse().find(m => m.content.includes(prefix))!.content
  const text = message.slice(message.indexOf(prefix) + prefix.length).split("\n\nRemaining dispatches:")[0]!
  return JSON.parse(text) as MockContext
}
function action(context: MockContext, stages: string[]) {
  const { focus } = context; stages.push(focus.stage)
  if (focus.stage === "locate") return { schemaVersion: "authorization-focused-update/v1", kind: "select", focusId: focus.id, candidateId: context.locationTasks[0]!.candidates[0]!.id }
  if (focus.stage === "interpret") {
    const skeleton = context.tasks[0]!.sourceSkeleton
    expect(skeleton.modelCovered).toBe(true)
    const originalReturn = skeleton.anchors.find(a => a.kind === "return")!
    expect(originalReturn.text).toContain("False")
    return { schemaVersion: "authorization-source-update/v1", kind: "interpret", focusId: focus.id, interpretation: { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations: [{ anchorId: originalReturn.id, role: "context", explanation: "The shown entry returns False", returnOutcome: "deny" }], unresolved: [] } }
  }
  if (focus.stage === "review") return { schemaVersion: "authorization-focused-update/v1", kind: "review", focusId: focus.id, claims: context.claims!.map(c => ({ claim: c.id, verdict: "confirmed", explanation: "Confirmed in the shown original" })) }
  expect(focus.stage).toBe("answer")
  return { kind: "final", schemaVersion: "authorization-focused-result/v1", focusId: focus.id, answers: context.questions.map(() => ({ explanation: "The shown entry returns False and denies this source path; deployment remains outside scope.", disposition: "deny", paths: context.answerSnapshot!.map(p => ({ path: p.path, explanation: "The original return denies the path", disposition: "deny" })) })), scope: "Only the provided entry source" }
}
async function fixture(completeDeclaration = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), "av-public-source-")); await mkdir(path.join(root, "source"))
  await writeFile(path.join(root, "source/app.py"), "def entry():\n    return False\n")
  const inputFile = path.join(root, "input.json")
  await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "anonymous", repository: "anonymous", sourceRef: "fixed", sourceRoot: "source", allowedPaths: ["app.py"], ...(completeDeclaration ? { inquiry } : { brief }) }))
  return { root, inputFile, sourceRoot: path.join(root, "source") }
}

for (const completeDeclaration of [false, true]) for (const method of ["M", "D1"] as const) test(`public source-assisted inquiry ${method} ${completeDeclaration ? "complete declaration" : "natural brief"} consumes original source annotations and checks the same natural answer`, async () => {
  const { sourceRoot } = await fixture(completeDeclaration), stages: string[] = []; let declarations = 0
  const provider: LLMProvider = { name: "mock", complete: async params => {
    const author = params.tools?.[0]?.name === "submit_inquiry_declaration"
    if (author) { declarations++; return response("", [{ id: "declare", name: params.tools![0]!.name, arguments: inquiry }]) }
    return response("", [{ id: "step", name: params.tools![0]!.name, arguments: action(currentContext(params), stages) }])
  }, completeWithToolResults: async () => { throw new Error("Unused") } }
  const run = await runAuthorizationInquiry({ sourceRoot, repository: "anonymous", sourceRef: "fixed", allowedPaths: ["app.py"], ...(completeDeclaration ? { inquiry } : { brief }), provider, method, strategy, maxDispatches: 12 })
  expect(run.status).toBe("completed")
  expect(declarations).toBe(method === "D1" && !completeDeclaration ? 1 : 0)
  expect(stages).toContain("locate"); expect(stages).toContain("interpret"); expect(stages).toContain("answer")
  expect(run.toolHistory.some(h => h.name === "source_read")).toBe(true)
  expect(run.domain?.sourceWorkMetrics).toMatchObject({ sourceInterpretationSubmissions: 1, lowLevelFallbacks: 0 })
  expect(run.validation?.valid).toBe(true)
  expect(JSON.stringify(run.final)).toContain("The shown entry returns False")
})

for (const completeDeclaration of [false, true]) for (const method of ["M", "D1"] as const) test(`ordinary full-skill source-assisted ${method} ${completeDeclaration ? "complete declaration" : "natural brief"} uses the same core through real continuation and prose delivery`, async () => {
  const { root, inputFile } = await fixture(completeDeclaration), stages: string[] = []; let declarations = 0, deliveries = 0
  const complete = async (params: CompletionParams) => {
    expect(params.system).toContain("FULL_ORIGINAL_TAIL")
    expect(params.tools?.map(t => t.name)).not.toContain("write_file")
    if (!params.tools?.length) { deliveries++; return response("The shown entry returns False and denies this source path; deployment remains outside scope.") }
    if (params.tools.some(t => t.name === "authorization_compile")) { declarations++; return response("", [{ id: "declare", name: "authorization_compile", arguments: { inquiry } }]) }
    const value = action(currentContext(params), stages)
    if (value.kind === "final") { const { kind: _kind, ...result } = value; return response("", [{ id: "check", name: "authorization_check_result", arguments: { result } }]) }
    return response("", [{ id: "interpret", name: "authorization_observe", arguments: { controlDelta: value } }])
  }
  const provider: LLMProvider = { name: "mock", complete, completeWithToolResults: (params, results) => { expect(results.length).toBeGreaterThan(0); return complete(params) } }
  const adapter = new BareAgentAdapter(() => provider)
  await adapter.setup({ model: "mock/model", maxSteps: 12, timeoutMs: 10000, providerOptions: { authorizationScope: inputFile, authorizationDomainTools: true, authorizationStrategy: strategy, authorizationMethod: method } })
  const run = await adapter.run({ prompt: brief, workDir: root, skill: { content: "Inspect complete source. FULL_ORIGINAL_TAIL", meta: { name: "original", description: "Full original skill" }, mode: "inject" } })
  expect(run.runStatus).toBe("ok")
  expect(run.text).toContain("returns False")
  expect(declarations).toBe(method === "D1" && !completeDeclaration ? 1 : 0); expect(deliveries).toBe(1)
  expect(stages).toContain("locate"); expect(stages).toContain("interpret"); expect(stages).toContain("answer")
  const native = run.authorizationInquiry as { result?: unknown; domain: { sourceWorkMetrics: { sourceInterpretationSubmissions: number; lowLevelFallbacks: number }; delivery: { check: { ruleConsistency: boolean } } } }
  expect(native.result).toBeDefined()
  expect(native.domain.sourceWorkMetrics).toMatchObject({ sourceInterpretationSubmissions: 1, lowLevelFallbacks: 0 })
  expect(native.domain.delivery.check.ruleConsistency).toBe(true)
})

test("ordinary source-only recovery preserves unknown billing while accepting one current response", async () => {
  const { root, inputFile } = await fixture(); let calls = 0
  const provider: LLMProvider = { name: "mock", supportsAbortSignal: true, complete: async () => { if (++calls === 1) throw new ProviderNetworkError("Request timed out", "mock"); return response("Current read-only source answer with unresolved source duties") }, completeWithToolResults: async () => { throw new Error("Unused") } }
  const adapter = new BareAgentAdapter(() => provider)
  await adapter.setup({ model: "mock/model", maxSteps: 24, timeoutMs: 10000, providerOptions: { authorizationScope: inputFile, authorizationReadonlyRecovery: true, authorizationMaxProviderCalls: 24, authorizationSessionTimeoutMs: 7500000 } })
  const run = await adapter.run({ prompt: brief, workDir: root })
  expect(calls).toBe(2)
  expect(run.runStatus).toBe("ok")
  expect(run.text).toContain("Current read-only")
  const native = run.authorizationInquiry as { attempts: Array<{ status: string; localConsumer: string; recovery?: { parentAttemptId: string } }>; telemetry: { providerCalls: number; unknownUsageCalls: number; totalActualUsd: null } }
  expect(native.attempts[0]).toMatchObject({ status: "timeout", localConsumer: "closed" })
  expect(native.attempts[1]).toMatchObject({ status: "response", localConsumer: "accepted", recovery: { parentAttemptId: "provider-attempt-1" } })
  expect(native.telemetry).toMatchObject({ providerCalls: 2, unknownUsageCalls: 1, totalActualUsd: null })
})

for (const method of ["M", "D1"] as const) test(`v2 public ${method} retains source behavior when conformance policy is unspecified`, async () => {
  const { root, sourceRoot } = await fixture(), stages: string[] = []
  const missingPolicy = { ...inquiry, mode: "conformance" }
  const provider: LLMProvider = { name: "mock", complete: async params => params.tools?.[0]?.name === "submit_inquiry_declaration" ? response("", [{ id: "declare", name: params.tools[0]!.name, arguments: missingPolicy }]) : response("", [{ id: "step", name: params.tools![0]!.name, arguments: action(currentContext(params), stages) }]), completeWithToolResults: async () => { throw new Error("Unused") } }
  const run = await runAuthorizationInquiry({ sourceRoot, repository: "anonymous", sourceRef: "fixed", allowedPaths: ["app.py"], brief, mode: "conformance", provider, method, strategy, maxDispatches: 12 })
  expect(run.domain?.delivery?.gaps).toContainEqual(expect.objectContaining({ kind: "policy-unspecified", affects: "conformance" }))
  expect(run.domain?.delivery?.machineAnswer).toMatchObject({ questions: [expect.objectContaining({ behavior: { disposition: "deny", explanation: expect.any(String) }, policyAssessment: { status: "undetermined", explanation: expect.any(String) } })] })
  const inputFile = path.join(root, "conformance.json")
  await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "anonymous", repository: "anonymous", sourceRef: "fixed", sourceRoot: "source", allowedPaths: ["app.py"], inquiry: missingPolicy }))
  const { checkAuthorizationInquiry } = await import("./inquiry-local.ts")
  expect((await checkAuthorizationInquiry(inputFile, method, strategy)).status).toBe("valid")
  expect((await checkAuthorizationInquiry(inputFile, method, "operation-evidence-v1")).status).toBe("invalid")
})
