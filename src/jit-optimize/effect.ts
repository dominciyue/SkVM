export interface ConsumptionRunForComparison {
  source: { inputSha256: string; bindingSha256: string }
  runtime: {
    model: string
    driver: string
    bunVersion: string
    nodeVersion: string
  }
  targetAgent: {
    durationMs: number
    usageAvailable: boolean
    tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }
    actualCostUsd: number | string | null
  }
  verification: { qualityPassed: boolean }
}

export interface MatchedConsumptionPair {
  pairId: string
  original: ConsumptionRunForComparison
  optimized: ConsumptionRunForComparison
}

type Difference = { original: number; optimized: number; delta: number; changeRatio: number | null }

function difference(original: number, optimized: number): Difference {
  return {
    original,
    optimized,
    delta: optimized - original,
    changeRatio: original === 0 ? null : (optimized - original) / original,
  }
}

function observedTokens(run: ConsumptionRunForComparison): number {
  return run.targetAgent.tokens.input
    + run.targetAgent.tokens.output
    + run.targetAgent.tokens.cacheRead
    + run.targetAgent.tokens.cacheWrite
}

function assertMatched(pair: MatchedConsumptionPair): void {
  for (const field of ["inputSha256", "bindingSha256"] as const) {
    if (pair.original.source[field] !== pair.optimized.source[field]) {
      throw new Error(`Pair ${pair.pairId} is unmatched: ${field}`)
    }
  }
  for (const field of ["model", "driver", "bunVersion", "nodeVersion"] as const) {
    if (pair.original.runtime[field] !== pair.optimized.runtime[field]) {
      throw new Error(`Pair ${pair.pairId} is unmatched: runtime.${field}`)
    }
  }
  if (!pair.original.targetAgent.usageAvailable || !pair.optimized.targetAgent.usageAvailable) {
    throw new Error(`Pair ${pair.pairId} has unknown target-agent usage`)
  }
}

export function analyzeMatchedConsumptionPairs(pairs: MatchedConsumptionPair[]) {
  if (pairs.length === 0) throw new Error("At least one matched pair is required")
  pairs.forEach(assertMatched)
  const sum = (side: "original" | "optimized", value: (run: ConsumptionRunForComparison) => number) =>
    pairs.reduce((total, pair) => total + value(pair[side]), 0)
  const metric = (value: (run: ConsumptionRunForComparison) => number) =>
    difference(sum("original", value), sum("optimized", value))
  const aggregate = {
    durationMs: metric((run) => run.targetAgent.durationMs),
    tokens: {
      input: metric((run) => run.targetAgent.tokens.input),
      output: metric((run) => run.targetAgent.tokens.output),
      cacheRead: metric((run) => run.targetAgent.tokens.cacheRead),
      cacheWrite: metric((run) => run.targetAgent.tokens.cacheWrite),
      totalObserved: metric(observedTokens),
    },
  }
  const quality = {
    originalPassed: pairs.filter((pair) => pair.original.verification.qualityPassed).length,
    optimizedPassed: pairs.filter((pair) => pair.optimized.verification.qualityPassed).length,
    paired: pairs.length,
  }
  const qualityRegression = pairs.some((pair) =>
    pair.original.verification.qualityPassed && !pair.optimized.verification.qualityPassed)
  const deltas = [
    aggregate.durationMs.delta,
    aggregate.tokens.input.delta,
    aggregate.tokens.output.delta,
    aggregate.tokens.cacheRead.delta,
    aggregate.tokens.cacheWrite.delta,
    aggregate.tokens.totalObserved.delta,
  ]
  const improved = deltas.some((value) => value < 0)
  const worsened = deltas.some((value) => value > 0)
  const effect = qualityRegression
    ? "negative"
    : improved && worsened
      ? "mixed"
      : improved
        ? "positive"
        : worsened
          ? "negative"
          : "no-improvement"
  return {
    schemaVersion: "skill-ir-trace-guided-effect-analysis/v1" as const,
    effect,
    pairCount: pairs.length,
    quality,
    aggregate,
    pairs: pairs.map((pair) => ({
      pairId: pair.pairId,
      quality: {
        originalPassed: pair.original.verification.qualityPassed,
        optimizedPassed: pair.optimized.verification.qualityPassed,
      },
      durationMs: difference(pair.original.targetAgent.durationMs, pair.optimized.targetAgent.durationMs),
      tokens: {
        input: difference(pair.original.targetAgent.tokens.input, pair.optimized.targetAgent.tokens.input),
        output: difference(pair.original.targetAgent.tokens.output, pair.optimized.targetAgent.tokens.output),
        cacheRead: difference(pair.original.targetAgent.tokens.cacheRead, pair.optimized.targetAgent.tokens.cacheRead),
        cacheWrite: difference(pair.original.targetAgent.tokens.cacheWrite, pair.optimized.targetAgent.tokens.cacheWrite),
        totalObserved: difference(observedTokens(pair.original), observedTokens(pair.optimized)),
      },
    })),
    costComparison: {
      status: "unknown" as const,
      reason: "provider-pricing-unavailable" as const,
    },
    interpretation: "Quality is compared by the same deterministic checker. Token fields are reported separately; observed-token sums are not USD-equivalent because cache pricing is unknown.",
  }
}
