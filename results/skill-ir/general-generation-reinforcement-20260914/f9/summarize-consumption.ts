import path from "node:path"
import { writeFile } from "node:fs/promises"
import { analyzeMatchedConsumptionPairs } from "../../../../src/jit-optimize/effect.ts"
import { i18nHelperGradeV2 } from "../../../../src/bench/evaluators/i18n-helper-grade-v2.ts"
import type { RunResult } from "../../../../src/core/types.ts"

const root = import.meta.dirname
const output = path.resolve(process.argv[2] ?? path.join(root, "consumption-effect.json"))
const units = []
const pairs = []
for (const model of ["sol", "gpt55"]) {
  for (const task of ["original", "changed"]) {
    const sides = []
    for (const condition of ["source", "optimized"]) {
      const id = `${model}-${condition}-${task}`
      const directory = path.join(root, "consumption", id)
      const quality = await Bun.file(path.join(directory, "quality.json")).json()
      const report = await Bun.file(path.join(directory, "report.json")).json()
      const runResult: RunResult = {
        text: "", steps: [], tokens: report.runtime.tokens, cost: report.runtime.reportedCostUsd,
        durationMs: report.runtime.durationMs, llmDurationMs: 0, workDir: report.runtime.workDir,
        runStatus: report.runtime.timedOut ? "timeout" : report.runtime.exitCode === 0 ? "ok" : "adapter-crashed",
        usageAvailable: true, initialWorkdirManifest: report.runtime.initialWorkdirManifest,
      }
      const checks = []
      for (const check of ["delta-policy", "source-transform", "locale-integrity", "interpolation", "report"]) {
        checks.push({ check, ...await i18nHelperGradeV2.run({
          criterion: { method: "custom", evaluatorId: "skill-ir-i18n-helper-v2", payload: { schemaVersion: "skill-ir-i18n-helper-eval/v2", check } },
          runResult,
        }) })
      }
      const current = {
        ...quality,
        verification: { qualityPassed: report.verification.taskPassed && checks.every((check) => check.pass) },
      }
      sides.push(current)
      units.push({
        id, historicalQualityPassed: quality.verification.qualityPassed,
        semanticQualityPassed: current.verification.qualityPassed, checks,
        historicalChecks: quality.checks,
        startedAt: quality.startedAt, completedAt: quality.completedAt,
        tokens: quality.targetAgent.tokens, durationMs: quality.targetAgent.durationMs,
        counts: quality.targetAgent.counts,
        consumption: quality.consumption,
        workDir: report.runtime.workDir,
        evidence: path.relative(root, directory).replaceAll("\\", "/"),
      })
    }
    pairs.push({ pairId: `${model}-${task}`, original: sides[0], optimized: sides[1] })
  }
}
const effect = analyzeMatchedConsumptionPairs(pairs)
const result = {
  schemaVersion: "skill-ir-f9-consumption-effect/v1",
  recordedAt: new Date().toISOString(),
  reevaluation: {
    paidCalls: 0, modelReplayed: false, packageModified: false, historicalResultsRewritten: false,
    reason: "User-authorized semantic evaluation: report sets have no ordering requirement; harmless empty representations and extra commentary are not a machine ABI. Wrong keys, missing locales and interpolation defects still fail.",
    evaluationChangedAfterConsumption: true,
  },
  units, effect,
  modelConsumption: "Two actual consumption models; one fixed model-generated report-production package, original and changed inputs. Not a population reliability estimate.",
  environmentPortability: "Same Windows host, isolated temporary installation/input/cwd with minimal environment and Node standard library. No cross-OS claim.",
  optimizerGeneration: "Recovered exact successful model tool-event bytes from F9.9 after shared validation repair. F9.10 docs-only; no further sampling. Package remains draft with fidelity execution and no independent internal case.",
  costs: { consumption: units.map(({ id, tokens, durationMs }) => ({ id, tokens, durationMs })), actualUsd: null, developerAgentCost: "not-measured" },
  limitations: [
    "Reevaluation changes report presentation semantics, not old results; both conditions receive the same current evaluator.",
    "Translation meaning remains agent-owned and is not proven by these structural checks.",
    "All calls used the existing cache route; cache and concurrent provider latency are not controlled.",
    "Report generation does not automate source translation or locale/config editing.",
    "No USD or broad efficiency claim; generation and failed-attempt costs are separate.",
  ],
}
await writeFile(output, JSON.stringify(result, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ output, effect, units: units.map((unit) => ({
  id: unit.id, historical: unit.historicalQualityPassed, semantic: unit.semanticQualityPassed,
  consumption: unit.consumption.observations,
})) }, null, 2))
