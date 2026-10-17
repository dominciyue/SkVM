import { expect, test } from "bun:test"
const wire: any = await import("./wire.ts").catch(() => ({}))
test("wire claims require observed source tables and every consumer rule revision to match", () => {
  expect(typeof wire.assessWireRows).toBe("function")
  const row = { position: "Q0-R1-0", attempt: "first", sourceSets: [[{ name: "source_read" }]], firstRule: "fixed", ruleHashes: ["fixed"] }
  expect(wire.assessWireRows([row])).toMatchObject({ identicalSourceTools: true, identicalFixedRules: true })
  expect(() => wire.assessWireRows([{ ...row, ruleHashes: ["fixed", "changed-later"] }])).toThrow("rule")
  expect(wire.assessWireRows([])).toMatchObject({ identicalSourceTools: false, identicalFixedRules: false })
  expect(wire.assessWireRows([{ ...row, sourceSets: [] }])).toMatchObject({ identicalSourceTools: false })
  expect(wire.assessWireRows([{ ...row, firstRule: undefined, ruleHashes: [] }])).toMatchObject({ identicalFixedRules: false })
})
test("interrupted wire evidence falls back to retained lifecycle without inventing a complete archive", () => {
  expect(typeof wire.wireTurnRecords).toBe("function")
  const event = { direction: "client", method: "thread/start", params: { dynamicTools: [] } }
  const lifecycle = { name: "lifecycle.jsonl", text: JSON.stringify(event) + "\n" }
  const partial = wire.wireTurnRecords([lifecycle])
  expect(partial).toMatchObject({ completeArchive: false, turns: [{ events: [event] }] })
  const complete = wire.wireTurnRecords([lifecycle, { name: "account-turn-1.json", text: JSON.stringify({ events: [event] }) }])
  expect(complete).toMatchObject({ completeArchive: true })
  expect(complete.turns).toHaveLength(1)
  expect(() => wire.wireTurnRecords([])).toThrow("No retained wire")
})
test("rules wire audit preserves authored raw but detects results in restored and child views", () => {
  expect(typeof wire.rulesResultPaths).toBe("function")
  expect(wire.rulesResultPaths({ raw: { returned: "author field" }, steps: [{ value: { literal: { outcome: "author text" } } }], ruleDocument: { markdown: "outcome" } })).toEqual([])
  expect(wire.rulesResultPaths({ currentContext: { outcome: { returned: 4 } } })).toContain("$.currentContext.outcome")
  expect(wire.rulesResultPaths({ retainedViews: [{ output: JSON.stringify({ resourceExecution: { returned: 4 } }) }] })).toContain("$.retainedViews.0.output<json>.resourceExecution")
})
