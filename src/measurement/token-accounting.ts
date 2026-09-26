import { z } from "zod"

export type InputTokenSemantics = "skvm-disjoint" | "inclusive-input" | "unknown"

/** Null and absent counters remain unknown. Semantics are assertions backed by evidence. */
export interface UsageObservation {
  id: string
  semantics: InputTokenSemantics
  input?: number | null
  output?: number | null
  cacheRead?: number | null
  cacheWrite?: number | null
  reasoningOutput?: number | null
  actualUSD?: number | null
  evidence: string
}

export interface TokenDiagnostic {
  code: "missing-field" | "unknown-semantics" | "unknown-fresh-input"
  field: string
  reason: string
}

export interface NormalizedTokenObservation {
  raw: UsageObservation
  promptTokens: number | null
  totalTokens: number | null
  freshInputAndOutputTokens: number | null
  basis: { promptTokens: string; totalTokens: string; freshInputAndOutputTokens: string }
  diagnostics: TokenDiagnostic[]
}

export interface UsageGroup {
  id: string
  account: string
  source: string
  semantics: InputTokenSemantics
  evidence: string
}

export const TOKEN_METRICS = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens",
  "promptTokens", "totalTokens", "freshInputAndOutputTokens", "actualUSD"] as const
export type TokenMetric = typeof TOKEN_METRICS[number]
export interface MetricAggregate {
  knownSubtotal: number
  total: number | null
  completeRecords: number
  unknownRecords: number
}
export interface TokenGroupAggregate {
  group: UsageGroup
  recordCount: number
  records: NormalizedTokenObservation[]
  metrics: Record<TokenMetric, MetricAggregate>
}
export interface MetricComparison {
  baseline: number | null
  candidate: number | null
  delta: number | null
  percentChange: number | null
  reason: "incomplete-total" | "zero-baseline" | "unknown-semantics" | "numeric-overflow" | null
}
export interface TokenGroupComparison {
  baselineGroup: string
  candidateGroup: string
  account: string
  source: string
  semantics: InputTokenSemantics
  formula: "(candidate / baseline - 1) * 100"
  metrics: Record<TokenMetric, MetricComparison>
}

const text = z.string().refine(value => value.trim().length > 0, "nonblank text required")
const semantics = z.enum(["skvm-disjoint", "inclusive-input", "unknown"])
const counter = z.number().finite().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullish()
export const UsageObservationSchema = z.object({
  id: text, semantics, input: counter, output: counter, cacheRead: counter, cacheWrite: counter,
  reasoningOutput: counter, actualUSD: z.number().finite().nonnegative().nullish(), evidence: text,
}).strict()
export const UsageGroupSchema = z.object({ id: text, account: text, source: text, semantics, evidence: text }).strict()

function sum(values: readonly number[], money = false): number {
  const result = values.reduce((a, b) => a + b, 0)
  if (!Number.isFinite(result) || (!money && !Number.isSafeInteger(result))) {
    throw new Error("numeric overflow in token accounting")
  }
  return result
}

function completeSum(values: readonly (number | null | undefined)[]): number | null {
  return values.every((value): value is number => value != null) ? sum(values) : null
}

/** Invalid observations fail closed; valid unknown observations return null derived totals. */
export function normalizeTokenObservation(value: UsageObservation): NormalizedTokenObservation {
  const raw = UsageObservationSchema.parse(value)
  if (raw.semantics === "inclusive-input" && raw.input != null) {
    for (const field of ["cacheRead", "cacheWrite"] as const) {
      if (raw[field] != null && raw[field] > raw.input) throw new Error(`${raw.id}: ${field} exceeds inclusive input`)
    }
  }
  if (raw.reasoningOutput != null && raw.output != null && raw.reasoningOutput > raw.output) {
    throw new Error(`${raw.id}: reasoningOutput exceeds output`)
  }
  const diagnostics: TokenDiagnostic[] = []
  for (const field of ["input", "output", "cacheRead", "cacheWrite", "actualUSD"] as const) {
    if (raw[field] == null) diagnostics.push({ code: "missing-field", field, reason: `${field} was not reported; not zero` })
  }
  let promptTokens: number | null = null
  let freshInputAndOutputTokens: number | null = null
  let promptBasis: string
  if (raw.semantics === "skvm-disjoint") {
    promptTokens = completeSum([raw.input, raw.cacheRead, raw.cacheWrite])
    freshInputAndOutputTokens = completeSum([raw.input, raw.output])
    promptBasis = "input + cacheRead + cacheWrite; evidence asserts disjoint components"
  } else if (raw.semantics === "inclusive-input") {
    promptTokens = raw.input ?? null
    promptBasis = "input; cache counters are included subsets, never added again"
    diagnostics.push({ code: "unknown-fresh-input", field: "freshInputAndOutputTokens",
      reason: "No disjoint cache partition is asserted; fresh input is not derived from inclusive input" })
  } else {
    promptBasis = "unknown input semantics; no prompt formula is justified"
    diagnostics.push({ code: "unknown-semantics", field: "semantics", reason: promptBasis })
  }
  return {
    raw, promptTokens, totalTokens: completeSum([promptTokens, raw.output]), freshInputAndOutputTokens,
    basis: {
      promptTokens: `${promptBasis}; source: ${raw.evidence}`,
      totalTokens: "promptTokens + output, only when both are known; reasoningOutput is an output subset",
      freshInputAndOutputTokens: raw.semantics === "skvm-disjoint"
        ? "input + output; excludes separately reported cacheRead/cacheWrite"
        : "unknown; no disjoint fresh-input measurement",
    }, diagnostics,
  }
}

