import { test, expect } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { positionOptions } from "./study.ts"
import { assessAutomaticCase } from "./assessment.ts"
const load = async (name: string) => JSON.parse(await readFile(path.join(import.meta.dir, name), "utf8"))
test("BM purpose contract keeps repaired and independent authors distinct and fixed pair order", async () => {
  const manifest = await load("manifest.json"), config = await load("configuration.json")
  expect(manifest.purposes).toEqual(["A0", "A1", "C0", "B0", "B1", "C1", "C2", "S0"])
  expect(config.comparisonOrder).toEqual(["C0", "B0", "B1", "C1"])
  expect(positionOptions("A0")).toEqual({ author: true, baseline: false, variant: "root-default" })
  expect(positionOptions("A1").variant).toBe("empty-version")
  expect(positionOptions("C2").variant).toBe("denied")
  expect(positionOptions("B0").baseline).toBe(true)
  expect(() => positionOptions("extra")).toThrow()
  expect(config.limits.maxToolCalls).toBe(64)
  expect(manifest.maximumNamedRepairPurposes).toBe(4)
})
test("author facts contain no expected answers and retain all four original questions", async () => {
  for (const variant of ["root-default", "empty-version"]) {
    const ordinary = await load(`inputs/${variant}.json`), author = await load(`inputs/author-${variant}.json`)
    expect(author.inquiry).toEqual(ordinary.inquiry)
    expect(author.inquiry.questions).toHaveLength(4)
    const cases = JSON.parse(author.sourceNotes.text.split("\n").slice(1).join("\n"))
    expect(cases).toHaveLength(4)
    for (const item of cases) expect(Object.keys(item).sort()).toEqual(["externalAssumptions", "id", "operationId", "resourceInputs"])
  }
})
test("unknown raw cannot acquire semantic field credit from preferred key names", () => {
  expect(assessAutomaticCase({ kind: "computed", conditions: [] }, { returned: { document_id: 11 } }, "unreviewed").fieldMappingStatus).toBe("pending-independent-review")
})
