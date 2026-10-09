import { test, expect } from "bun:test"
import { migrateRetainedInterpretation } from "./replay.ts"
test("derived replay changes only qualified host revisions and retains annotation bytes", () => {
  const current: any = { sourceId: "s", source: { sha256: "sha" }, revision: "new", anchors: [{ id: "a" }] }
  const original: any = { schemaVersion: "source-interpretation/v1", revision: "old", annotations: [{ anchorId: "a", role: "resource", explanation: "Archived meaning" }], unresolved: [], propertyBindings: [{ propertyId: "p", effectRef: { sourceId: "s", sourceSha256: "sha", revision: "old", anchorId: "a", questionId: "q", operationId: "op" } }] }
  const before = JSON.stringify(original), derived = migrateRetainedInterpretation(original, current, [current])
  expect(JSON.stringify(original)).toBe(before)
  expect(derived.interpretation.annotations).toEqual(original.annotations)
  expect(derived.interpretation.propertyBindings[0].effectRef).toEqual({ ...original.propertyBindings[0].effectRef, revision: "new" })
  expect(derived.migrations).toHaveLength(2)
})
test("derived replay refuses source/anchor changes rather than manufacturing new meanings", () => {
  const current: any = { sourceId: "s", source: { sha256: "new-sha" }, revision: "new", anchors: [{ id: "a" }] }
  const original: any = { revision: "old", annotations: [{ anchorId: "foreign", role: "effect" }], unresolved: [] }
  expect(() => migrateRetainedInterpretation(original, current, [current])).toThrow("archived anchor")
  original.annotations[0].anchorId = "a"; original.propertyBindings = [{ effectRef: { sourceId: "s", sourceSha256: "old-sha", anchorId: "a" } }]
  expect(() => migrateRetainedInterpretation(original, current, [current])).toThrow("qualified reference")
})
