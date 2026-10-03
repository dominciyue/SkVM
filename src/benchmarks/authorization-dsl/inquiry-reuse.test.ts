import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { runAuthorizationInquiry } from "./inquiry-run.ts"
import { emptyTokenUsage } from "../../core/types.ts"
import { createInquiryTools } from "./inquiry-tools.ts"
import type { CompletionParams } from "../../providers/types.ts"
const api = await import("./inquiry-reuse.ts").catch(() => ({} as any))

async function fixture(conformance = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), "ar-reuse-")); await mkdir(path.join(root, "source"))
  await writeFile(path.join(root, "source/entry.ts"), "export function entry() { return true; }\n")
  const policy = { text: "Everyone may write.", origin: "user" as const, location: "current-policy" }
  const inquiry = { schemaVersion: "authorization-inquiry/v1", mode: conformance ? "conformance" : "behavior", questions: [{ id: "q", request: "Can a caller write?", entryHint: "entry", premises: [] }], ...(conformance ? { policy } : {}) }
  const input = { schemaVersion: "authorization-inquiry-input/v1", taskId: "current", repository: "neutral", sourceRef: "fixed", sourceRoot: "source", allowedPaths: ["."], inquiry }
  const run = await runAuthorizationInquiry({ repository: input.repository, sourceRef: input.sourceRef, sourceRoot: path.join(root, "source"), allowedPaths: input.allowedPaths, inquiry, method: "M", strategy: "guided-evidence-v2", provider: { name: "mock", async complete(p: CompletionParams) {
    const context = JSON.parse(p.messages[0]!.content.split("Current local explanation context: ")[1]!.split("\n\nRemaining dispatches:")[0]!), id = context.sourceWindows[0].id
    const result = { schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q", behavior: { disposition: "allow", explanation: "Old final answer must never be reused" }, branches: [], evidenceIds: [id], missing: [], ...(conformance ? { policyAssessment: { status: "satisfied", explanation: "Old policy comparison" } } : {}) }], observations: [], scope: "local" }
    return { text: "", toolCalls: [{ id: "mock-call", name: p.tools![0]!.name, arguments: { kind: "final", result, controlDelta: { schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: context.tasks[0].itemId, rules: [{ op: "add", targetKey: "entry", kind: "entry", pathKey: "p", after: [], claim: "Source entry" }, { op: "add", targetKey: "write", kind: "effect", pathKey: "p", after: ["entry"], complete: true, claim: "Source effect" }], ...(conformance ? { policyRules: [{ op: "add", targetKey: "policy", pathKey: "p", expected: "allow", text: policy.text, location: policy.location }] } : {}) }] } } }], tokens: emptyTokenUsage(), durationMs: 0, stopReason: "tool_use" as const }
  }, async completeWithToolResults() { throw new Error("Unused") } } })
  expect(run.status).toBe("completed")
  const args = { currentInput: input, previousInput: input, previousRun: run, previousSessionId: "prior", currentFiles: run.sourceFiles, currentMethod: "M", previousMethod: "M", currentStrategy: "guided-evidence-v2", previousStrategy: "guided-evidence-v2", currentModel: "mock", previousModel: "mock" }
  return { root, input, run, args }
}

test("policy-only reuse retains bounded behavior extraction and invalidates all old policy conclusions", async () => {
  const f = await fixture(true)
  expect(typeof api.planInquiryReuse).toBe("function")
  const currentInput = structuredClone(f.input); currentInput.inquiry.policy!.text = "No one may write."
  const plan = api.planInquiryReuse({ ...f.args, currentInput })
  expect(plan.status).toBe("reusable")
  expect(plan.info).toMatchObject({ change: "policy-only", answerReused: false })
  expect(plan.seed.delta.rules.map((r: any) => r.key)).toEqual(["entry", "write"])
  expect(plan.seed.delta.policyRules).toEqual([])
  expect(plan.seed.evidence).toEqual(f.run.evidence)
  expect(JSON.stringify(plan.seed)).not.toContain("Old final answer must never be reused")
  expect(JSON.stringify(plan.seed)).not.toContain("Old policy comparison")
})

test("source changes, missing footprints and incompatible strategy cannot promote old partial output", async () => {
  const f = await fixture()
  expect(typeof api.planInquiryReuse).toBe("function")
  for (const patch of [{ currentFiles: f.run.sourceFiles.map(file => ({ ...file, sha256: "changed" })) }, { previousRun: { ...f.run, validation: undefined } }, { currentStrategy: "legacy" }, { currentModel: "another" }, { currentInput: { ...f.input, allowedPaths: ["entry.ts"] } }]) {
    const plan = api.planInquiryReuse({ ...f.args, ...patch })
    expect(plan.status).toBe("needs-fresh-analysis")
    expect(plan.seed).toBeUndefined()
    expect(plan.info.answerReused).toBe(false)
    expect(plan.reasons.length).toBeGreaterThan(0)
  }
})

