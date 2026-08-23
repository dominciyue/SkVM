import { describe, expect, test } from "bun:test"
import { buildProspectiveDevelopmentResult } from "./prospective-development-result"

const tasks = ["task-a", "task-b"]
const systems = ["no-skill", "original", "ir-static"]

function rows() {
  return tasks.flatMap((task) => [1, 2].flatMap((runIndex) => systems.map((system) => ({
    task,
    runIndex,
    system,
    evaluatorScore: system === "ir-static" && task === "task-b" && runIndex === 2 ? 1 : 0.2,
    success: system === "ir-static" && task === "task-b" && runIndex === 2,
    successSource: "deterministic-evaluator",
  }))))
}

describe("prospective development result", () => {
  test("keeps measurement, contribution, static, artifact, and automatic claims separate", () => {
    const result = buildProspectiveDevelopmentResult({
      experimentId: "bids-prospective-development-2026-08-23",
      analysisPolicySha256: "a".repeat(64),
      modelRows: rows(),
      artifactRows: tasks.flatMap((task) => [1, 2].map((runIndex) => ({
        task, runIndex, system: "validated-artifact", evaluatorScore: 1, success: true,
        successSource: "deterministic-evaluator",
      }))),
      classifications: Array.from({ length: 12 }, () => "semantic-complete"),
      evidence: {
        modelRaw: { path: "run/raw-runs.jsonl", sha256: "b".repeat(64) },
        modelScored: { path: "run/scored-runs.jsonl", sha256: "c".repeat(64) },
        executionEnvelopes: { path: "run/execution-envelopes.jsonl", sha256: "d".repeat(64) },
        artifactRaw: { path: "artifact-control/raw-runs.jsonl", sha256: "e".repeat(64) },
        artifactScored: { path: "artifact-control/scored-runs.jsonl", sha256: "f".repeat(64) },
        constructionReport: { path: "construction/report.json", sha256: "1".repeat(64) },
      },
      executionTotals: { input: 100, output: 20, cacheRead: 30, cacheWrite: 0, durationMs: 5000 },
      maximumActiveExecutionFailures: 1,
      maximumParserOrRuntimeBlockers: 0,
      automaticConstructionEligible: false,
    })
    expect(result.measurement.status).toBe("eligible")
    expect(result.measurement.executionTotals).toEqual({
      input: 100, output: 20, cacheRead: 30, cacheWrite: 0, durationMs: 5000,
    })
    expect(result.evidence.modelRaw.sha256).toBe("b".repeat(64))
    expect(result.systems).toMatchObject({
      "no-skill": { meanScore: 0.2, successes: 0 },
      original: { meanScore: 0.2, successes: 0 },
      "ir-static": { meanScore: 0.4, successes: 1 },
      "validated-artifact": { meanScore: 1, successes: 4 },
    })
    expect(result.estimands[0]).toMatchObject({ id: "original-minus-no-skill", meanDelta: 0, positivePairs: 0 })
    expect(result.estimands[1]).toMatchObject({ id: "ir-static-minus-original", meanDelta: 0.2, positivePairs: 1 })
    expect(result.estimands[2]).toMatchObject({ id: "validated-artifact-minus-original", meanDelta: 0.8, positivePairs: 4 })
    expect(result.decisions).toEqual({
      contributionIdentified: false,
      irStaticImproved: true,
      validatedArtifactImproved: true,
      automaticOptimizedResult: false,
    })
  })
})
