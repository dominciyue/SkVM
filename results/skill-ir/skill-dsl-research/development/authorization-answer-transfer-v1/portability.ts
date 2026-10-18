// Evaluation only: move a verified ordinary archive and mutate a source COPY.
import { cp, mkdir, readFile, writeFile, stat } from "node:fs/promises"
import path from "node:path"
import assert from "node:assert/strict"
import { inspectLocalInquiry, initializeLocalInquiry, loadInquiryInput, compareLocalInquiry, checkAuthorizationInquiry, saveLocalInquiryCheck } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { base, repo, load, save, hash, relative } from "./study.ts"

const matrix = await load(path.join(base, "evaluation/final/matrix.json")), raw = path.join(base, "authoring/automatic-program.json")
if (!matrix.session) {
  await save(path.join(base, "verification/portability.json"), { providerCalls: 0, status: "unavailable-program", reason: "Final raw did not produce an inspectable ordinary execution; not replaced by developer semantics." })
} else {
  const original = path.resolve(repo, matrix.session), originalInput = await loadInquiryInput(path.join(base, "inputs/memos-original.json")), work = path.join(base, "verification/portable-copy-relative"), copied = path.join(work, "session"), source = path.join(work, "source"), program = path.join(work, "program.json")
  assert.equal(await stat(work).then(() => true).catch(() => false), false, "Use retained result instead of overwriting an existing replay")
  await mkdir(work, { recursive: true })
  await cp(original, copied, { recursive: true, errorOnExist: true, force: false })
  await cp(originalInput.context.sourceRoot, source, { recursive: true, errorOnExist: true, force: false })
  await writeFile(program, await readFile(raw))
  const before: any = await inspectLocalInquiry(original), after: any = await inspectLocalInquiry(copied)
  assert.equal(before.sessionId, after.sessionId); assert.deepEqual(before.execution, after.execution)
  const inputFile = path.join(work, "input.json")
  await initializeLocalInquiry(copied, inputFile, source)
  const same: any = await compareLocalInquiry(inputFile, copied, "question-checked-v1", program, { executionPolicy: "progressive", programMode: "consume" })
  assert.equal(same.sourceChanged, false); assert.equal(same.answerReused, false); assert.equal(same.providerCalls, 0)
  const checked: any = await checkAuthorizationInquiry(inputFile, "D1", "question-checked-v1", program, { executionPolicy: "progressive" })
  assert.equal(checked.status, "valid"); assert.deepEqual(same.executableContract?.resourceExecution, checked.executableContract?.resourceExecution)
  const archive = await saveLocalInquiryCheck(inputFile, program, path.join(work, "replay"), checked, { executionPolicy: "progressive" })
  await inspectLocalInquiry(archive.sessionPath)
  const changedInput = await load(path.join(base, "inputs/memos-changed.json")), changedFile = path.join(work, "changed-input.json")
  changedInput.sourceRoot = path.relative(path.dirname(changedFile), source).split(path.sep).join("/"); await save(changedFile, changedInput)
  const inputChange: any = await compareLocalInquiry(changedFile, copied, "question-checked-v1", program, { executionPolicy: "progressive", programMode: "consume" })
  assert.equal(inputChange.sourceChanged, false); assert.equal(inputChange.resourceInputsOnly, true); assert.equal(inputChange.answerReused, false)
  const file = path.join(source, "server/api/v1/memo_share_service.go"), bytes = await readFile(file, "utf8"), old = "time.Now().Unix() > *ms.ExpiresTs", replacement = "time.Now().Unix() >= *ms.ExpiresTs"
  assert.equal(bytes.split(old).length, 2)
  await writeFile(file, bytes.replace(old, replacement), "utf8")
  const changed: any = await compareLocalInquiry(inputFile, copied, "question-checked-v1", program, { executionPolicy: "progressive", programMode: "consume" })
  assert.equal(changed.sourceChanged, true); assert.equal(changed.providerCalls, 0); assert.equal(changed.answerReused, false)
  assert.equal(changed.executableContract?.resourceExecution?.returned, undefined)
  assert.equal(hash(await readFile(raw)), matrix.programSha256)
  assert.equal(hash(await readFile(path.join(originalInput.context.sourceRoot, "server/api/v1/memo_share_service.go"))), hash(bytes))
  await save(path.join(base, "verification/portability.json"), { providerCalls: 0, targetExecutions: 0, status: "verified", programSha256: matrix.programSha256, original: relative(original), copied: relative(copied), movedProgram: relative(program), replay: relative(archive.sessionPath), sessionIdentityPreserved: true, executionPreserved: true, originalBytesPreserved: true, sameInput: same.executableContract?.resourceExecution, changedInput: inputChange.executableContract?.resourceExecution, inputRecomputed: true, answerReused: false, sourceChange: { file: "server/api/v1/memo_share_service.go", old, replacement, previousReturnExisted: checked.executableContract?.resourceExecution?.returned !== undefined, currentReturnAbsent: true, programSourceBasis: changed.programSourceBasis, diagnostics: changed.executableContract?.diagnostics, resourceExecution: changed.executableContract?.resourceExecution }, limits: "Full prior answer is withdrawn. Unchanged synthetic input and unmodified source files remain available; this does not certify all independent semantic conclusions." })
}
console.log(JSON.stringify(await load(path.join(base, "verification/portability.json")), null, 2))
