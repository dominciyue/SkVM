import { expect, test } from "bun:test"
import { migrateInterpretation } from "./replay.ts"
test("replay migrates only current revision identities and never adds source meaning", () => {
  const source = { revision: "current", source: { sha256: "same" }, anchors: [{ id: "a" }] }, original = { revision: "old", annotations: [{ anchorId: "a", role: "context", explanation: "Original model meaning" }], unresolved: [], propertyBindings: [{ propertyId: "p", effectRef: { sourceId: "s", sourceSha256: "same", revision: "old", anchorId: "a" } }] }
  const result = migrateInterpretation(original, source, new Map([["s", source]]))
  expect(result.failures).toEqual([]); expect(result.annotationsByteIdentical).toBe(true); expect(result.interpretation.propertyBindings[0].effectRef.revision).toBe("current")
  expect(original.propertyBindings[0]!.effectRef.revision).toBe("old")
  expect(migrateInterpretation(original, { ...source, anchors: [] }, new Map()).failures.length).toBeGreaterThan(0)
})
