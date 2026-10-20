import { test, expect } from "bun:test"
import { inspectPackets } from "./packets.ts"

test("audit distinguishes actual client bodies from server text and pointers", () => {
  const packet = { revision: "fixed-revision", sources: [{ path: "a.go", startLine: 2, endLine: 4, text: "2 | body" }], index: [{ path: "unread.go" }], resourceExecution: { termination: "return" } }
  const run = { telemetry: { account: { turns: [{ events: [
    { direction: "client", method: "turn/start", params: { input: [{ text: "prefix Current local explanation context: " + JSON.stringify(packet) }] } },
    { direction: "server", result: { contentItems: [{ text: JSON.stringify({ path: "not-sent.go", text: "ignored" }) }] } }
  ] }] } } }
  const result = inspectPackets(run, false)
  expect(result.bodies.map(x => x.path)).toEqual(["a.go"])
  expect(result.revisions.map(x => x.value)).toContain("fixed-revision")
  expect(result.decodeErrors).toEqual([])
  expect(inspectPackets(run, true).rulesViolations).toHaveLength(1)
})

test("invalid JSON is an audit gap, never evidence of absence", () => {
  const result = inspectPackets({ telemetry: { account: { turns: [{ events: [
    { direction: "client", result: { contentItems: [{ text: "{bad" }] } }
  ] }] } } }, false)
  expect(result.decodeErrors).toHaveLength(1)
  expect(result.bodies).toEqual([])
})