export function aggregateTokenObservations(group: UsageGroup, observations: readonly UsageObservation[]): TokenGroupAggregate {
  const parsedGroup = UsageGroupSchema.parse(group)
  const ids = new Set<string>()
  const records = observations.map(observation => {
    const record = normalizeTokenObservation(observation)
    if (ids.has(record.raw.id)) throw new Error(`duplicate observation id: ${record.raw.id}`)
    ids.add(record.raw.id)
    if (record.raw.semantics !== parsedGroup.semantics) throw new Error(`semantics mismatch in group ${group.id}`)
    return record
  }).sort((a, b) => a.raw.id < b.raw.id ? -1 : a.raw.id > b.raw.id ? 1 : 0)
  const values: Record<TokenMetric, (record: NormalizedTokenObservation) => number | null | undefined> = {
    inputTokens: r => r.raw.input, outputTokens: r => r.raw.output,
    cacheReadTokens: r => r.raw.cacheRead, cacheWriteTokens: r => r.raw.cacheWrite,
    promptTokens: r => r.promptTokens, totalTokens: r => r.totalTokens,
    freshInputAndOutputTokens: r => r.freshInputAndOutputTokens, actualUSD: r => r.raw.actualUSD,
  }
  const metrics = Object.fromEntries(TOKEN_METRICS.map(metric => {
    const known = records.map(values[metric]).filter((v): v is number => v != null)
    const knownSubtotal = sum(known, metric === "actualUSD")
    return [metric, {
      knownSubtotal, total: records.length > 0 && known.length === records.length ? knownSubtotal : null,
      completeRecords: known.length, unknownRecords: records.length - known.length,
    }]
  })) as Record<TokenMetric, MetricAggregate>
  return { group: parsedGroup, recordCount: records.length, records, metrics }
}

export function compareTokenGroups(baseline: TokenGroupAggregate, candidate: TokenGroupAggregate): TokenGroupComparison {
  if (baseline.group.id === candidate.group.id) throw new Error("comparison requires distinct groups")
  for (const field of ["account", "source", "semantics"] as const) {
    if (baseline.group[field] !== candidate.group[field]) throw new Error(`comparison ${field} mismatch`)
  }
  const unknownSemantics = baseline.group.semantics === "unknown"
  const ids = new Set(baseline.records.map(record => record.raw.id))
  if (candidate.records.some(record => ids.has(record.raw.id))) throw new Error("duplicate observation id across comparison groups")
  const metrics = Object.fromEntries(TOKEN_METRICS.map(metric => {
    const a = baseline.metrics[metric].total
    const b = candidate.metrics[metric].total
    const delta = !unknownSemantics && a != null && b != null ? b - a : null
    const percentage = a != null && b != null && a !== 0 ? (b / a - 1) * 100 : null
    const reason = unknownSemantics ? "unknown-semantics" : a == null || b == null ? "incomplete-total" : a === 0 ? "zero-baseline"
      : !Number.isFinite(percentage) ? "numeric-overflow" : null
    return [metric, { baseline: a, candidate: b, delta, percentChange: reason === null ? percentage : null, reason }]
  })) as Record<TokenMetric, MetricComparison>
  return { baselineGroup: baseline.group.id, candidateGroup: candidate.group.id,
    account: baseline.group.account, source: baseline.group.source, semantics: baseline.group.semantics,
    formula: "(candidate / baseline - 1) * 100", metrics }
}
