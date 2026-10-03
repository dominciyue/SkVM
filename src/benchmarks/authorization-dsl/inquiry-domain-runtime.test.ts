import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "./inquiry-tools.ts"
import { createInquiryDomainRuntime } from "./inquiry-domain-runtime.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
import { validateAuthorizationInquiryResult } from "../../task-dsl/authorization/inquiry-result.ts"
test("rejected extraction diagnostics cannot coexist with a reported consistent complete result", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ar-runtime-")); await writeFile(path.join(sourceRoot, "entry.ts"), "export const entry = true\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["entry.ts"] })
  const evidence = (await tools.execute("source_read", { path: "entry.ts", startLine: 1, endLine: 1 })).evidence[0]!.id
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Owner is unspecified.", premises: [] }] })
  const runtime = createInquiryDomainRuntime({ program, tools })
  await runtime.propose({ schemaVersion: "authorization-control-slice/v1", rules: [{ key: "entry", questionId: "q", pathKey: "p", kind: "entry", after: [], claim: "Entry", evidenceIds: [evidence] }, { key: "effect", questionId: "q", pathKey: "p", kind: "effect", after: ["entry"], claim: "Effect", evidenceIds: [evidence], complete: true }], bindings: [{ key: "owner", questionId: "q", value: null, origin: "user", text: "Owner is unspecified." }] })
  const checked = await runtime.validate({ schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q", behavior: { disposition: "allow", explanation: "Original candidate" }, evidenceIds: [evidence], branches: [], missing: [] }], observations: [], scope: "local" })
  expect(checked.diagnostics.some(d => d.code === "premise-value-unspecified")).toBe(true)
  expect(checked.ruleConsistency).toBe(false)
  expect(checked.taskResolution).toBe("partial")
})

test("local corrections retain accepted work and clear only their own question's rejected target", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ar-local-runtime-")); await writeFile(path.join(sourceRoot, "entry.ts"), "export const entry = true\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["entry.ts"] })
  const evidence = (await tools.execute("source_read", { path: "entry.ts", startLine: 1, endLine: 1 })).evidence[0]!.id
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: ["q", "other"].map(id => ({ id, request: "Investigate entry", premises: [] })) })
  const runtime = createInquiryDomainRuntime({ program, tools })
  const item = (questionId: string, targetKey: string, extra = {}) => ({ op: "add", questionId, targetKey, pathKey: "p", kind: "entry", after: [], evidenceIds: [evidence], claim: "Entry", ...extra })
  const submit = (rules: unknown[]) => runtime.propose({ schemaVersion: "authorization-control-update/v1", rules })
  const first: any = await submit([item("q", "good"), item("q", "bad", { evidenceIds: ["not-shown"] }), item("other", "bad", { evidenceIds: ["not-shown"] })])
  expect(first.accepted.map((a: any) => a.targetKey)).toEqual(["good"])
  expect(first.rejected).toHaveLength(2)
  await submit([item("q", "bad")])
  expect(runtime.report().slice.rules.map(r => r.key)).toEqual(["good", "bad"])
  expect(runtime.feedback().diagnostics).toHaveLength(1)
  expect(runtime.feedback().diagnostics[0]!.path).toContain("other.bad")
  await submit([item("other", "bad")])
  expect(runtime.feedback().diagnostics).toEqual([])
  expect(runtime.report().proposals).toHaveLength(3)
})

test("guided shared runtime can advance real source work before any control proposal", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ar-shared-work-")); await writeFile(path.join(sourceRoot, "entry.ts"), "export function entry() { return false; }\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["entry.ts"] })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Investigate entry", entryHint: "entry", premises: [] }] })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "guided-evidence-v2" } as any)
  await runtime.sync()
  expect(tools.evidence[0]!.quote).toContain("return false")
  expect((runtime.report() as any).worklist.items.find((w: any) => w.kind === "entry").state).toBe("awaiting-interpretation")
  expect(runtime.report().slice.rules).toEqual([])
  expect(runtime.report().schedulerActions[0]!.actionOrigin).toBe("domain-worklist")
  await runtime.sync()
  expect(tools.toolCalls).toBe(1)
})

