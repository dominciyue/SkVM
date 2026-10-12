import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { checkAuthorizationInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
const base = import.meta.dir, repo = path.resolve(base, "../../../../..")
const original = path.resolve(base, "../authorization-authoring-closure-v1/authoring/automatic-program.json")
const originalBytes = await readFile(original), raw = JSON.parse(originalBytes.toString("utf8"))
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")
const derived = { ...raw, inputBinding: { questionId: "requested-document-and-returned-file" } }
const directory = path.join(base, "verification/developer-assisted"); await mkdir(directory, { recursive: true })
const file = path.join(directory, "BI-A2-binding-only.json"); await writeFile(file, JSON.stringify(derived, null, 2) + "\n", "utf8")
const checked: any = await checkAuthorizationInquiry(path.join(base, "inputs/root-default.json"), "D1", "question-checked-v1", file, { executionPolicy: "progressive" })
assert.equal(checked.status, "valid", JSON.stringify(checked.diagnostics))
assert.equal(checked.executableContract.inputBinding.inputQuestionId, derived.inputBinding.questionId)
assert.equal(checked.executableContract.resourceExecution.values.request_doc.id, 10)
assert.equal(hash(await readFile(original)), hash(originalBytes))
const result = { label: "developer-assisted diagnostic, never automatic success", original: path.relative(repo, original), originalSha256: hash(originalBytes), onlyRawChange: "top-level inputBinding", derivedSha256: hash(await readFile(file)), providerCalls: 0, checkedStatus: checked.status, inputBinding: checked.executableContract.inputBinding, execution: checked.executableContract.resourceExecution, remainingMeaning: "Original source-visible permission, version and fallback omissions remain; no semantic steps were corrected." }
await writeFile(path.join(base, "verification/offline-binding.json"), JSON.stringify(result, null, 2) + "\n", "utf8")
console.log(JSON.stringify({ status: checked.status, providerCalls: 0, returned: result.execution.returned, termination: result.execution.termination, originalUnchanged: true, label: result.label }))
