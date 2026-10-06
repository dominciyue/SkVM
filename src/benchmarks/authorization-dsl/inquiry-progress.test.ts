import { expect, test } from "bun:test"
const api = await import("./inquiry-progress.ts").catch(() => ({} as any))
test("same state and same proposal receive one repair hint then preserve independent duties", () => {
  const p = api.createInquiryProgress()
  const event = { unit: "helper", input: { observe: [] }, state: { revision: 1 }, diagnostics: ["missing-role"] }
  expect(p.record(event).action).toBe("continue")
  expect(p.record(event).action).toBe("repair-once")
  expect(p.record(event).action).toBe("continue-independent-or-deliver")
})
test("new input or actual state progress keeps working even with the same tool name", () => {
  const p = api.createInquiryProgress(), event = { unit: "helper", input: { role: "bad" }, state: { revision: 1 }, diagnostics: ["missing-role"] }
  p.record(event); p.record(event)
  expect(p.record({ ...event, input: { role: "resource" } }).action).toBe("continue")
  expect(p.record({ ...event, state: { revision: 2 } }).action).toBe("continue")
})
