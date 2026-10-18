// Evaluation only: original first/final raw on the registered common input.
import { readFile } from "node:fs/promises"
import path from "node:path"
import { checkAuthorizationInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { base, load, save, hash, relative } from "./study.ts"
const ledger = await load(path.join(base, "attempts.json"))
if (ledger.some((a: any) => a.status === "running")) throw new Error("Wait for active purposes to close")
const inputFile = path.join(base, "inputs/sharelink.json"), rows = []
for (const version of ["first", "final"]) {
  const file = path.join(base, `authoring/${version === "first" ? "first-program" : "automatic-program"}-T-A0-first.json`)
  const bytes = await readFile(file), checked: any = await checkAuthorizationInquiry(inputFile, "D1", "question-checked-v1", file, { executionPolicy: "progressive", programContext: "full" })
  if (checked.providerCalls !== 0 || hash(await readFile(file)) !== hash(bytes)) throw new Error("Replay boundary violated")
  rows.push({ version, program: relative(file), programSha256: hash(bytes), steps: JSON.parse(bytes.toString()).resourceWorkflow?.steps?.length, status: checked.status, actual: checked.executableContract?.resourceExecution ?? null, diagnostics: checked.executableContract?.diagnostics ?? checked.diagnostics, scope: "Finite registered current input only; no backend or constructor completion/persistence certification" })
}
await save(path.join(base, "verification/sharelink-current-input.json"), { providerCalls: 0, targetExecutions: 0, input: relative(inputFile), inputSha256: hash(await readFile(inputFile)), developerSemanticEdits: false, rows })
console.log(JSON.stringify({ cases: rows.length, providerCalls: 0, output: "verification/sharelink-current-input.json" }))
