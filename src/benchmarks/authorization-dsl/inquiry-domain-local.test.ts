import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { executeLocalInquiryRun, compareLocalInquiry, editAuthorizationInquiry } from "./inquiry-local.ts"
import { emptyTokenUsage } from "../../core/types.ts"
test("policy/premise/source/rename changes have distinct ordinary applicability and never reuse an answer", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "aq-change-")); await mkdir(path.join(root, "source"))
  await writeFile(path.join(root, "source/entry.ts"), "export function entry() { return true; }\n")
  const policy = { text: "Everyone may write.", origin: "user", location: "current-policy" }
  const inquiry = { schemaVersion: "authorization-inquiry/v1", mode: "conformance", policy, questions: [{ id: "q", request: "Can a caller write?", premises: [] }] }
  const value = { schemaVersion: "authorization-inquiry-input/v1", taskId: "current", repository: "neutral", sourceRef: "fixed", sourceRoot: "source", allowedPaths: ["."], inquiry }
  const input = path.join(root, "input.json"); await writeFile(input, JSON.stringify(value))
  let calls = 0
  const report: any = await executeLocalInquiryRun({ inputFile: input, outDir: path.join(root, "runs"), model: "mock", strategy: "domain-evidence-v1", providerFactory: () => ({ name: "mock", async complete(p) {
    const id = /"id":"(ev-[a-f0-9]+)"/.exec(p.messages[0]!.content)?.[1]
    const args = !calls++ ? { kind: "tool", calls: [{ name: "source_read", arguments: { path: "entry.ts", startLine: 1, endLine: 1 } }] } : { kind: "final", controlDelta: { schemaVersion: "authorization-control-slice/v1", rules: [{ key: "entry", questionId: "q", pathKey: "p", kind: "entry", after: [], claim: "entry", evidenceIds: [id] }, { key: "write", questionId: "q", pathKey: "p", kind: "effect", after: ["entry"], claim: "true", complete: true, evidenceIds: [id] }], policyRules: [{ key: "rule", questionId: "q", pathKey: "p", expected: "allow", origin: "policy", text: policy.text, location: policy.location }] }, result: { schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q", behavior: { disposition: "allow", explanation: "returns true" }, branches: [], evidenceIds: [id], missing: [], policyAssessment: { status: "satisfied", explanation: "current independent policy" } }], observations: [], scope: "local" } }
    return { text: "", toolCalls: [{ id: "c", name: p.tools![0]!.name, arguments: args }], tokens: emptyTokenUsage(), durationMs: 0, stopReason: "tool_use" }
  }, async completeWithToolResults() { throw new Error("Unused") } }) })
  expect(report.status).toBe("completed")
  const changed = path.join(root, "changed.json")
  const save = async (v: any) => { await writeFile(changed, JSON.stringify(v)); return compareLocalInquiry(changed, report.sessionPath) }
  const policyChanged: any = await save(editAuthorizationInquiry(value, { schemaVersion: "authorization-inquiry-edit/v1", reason: "New policy", operations: [{ kind: "policy", policy: { ...policy, text: "Only reviewers may write." } }] }))
  expect(policyChanged).toMatchObject({ policyOnly: true, sourceChanged: false, mechanicalIndexReusable: true, controlRulesReused: false, answerReused: false })
  expect(policyChanged.affectedComputation).toEqual(["policy-mapping", "policy-comparison"])
  const premiseChanged: any = await save(editAuthorizationInquiry(value, { schemaVersion: "authorization-inquiry-edit/v1", reason: "New fact", operations: [{ kind: "premises", questionId: "q", premises: [{ text: "Owner is null.", origin: "user" }] }] }))
  expect(premiseChanged).toMatchObject({ premiseOnly: true, sourceChanged: false, status: "needs-review" })
  await writeFile(path.join(root, "source/entry.ts"), "export function entry() { return false; }\n")
  const sourceChanged: any = await save(value)
  expect(sourceChanged).toMatchObject({ sourceChanged: true, mechanicalIndexReusable: false, status: "needs-review" })
  await writeFile(path.join(root, "source/renamed.ts"), "export function renamed() { return false; }\n")
  const renamed: any = await save({ ...value, allowedPaths: ["renamed.ts"], inquiry: { ...inquiry, questions: [{ ...inquiry.questions[0], request: "Can renamed proceed?" }] } })
  expect(renamed.sourceChanged).toBe(true)
  expect(calls).toBe(2)
})
