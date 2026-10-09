import { test, expect } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { deriveChange } from "./changes.ts"
import { bbRoot } from "./study.ts"
test("registered changes retain all original duties and import facts without historical properties", async () => {
  const original = JSON.parse(await readFile(path.join(bbRoot, "model/packages/download/inquiry.json"), "utf8")), before = JSON.stringify(original)
  for (const kind of ["policy", "premise", "source"] as const) {
    const retained = JSON.parse(await readFile(path.join(bbRoot, `model/inputs/download-${kind}.json`), "utf8")), result = deriveChange(original, retained, kind, "current-source")
    expect(result.inquiry.questions.map((q: any) => [q.id, q.request, q.operationId, q.intent])).toEqual(original.inquiry.questions.map((q: any) => [q.id, q.request, q.operationId, q.intent]))
    expect(result.inquiry.questions.every((q: any) => q.properties === undefined)).toBe(true)
    expect(result.allowedPaths).toEqual(original.allowedPaths)
    if (kind === "policy") { expect(result.inquiry.policy).toEqual(retained.inquiry.policy); expect(result.inquiry.mode).toBe("conformance") }
    if (kind === "premise") { expect(result.inquiry.questions.every((q: any) => q.premises.some((p: any) => p.text === retained.inquiry.questions[0].premises[0].text))).toBe(true); expect(JSON.stringify(result.inquiry)).not.toContain('"text":"Ownership and object grants are unspecified."') }
    if (kind === "source") expect(result.sourceRoot).toBe("current-source")
  }
  expect(JSON.stringify(original)).toBe(before)
})