test("local guided candidate choice reads a shown ambiguous candidate without rewriting a dependency graph", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ar-choice-"))
  for (const file of ["a.ts", "b.ts"]) await writeFile(path.join(sourceRoot, file), "export function entry() { return false; }\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["."] })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Investigate entry", premises: [] }] })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "guided-evidence-v2" } as any)
  await runtime.sync()
  const item = (runtime.feedback() as any).worklist.find((w: any) => w.kind === "entry")
  const feedback = await runtime.propose({ schemaVersion: "authorization-control-update/v1", workSelections: [{ questionId: "q", itemId: item.id, candidateId: item.candidates[0].id }] })
  expect(feedback.diagnostics).toEqual([])
  expect(feedback.actions).toHaveLength(1)
  expect(tools.evidence[0]!.path).toBe(item.candidates[0].path)
  expect(runtime.report().slice.rules).toEqual([])
})

test("multiple synchronizations share two automatic reads until a new model step begins", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ar-auto-bound-")); await writeFile(path.join(sourceRoot, "entry.ts"), "export function entry() {\n" + "  // original line\n".repeat(340) + "  return false;\n}\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["entry.ts"] })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Investigate entry", premises: [] }] })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "guided-evidence-v2" })
  await runtime.sync(); await runtime.sync()
  expect(tools.toolCalls).toBe(2)
  runtime.beginStep(); await runtime.sync()
  expect(tools.toolCalls).toBe(3)
  runtime.close()
  expect(() => runtime.beginStep()).toThrow("session-closed")
})

test("a dependency reopens when a corrected preceding reject no longer makes it unreachable", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ar-reopen-"))
  await writeFile(path.join(sourceRoot, "entry.ts"), "export function entry() { return gate(); }\n")
  await writeFile(path.join(sourceRoot, "helper.ts"), "export function gate() { return false; }\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["."] })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Investigate entry", premises: [] }] })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "guided-evidence-v2" })
  await runtime.sync()
  const evidenceIds = [tools.evidence[0]!.id]
  const stop = (value: boolean, replacement = false) => ({ op: replacement ? "replace" : "add", targetKey: "stop", questionId: "q", pathKey: "p", kind: "reject", after: ["entry"], evidenceIds, claim: "Current rejection condition", condition: { op: "eq", left: { literal: true }, right: { literal: value } }, ...(replacement ? { reason: "Correct the rejection reachability" } : {}) })
  await runtime.propose({ schemaVersion: "authorization-control-update/v1", rules: [{ op: "add", targetKey: "entry", questionId: "q", pathKey: "p", kind: "entry", after: [], evidenceIds, claim: "Calls gate" }, stop(true)], dependencies: [{ op: "add", targetKey: "gate", questionId: "q", pathKey: "p", from: "entry", after: ["stop"], symbol: "gate", evidenceIds, reason: "Actual source reference", kind: "control", decisive: true }] })
  const item = () => runtime.report().worklist!.items.find(w => w.origin === "explicit-dependency")!
  expect(item()).toMatchObject({ state: "closed", code: "dependency-unreachable" })
  expect(tools.toolCalls).toBe(1)
  runtime.beginStep()
  const corrected = await runtime.propose({ schemaVersion: "authorization-control-update/v1", rules: [stop(false, true)] })
  expect(corrected.diagnostics).toEqual([])
  expect(runtime.report().dependencies[0]!.state).toBe("read")
  expect(item()).toMatchObject({ state: "awaiting-interpretation", nextAction: { kind: "interpret" } })
})

