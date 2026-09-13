import { describe, expect, test } from "bun:test"
import { analyzeMatchedConsumptionPairs } from "../../src/jit-optimize/effect.ts"

function run(input: {
  inputSha256?: string
  model?: string
  qualityPassed?: boolean
  durationMs: number
  input: number
  output: number
  cacheRead: number | null
  actualCostUsd?: number | string | null
  counts?: { runCount: number; modelResponseCount: number; turnCount: number; toolCallCount: number; retryCount: number }
}) {
  return {
    source: { inputSha256: input.inputSha256 ?? "a".repeat(64), bindingSha256: "b".repeat(64) },
    runtime: { model: input.model ?? "provider/model", driver: "pi", bunVersion: "1.3.14", nodeVersion: "v24.3.0" },
    targetAgent: {
      durationMs: input.durationMs,
      usageAvailable: true,
      tokens: { input: input.input, output: input.output, cacheRead: input.cacheRead, cacheWrite: 0 },
      actualCostUsd: input.actualCostUsd ?? "unknown-provider-pricing",
      ...(input.counts ? { counts: input.counts } : {}),
    },
    verification: { qualityPassed: input.qualityPassed ?? true },
  }
}

describe("analyzeMatchedConsumptionPairs", () => {
  test("reports mixed effects without turning unknown cost into zero", () => {
    const result = analyzeMatchedConsumptionPairs([{
      pairId: "users",
      original: run({ durationMs: 60_000, input: 10_000, output: 3_000, cacheRead: 10_000 }),
      optimized: run({ durationMs: 30_000, input: 12_000, output: 800, cacheRead: 40_000 }),
    }])
    expect(result.effect).toBe("mixed")
    expect(result.quality).toEqual({ originalPassed: 1, optimizedPassed: 1, paired: 1 })
    expect(result.aggregate.durationMs.changeRatio).toBeCloseTo(-0.5)
    const output = result.aggregate.tokens.output
    const total = result.aggregate.tokens.totalObserved
    if (!("changeRatio" in output) || !("changeRatio" in total)) throw new Error("complete token fixture must be comparable")
    expect(output.changeRatio).toBeCloseTo(-0.733333, 5)
    expect(total.changeRatio).toBeGreaterThan(1)
    expect(result.costComparison).toEqual({ status: "unknown", reason: "provider-pricing-unavailable" })
  })

  test("rejects unmatched task or runtime bindings", () => {
    expect(() => analyzeMatchedConsumptionPairs([{
      pairId: "mismatch",
      original: run({ durationMs: 1, input: 1, output: 1, cacheRead: 0 }),
      optimized: run({ inputSha256: "c".repeat(64), durationMs: 1, input: 1, output: 1, cacheRead: 0 }),
    }])).toThrow("inputSha256")
  })

  test("does not call a quality regression an optimization", () => {
    const result = analyzeMatchedConsumptionPairs([{
      pairId: "quality-regression",
      original: run({ durationMs: 100, input: 10, output: 10, cacheRead: 0 }),
      optimized: run({ qualityPassed: false, durationMs: 20, input: 2, output: 2, cacheRead: 0 }),
    }])
    expect(result.effect).toBe("negative")
  })

  test("compares execution counts and actual cost only when both sides provide matching units", () => {
    const counts = { runCount: 1, modelResponseCount: 3, turnCount: 3, toolCallCount: 4, retryCount: 1 }
    const result = analyzeMatchedConsumptionPairs([{
      pairId: "accounting",
      original: run({ durationMs: 100, input: 10, output: 5, cacheRead: 2, actualCostUsd: 0.4, counts }),
      optimized: run({
        durationMs: 90, input: 9, output: 4, cacheRead: 2, actualCostUsd: 0.3,
        counts: { ...counts, modelResponseCount: 2, turnCount: 2, toolCallCount: 2, retryCount: 0 },
      }),
    }])
    expect(result.aggregate.executionCounts).toMatchObject({
      status: "available",
      runCount: { original: 1, optimized: 1, delta: 0 },
      modelResponseCount: { original: 3, optimized: 2, delta: -1 },
      toolCallCount: { original: 4, optimized: 2, delta: -2 },
      retryCount: { original: 1, optimized: 0, delta: -1 },
    })
    expect(result.costComparison).toMatchObject({ status: "available", actualUsd: { original: 0.4, optimized: 0.3 } })
  })

  test("keeps missing cache telemetry unknown while comparing available token fields", () => {
    const result = analyzeMatchedConsumptionPairs([{
      pairId: "partial-usage",
      original: run({ durationMs: 120, input: 30, output: 5, cacheRead: null }),
      optimized: run({ durationMs: 80, input: 20, output: 6, cacheRead: 10 }),
    }])
    expect(result.aggregate.tokens.input).toMatchObject({ original: 30, optimized: 20, delta: -10 })
    expect(result.aggregate.tokens.output).toMatchObject({ original: 5, optimized: 6, delta: 1 })
    expect(result.aggregate.tokens.cacheRead).toEqual({ status: "unknown", reason: "token-field-unavailable" })
    expect(result.aggregate.tokens.totalObserved).toEqual({ status: "unknown", reason: "token-field-unavailable" })
    expect(result.effect).toBe("mixed")
  })
})
