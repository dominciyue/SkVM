import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
const study = await import("./study.ts").catch(() => ({} as any))
const original = JSON.parse(await readFile(path.resolve(import.meta.dir, "../authorization-interprocedural-property-v1/model/packages/download/inquiry.json"), "utf8"))
test("automatic positions preserve the complete original input and exclude authored meanings", () => {
  expect(typeof study.positionConfiguration).toBe("function")
  for (const id of ["auto-h-1", "auto-d-1"]) {
    const configuration = study.positionConfiguration(id)
    expect(configuration.track).toBe("B")
    expect(configuration.domainProgramFile).toBeUndefined()
    expect(study.inputBoundaryIssues(configuration, original, original)).toEqual([])
    expect(study.inputBoundaryIssues({ ...configuration, domainProgramFile: "developer.json" }, original, original)).toContain("automatic-authored-program")
    expect(study.inputBoundaryIssues(configuration, { ...original, contractInputs: { q: { guard: true } } }, original)).toContain("automatic-explicit-inputs")
  }
})
test("every position keeps all original question duties byte-identical", () => {
  const configuration = study.positionConfiguration("authored-use-base")
  const extra = structuredClone(original); extra.inquiry.questions.push({ id: "local-development", request: "Local only", premises: [] })
  expect(study.inputBoundaryIssues(configuration, extra, original)).toEqual([])
  extra.inquiry.questions[0].request = "Simplified question"
  expect(study.inputBoundaryIssues(configuration, extra, original)).toContain("original-question-changed:requested-document-and-returned-file")
  expect(() => study.positionConfiguration("unregistered")).toThrow()
})
