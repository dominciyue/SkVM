import path from "node:path"
import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { root, sha } from "../study.ts"
import { loadInquiryInput, checkAuthorizationInquiry, initializeLocalInquiry, editAuthorizationInquiry } from "../../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { normalizeNaturalOperation } from "../../../../../../src/task-dsl/authorization/operation-program.ts"

const exampleRoot = path.resolve(root, "../../../../../examples/authorization-assessment/reusable-skill")
const originalFile = path.join(exampleRoot, "inquiry.json")
const original = await loadInquiryInput(originalFile)
const check = await checkAuthorizationInquiry(originalFile, "M", "operation-evidence-v2")
assert.equal(check.status, "valid")
assert.equal(check.providerCalls, 0)
const inquiry = normalizeNaturalOperation(original.value.brief!, "behavior")
assert.equal(inquiry.operations[0]!.request, original.value.brief)
assert.equal(inquiry.questions[0]!.request, original.value.brief)
const { brief: _brief, mode: _mode, ...metadata } = original.value
const fixtureFile = path.join(root, "verification/av19-example-declared-fixture.json")
const declaredFile = path.join(root, "verification/av19-example-exported.json")
const changedFile = path.join(root, "verification/av19-example-premise.json")
const save = (file: string, value: unknown) => writeFile(file, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: "wx" })
await save(fixtureFile, { ...metadata, sourceRoot: path.relative(path.dirname(fixtureFile), original.context.sourceRoot).replaceAll("\\", "/"), inquiry })
const exported = await initializeLocalInquiry(fixtureFile, declaredFile)
assert.equal(exported.providerCalls, 0)
const declared = await loadInquiryInput(declaredFile)
const patchBytes = await readFile(path.join(exampleRoot, "inquiry-premise-edit.json"))
const changed = editAuthorizationInquiry(declared.value, JSON.parse(patchBytes.toString("utf8")))
assert.deepEqual(changed.inquiry!.schemaVersion, "authorization-inquiry/v2")
assert.deepEqual(changed.inquiry!.questions.map(({ premises: _p, ...q }) => q), declared.value.inquiry!.questions.map(({ premises: _p, ...q }) => q))
assert.deepEqual("operations" in changed.inquiry! ? changed.inquiry.operations : undefined, inquiry.operations)
assert.equal(changed.inquiry!.questions[0]!.premises[0]!.text, "The caller has the supervisor role and the supplied record belongs to a different principal.")
await save(changedFile, changed)
const currentCheck = await checkAuthorizationInquiry(changedFile, "M", "operation-evidence-v2")
assert.equal(currentCheck.status, "valid")
assert.equal(currentCheck.providerCalls, 0)
await save(path.join(root, "verification/av19-example.json"), {
  schemaVersion: "authorization-av19-example-verification/v1", at: new Date().toISOString(),
  original: { file: path.relative(path.resolve(root, "../../../../.."), originalFile).replaceAll("\\", "/"), sha256: original.inputSha256, entireBrief: original.value.brief },
  patchSha256: sha(patchBytes), exported, checks: { original: check.status, current: currentCheck.status },
  fullOperationAndQuestionPreserved: true, sourceScopePreserved: true, answerSupplied: false,
  basis: "Deterministic public interface fixture from the ordinary M frontend; no fabricated provider session or measured reuse claim. Actual retained-session init/compare is separately verified in AV14.",
  providerCalls: 0, targetExecutions: 0,
})
console.log(JSON.stringify({ original: check.status, current: currentCheck.status, fullOperationAndQuestionPreserved: true, providerCalls: 0, targetExecutions: 0 }))
