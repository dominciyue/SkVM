// Evaluation-only replay of original model bytes; never included in model input.
import { readFile } from "node:fs/promises"
import path from "node:path"
import { checkAuthorizationInquiry, compareLocalInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { base, repo, load, save, hash, relative } from "./study.ts"

const ledger = await load(path.join(base, "attempts.json"))
if (ledger.some((a: any) => a.status === "running")) throw new Error("Wait for the active purpose to close before maintenance evaluation")
const selected = await load(path.join(base, "evaluation/selected/matrix.json"))
const previous = selected.rows.find((r: any) => r.session)?.session
if (!previous) throw new Error("Missing original current check archive")
const original = path.join(base, "authoring/automatic-program.json"), originalSha256 = hash(await readFile(original))
const inputs: Array<{ variant: string; inputFile: string; invalidation: unknown }> = []
for (const variant of ["root-default", "empty-version", "denied"]) {
  const input = await load(path.join(base, `inputs/${variant}.json`)), inputFile = path.join(base, `verification/maintenance/inputs/${variant}.json`)
  input.sourceRoot = path.relative(path.dirname(inputFile), path.join(base, "verification/source-change/package/source")).split(path.sep).join("/")
  await save(inputFile, input)
  const before: any = await compareLocalInquiry(inputFile, path.resolve(repo, previous), "question-checked-v1", original, { executionPolicy: "progressive" })
  if (before.providerCalls !== 0 || before.answerReused !== false || !before.sourceChanged || before.executableContract?.resourceExecution?.returned !== undefined) throw new Error("Old result was not withdrawn after source change")
  inputs.push({ variant, inputFile, invalidation: { sourceChanged: true, oldReturnWithdrawn: true, diagnostics: before.executableContract?.diagnostics } })
}
const rows = [], unavailable = []
for (const entry of ledger.filter((a: any) => ["S-R1", "S-R2"].includes(a.position))) {
  const { position, attempt } = entry
  if (!entry || entry.lifecycle?.localExecution !== "closed") throw new Error(`Missing closed ${position}`)
  for (const version of ["first", "final"]) {
    const program = path.join(base, `authoring/${version === "first" ? "first-program" : "automatic-program"}-${position}-${attempt}.json`)
    const bytes = await readFile(program).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; return undefined })
    if (!bytes) { unavailable.push({ position, attempt, version, reason: "No retained model program for this version" }); continue }
    for (const { variant, inputFile, invalidation } of inputs) {
      const checked: any = await checkAuthorizationInquiry(inputFile, "D1", "question-checked-v1", program, { executionPolicy: "progressive", programContext: "full" })
      if (checked.providerCalls !== 0) throw new Error("Evaluation unexpectedly called a provider")
      rows.push({ position, attempt, version, variant, inheritedUnchanged: hash(bytes) === originalSha256, program: relative(program), programSha256: hash(bytes), input: relative(inputFile), invalidation, actual: checked.executableContract?.resourceExecution ?? null, status: checked.status, diagnostics: checked.executableContract?.diagnostics ?? checked.diagnostics, expected: variant === "denied" ? { kind: "return", requestedDocument: 10, authorizedResource: 10, fileDocument: 11, useArchive: true, selectedFile: "v1-archive.pdf" } : { kind: "deny-before-file-selection" } })
    }
    if (hash(await readFile(program)) !== hash(bytes)) throw new Error("Model raw changed during replay")
  }
}
if (hash(await readFile(original)) !== originalSha256) throw new Error("Fixed primary program changed")
await save(path.join(base, "verification/maintenance.json"), { providerCalls: 0, targetExecutions: 0, originalProgramSha256: originalSha256, replacesConsumerSelection: false, expectedIsEvaluationOnly: true, sourceReason: "Copied views.py:1421 removes not: owner/grant success now causes403; explicit nonowner false falls through. Original source unchanged.", rows, unavailable, semanticAssessment: "Requires source and actual-event review; no automatic promotion" })
console.log(JSON.stringify({ cases: rows.length, unavailable, providerCalls: 0, result: "verification/maintenance.json" }))
