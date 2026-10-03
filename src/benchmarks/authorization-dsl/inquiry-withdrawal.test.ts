import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "./inquiry-tools.ts"
import { createInquiryDomainRuntime } from "./inquiry-domain-runtime.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"

async function fixture() {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ar-withdraw-"))
  await writeFile(path.join(sourceRoot, "entry.ts"), "export function entry() { return true; }\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["."] })
  const evidenceIds = [(await tools.execute("source_read", { path: "entry.ts", startLine: 1, endLine: 1 })).evidence[0]!.id]
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: ["q", "other"].map(id => ({ id, request: "Investigate entry", premises: [] })) })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "guided-evidence-v2", remainingActions: () => 0 })
  const rule = (questionId: string, targetKey: string, extra = {}) => ({ op: "add", questionId, targetKey, pathKey: "p", kind: "entry", after: [], evidenceIds, claim: "Source candidate", ...extra })
  const submit = (value: object) => runtime.propose({ schemaVersion: "authorization-control-update/v1", ...value })
  const withdrawal = (questionId: string, targetKey: string) => ({ group: "rules", questionId, targetKey, reason: "Withdraw the malformed unaccepted draft; use the corrected proposal separately." })
  return { runtime, rule, submit, withdrawal, evidenceIds }
}

test("explicit draft withdrawal preserves history, other-question errors and dangling predecessors", async () => {
  const f = await fixture()
  await f.submit({ rules: [f.rule("q", "bad", { kind: "principal-binding" }), f.rule("other", "bad", { kind: "principal-binding" }), f.rule("q", "effect", { kind: "effect", after: ["bad"], complete: true })] })
  const result: any = await f.submit({ withdrawals: [f.withdrawal("q", "bad")] })
  expect(result.withdrawn).toMatchObject([{ questionId: "q", targetKey: "bad" }])
  expect(f.runtime.feedback().diagnostics.some(d => d.path.startsWith("rules.q.bad"))).toBe(false)
  expect(f.runtime.feedback().diagnostics.some(d => d.path.startsWith("rules.other.bad"))).toBe(true)
  expect(f.runtime.report().slice.rules.map(r => r.key)).toEqual(["effect"])
  expect(f.runtime.report().proposals[0]!.rejected).toHaveLength(2)
  expect((f.runtime.report().proposals[1] as any).withdrawn[0].reason).toContain("malformed")
  const checked = await f.runtime.validate({ schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q", behavior: { disposition: "allow", explanation: "Candidate" }, evidenceIds: f.evidenceIds, branches: [], missing: [] }, { questionId: "other", behavior: { disposition: "unknown", explanation: "Unresolved" }, evidenceIds: f.evidenceIds, branches: [], missing: [] }], observations: [], scope: "source" })
  expect(checked.ruleConsistency).toBe(false)
  expect(checked.diagnostics.some(d => d.code === "path-not-closed")).toBe(true)
})

test("withdrawal cannot delete an accepted target or clear a failed atomic correction", async () => {
  const f = await fixture()
  await f.submit({ rules: [f.rule("q", "entry"), f.rule("q", "bad", { kind: "principal-binding" })] })
  await f.submit({ rules: [f.rule("q", "entry", { op: "replace", evidenceIds: ["not-shown"] })] })
  const invalid: any = await f.submit({ withdrawals: [f.withdrawal("q", "entry")] })
  expect(invalid.diagnostics.some((d: any) => d.code === "withdrawal-target-accepted")).toBe(true)
  expect(f.runtime.report().slice.rules.map(r => r.key)).toEqual(["entry"])
  const atomic: any = await f.submit({ atomic: true, withdrawals: [f.withdrawal("q", "bad")], rules: [f.rule("q", "new", { evidenceIds: ["not-shown"] })] })
  expect(atomic.withdrawn).toEqual([])
  expect(f.runtime.feedback().diagnostics.some(d => d.path.startsWith("rules.q.bad"))).toBe(true)
  const absent: any = await f.submit({ withdrawals: [f.withdrawal("other", "missing")] })
  expect(absent.diagnostics.some((d: any) => d.code === "withdrawal-target-missing")).toBe(true)
})
