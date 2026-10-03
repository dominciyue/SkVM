import { expect, test } from "bun:test"
import { assertKnownAuthoredRepair } from "./ordinary-authored-use.ts"

const expected = { stage: "consume-authorization-example", author: "author-example", inputSha256: "original-input" }
const report = { status: "transport-failed", telemetry: { providerCalls: 12, respondedCalls: 12 } }
test("a named authored-package repair admits only the same fully responded original", () => {
  expect(() => assertKnownAuthoredRepair({ claim: expected, report }, expected)).not.toThrow()
  expect(() => assertKnownAuthoredRepair({ claim: { ...expected, inputSha256: "changed-input" }, report }, expected)).toThrow(/identity/)
})
test("an old SDK-timeout classification cannot become a renamed authored-package repair", () => {
  expect(() => assertKnownAuthoredRepair({ claim: expected, report: { ...report, completionUnknown: true, telemetry: { providerCalls: 11, respondedCalls: 10 } } }, expected)).toThrow(/unknown completion/)
  expect(() => assertKnownAuthoredRepair({ claim: expected, report: { ...report, status: "timeout-unknown" } }, expected)).toThrow(/unknown completion/)
})
test("unknown or incomplete response accounting does not authorize another authored-package dispatch", () => {
  expect(() => assertKnownAuthoredRepair({ claim: expected, report: { ...report, telemetry: { providerCalls: 12, respondedCalls: null } } }, expected)).toThrow(/fully responded/)
})
