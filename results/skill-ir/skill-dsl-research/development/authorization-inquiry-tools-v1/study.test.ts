import { test, expect } from "bun:test"
import { tasks, plannedRows, makeInput, renameGiteaSource } from "./study.ts"
test("registration keeps planned denominators, natural briefs, independent policy and source identity", () => {
  const rows = plannedRows()
  expect(rows.filter(r => r.kind === "quality").length).toBe(32)
  expect(rows.filter(r => r.kind === "author").length).toBe(8)
  expect(rows.filter(r => r.kind === "consume").length).toBe(8)
  expect(rows.filter(r => r.kind === "skill").length).toBe(8)
  expect(new Set(rows.map(r => r.id)).size).toBe(56)
  for (const task of tasks) {
    const input = makeInput(task)
    expect(input.inquiry).toBeUndefined()
    expect(input.brief).toBe(task.brief)
    expect(JSON.stringify(input)).not.toContain('"expectation"')
    expect(input.mode === "conformance").toBe(!!input.policy)
  }
})
test("synthetic rename keeps actual fixed-ref import and handler reference connected", () => {
  const renamed = renameGiteaSource('import "gitea.dev/routers/api/v1/repo"\nrepo.GetRepoPermissions(ctx)')
  expect(renamed).toContain('"gitea.dev/routers/api/v1/repository_access"')
  expect(renamed).toContain("repo.InspectRepoAccess(ctx)")
})
