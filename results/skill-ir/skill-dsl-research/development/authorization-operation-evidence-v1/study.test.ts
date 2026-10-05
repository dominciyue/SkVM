import { expect, test } from "bun:test"
import { plannedPositions, modelInputPath, selectDebugRow } from "./study.ts"

test("AU registers all 32 first positions without sealed logical tasks", () => {
  const rows = plannedPositions()
  expect(rows).toHaveLength(32)
  expect(new Set(rows.map(r => r.id)).size).toBe(32)
  expect(rows.filter(r => r.kind === "quality")).toHaveLength(12)
  expect(rows.filter(r => r.kind === "variation")).toHaveLength(6)
  expect(rows.some(r => /notes|memos/.test(r.task))).toBe(false)
  expect(rows.filter(r => r.kind === "quality").map(r => r.arm).sort()).toEqual([...Array(4).fill("N"), ...Array(4).fill("M-O"), ...Array(4).fill("D-O")].sort())
})
test("only registered model inputs can enter a runner", () => {
  expect(modelInputPath("model/inputs/gitea-create-issue.json")).toContain("model")
  for (const p of ["evaluations/answer.json", "repair-events/fix.json", "model/../evaluations/answer.json", "model/inputs/unknown.json"])
    expect(() => modelInputPath(p)).toThrow()
})

test("debug dispatch is registered, source-input-bound and uses the production operation core", () => {
  const manifest: any = { rows: plannedPositions(), inputs: [{ id: "gitea-create-issue", file: "model/inputs/gitea-create-issue.json", sha256: "sha" }], inheritedSeals: { sealedTasks: ["paperless-notes"] } }
  const selected = selectDebugRow(manifest, "debug-gitea-create-issue")
  expect(selected.row.strategy).toBe("operation-evidence-v1")
  expect(selected.row.method).toBe("D1")
  expect(selected.input.sha256).toBe("sha")
  expect(() => selectDebugRow(manifest, "quality-gitea-create-issue-D-O")).toThrow()
  manifest.inheritedSeals.sealedTasks.push("gitea-create-issue")
  expect(() => selectDebugRow(manifest, "debug-gitea-create-issue")).toThrow()
})
