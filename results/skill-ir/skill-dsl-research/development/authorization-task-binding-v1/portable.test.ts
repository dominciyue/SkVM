import { test, expect } from "bun:test"
import { cp, copyFile, mkdtemp, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { bbRoot, sha } from "./study.ts"
import { loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { prepareTaskProperties } from "../../../../../src/task-dsl/authorization/property-intent.ts"
import { verifyPublicCommands } from "./public-command-check.ts"
const residualProposal = (inquiry: any) => ({ schemaVersion: "authorization-property-intent/v1", questions: inquiry.questions.map((q: any) => ({ questionId: q.id, state: "residual", reason: "Explicit offline mock retains the complete question; no source or model success is asserted." })) })
test("moving the original four-question package preserves input bytes and source identities, then detects a source edit", async () => {
  const originalFile = path.join(bbRoot, "model/packages/download/inquiry.json"), before = await readFile(originalFile), original = await loadInquiryInput(originalFile), destination = await mkdtemp(path.join(os.tmpdir(), "bc-portable-")), movedFile = path.join(destination, "inquiry.json")
  await copyFile(originalFile, movedFile); await cp(original.context.sourceRoot, path.join(destination, "source"), { recursive: true })
  const moved = await loadInquiryInput(movedFile), originalTools = await createInquiryTools(original.context), movedTools = await createInquiryTools(moved.context)
  expect(sha(await readFile(movedFile))).toBe(sha(before)); expect(moved.value.inquiry!.questions).toEqual(original.value.inquiry!.questions)
  expect(movedTools.files).toEqual(originalTools.files)
  const prepared = prepareTaskProperties(moved.value.inquiry!, residualProposal(moved.value.inquiry))
  expect(prepared.questions.map(q => q.residualRequest)).toEqual(original.value.inquiry!.questions.map(q => q.request))
  const changed = structuredClone(moved.value.inquiry!); changed.questions[0]!.premises.push({ text: "The authenticated caller owns the requested document.", origin: "user" })
  expect(prepareTaskProperties(changed, residualProposal(changed)).revision).not.toBe(prepared.revision)
  const sourceFile = path.join(moved.context.sourceRoot, movedTools.files[0]!.path); await writeFile(sourceFile, (await readFile(sourceFile, "utf8")) + "\n# explicit portability stale-source fixture\n")
  expect((await movedTools.verifySnapshot()).valid).toBe(false)
  const refreshed = await createInquiryTools(moved.context)
  expect(refreshed.files[0]!.sha256).not.toBe(movedTools.files[0]!.sha256)
  expect((await refreshed.verifySnapshot()).valid).toBe(true)
  expect(refreshed.evidence).toEqual([])
  expect(sha(await readFile(originalFile))).toBe(sha(before))
}, 60000)
test("the original OWUI eleven questions all remain pending duties and survive offline task preparation", async () => {
  const file = path.join(bbRoot, "model/packages/owui/inquiry.json"), bytes = await readFile(file), original = await loadInquiryInput(file)
  expect(original.value.inquiry!.questions).toHaveLength(11)
  expect(original.value.inquiry!.questions.every(q => !q.properties?.length)).toBe(true)
  const sidecar = prepareTaskProperties(original.value.inquiry!, residualProposal(original.value.inquiry))
  expect(sidecar.questions.map(q => [q.questionId, q.residualRequest])).toEqual(original.value.inquiry!.questions.map(q => [q.id, q.request]))
  expect(sidecar.questions.every(q => q.state === "residual")).toBe(true)
  expect(await readFile(file)).toEqual(bytes)
})
test("ordinary task-binding check, inspect, edit and compare preserve the original package with zero model dispatch", async () => {
  const result = await verifyPublicCommands()
  expect(result.modelCalls).toBe(0)
  expect(result.originalBytesUnchanged).toBe(true)
  expect(result.checkStatus).toBe("valid")
  expect(result.inspectStatus).toBe("provider-unavailable")
  expect(result.originalQuestionCount).toBe(4)
  expect(result.changedQuestionCount).toBe(4)
  expect(result.comparison).toMatchObject({ premiseOnly: true, sourceChanged: false, answerReused: false, providerCalls: 0 })
}, 60000)
