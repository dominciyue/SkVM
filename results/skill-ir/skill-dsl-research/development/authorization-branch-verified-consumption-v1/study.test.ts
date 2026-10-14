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
test("reviewed A1 representation enum maps only its two exact authored literals", () => {
  const sha = "7bb99c9261ec97dca5c788320a50f81e91372e567f541a7e47573e163ddfbaba"
  for (const [representation, archive] of [["archive", true], ["original", false]] as const) {
    const result = assessAutomaticCase({ kind: "computed", conditions: [], returned: { requested_document: 10, authorized_resource: 10, file_document: 12, archive_selected: archive, selected_file: "f" } }, { returned: { requested_document_id: 10, authorized_root_id: 10, returned_document_id: 12, representation, file: "f" } }, sha)
    expect(result.semanticFields?.finiteMachineMatch).toBe(true)
    expect(result.literalShape.finiteMachineMatch).toBe(false)
  }
  expect(assessAutomaticCase({ kind: "computed", conditions: [] }, { returned: { representation: "unknown" } }, sha).normalizedReturned).toEqual({})
})
