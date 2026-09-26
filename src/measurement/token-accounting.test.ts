import { describe, expect, test } from "bun:test"
import {
  normalizeTokenObservation, aggregateTokenObservations, compareTokenGroups,
  type UsageObservation, type UsageGroup,
} from "./token-accounting.ts"

const observation = (patch: Partial<UsageObservation> = {}): UsageObservation => ({
  id: "a", semantics: "skvm-disjoint", input: 720, output: 1059,
  cacheRead: 6528, cacheWrite: 0, evidence: "fixture:provider-mapping", ...patch,
})
const group = (id = "md", patch: Partial<UsageGroup> = {}): UsageGroup => ({
  id, account: "analysis", source: "same-provider", semantics: "skvm-disjoint",
  evidence: "fixture:matched-design", ...patch,
})

describe("normalization", () => {
  test("restores disjoint cached prompt and preserves the raw record", () => {
    const input = observation()
    const result = normalizeTokenObservation(input)
    expect(result.raw).toEqual(input)
    expect(result.raw).not.toBe(input)
    expect(result.promptTokens).toBe(7248)
    expect(result.totalTokens).toBe(8307)
    expect(result.freshInputAndOutputTokens).toBe(1779)
    expect(result.basis.promptTokens).toContain("input + cacheRead + cacheWrite")
  })
  test("counts disjoint cache writes once", () => {
    expect(normalizeTokenObservation(observation({ cacheWrite: 100 })).promptTokens).toBe(7348)
  })
  test("inclusive author input and output already contain their subsets", () => {
    const result = normalizeTokenObservation(observation({ semantics: "inclusive-input", input: 774416,
      output: 14714, cacheRead: 706560, cacheWrite: null, reasoningOutput: 1117 }))
    expect(result.promptTokens).toBe(774416)
    expect(result.totalTokens).toBe(789130)
    expect(result.freshInputAndOutputTokens).toBeNull()
    expect(result.raw.reasoningOutput).toBe(1117)
  })
  test("does not assume two inclusive cache subsets are mutually exclusive", () => {
    expect(normalizeTokenObservation(observation({ semantics: "inclusive-input", input: 10,
      cacheRead: 8, cacheWrite: 8 })).promptTokens).toBe(10)
  })
  test("explicit zero is known, including all-zero usage", () => {
    const result = normalizeTokenObservation(observation({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }))
    expect(result.promptTokens).toBe(0)
    expect(result.totalTokens).toBe(0)
  })
  for (const field of ["input", "output", "cacheRead", "cacheWrite"] as const) {
    for (const missing of [null, undefined]) {
      test(`preserves ${field}=${missing} without inventing a complete total`, () => {
        const result = normalizeTokenObservation(observation({ [field]: missing }))
        expect(result.totalTokens).toBeNull()
        expect(result.raw[field]).toBe(missing)
        expect(result.diagnostics.some(d => d.code === "missing-field" && d.field === field)).toBe(true)
      })
    }
    for (const invalid of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      test(`rejects invalid ${field}=${invalid}`, () => {
        expect(() => normalizeTokenObservation(observation({ [field]: invalid }))).toThrow()
      })
    }
  }
  test("unknown source semantics retain raw fields but no derived complete totals", () => {
    const result = normalizeTokenObservation(observation({ semantics: "unknown" }))
    expect(result.promptTokens).toBeNull()
    expect(result.totalTokens).toBeNull()
    expect(result.raw.input).toBe(720)
    expect(result.diagnostics.some(d => d.code === "unknown-semantics")).toBe(true)
  })
  test("rejects inclusive cache greater than input and reasoning greater than output", () => {
    expect(() => normalizeTokenObservation(observation({ semantics: "inclusive-input" }))).toThrow()
    expect(() => normalizeTokenObservation(observation({ semantics: "inclusive-input", cacheRead: 0, cacheWrite: 721 }))).toThrow()
    expect(() => normalizeTokenObservation(observation({ reasoningOutput: 1060 }))).toThrow()
  })
  test("requires provenance and rejects derived numeric overflow", () => {
    expect(() => normalizeTokenObservation(observation({ evidence: " " }))).toThrow()
    expect(() => normalizeTokenObservation(observation({ input: Number.MAX_SAFE_INTEGER }))).toThrow()
  })
})

