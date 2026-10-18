import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "../../benchmarks/authorization-dsl/inquiry-tools.ts"
import { compileAuthorizationInquiry } from "./inquiry-program.ts"
import { compileExecutableContract } from "./executable-contract.ts"
import { createProgramDraft } from "./resource-program-draft.ts"
const api = await import("./program-trial.ts").catch(() => ({} as any))
const at = { path: "app.py", startLine: 1, endLine: 4 }
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "bl-trial-"))
  await writeFile(path.join(root, "app.py"), "def choose(flag, item):\n    if not flag:\n        return None\n    return item\n\ndef sibling():\n    return None\n")
  const tools = await createInquiryTools({ sourceRoot: root, repository: "anonymous", sourceRef: "r", allowedPaths: ["app.py"], structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  await tools.execute("source_read", at)
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Explain the source branches", premises: [] }] })
  const raw = { schemaVersion: "authorization-executable-contract/v1", id: "choice", scope: { kind: "function-contract", questionId: "q", root: at, upstream: [] }, sourceDeclarations: [{ source: at, statements: [] }], queries: [], assumptions: [], authoringTarget: { mode: "reusable", coverage: [{ id: "return", source: at, stepIds: ["result"], disposition: "implemented" }] }, resourceWorkflow: { inputs: ["flag", "item"], steps: [
    { id: "guard", op: "guard", test: { op: "truthy", language: "python", value: { binding: "flag" } }, failure: "refused", source: at },
    { id: "result", op: "return", value: { ref: "item" }, source: at },
  ] } }
  const draft = createProgramDraft(raw), compileOptions = { tools, program, resourceInputs: { flag: true, item: 5 }, executionPolicy: "progressive" as const }
  const candidate = await compileExecutableContract(raw, compileOptions)
  return { root, draft, candidate, candidateRevision: draft.revision, compileOptions, remainingUnits: 8 }
}
test("trial recompiles current candidate for bounded inputs without mutating active facts or results", async () => {
  expect(typeof api.runProgramTrial).toBe("function")
  const f = await fixture(), before = JSON.stringify([f.draft, f.candidate, f.compileOptions.resourceInputs]), reads = f.compileOptions.tools.ioReadBytes
  const result = await api.runProgramTrial({ expectedRevision: f.draft.revision, cases: [{ id: "allowed", resourceInputs: { flag: true, item: 19 } }, { id: "denied", resourceInputs: { flag: false, item: 19 } }, { id: "unknown", resourceInputs: { item: 19 } }] }, f)
  expect(result.status).toBe("completed")
  expect(result.units).toBe(3)
  expect(result.cases[0].execution.returned).toBe(19)
  expect(result.cases[0].outcome.execution).toBe("computed")
  expect(result.cases[0].obligations.some((o: any) => o.kind === "branch-exit" && o.state === "unmapped")).toBe(true)
  expect(result.cases[1].outcome.execution).toBe("denied")
  expect(result.cases[2].outcome.execution).toBe("conditional")
  expect(result.cases[1].execution.termination).toBe("refused")
  expect(result.cases[1].execution.returned).toBeUndefined()
  expect(result.cases[2].execution.conditions.length).toBeGreaterThan(0)
  expect(result.cases[0].inputOrigin).toBe("unreviewed-trial-facts")
  expect(result.cases[0].resourceInputs).toEqual({ flag: true, item: 19 })
  expect(result.cases[0].externalAssumptions).toEqual([])
  expect(result.requestOperationCertified).toBe(false)
  expect(JSON.stringify([f.draft, f.candidate, f.compileOptions.resourceInputs])).toBe(before)
  expect(f.compileOptions.tools.ioReadBytes - reads).toBe(Buffer.byteLength(await Bun.file(path.join(f.root, "app.py")).text()))
  expect((await f.compileOptions.tools.execute("source_read", at)).status).toBe("ok")
})
test("trial rejects stale revisions missing candidate foreign operation and oversized or oracle cases", async () => {
  expect(typeof api.runProgramTrial).toBe("function")
  const f = await fixture(), one = { id: "case", resourceInputs: {} }
  for (const [request, options, code] of [
    [{ expectedRevision: "old", cases: [one] }, f, "program-trial-stale"],
    [{ expectedRevision: f.draft.revision, cases: [one] }, { ...f, candidate: undefined }, "program-trial-candidate-missing"],
    [{ expectedRevision: f.draft.revision, cases: [one] }, { ...f, candidateRevision: "old" }, "program-trial-candidate-missing"],
    [{ expectedRevision: f.draft.revision, cases: [one] }, { ...f, candidateRevision: undefined }, "program-trial-candidate-missing"],
    [{ expectedRevision: f.draft.revision, cases: [{ ...one, operationId: "foreign" }] }, f, "program-trial-operation"],
    [{ expectedRevision: f.draft.revision, cases: Array(5).fill(one) }, f, "program-trial-shape"],
    [{ expectedRevision: f.draft.revision, cases: [{ ...one, expected: true }] }, f, "program-trial-shape"],
    [{ expectedRevision: f.draft.revision, cases: [one, { ...one, id: "two" }] }, { ...f, remainingUnits: 1 }, "program-trial-budget"],
  ] as any[]) {
    const result = await api.runProgramTrial(request, options)
    expect(result.diagnostics[0].code).toBe(code)
    expect(result.cases).toEqual([])
  }
  await writeFile(path.join(f.root, "app.py"), "def choose(flag, item):\n    return item\n")
  const stale = await api.runProgramTrial({ expectedRevision: f.draft.revision, cases: [one] }, f)
  expect(stale.diagnostics[0].code).toBe("program-trial-source-changed")
  expect(stale.cases).toEqual([])
})
test("compiler retains target but diagnoses unsupported coverage references separately from execution", async () => {
  const f = await fixture()
  expect((f.candidate as any).contract?.authoringTarget.mode, JSON.stringify(f.candidate.diagnostics)).toBe("reusable")
  const raw = structuredClone(f.draft.raw)
  raw.authoringTarget.coverage[0].stepIds = ["nonexistent"]
  raw.authoringTarget.coverage[0].source = { path: "unread.py", startLine: 90 }
  const compiled: any = await compileExecutableContract(raw, f.compileOptions)
  expect(compiled.resourceExecution.returned).toBe(5)
  expect(compiled.diagnostics.some((d: any) => d.code === "contract-coverage-reference")).toBe(true)
  expect(compiled.requestOperationCertified).toBe(false)
})
test("strict trial isolates an undeclared input case and still executes the next case", async () => {
  const f = await fixture()
  const result = await api.runProgramTrial({ expectedRevision: f.draft.revision, cases: [{ id: "bad", resourceInputs: { flag: true, item: 5, typo: 1 } }, { id: "good", resourceInputs: { flag: true, item: 11 } }] }, { ...f, compileOptions: { ...f.compileOptions, executionPolicy: "strict" } })
  expect(result.status).toBe("completed")
  expect(result.cases[0].diagnostics[0].code).toBe("program-trial-case-failed")
  expect(result.cases[1].execution.returned).toBe(11)
  expect(result.units).toBe(2)
})
