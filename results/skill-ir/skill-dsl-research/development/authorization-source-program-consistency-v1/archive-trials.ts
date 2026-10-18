// Preserve model-authored regression inputs as ordinary inquiry inputs; no expected values added.
import path from "node:path"
import { base, load, save, relative } from "./study.ts"
import { question } from "../authorization-reusable-program-v1/cases.ts"

const ledger = await load(path.join(base, "attempts.json")), index: any[] = []
for (const entry of ledger) {
  if (entry.status === "running" || entry.status === "unknown") continue
  const inputFile = path.resolve(base, "inputs", entry.position === "U-E" ? "consume.json" : "task.json")
  const original = await load(inputFile)
  const archive = await load(path.join(base, `authoring/${entry.position}-${entry.attempt}-regressions.json`)).catch(() => ({ trials: [] }))
  for (const [batch, trial] of archive.trials.entries()) {
    for (const [caseIndex, c] of (trial.output.cases ?? []).entries()) {
      if (!c.resourceInputs || !Array.isArray(c.externalAssumptions)) continue
      const name = `${entry.position.toLowerCase()}-${entry.attempt}-${batch + 1}-${caseIndex + 1}`
      const file = path.join(base, `inputs/model-trials/${name}.json`), input = structuredClone(original)
      input.sourceRoot = path.relative(path.dirname(file), path.resolve(path.dirname(inputFile), original.sourceRoot)).split(path.sep).join("/")
      input.resourceInputs[question] = c.resourceInputs; input.externalAssumptions[question] = c.externalAssumptions
      await save(file, input)
      index.push({ position: entry.position, attempt: entry.attempt, batch: batch + 1, caseId: c.id, originalRevision: trial.output.revision, input: relative(file), inputOrigin: c.inputOrigin, originalTrialStatus: c.status, originalOutcome: c.outcome?.execution, rawSemanticsEditedByArchiver: false })
    }
  }
}
await save(path.join(base, "authoring/regression-input-index.json"), { origin: "verbatim model trial case inputs; ordinary input wrapper and relative source root only", replayAgainstFinalMayDifferFromHistoricalRevision: true, cases: index })
console.log(JSON.stringify({ archivedCases: index.length, providerCalls: 0 }))