test("model repair feedback deduplicates and bounds diagnostics without dropping the complete retained failures", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ar-feedback-")); await writeFile(path.join(sourceRoot, "entry.ts"), "export const entry = true\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["."] })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Investigate entry", premises: [] }] })
  const runtime: any = createInquiryDomainRuntime({ program, tools, strategy: "guided-evidence-v2" })
  await runtime.propose({ schemaVersion: "authorization-control-update/v1", rules: Array.from({ length: 20 }, (_, i) => ({ op: "add", questionId: "q", targetKey: `bad-${i}`, pathKey: "p", kind: "entry", after: [], evidenceIds: ["not-shown"], claim: "Candidate" })) })
  expect(runtime.feedback().diagnostics).toHaveLength(20)
  expect(runtime.modelFeedback()).toMatchObject({ diagnosticCount: 20 })
  expect(runtime.modelFeedback().diagnostics).toHaveLength(16)
  expect(runtime.report().proposals[0].rejected).toHaveLength(20)
})
test("model queue projection retains every task and action while avoiding duplicate candidate metadata", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ar-queue-view-"))
  for (const file of ["a.ts", "b.ts"]) await writeFile(path.join(sourceRoot, file), "export function entry() { return false; }\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["."] })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: ["q", "other"].map(id => ({ id, request: "Inspect entry", entryHint: "entry", premises: [] })) })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "guided-evidence-v2" })
  await runtime.sync()
  const full = runtime.feedback().worklist!, projected = runtime.modelFeedback().worklist!
  expect(projected.map(w => [w.id, w.questionId, w.state, w.code, w.nextAction, w.callsiteEvidenceIds, w.evidenceIds])).toEqual(full.map(w => [w.id, w.questionId, w.state, w.code, w.nextAction, w.callsiteEvidenceIds, w.evidenceIds]))
  expect(Buffer.byteLength(JSON.stringify(projected))).toBeLessThan(Buffer.byteLength(JSON.stringify(full)) * 0.75)
  expect(runtime.report().worklist!.items).toEqual(full)
  expect(runtime.modelContext().locationTasks[0]!.candidates).toEqual(full[0]!.candidates)
})
test("runtime rejection joins only its own question's layered check", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ar-question-check-")); await writeFile(path.join(sourceRoot, "entry.ts"), "export const entry = true\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["."] })
  const evidenceIds = [(await tools.execute("source_read", { path: "entry.ts", startLine: 1, endLine: 1 })).evidence[0]!.id]
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: ["q", "other"].map(id => ({ id, request: "Inspect entry", premises: [] })) })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "guided-evidence-v2" })
  await runtime.propose({ schemaVersion: "authorization-control-update/v1", rules: [{ op: "add", questionId: "q", targetKey: "entry", pathKey: "p", kind: "entry", after: [], evidenceIds, claim: "Entry" }, { op: "add", questionId: "q", targetKey: "effect", pathKey: "p", kind: "effect", after: ["entry"], evidenceIds, claim: "Source effect", complete: true }, { op: "add", questionId: "other", targetKey: "bad", pathKey: "p", kind: "entry", after: [], evidenceIds: ["unshown"], claim: "Bad source" }] })
  const checked: any = await runtime.validate({ schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q", behavior: { disposition: "allow", explanation: "Grounded local effect" }, evidenceIds, branches: [], missing: [] }, { questionId: "other", behavior: { disposition: "unknown", explanation: "Helper missing" }, evidenceIds: [], branches: [], missing: [{ kind: "source-gap", detail: "Helper missing" }] }], observations: [], scope: "local" })
  expect(checked.ruleConsistency).toBe(false)
  expect(checked.questionChecks.map((q: any) => q.ruleConsistent)).toEqual([true, false])
  expect(checked.questionChecks[1].diagnostics.map((d: any) => d.code)).toContain("evidence-not-shown")
})

test("checks-off reports unverified local answers and no aggregate consistency claim", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ar-checks-off-")); await writeFile(path.join(sourceRoot, "entry.ts"), "export const entry = true\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["entry.ts"] })
  const evidenceIds = [(await tools.execute("source_read", { path: "entry.ts", startLine: 1, endLine: 1 })).evidence[0]!.id]
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect entry", premises: [] }] })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "guided-evidence-v2", ablation: "checks-off" })
  const answer = { schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q", behavior: { disposition: "allow", explanation: "Source effect" }, evidenceIds, branches: [], missing: [] }], observations: [], scope: "local" }
  const domain = await runtime.validate(answer)
  const checked = validateAuthorizationInquiryResult(program, answer, { questionIds: ["q"], shownEvidenceIds: evidenceIds }, domain)
  expect(checked.questionChecks[0]).toMatchObject({ ruleConsistent: null, evidenceCoverage: "unreviewed", deliveryStatus: "unverified" })
  expect(domain.ruleConsistency).toBeNull()
  expect(runtime.report().computation.conclusionChecks).toBe(0)
  expect((await runtime.validate({ ...answer, questions: "malformed" })).structureValid).toBe(false)
  runtime.close()
})
