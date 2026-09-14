import path from "node:path"
import { cp, writeFile } from "node:fs/promises"
import { buildOptimizedSkillPackage } from "../../../../src/jit-optimize/package.ts"
import { ProposalHistoryFileSchema, ProposalMetaSchema } from "../../../../src/proposals/storage.ts"

const [originalArg, recoveredArg, validationArg, packageArg] = process.argv.slice(2)
if (!originalArg || !recoveredArg || !validationArg || !packageArg) throw new Error("Expected original, recovered, validation and package paths")
const original = path.resolve(originalArg)
const recovered = path.resolve(recoveredArg)
const verification = await Bun.file(path.join(validationArg, "verification.json")).json()
if (verification.summary.rejectedActionIds.length || verification.execution.caseRuns < 1) throw new Error("Candidate has not passed executable checks")
const submission = await Bun.file(path.join(recovered, "round-1-optimizer/submission.json")).json()
const meta = ProposalMetaSchema.parse(await Bun.file(path.join(original, "meta.json")).json())
const history = ProposalHistoryFileSchema.parse(await Bun.file(path.join(original, "history.json")).json())
meta.bestRound = 1
meta.bestRoundReason = "Recovered exact model candidate after shared validation-layout repair; fidelity executed, independent quality unknown, draft only."
history.bestRound = 1
history.bestRoundReason = meta.bestRoundReason
const entry = history.entries.find((entry) => entry.round === 1)
if (!entry) throw new Error("Original round history missing")
entry.actions = submission.actions
entry.validation = verification.summary
for (const round of history.rounds ?? []) {
  if (round.round !== 1) continue
  round.validation = verification.summary
  if (round.historyEntry) {
    round.historyEntry.actions = submission.actions
    round.historyEntry.validation = verification.summary
  }
}
await cp(path.join(validationArg, "round-1-validation"), path.join(recovered, "round-1-validation"), { recursive: true, errorOnExist: true })
await writeFile(path.join(recovered, "meta.json"), JSON.stringify(meta, null, 2) + "\n", { flag: "wx" })
await writeFile(path.join(recovered, "history.json"), JSON.stringify(history, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify(await buildOptimizedSkillPackage({ proposalDir: recovered, packageDir: path.resolve(packageArg) })))
