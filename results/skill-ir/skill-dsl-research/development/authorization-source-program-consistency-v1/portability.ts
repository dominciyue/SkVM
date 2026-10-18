// Evaluation-only, zero-provider ordinary session relocation and source invalidation.
import { cp, mkdir, readFile, writeFile, stat } from "node:fs/promises"
import path from "node:path"
import assert from "node:assert/strict"
import { inspectLocalInquiry, initializeLocalInquiry, loadInquiryInput, compareLocalInquiry, checkAuthorizationInquiry, saveLocalInquiryCheck } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { base, repo, load, save, hash, relative } from "./study.ts"

const matrix = await load(path.join(base, "evaluation/te-final/matrix.json"))
const original = path.resolve(repo, matrix.session), work = path.join(base, "verification/portable-copy")
const program = path.join(base, "authoring/automatic-program.json"), digest = hash(await readFile(program))
const originalInput = await loadInquiryInput(path.join(base, "inputs/task.json"))
await mkdir(work, { recursive: true })
const copied = path.join(work, "session"), source = path.join(work, "source")
for (const [from, to] of [[original, copied], [originalInput.context.sourceRoot, source]] as const) {
  if (!await stat(to).catch(() => undefined)) await cp(from, to, { recursive: true, errorOnExist: true, force: false })
}
const before: any = await inspectLocalInquiry(original), after: any = await inspectLocalInquiry(copied)
assert.equal(before.sessionId, after.sessionId)
assert.deepEqual(before.execution, after.execution)
const inputFile = path.join(work, "input.json")
if (!await stat(inputFile).catch(() => undefined)) await initializeLocalInquiry(copied, inputFile, source)
const same: any = await compareLocalInquiry(inputFile, copied, "question-checked-v1", program, { executionPolicy: "progressive", programMode: "consume" })
assert.equal(same.sourceChanged, false); assert.equal(same.answerReused, false); assert.equal(same.providerCalls, 0)
const checked = await checkAuthorizationInquiry(inputFile, "D1", "question-checked-v1", program, { executionPolicy: "progressive" })
assert.equal(checked.status, "valid")
const archive = await saveLocalInquiryCheck(inputFile, program, path.join(work, "replay"), checked, { executionPolicy: "progressive" })
await inspectLocalInquiry(archive.sessionPath)
const file = path.join(source, "src/documents/views.py"), bytes = await readFile(file, "utf8")
const old = "if request.user is not None and not has_perms_owner_aware(", replacement = "if request.user is not None and has_perms_owner_aware("
const start = bytes.indexOf("    def _resolve_request_and_root_doc("), end = bytes.indexOf("    def file_response(", start)
assert.ok(start >= 0 && end > start)
const target = bytes.slice(start, end)
assert.equal(target.split(old).length, 2)
await writeFile(file, bytes.slice(0, start) + target.replace(old, replacement) + bytes.slice(end), "utf8")
const changed: any = await compareLocalInquiry(inputFile, copied, "question-checked-v1", program, { executionPolicy: "progressive", programMode: "consume" })
assert.equal(changed.sourceChanged, true); assert.equal(changed.providerCalls, 0); assert.equal(changed.answerReused, false)
assert.equal(changed.executableContract?.resourceExecution?.returned, undefined)
assert.equal(hash(await readFile(program)), digest)
assert.equal(hash(await readFile(path.join(originalInput.context.sourceRoot, "src/documents/views.py"))), hash(bytes))
await save(path.join(base, "verification/portability.json"), { providerCalls: 0, targetExecutions: 0, rawSha256: digest, original: relative(original), copied: relative(copied), copiedSource: relative(source), replay: relative(archive.sessionPath), sessionIdentityPreserved: true, executionPreserved: true, sourceIdentityPreservedBeforeChange: true, originalBytesPreserved: true, answerReused: false, sourceChange: { file: "src/documents/views.py", old, replacement, sourceChanged: true, previousReturnWithdrawn: true, programSourceBasis: changed.programSourceBasis, diagnostics: changed.executableContract?.diagnostics, resourceExecution: changed.executableContract?.resourceExecution }, retainedReproducibleCopy: true })
console.log(JSON.stringify({ providerCalls: 0, relocated: true, previousReturnWithdrawn: true, originalBytesPreserved: true }))