describe("grouped aggregation and comparison", () => {
  test("known subtotal remains distinct from an incomplete total", () => {
    const result = aggregateTokenObservations(group(), [observation(), observation({ id: "b", output: null })])
    expect(result.metrics.totalTokens).toEqual({ knownSubtotal: 8307, total: null, completeRecords: 1, unknownRecords: 1 })
    expect(result.metrics.promptTokens.total).toBe(14496)
    expect(result.metrics.actualUSD).toEqual({ knownSubtotal: 0, total: null, completeRecords: 0, unknownRecords: 2 })
  })
  test("rejects duplicate IDs and mismatched group semantics", () => {
    expect(() => aggregateTokenObservations(group(), [observation(), observation()])).toThrow(/duplicate/i)
    expect(() => aggregateTokenObservations(group(), [observation({ semantics: "unknown" })])).toThrow(/semantics/i)
  })
  test("sorts records deterministically without mutating input", () => {
    const rows = [observation({ id: "z" }), observation({ id: "a" })]
    expect(aggregateTokenObservations(group(), rows)).toEqual(aggregateTokenObservations(group(), [...rows].reverse()))
    expect(rows[0]!.id).toBe("z")
  })
  test("empty groups have no complete totals and measured money remains separate", () => {
    expect(aggregateTokenObservations(group(), []).metrics.totalTokens.total).toBeNull()
    expect(aggregateTokenObservations(group(), [observation({ actualUSD: 0 })]).metrics.actualUSD.total).toBe(0)
  })
  test("rejects aggregate overflow", () => {
    const row = observation({ input: Number.MAX_SAFE_INTEGER, output: 0, cacheRead: 0 })
    expect(() => aggregateTokenObservations(group(), [row, { ...row, id: "b" }])).toThrow(/overflow/i)
  })
  test("reproduces AB complete-token and fresh-token percent differences", () => {
    const md = aggregateTokenObservations(group(), [observation({ input: 69011, output: 8572 })])
    const dsl = aggregateTokenObservations(group("dsl"), [observation({ id: "b", input: 77875, output: 8994, cacheRead: 0 })])
    const result = compareTokenGroups(md, dsl)
    expect(result.metrics.totalTokens.percentChange).toBe(3.2790003685605917)
    expect(result.metrics.freshInputAndOutputTokens.percentChange).toBe(11.969116945722647)
    expect(result.metrics.actualUSD.percentChange).toBeNull()
  })
  test("zero baseline and incomplete totals carry explicit reasons", () => {
    const baseline = aggregateTokenObservations(group(), [observation({ input: 0, output: 0, cacheRead: 0 })])
    const candidate = aggregateTokenObservations(group("dsl"), [observation({ id: "b" })])
    expect(compareTokenGroups(baseline, candidate).metrics.totalTokens.reason).toBe("zero-baseline")
    const incomplete = aggregateTokenObservations(group("dsl"), [observation({ id: "b", output: null })])
    expect(compareTokenGroups(baseline, incomplete).metrics.totalTokens.reason).toBe("incomplete-total")
  })
  test("refuses cross-account/source/semantics comparisons and shared record IDs", () => {
    const md = aggregateTokenObservations(group(), [observation()])
    for (const patch of [{ account: "author" }, { source: "unmatched-provider" }]) {
      const other = aggregateTokenObservations(group("dsl", patch), [observation({ id: "b" })])
      expect(() => compareTokenGroups(md, other)).toThrow()
    }
    const inclusive = aggregateTokenObservations(group("author", { semantics: "inclusive-input" }),
      [observation({ id: "b", semantics: "inclusive-input", cacheRead: 0 })])
    expect(() => compareTokenGroups(md, inclusive)).toThrow(/semantics/i)
    expect(() => compareTokenGroups(md, aggregateTokenObservations(group("dsl"), [observation()]))).toThrow(/duplicate/i)
    const unknown = aggregateTokenObservations(group("unknown", { semantics: "unknown" }), [observation({ semantics: "unknown" })])
    const unknown2 = aggregateTokenObservations(group("unknown2", { semantics: "unknown" }), [observation({ id: "b", semantics: "unknown" })])
    const result = compareTokenGroups(unknown, unknown2)
    expect(result.metrics.totalTokens.percentChange).toBeNull()
    expect(result.metrics.totalTokens.reason).toBe("unknown-semantics")
    expect(result.metrics.inputTokens.delta).toBeNull()
    expect(result.metrics.outputTokens.percentChange).toBeNull()
  })
})
