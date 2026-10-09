import { expect, test } from "bun:test"
const api = await import("./replay.ts").catch(() => ({})) as any
test("BB replays original proposals through public source transactions without supplying new meaning", async () => {
  expect(typeof api.replay).toBe("function")
  const replay = await api.replay()
  expect(replay.modelCalls).toBe(0); expect(replay.targetExecutions).toBe(0)
  expect(replay.entries).toHaveLength(2)
  expect(replay.entries.map((e: any) => e.original.materialUses)).toEqual([1, 0])
  expect(replay.entries.every((e: any) => e.originalHashUnchanged && e.newSemanticAnnotations === 0)).toBe(true)
  expect(replay.entries[0].submissions.some((s: any) => s.annotationRoles.includes("effect"))).toBe(true)
  expect(replay.entries.every((e: any) => e.derived && e.scope === "derived-current-public-runtime-not-real-use")).toBe(true)
}, 120000)
