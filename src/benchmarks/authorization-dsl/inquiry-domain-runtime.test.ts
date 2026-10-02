import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "./inquiry-tools.ts"
import { createInquiryDomainRuntime } from "./inquiry-domain-runtime.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
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
