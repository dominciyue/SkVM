import { expect, test } from "bun:test"
const api = await import("./accounting.ts").catch(() => ({} as any))
test("provider fresh input and cache read form full prompt without treating unknown dollars as zero", () => {
  expect(typeof api.sumUsage).toBe("function")
  const known = { providerCalls: 2, respondedCalls: 2, tokensStatus: "complete", knownTokens: { input: 100, output: 10, cacheRead: 40, cacheWrite: 0 }, unknownUsageCalls: 0, totalActualUsd: null, knownActualUsdSubtotal: 0 }
  expect(api.sumUsage([known])).toMatchObject({ providerCalls: 2, respondedCalls: 2, knownFreshInput: 100, knownFullPrompt: 140, knownOutput: 10, knownPromptAndOutput: 150, totalActualUsd: null, actualUsdStatus: "unknown" })
  expect(api.sumUsage([known, { ...known, tokensStatus: "partial", unknownUsageCalls: 1 }]).tokensStatus).toBe("partial")
})
test("proved zero dispatch and a known paid attempt do not erase unknown reported cost", () => {
  expect(typeof api.sumUsage).toBe("function")
  const zero = { providerCalls: 0, respondedCalls: 0, tokensStatus: "complete", knownTokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, unknownUsageCalls: 0, totalActualUsd: 0, knownActualUsdSubtotal: 0 }
  expect(api.sumUsage([zero])).toMatchObject({ providerCalls: 0, totalActualUsd: 0, actualUsdStatus: "complete" })
  const paid = { ...zero, providerCalls: 1, respondedCalls: 1, totalActualUsd: null }
  expect(api.sumUsage([zero, paid])).toMatchObject({ providerCalls: 1, totalActualUsd: null, actualUsdStatus: "unknown" })
})
