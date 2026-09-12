import { describe, expect, test } from "bun:test"
import { analyzeMatchedConsumptionPairs } from "../../src/jit-optimize/effect.ts"

function run(input: {
  inputSha256?: string
  model?: string
  qualityPassed?: boolean
  durationMs: number
  input: number
  output: number
  cacheRead: number
}) {
  return {
    source: { inputSha256: input.inputSha256 ?? "a".repeat(64), bindingSha256: "b".repeat(64) },
    runtime: { model: input.model ?? "provider/model", driver: "pi", bunVersion: "1.3.14", nodeVersion: "v24.3.0" },
    targetAgent: {
      durationMs: input.durationMs,
      usageAvailable: true,
      tokens: { input: input.input, output: input.output, cacheRead: input.cacheRead, cacheWrite: 0 },
      actualCostUsd: "unknown-provider-pricing",
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
    expect(result.aggregate.tokens.output.changeRatio).toBeCloseTo(-0.733333, 5)
    expect(result.aggregate.tokens.totalObserved.changeRatio).toBeGreaterThan(1)
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
})
