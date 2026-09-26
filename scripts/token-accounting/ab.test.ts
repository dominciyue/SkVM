import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { buildAbEvidence } from "./clarify-ab.ts"

test("AB extracts sixteen archived attempts and preserves separate inclusive author totals", () => {
  const manifest = JSON.parse(readFileSync(new URL("./fixtures/ab-sources.json", import.meta.url), "utf8"))
  const result = buildAbEvidence(resolve(import.meta.dir, "../.."), manifest)
  const md = result.report.groups.find(g => g.group.id === "analysis-markdown")!
  const dsl = result.report.groups.find(g => g.group.id === "analysis-dsl")!
  expect(md.recordCount + dsl.recordCount).toBe(16)
  expect(md.metrics.promptTokens.total).toBe(75539)
  expect(md.metrics.totalTokens.total).toBe(84111)
  expect(dsl.metrics.totalTokens.total).toBe(86869)
  expect(result.report.groups.find(g => g.group.id === "author-markdown")!.metrics.totalTokens.total).toBe(789130)
  expect(result.report.groups.find(g => g.group.id === "author-dsl")!.metrics.totalTokens.total).toBe(671649)
  expect(result.clarification.fullPromptAndOutputDeltaPercent).toBe(3.2790003685605917)
  expect(result.clarification.originalFreshInputAndOutputDeltaPercent).toBe(11.969116945722647)
  expect(result.clarification.originalResponseDurationDeltaPercent).toBe(-8.492489676207594)
  expect(result.clarification.quality.fullSuccess).toEqual({ markdown: 8, dsl: 6 })
  expect(result.clarification.sourceFiles).toHaveLength(19)
  expect(result.clarification.sourceFiles.every(f => f.sha256Before === f.sha256After)).toBe(true)
  expect(result.report.groups.every(g => g.metrics.actualUSD.total === null)).toBe(true)
  expect(result.clarification.authorProviderCalls).toBeNull()
  expect(result.clarification.humanMinutes).toBeNull()
})

test("AB source manifest rejects duplicate, missing and escaping input identities", () => {
  const manifest = JSON.parse(readFileSync(new URL("./fixtures/ab-sources.json", import.meta.url), "utf8"))
  const root = resolve(import.meta.dir, "../..")
  expect(() => buildAbEvidence(root, { ...manifest, runs: manifest.runs.slice(1) })).toThrow()
  expect(() => buildAbEvidence(root, { ...manifest, summary: "../outside.json" })).toThrow()
  expect(() => buildAbEvidence(root, { ...manifest, runs: [...manifest.runs.slice(1), manifest.runs[1]] })).toThrow()
})
