import path from "node:path"
import { writeFile } from "node:fs/promises"
import { analyzeMatchedConsumptionPairs } from "../../../src/jit-optimize/effect.ts"

const root = import.meta.dirname
const selection = await Bun.file(path.join(root, "f10-selection.json")).json()
const prior = await Bun.file(path.join(root, "f9/consumption-effect.json")).json()
const pairs = []
const units = []
for (const selected of selection.units) {
  const original = await Bun.file(path.join(root, "f9/consumption", selected.baseline, "quality.json")).json()
  const recorded = prior.units.find((unit: any) => unit.id === selected.baseline)
  if (!recorded) throw new Error(`Missing semantic baseline: ${selected.baseline}`)
  const directory = path.join(root, "f10-consumption", selected.id)
  const optimized = await Bun.file(path.join(directory, "quality.json")).json()
  const report = await Bun.file(path.join(directory, "report.json")).json()
  pairs.push({
    pairId: selected.id,
    original: { ...original, verification: { qualityPassed: recorded.semanticQualityPassed } },
    optimized,
  })
  units.push({
    id: selected.id, evidence: path.relative(root, directory).replaceAll("\\", "/"),
    startedAt: optimized.startedAt, completedAt: optimized.completedAt,
    qualityPassed: optimized.verification.qualityPassed, checks: optimized.checks,
    package: optimized.package, consumption: optimized.consumption,
    observation: report.runtime.executionObservation, targetAgent: optimized.targetAgent,
    baselineEvidence: `f9/consumption/${selected.baseline}`,
    baselineSemanticChecks: recorded.checks,
  })
}
const result = {
  schemaVersion: "skill-ir-feedback-successor-effect/v1",
  recordedAt: new Date().toISOString(),
  selection: "f10-selection.json",
  units,
  effect: analyzeMatchedConsumptionPairs(pairs),
  limits: [
    "Three preselected affected units, not a second complete cross-model matrix.",
    "Original source runs reused; later cache/provider latency conditions limit time comparisons.",
    "Translation meaning remains agent-owned. Structural checks do not establish whole-skill quality.",
    "No result transfers from the old package; gpt-5.5 changed-task successor use is untested.",
    "Actual USD unknown. Token fields and optimizer overhead are reported separately.",
  ],
}
await writeFile(path.join(root, "f10-effect.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ effect: result.effect, units: units.map((unit) => ({
  id: unit.id, qualityPassed: unit.qualityPassed, consumption: unit.consumption.consumptionComplete,
})) }, null, 2))
