import { expect, test } from "bun:test"
const api = await import("./inquiry-progress.ts").catch(() => ({} as any))
test("same state and same proposal receive one repair hint then preserve independent duties", () => {
  const p = api.createInquiryProgress()
  const event = { unit: "helper", input: { observe: [] }, state: { revision: 1 }, diagnostics: ["missing-role"] }
  expect(p.record(event).action).toBe("continue")
  expect(p.record(event).action).toBe("repair-once")
  expect(p.record(event).action).toBe("continue-independent-or-deliver")
})
test("changed invalid wording does not reset the same gap but a new diagnosis or state does", () => {
  const p = api.createInquiryProgress(), event = { unit: "helper", input: { role: "bad" }, state: { revision: 1 }, diagnostics: ["missing-role"] }
  p.record(event)
  expect(p.record({ ...event, input: { role: "another-bad-field" } }).action).toBe("repair-once")
  expect(p.record({ ...event, diagnostics: ["missing-return-outcome"] }).action).toBe("continue")
  expect(p.record({ ...event, state: { revision: 2 } }).action).toBe("continue")
})

test("diagnostic prose does not reset stagnation while retained source fields count as progress", () => {
  const p = api.createInquiryProgress()
  const report: any = { slice: { revision: 0 }, focus: { current: { id: "same-focus" } }, propertyAnalysis: { demands: [{ questionId: "q", source: { id: "entry" }, revision: "source-v1", required: [{ anchorId: "a", field: "role", status: "missing" }], dependencies: { revision: "dep-v1" } }] } }
  const event = { unit: "same-focus", input: {}, state: api.inquiryProgressState(report), diagnostics: [{ code: "source-role-required", path: "b", message: "First wording" }] }
  p.record(event)
  expect(p.record({ ...event, diagnostics: [{ ...event.diagnostics[0], message: "Changed wording" }] }).action).toBe("repair-once")
  report.propertyAnalysis.demands[0].required[0].status = "provided"
  expect(p.record({ ...event, state: api.inquiryProgressState(report) }).action).toBe("continue")
})

test("retained provided values reset stagnation without a new source or dependency revision", () => {
  const p = api.createInquiryProgress()
  const interpretation: any = { revision: "source-v1", annotations: [
    { anchorId: "branch", role: "condition", explanation: "Current test", condition: { op: "eq", left: { binding: "flag" }, right: { literal: true } } },
    { anchorId: "exit", role: "context", explanation: "Current return", returnOutcome: "unknown" },
    { anchorId: "invalid", role: "condition", explanation: "Still invalid", condition: { op: "unsupported" } },
  ], fallthroughOutcome: "unknown" }
  const report: any = { slice: { revision: 0 }, focus: { current: { id: "same-focus" }, sourceDrafts: [{ handle: "entry", interpretation }] }, propertyAnalysis: { demands: [{ questionId: "q", source: { id: "source" }, revision: "source-v1", dependencies: { revision: "dep-v1" }, required: [
    { anchorId: "branch", field: "condition", status: "provided" }, { anchorId: "exit", field: "returnOutcome", status: "provided" },
    { anchorId: "source", field: "fallthroughOutcome", status: "provided" }, { anchorId: "invalid", field: "condition", status: "invalid" },
  ] }] } }
  const event = { unit: "same-focus", input: {}, diagnostics: ["another-field-missing"] }
  p.record({ ...event, state: api.inquiryProgressState(report) })
  interpretation.annotations[0].explanation = "Changed explanation only"
  interpretation.annotations[2].condition = { op: "another-unsupported" }
  expect(p.record({ ...event, state: api.inquiryProgressState(report) }).action).toBe("repair-once")
  interpretation.annotations[0].condition.right.literal = false
  expect(p.record({ ...event, state: api.inquiryProgressState(report) }).action).toBe("continue")
  interpretation.annotations[1].returnOutcome = "deny"
  expect(p.record({ ...event, state: api.inquiryProgressState(report) }).action).toBe("continue")
  interpretation.fallthroughOutcome = "allow"
  expect(p.record({ ...event, state: api.inquiryProgressState(report) }).action).toBe("continue")
})
