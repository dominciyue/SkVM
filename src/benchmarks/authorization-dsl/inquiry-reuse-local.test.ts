import { expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { executeLocalInquiryRun, inspectLocalInquiry, compareLocalInquiry } from "./inquiry-local.ts"
import { runAuthorizationCli } from "../../cli/authorization.ts"
import { emptyTokenUsage } from "../../core/types.ts"

test("legacy precompile author failure derives only missing strategy metadata from its session", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ar-precompile-")); await mkdir(path.join(root, "source"))
  await writeFile(path.join(root, "source/entry.ts"), "export function entry() { return false; }\n")
  const inputFile = path.join(root, "input.json")
  await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "anonymous", repository: "neutral", sourceRef: "fixed", sourceRoot: "source", allowedPaths: ["."], brief: "Trace entry authorization", mode: "behavior" }))
  const report: any = await executeLocalInquiryRun({ inputFile, outDir: path.join(root, "runs"), model: "mock", method: "D1", strategy: "focused-closure-v1", execution: { maxDispatches: 2 }, providerFactory: () => ({ name: "mock", async complete() { return { text: "{}", toolCalls: [], tokens: emptyTokenUsage(), durationMs: 0, stopReason: "end_turn" } }, async completeWithToolResults() { throw new Error("unused") } }) })
  const runFile = path.join(report.sessionPath, "run.json"), run = JSON.parse(await readFile(runFile, "utf8"))
  delete run.strategy; await writeFile(runFile, JSON.stringify(run))
  expect((await inspectLocalInquiry(report.sessionPath)).strategy).toBe("focused-closure-v1")
  expect((await inspectLocalInquiry(report.sessionPath)).strategyMetadataOrigin).toBe("precompile-session-identity")
  expect((await inspectLocalInquiry(report.sessionPath)).result).toBeUndefined()
  run.inquiry = {}; await writeFile(runFile, JSON.stringify(run))
  await expect(inspectLocalInquiry(report.sessionPath)).rejects.toThrow("identity")
})

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ar-reuse-local-")); await mkdir(path.join(root, "source"))
  const source = "export function entry() { return true; }\n"
  await writeFile(path.join(root, "source/entry.ts"), source)
  const policy = { text: "Everyone may write.", origin: "user", location: "current-policy" }
  const input = { schemaVersion: "authorization-inquiry-input/v1", taskId: "current", repository: "neutral", sourceRef: "fixed", sourceRoot: "source", allowedPaths: ["."], inquiry: { schemaVersion: "authorization-inquiry/v1", mode: "conformance", policy, questions: [{ id: "q", request: "Can a caller write?", entryHint: "entry", premises: [] }] } }
  const inputFile = path.join(root, "input.json"), changedFile = path.join(root, "changed.json")
  await writeFile(inputFile, JSON.stringify(input))
  const changed = structuredClone(input); changed.inquiry.policy.text = "No one may write."
  await writeFile(changedFile, JSON.stringify(changed))
  let calls = 0, factories = 0
  const factory = (current = false) => { factories++; return { name: "mock", async complete(p: any) {
    calls++
    const prompt = p.messages[0].content, context = JSON.parse(prompt.split("Current local explanation context: ")[1].split("\n\nRemaining dispatches:")[0])
    if (current) expect(prompt).not.toContain("Old final explanation")
    const id = context.sourceWindows[0]?.id ?? context.evidenceCatalog[0].id, task = context.tasks.find((t: any) => t.duty.kind === "entry")
    const policy = current ? changed.inquiry.policy : input.inquiry.policy
    const policyRule = { op: "add", targetKey: "policy", pathKey: "p", expected: current ? "deny" : "allow", text: policy.text, location: policy.location }
    const controlDelta = task ? { schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: task.itemId, rules: [{ op: "add", targetKey: "entry", pathKey: "p", kind: "entry", after: [], claim: "Source entry" }, { op: "add", targetKey: "write", pathKey: "p", kind: "effect", after: ["entry"], complete: true, claim: "Source effect" }], policyRules: [policyRule] }] } : { schemaVersion: "authorization-control-update/v1", policyRules: [{ ...policyRule, questionId: "q" }] }
    return { text: "", toolCalls: [{ id: "mock-call", name: p.tools[0].name, arguments: { kind: "final", controlDelta, result: { schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q", behavior: { disposition: "allow", explanation: current ? "Current source behavior" : "Old final explanation" }, branches: [], evidenceIds: [id], missing: [], policyAssessment: { status: current ? "violated" : "satisfied", explanation: "Current policy mapping" } }], observations: [], scope: "source" } } }], tokens: emptyTokenUsage(), durationMs: 0, stopReason: "tool_use" as const }
  }, async completeWithToolResults() { throw new Error("Unused") } } }
  const options = { outDir: path.join(root, "runs"), model: "mock", method: "M" as const, strategy: "guided-evidence-v2" as const }
  const old: any = await executeLocalInquiryRun({ ...options, inputFile, providerFactory: () => factory() })
  expect(old.status).toBe("completed")
  return { root, source, inputFile, changedFile, old, factory, options, calls: () => calls, factories: () => factories }
}

test("ordinary CLI --previous recomputes policy and archives verified reuse provenance", async () => {
  const f = await fixture(); let output = ""
  const comparison: any = await compareLocalInquiry(f.changedFile, f.old.sessionPath)
  expect(comparison.reuseEligibility).toMatchObject({ status: "reusable", info: { change: "policy-only", answerReused: false } })
  expect(comparison.reuseEligibility.seed).toBeUndefined()
  const code = await runAuthorizationCli(["inquiry", "run", `--input=${f.changedFile}`, `--out=${f.options.outDir}`, "--model=mock", "--method=M", "--strategy=guided-evidence-v2", `--previous=${f.old.sessionPath}`], { stdout: s => output = s, stderr: () => {}, providerFactory: () => f.factory(true) })
  expect(code).toBe(0)
  const current = await inspectLocalInquiry(JSON.parse(output).sessionPath)
  expect(current.reuse).toMatchObject({ previousSessionId: f.old.sessionId, change: "policy-only", answerReused: false })
  expect(current.reuseOrigin).toMatchObject({ previousSessionId: f.old.sessionId, previousInputSha256: f.old.inputSha256, previousSessionPath: f.old.sessionPath })
  expect(current.result.questions[0].policyAssessment.status).toBe("violated")
  const run = JSON.parse(await readFile(path.join(current.sessionPath, "run.json"), "utf8"))
  expect(run.toolHistory).toEqual([])
  expect(run.sourceAccounting.importedEvidenceBytes).toBeGreaterThan(0)
  expect(run.requests[0].params.messages.map((m: any) => m.content).join("\n")).toContain(JSON.stringify(run.evidence[0].text))
  expect(run.sourceAccounting.cumulativeModelSourceBytes).toBe(run.evidence[0].bytes)
  expect(run.sourceAccounting.toolDisplayBytes).toBe(0)
  expect(f.calls()).toBe(2)
  const reportPath = path.join(current.sessionPath, "report.json"), report = JSON.parse(await readFile(reportPath, "utf8"))
  report.reuseOrigin.previousSessionId = "unrelated-session"
  await writeFile(reportPath, JSON.stringify(report))
  await expect(inspectLocalInquiry(current.sessionPath)).rejects.toThrow("identity")
})

test("source changes and unknown prior completion refuse reuse before provider creation", async () => {
  const f = await fixture()
  await writeFile(path.join(f.root, "source/entry.ts"), "export function entry() { return false; }\n")
  const changed: any = await executeLocalInquiryRun({ ...f.options, inputFile: f.changedFile, previous: f.old.sessionPath, providerFactory: () => f.factory(true) } as any)
  expect(changed).toMatchObject({ status: "needs-fresh-analysis", providerCalls: 0, reuseEligibility: { info: { change: "source-changed" } } })
  expect(f.factories()).toBe(1)
  await writeFile(path.join(f.root, "source/entry.ts"), f.source)
  for (const name of ["run.json", "report.json"]) {
    const file = path.join(f.old.sessionPath, name), value = JSON.parse(await readFile(file, "utf8")); value.status = "timeout-unknown"; await writeFile(file, JSON.stringify(value))
  }
  const unknown: any = await executeLocalInquiryRun({ ...f.options, inputFile: f.changedFile, previous: f.old.sessionPath, providerFactory: () => f.factory(true) } as any)
  expect(unknown).toMatchObject({ status: "needs-fresh-analysis", providerCalls: 0, noAutomaticResend: true, recovery: { kind: "inspect-previous" } })
  expect(f.factories()).toBe(1)
  expect(f.calls()).toBe(1)
})

test("ordinary reuse agrees with fresh policy analysis while avoiding the old source read", async () => {
  const f = await fixture()
  const reused: any = await executeLocalInquiryRun({ ...f.options, inputFile: f.changedFile, previous: f.old.sessionPath, providerFactory: () => f.factory(true) })
  const fresh: any = await executeLocalInquiryRun({ ...f.options, inputFile: f.changedFile, providerFactory: () => f.factory(true) })
  expect(reused.status).toBe("completed")
  expect(fresh.status).toBe("completed")
  expect(reused.result).toEqual(fresh.result)
  expect(reused.domain.check.policyComparisons).toEqual(fresh.domain.check.policyComparisons)
  expect(reused.sourceAccounting.toolDisplayBytes).toBe(0)
  expect(fresh.sourceAccounting.toolDisplayBytes).toBeGreaterThan(0)
})

test("modified archived evidence cannot reach provider creation even with matching report flags", async () => {
  const f = await fixture(), file = path.join(f.old.sessionPath, "run.json")
  const run = JSON.parse(await readFile(file, "utf8")); run.evidence[0].text = "Invented source window"
  await writeFile(file, JSON.stringify(run))
  const result: any = await executeLocalInquiryRun({ ...f.options, inputFile: f.changedFile, previous: f.old.sessionPath, providerFactory: () => f.factory(true) })
  expect(result.status).toBe("needs-fresh-analysis")
  expect(result.reuseEligibility.reasons.join(" ")).toContain("reuse-evidence-mismatch")
  expect(f.factories()).toBe(1)
  expect(f.calls()).toBe(1)
})

test("an old transport-failed SDK timeout returns inspection rather than a fresh resend command", async () => {
  const f = await fixture()
  for (const name of ["run.json", "report.json"]) {
    const file = path.join(f.old.sessionPath, name), value = JSON.parse(await readFile(file, "utf8"))
    value.status = "transport-failed"
    if (name === "run.json") value.attempts = [{ status: "error", error: { name: "ProviderNetworkError", message: "The operation timed out." } }]
    await writeFile(file, JSON.stringify(value))
  }
  const old = await inspectLocalInquiry(f.old.sessionPath)
  expect(old.status).toBe("transport-failed")
  expect(old.completionUnknown).toBe(true)
  const current: any = await executeLocalInquiryRun({ ...f.options, inputFile: f.changedFile, previous: f.old.sessionPath, providerFactory: () => f.factory(true) })
  expect(current).toMatchObject({ providerCalls: 0, noAutomaticResend: true, recovery: { kind: "inspect-previous" } })
  expect(current.recovery.arguments).toContain("inspect")
  expect(f.factories()).toBe(1)
})