test("recorded checked flags cannot hide a currently invalid control extraction", async () => {
  const f = await fixture(), previousRun = structuredClone(f.run)
  previousRun.domain!.slice.rules[1]!.after = ["missing"]
  expect(api.planInquiryReuse({ ...f.args, previousRun }).status).toBe("needs-fresh-analysis")
})

test("imported evidence matches the complete current original window atomically and does not spend a read call", async () => {
  const f = await fixture(), tools = await createInquiryTools({ sourceRoot: path.join(f.root, "source"), repository: f.input.repository, sourceRef: f.input.sourceRef, allowedPaths: f.input.allowedPaths })
  expect(typeof (tools as any).restoreEvidence).toBe("function")
  const evidence = f.run.evidence[0]!
  const bad = (tools as any).restoreEvidence([evidence, { ...evidence, path: "another.ts", id: "ev-fake" }])
  expect(bad.diagnostics[0].code).toBe("reuse-evidence-mismatch")
  expect(tools.evidence).toEqual([])
  for (const patch of [{ quote: "invented" }, { text: "invented" }, { startLine: 2 }, { sha256: "changed" }, { repository: "other" }, { id: "ev-fake" }, { bytes: 0 }]) expect((tools as any).restoreEvidence([{ ...evidence, ...patch }]).diagnostics.length).toBeGreaterThan(0)
  expect((tools as any).restoreEvidence([evidence]).diagnostics).toEqual([])
  expect(tools.evidence).toEqual([evidence])
  expect(tools.toolCalls).toBe(0)
  expect((tools as any).importedEvidenceBytes).toBe(evidence.bytes)
  expect(tools.displayBytes).toBe(0)
})

