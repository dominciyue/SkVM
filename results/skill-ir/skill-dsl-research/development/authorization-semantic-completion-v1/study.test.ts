import { expect, test } from "bun:test"
import { qualityReady, qualifiedReuse, positionConfiguration } from "./study.ts"
test("quality admission includes unknown D while reuse requires source-reviewed current material", () => {
  const report = { status: "completed", strategy: "semantic-completion-v1", propertyAnalysis: { checks: { questions: [{ properties: [{ status: "unknown", traceDetails: [] }] }] } } }
  expect(qualityReady({ status: "valid" }, true, 4)).toBe(true)
  expect(qualifiedReuse(report, {}, "current")).toBe(false)
  expect(qualityReady({ status: "invalid" }, true, 4)).toBe(false)
  expect(qualityReady({ status: "valid" }, false, 4)).toBe(false)
  expect(qualityReady({ status: "valid" }, true, 3)).toBe(false)
})
test("registered N/D positions share bounds and public session entrance", () => {
  const n = positionConfiguration("quality-n-1"), d = positionConfiguration("quality-d-1")
  expect(n.domainTools).toBe(false); expect(n.strategy).toBe("legacy")
  expect(d.domainTools).toBe(true); expect(d.strategy).toBe("semantic-completion-v1")
  expect(n.limits).toEqual(d.limits); expect(n.entrance).toBe(d.entrance)
  expect(() => positionConfiguration("native-download")).toThrow("registered BD")
  expect(positionConfiguration("extraction-download").limits.maxToolCalls).toBe(12)
})
