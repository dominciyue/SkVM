// Evaluation-only replay. This file and its expected outcomes never enter model inputs.
import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { checkAuthorizationInquiry, compareLocalInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
const base = import.meta.dir, repo = path.resolve(base, "../../../../..")
const load = async (p: string) => JSON.parse(await readFile(p, "utf8"))
const sha = (v: Buffer) => createHash("sha256").update(v).digest("hex")
const save = async (p: string, v: unknown) => { await mkdir(path.dirname(p), { recursive: true }); await writeFile(p, JSON.stringify(v, null, 2) + "\n", "utf8") }
const ledger = await load(path.join(base, "attempts.json"))
const s0 = ledger.find((a: any) => a.position === "S0" && a.status === "completed")
const c0 = ledger.find((a: any) => a.position === "C0" && a.status === "completed")
if (!s0 || !c0) throw new Error("Known completed S0/C0 required; never dispatch from evaluation")
const program = path.join(base, "authoring/automatic-program-S0-first.json")
const original = path.join(base, "authoring/automatic-program.json")
const beforeHash = sha(await readFile(original)), afterHash = sha(await readFile(program))
const rows = []
for (const variant of ["root-default", "empty-version", "denied"]) {
  const input = await load(path.join(base, `inputs/${variant}.json`))
  const inputFile = path.join(base, `verification/maintenance/inputs/${variant}.json`)
  input.sourceRoot = path.relative(path.dirname(inputFile), path.join(base, "verification/source-change/package/source")).split(path.sep).join("/")
  await save(inputFile, input)
  const before: any = await compareLocalInquiry(inputFile, path.resolve(repo, c0.session), "question-checked-v1", original, { executionPolicy: "progressive" })
  const after: any = await checkAuthorizationInquiry(inputFile, "D1", "question-checked-v1", program, { executionPolicy: "progressive", programContext: "full" })
  if (before.providerCalls !== 0 || after.providerCalls !== 0 || before.answerReused !== false || !before.sourceChanged) throw new Error("Replay isolation/source-change invariant failed")
  if (before.executableContract?.resourceExecution?.returned !== undefined) throw new Error("Old return survived changed source")
  rows.push({ variant, factsUnchangedFromOriginalInput: true, input: path.relative(repo, inputFile).split(path.sep).join("/"), before: { sourceChanged: true, oldReturnWithdrawn: true, diagnostics: before.executableContract?.diagnostics }, after: { status: after.status, diagnostics: after.diagnostics, actual: after.executableContract?.resourceExecution }, expected: variant === "denied" ? { kind: "return", requestedDocument: 10, authorizedResource: 10, fileDocument: 11, useArchive: true, selectedFile: "v1-archive.pdf" } : { kind: "deny-before-file-selection" }, sourceReason: "Copied views.py:1421 removes not: authenticated owner/grant success now triggers 403; exact false for non-owner falls through. Other selection source remains unchanged." })
}
if (beforeHash !== sha(await readFile(original)) || afterHash !== sha(await readFile(program))) throw new Error("Raw bytes changed during evaluation")
await save(path.join(base, "verification/maintenance.json"), { providerCalls: 0, targetExecutions: 0, originalProgramSha256: beforeHash, maintenanceProgramSha256: afterHash, replacesConsumerSelection: false, expectedIsEvaluationOnly: true, rows })
console.log(JSON.stringify({ cases: rows.length, providerCalls: 0, result: "verification/maintenance.json", semanticAssessment: "requires review of actual events; no automatic promotion" }))