test("a policy-only new run checks the current mapping with no source read and no old answer reuse", async () => {
  const f = await fixture(true), currentInput = structuredClone(f.input)
  expect(typeof api.planInquiryReuse).toBe("function")
  currentInput.inquiry.policy!.text = "No one may write."
  const plan = api.planInquiryReuse({ ...f.args, currentInput }); let calls = 0
  const run = await runAuthorizationInquiry({ repository: f.input.repository, sourceRef: f.input.sourceRef, sourceRoot: path.join(f.root, "source"), allowedPaths: f.input.allowedPaths, inquiry: currentInput.inquiry, method: "M", strategy: "guided-evidence-v2", reuse: { info: plan.info, seed: plan.seed }, provider: { name: "mock", async complete(p: CompletionParams) {
    calls++
    expect(p.messages[0]!.content).toContain("Reused source interpretation")
    expect(p.messages[0]!.content).not.toContain("Old final answer must never be reused")
    const id = plan.seed.evidence[0].id
    return { text: "", toolCalls: [{ id: "mock-call", name: p.tools![0]!.name, arguments: { kind: "final", result: { schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q", behavior: { disposition: "allow", explanation: "Current independent review of reused source behavior" }, branches: [], evidenceIds: [id], missing: [], policyAssessment: { status: "violated", explanation: "Current policy forbids writing" } }], observations: [], scope: "unchanged original source" }, controlDelta: { schemaVersion: "authorization-control-update/v1", policyRules: [{ op: "add", questionId: "q", targetKey: "policy", pathKey: "p", expected: "deny", text: currentInput.inquiry.policy!.text, location: currentInput.inquiry.policy!.location }] } } }], tokens: emptyTokenUsage(), durationMs: 0, stopReason: "tool_use" as const }
  }, async completeWithToolResults() { throw new Error("Unused") } } } as any)
  expect(run.status).toBe("completed")
  expect(calls).toBe(1)
  expect(run.result?.questions[0]?.policyAssessment?.status).toBe("violated")
  expect(run.toolHistory).toEqual([])
  expect(run.domain!.slice.rules.map(r => r.key)).toEqual(["entry", "write"])
  expect((run as any).reuse).toMatchObject({ change: "policy-only", answerReused: false })
  expect((run.sourceAccounting as any).importedEvidenceBytes).toBe(f.run.evidence[0]!.bytes)
})

test("premise reuse removes the old value and reads a newly reachable helper before current delivery", async () => {
  const f = await fixture(), oldInput: any = structuredClone(f.input)
  oldInput.inquiry.questions[0].premises = [{ text: "Enabled is false.", origin: "user" }]
  await writeFile(path.join(f.root, "source/entry.ts"), "export function entry(enabled) {\n  if (!enabled) return false;\n  return gate();\n}\n")
  await writeFile(path.join(f.root, "source/helper.ts"), "export function gate() { return true; }\n")
  const condition = (value: boolean) => ({ op: "eq", left: { binding: "enabled" }, right: { literal: value } })
  const options = { repository: f.input.repository, sourceRef: f.input.sourceRef, sourceRoot: path.join(f.root, "source"), allowedPaths: f.input.allowedPaths, method: "M" as const, strategy: "guided-evidence-v2" as const }
  const sourceRules = (id: string) => [{ op: "add", questionId: "q", targetKey: "entry", pathKey: "shared", kind: "entry", after: [], evidenceIds: [id], claim: "Entry calls gate on the enabled path" }, { op: "add", questionId: "q", targetKey: "stop", pathKey: "deny", kind: "reject", after: ["entry"], evidenceIds: [id], condition: condition(false), complete: true, claim: "Disabled caller is rejected" }, { op: "add", questionId: "q", targetKey: "write", pathKey: "allow", kind: "effect", after: ["entry"], evidenceIds: [id], condition: condition(true), complete: true, claim: "Enabled path delegates to gate" }]
  const response = (name: string, args: any) => ({ text: "", toolCalls: [{ id: "mock-call", name, arguments: args }], tokens: emptyTokenUsage(), durationMs: 0, stopReason: "tool_use" as const })
  const oldRun = await runAuthorizationInquiry({ ...options, inquiry: oldInput.inquiry, provider: { name: "mock", async complete(p: CompletionParams) {
    const context = JSON.parse(p.messages[0]!.content.split("Current local explanation context: ")[1]!.split("\n\nRemaining dispatches:")[0]!), id = context.sourceWindows[0].id
    return response(p.tools![0]!.name, { kind: "final", controlDelta: { schemaVersion: "authorization-control-update/v1", rules: sourceRules(id), premiseValues: [{ op: "add", questionId: "q", targetKey: "enabled", status: "known", value: false, text: "Enabled is false." }], dependencies: [{ op: "add", questionId: "q", targetKey: "gate", pathKey: "allow", from: "entry", symbol: "gate", kind: "control", decisive: true, condition: condition(true), evidenceIds: [id], reason: "Source outcome on enabled path" }] }, result: { schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q", behavior: { disposition: "deny", explanation: "Disabled path returns before gate" }, branches: [], evidenceIds: [id], missing: [] }], observations: [], scope: "source" } })
  }, async completeWithToolResults() { throw new Error("Unused") } } })
  expect(oldRun.status).toBe("completed")
  expect(oldRun.domain!.dependencies[0]!.state).toBe("inapplicable")
  expect(oldRun.toolHistory).toHaveLength(1)
  const currentInput = structuredClone(oldInput); currentInput.inquiry.questions[0].premises = [{ text: 'Enabled is true. The old premise "Enabled is false." no longer applies.', origin: "user" }]
  const plan = api.planInquiryReuse({ ...f.args, previousInput: oldInput, previousRun: oldRun, currentInput, currentFiles: oldRun.sourceFiles })
  expect(plan.status).toBe("reusable")
  expect(plan.seed.delta.bindings).toEqual([])
  expect(plan.info.invalidatedPremiseKeys).toEqual(["q.enabled"])
  let calls = 0
  const currentRun = await runAuthorizationInquiry({ ...options, inquiry: currentInput.inquiry, reuse: { info: plan.info, seed: plan.seed }, provider: { name: "mock", async complete(p: CompletionParams) {
    calls++
    const context = JSON.parse(p.messages[0]!.content.split("Current local explanation context: ")[1]!.split("\n\nRemaining dispatches:")[0]!), task = context.tasks.find((t: any) => t.duty.symbol === "gate")
    expect(task).toBeDefined()
    expect(context.sourceWindows.some((e: any) => e.path === "helper.ts" && e.text.includes("return true"))).toBe(true)
    return response(p.tools![0]!.name, { kind: "final", controlDelta: { schemaVersion: "authorization-control-update/v1", premiseValues: [{ op: "add", questionId: "q", targetKey: "enabled", status: "known", value: true, text: "Enabled is true." }], localExtractions: [{ itemId: task.itemId, rules: [{ op: "add", targetKey: "gate-result", pathKey: "allow", kind: "continue", after: ["entry"], condition: condition(true), claim: "The actual gate returns true" }] }], rules: [{ op: "replace", questionId: "q", targetKey: "write", pathKey: "allow", kind: "effect", after: ["gate-result"], condition: condition(true), complete: true, evidenceIds: [task.evidenceIds[0]], claim: "Gate permits the current enabled path", reason: "Bind the newly activated original helper" }] }, result: { schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q", behavior: { disposition: "allow", explanation: "Current enabled path reaches gate, which returns true" }, branches: [], evidenceIds: [task.evidenceIds[0]], missing: [] }], observations: [], scope: "unchanged source, current premise" } })
  }, async completeWithToolResults() { throw new Error("Unused") } } } as any)
  expect(currentRun.status).toBe("completed")
  expect(calls).toBe(1)
  expect(currentRun.toolHistory.map(h => (h.arguments as any).path)).toEqual(["helper.ts"])
  expect(currentRun.domain!.dependencies[0]!.state).toBe("checked")
  expect(currentRun.domain!.check!.paths.find(p => p.pathKey === "deny")!.state).toBe("inapplicable")
  expect(currentRun.domain!.check!.paths.find(p => p.pathKey === "allow")!.state).toBe("checked")
  expect(currentRun.result?.questions[0]?.behavior.disposition).toBe("allow")
})
