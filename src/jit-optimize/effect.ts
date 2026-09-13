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
    tokens: { input: number | null; output: number | null; cacheRead: number | null; cacheWrite: number | null }
    actualCostUsd: number | string | null
    counts?: {
      runCount: number
      modelResponseCount: number
      turnCount: number
      toolCallCount: number
      retryCount: number
    }
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

function observedTokens(run: ConsumptionRunForComparison): number | null {
  const values = Object.values(run.targetAgent.tokens)
  return values.every((value): value is number => typeof value === "number")
    ? values.reduce((total, value) => total + value, 0)
    : null
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
  const optionalMetric = (value: (run: ConsumptionRunForComparison) => number | null) => {
    const original = pairs.map((pair) => value(pair.original))
    const optimized = pairs.map((pair) => value(pair.optimized))
    if (!original.every((item): item is number => typeof item === "number")
      || !optimized.every((item): item is number => typeof item === "number")) {
      return { status: "unknown" as const, reason: "token-field-unavailable" as const }
    }
    return difference(
      original.reduce((total, item) => total + item, 0),
      optimized.reduce((total, item) => total + item, 0),
    )
  }
  const optionalDifference = (original: number | null, optimized: number | null) =>
    typeof original === "number" && typeof optimized === "number"
      ? difference(original, optimized)
      : { status: "unknown" as const, reason: "token-field-unavailable" as const }
  const aggregate = {
    durationMs: metric((run) => run.targetAgent.durationMs),
    tokens: {
      input: optionalMetric((run) => run.targetAgent.tokens.input),
      output: optionalMetric((run) => run.targetAgent.tokens.output),
      cacheRead: optionalMetric((run) => run.targetAgent.tokens.cacheRead),
      cacheWrite: optionalMetric((run) => run.targetAgent.tokens.cacheWrite),
      totalObserved: optionalMetric(observedTokens),
    },
    executionCounts: pairs.every((pair) => pair.original.targetAgent.counts && pair.optimized.targetAgent.counts)
      ? {
          status: "available" as const,
          runCount: metric((run) => run.targetAgent.counts!.runCount),
          modelResponseCount: metric((run) => run.targetAgent.counts!.modelResponseCount),
          turnCount: metric((run) => run.targetAgent.counts!.turnCount),
          toolCallCount: metric((run) => run.targetAgent.counts!.toolCallCount),
          retryCount: metric((run) => run.targetAgent.counts!.retryCount),
        }
      : { status: "unknown" as const, reason: "execution-counts-unavailable" as const },
  }
  const quality = {
    originalPassed: pairs.filter((pair) => pair.original.verification.qualityPassed).length,
    optimizedPassed: pairs.filter((pair) => pair.optimized.verification.qualityPassed).length,
    paired: pairs.length,
  }
  const qualityRegression = pairs.some((pair) =>
    pair.original.verification.qualityPassed && !pair.optimized.verification.qualityPassed)
  const deltas = [aggregate.durationMs, ...Object.values(aggregate.tokens)]
    .flatMap((value) => "delta" in value ? [value.delta] : [])
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
        input: optionalDifference(pair.original.targetAgent.tokens.input, pair.optimized.targetAgent.tokens.input),
        output: optionalDifference(pair.original.targetAgent.tokens.output, pair.optimized.targetAgent.tokens.output),
        cacheRead: optionalDifference(pair.original.targetAgent.tokens.cacheRead, pair.optimized.targetAgent.tokens.cacheRead),
        cacheWrite: optionalDifference(pair.original.targetAgent.tokens.cacheWrite, pair.optimized.targetAgent.tokens.cacheWrite),
        totalObserved: optionalDifference(observedTokens(pair.original), observedTokens(pair.optimized)),
      },
    })),
    costComparison: pairs.every((pair) =>
      typeof pair.original.targetAgent.actualCostUsd === "number"
      && typeof pair.optimized.targetAgent.actualCostUsd === "number")
      ? {
          status: "available" as const,
          actualUsd: metric((run) => run.targetAgent.actualCostUsd as number),
        }
      : {
          status: "unknown" as const,
          reason: "provider-pricing-unavailable" as const,
        },
    interpretation: "Quality is compared by the same deterministic checker. Token fields are reported separately and missing components remain unknown; observed-token sums are not USD-equivalent because cache pricing is unknown.",
  }
}
