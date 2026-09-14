import path from "node:path"
import { writeFile } from "node:fs/promises"

const root = import.meta.dirname
const attempts = await Bun.file(path.join(root, "f10-attempt-reconciliation.json")).json()
const repair = await Bun.file(path.join(root, "f10-validation-repair/repair-result.json")).json()
const oldConsumption = await Bun.file(path.join(root, "f9/consumption-effect.json")).json()
const successorConsumption = await Bun.file(path.join(root, "f10-effect.json")).json()
const sum = (values: Record<string, number>[]) => Object.fromEntries(
  ["input", "output", "cacheRead", "cacheWrite"].map((field) => [field, values.reduce((total, value) => total + (value[field] ?? 0), 0)]),
)
const result = {
  schemaVersion: "skill-ir-reinforcement-final-costs/v1",
  recordedAt: new Date().toISOString(),
  source: attempts.costs.source,
  optimizer: {
    observedSubtotals: sum([attempts.costs.optimizerIncludingRecordedRepair.observedSubtotals, repair.tokens]),
    missingFields: attempts.costs.optimizerIncludingRecordedRepair.missingFields,
    proposalCount: attempts.proposals.length,
    separateMetadataRepairCalls: 1,
    accounting: "Proposal history aggregates include their original repairs once; the F10 metadata-only repair is outside those histories and added exactly once.",
  },
  consumption: {
    unitCount: oldConsumption.units.length + successorConsumption.units.length,
    oldEightUnits: sum(oldConsumption.units.map((unit: any) => unit.tokens)),
    successorThreeUnits: sum(successorConsumption.units.map((unit: any) => unit.targetAgent.tokens)),
    observedSubtotals: sum([
      ...oldConsumption.units.map((unit: any) => unit.tokens),
      ...successorConsumption.units.map((unit: any) => unit.targetAgent.tokens),
    ]),
    sourceBaselineReplayedForF10: false,
  },
  f10AdditionalAgentRuns: { candidateGeneration: 2, metadataRepair: 1, consumption: 3 },
  preModelCliFailure: { path: "f10-feedback-successor", modelCalls: 0 },
  actualUsd: null,
  developerAgentCost: "not-measured-by-project-runtime",
  limits: [
    "Missing historical telemetry is not zero.",
    "Provider-reported zero is not billed zero; no reliable USD invoice/pricing binding is available.",
    "Token fields are separate observations, not dollar-equivalent costs.",
    "Proposal/package counts include failed, docs-only and reused artifacts, not distinct successful programs.",
    "Local validation, isolation and reevaluation added no paid model calls.",
  ],
}
await writeFile(path.join(root, "final-costs.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify(result, null, 2))
