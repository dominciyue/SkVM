import { expect, test } from "bun:test"
import type { BoundSemanticBlock } from "./semantic-flow.ts"
const api = await import("./source-materials.ts").catch(() => ({} as any))
const unit = (extra = {}): BoundSemanticBlock => ({ itemId: "focus-one", handle: "helper", questionId: "q", evidenceIds: ["ev"], op: "add", role: "helper", start: "body", complete: true, coverage: "path", parameters: [], blocks: [{ name: "body", steps: [{ kind: "return", name: "done", claim: "Test-authored source interpretation", value: true }] }], source: { id: "source-one", path: "app.py", sha256: "sha-one", startLine: 1, endLine: 2 }, ...extra })
const dependencies = [{ kind: "source-span", key: "app.py", revision: "sha-one" }, { kind: "symbol-resolution", key: "source-one", revision: "sha-one" }] as any
const identity = { repository: "anonymous", sourceRef: "r", semanticVersion: "finite-control/v1" }

test("source helper material is saved without an entry and rejects absent dependency footprints", () => {
  expect(typeof api.createSourceMaterials).toBe("function")
  const store = api.createSourceMaterials(identity)
  const material = store.accept(unit(), dependencies)
  expect(material.current).toBe(true)
  expect(material.semanticSupport).toBe("unreviewed")
  expect(store.snapshot().materials).toHaveLength(1)
  expect(() => store.accept(unit({ handle: "missing" }), [])).toThrow("source-material-dependency-missing")
  expect(store.snapshot().materials).toHaveLength(1)
})

test("material identity excludes question, focus, handle and replacement metadata but includes receiver and source revision", () => {
  const store = api.createSourceMaterials(identity), first = store.accept(unit(), dependencies)
  const repeated = store.accept(unit({ itemId: "other-focus", handle: "other-handle", questionId: "other-question", op: "replace" }), dependencies)
  expect(repeated.id).toBe(first.id)
  expect(store.snapshot().materials).toHaveLength(1)
  expect(store.accept(unit({ receiverClass: "app.Special" }), dependencies).id).not.toBe(first.id)
  expect(() => store.accept(unit({ source: { ...unit().source!, sha256: "changed" } }), dependencies)).toThrow("source-material-dependency-missing")
})

test("invalidating one dependency retires its material while a separately validated receiver survives", () => {
  const store = api.createSourceMaterials(identity)
  const first = store.accept(unit(), [...dependencies, { kind: "candidate-set", key: "relations:one", revision: "r1" }])
  const other = store.accept(unit({ receiverClass: "app.Special" }), [...dependencies, { kind: "candidate-set", key: "relations:two", revision: "r2" }])
  store.invalidate((d: any) => d.key === "relations:one", "override changed")
  expect(store.snapshot().materials.find((m: any) => m.id === first.id).current).toBe(false)
  expect(store.snapshot().materials.find((m: any) => m.id === other.id).current).toBe(true)
})

test("reaccepting A after A to B restores one current material with the latest validated binding", () => {
  const store = api.createSourceMaterials(identity), original = unit()
  const first = store.accept(original, dependencies, "test-authored")
  const intermediate = store.accept(unit({ blocks: [{ name: "body", steps: [{ kind: "return", name: "done", claim: "Intermediate test-authored interpretation", value: false }] }] }), dependencies, "test-authored")
  expect(store.snapshot().materials.find((m: any) => m.id === first.id).current).toBe(false)
  expect(() => store.accept(original, [], "revalidated-original")).toThrow("source-material-dependency-missing")
  expect(store.snapshot().materials.find((m: any) => m.id === intermediate.id).current).toBe(true)
  const refreshed = unit({ questionId: "current-question", itemId: "current-focus", handle: "current-helper", op: "replace", evidenceIds: ["current-evidence"] })
  const restored = store.accept(refreshed, dependencies, "revalidated-original"), snapshot = store.snapshot()
  expect(restored.id).toBe(first.id)
  expect(snapshot.materials.filter((m: any) => m.current).map((m: any) => m.id)).toEqual([first.id])
  expect(restored.unit).toEqual(refreshed)
  expect(restored.evidenceIds).toEqual(["current-evidence"])
  expect(restored.interpretationSource).toBe("revalidated-original")
  expect(snapshot.retired).toEqual([{ id: first.id, reason: "source-interpretation-replaced" }, { id: intermediate.id, reason: "source-interpretation-replaced" }])
})
