import { expect, test } from "bun:test"
import path from "node:path"
const api = await import("./cases.ts").catch(() => ({} as any))
test("BL variants retain original questions and isolate facts without expected answers", async () => {
  const seeds = await Promise.all(["root-default", "empty-version", "denied", "root-fallback"].map(n => Bun.file(path.resolve(import.meta.dir, `../../../../../examples/authorization-assessment/download-workflow/inputs/${n}.json`)).json()))
  const before = JSON.stringify(seeds), cases = api.createCases(...seeds), q = "requested-document-and-returned-file"
  expect(cases).toHaveLength(18)
  expect(new Set(cases.map((c: any) => c.name)).size).toBe(18)
  expect(JSON.stringify(seeds)).toBe(before)
  for (const c of cases) { expect(c.input.inquiry).toEqual(seeds[0].inquiry); expect(c.input).not.toHaveProperty("expected") }
  const renamed = cases.find((c: any) => c.name === "renamed-and-reordered").input.resourceInputs[q]
  expect(renamed.request.pk).toBe(1010)
  expect(renamed.documents.find((d: any) => d.id === 1011).root_document_id).toBe(1010)
  const hit = cases.find((c: any) => c.name === "root-query-hit").input.resourceInputs[q]
  expect(hit.related_root).toBeNull()
  expect(hit.documents.find((d: any) => d.id === hit.request.pk).root_document_id).toBe(10)
  const absent = cases.find((c: any) => c.name === "explicit-false-absent").input.externalAssumptions[q]
  expect(absent.some((a: any) => a.name === "ObjectPermissionChecker.has_perm")).toBe(false)
})
