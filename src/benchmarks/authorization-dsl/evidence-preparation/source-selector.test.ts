import { expect, test } from "bun:test"
const api = await import("./source-selector.ts").catch(() => ({} as any))
const candidates = [{ id: "a", path: "pkg/app.py", startLine: 3, endLine: 4 }, { id: "b", path: "pkg/app.py", startLine: 8, endLine: 9 }]
const context = { candidates, paths: ["pkg/app.py"] }
test("lossless legacy range selection preserves original and normalized identity", () => {
  const result = api.selectSourceCandidates("pkg/app.py:3-4", context)
  expect(result).toMatchObject({ status: "resolved", original: "pkg/app.py:3-4", selector: { path: "pkg/app.py", startLine: 3, endLine: 4 }, candidates: [candidates[0]] })
  expect(api.selectSourceCandidates({ path: "pkg/app.py", startLine: 3, endLine: 4, candidateId: "a" }, context).candidates).toEqual([candidates[0]])
  expect(api.selectSourceCandidates("pkg", context).candidates).toEqual(candidates)
})
test("ranges, unsafe paths, candidate conflicts and out-of-scope sources retain different diagnoses", () => {
  for (const [selector, code] of [["../pkg/app.py", "source-selector-unsafe-path"], ["C:/pkg/app.py:3-4", "source-selector-unsafe-path"], ["pkg/app.py:3-99", "source-selector-range-mismatch"], ["private/app.py", "source-selector-out-of-scope"], [{ path: "pkg/app.py", candidateId: "unknown" }, "source-selector-candidate-unknown"], [{ path: "pkg/app.py:3-4", candidateId: "b" }, "source-selector-range-mismatch"], [{ path: "pkg/app.py:3-4", startLine: 8, endLine: 9 }, "source-selector-range-conflict"]] as const) {
    expect(api.selectSourceCandidates(selector, context)).toMatchObject({ status: "unresolved", code })
  }
  expect(api.selectSourceCandidates("pkg/app.py:3-2", context).code).toBe("source-selector-range-invalid")
})
