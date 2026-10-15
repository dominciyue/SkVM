import { expect, test } from "bun:test"
const api: any = await import("./program-obligations.ts").catch(() => ({}))
const source = { id: "unit", path: "anonymous.py", sha256: "current", startLine: 1, endLine: 20 }
const skeleton: any = { sourceId: "unit", source, revision: "r", modelCovered: true, anchors: [
  ["condition", 2], ["raise", 3], ["return", 4], ["call", 5],
].map(([kind, line]) => ({ id: `${kind}`, kind, sourceSha256: "current", selector: { path: source.path, startLine: line, endLine: line }, text: `anonymous ${kind}` })), flow: [] }
test("source candidates survive absent and deleted author declarations without implying meanings", () => {
  expect(typeof api.projectProgramObligations).toBe("function")
  const result = api.projectProgramObligations([skeleton], {})
  expect(result.map((o: any) => o.kind)).toEqual(["branch-exit", "error-exit", "return-exit", "call-completion"])
  expect(result.every((o: any) => o.state === "unmapped" && o.origin === "source-structure")).toBe(true)
  expect(api.projectProgramObligations([{ ...skeleton, modelCovered: false }], {})).toEqual([])
})
test("only exact current candidate citations map; broad self reports and stale or missing steps do not prove coverage", () => {
  expect(typeof api.projectProgramObligations).toBe("function")
  const declaration = { id: "error", source: { path: source.path, startLine: 3, endLine: 3, sha256: "current" }, stepIds: ["stop"], disposition: "implemented" }
  const raw = { resourceWorkflow: { steps: [{ id: "stop" }] }, authoringTarget: { coverage: [declaration] } }
  expect(api.projectProgramObligations([skeleton], raw)[1]).toMatchObject({ state: "mapped-unreviewed", stepIds: ["stop"] })
  for (const source of [{ ...declaration.source, startLine: 1, endLine: 20 }, { ...declaration.source, sha256: "old" }]) expect(api.projectProgramObligations([skeleton], { ...raw, authoringTarget: { coverage: [{ ...declaration, source }] } })[1].state).toBe("unmapped")
  expect(api.projectProgramObligations([skeleton], { ...raw, resourceWorkflow: { steps: [] } })[1].state).toBe("unmapped")
  expect(api.projectProgramObligations([skeleton], { ...raw, authoringTarget: { coverage: [declaration, declaration] } })[1].diagnostics).toContain("duplicate-author-mapping")
})
test("split read windows use the existing skeleton coverage rather than requiring a single giant read", async () => {
  const tools = { structure: { symbols: [{ id: "unit", kind: "function", path: source.path, sha256: "current", startLine: 1, endLine: 20 }] }, evidence: [{ path: source.path, sha256: "current", startLine: 1, endLine: 10 }, { path: source.path, sha256: "current", startLine: 11, endLine: 20 }], sourceSkeleton: async () => skeleton }
  expect((await api.collectProgramObligations(tools)).length).toBe(4)
})
test("directed frontier selects a bounded related function while the full catalog survives", () => {
  const relevant = { ...skeleton, anchors: Array.from({ length: 18 }, (_, i) => ({ ...skeleton.anchors[0], id: `anchor-${i}`, selector: { startLine: i + 2, endLine: i + 2 } })) }
  const unrelated = { ...skeleton, sourceId: "other", source: { ...source, id: "other", path: "other.py" } }
  const raw = { scope: { entry: { path: source.path, startLine: 1, endLine: 20 } } }
  const catalog = api.projectProgramObligations([unrelated, relevant], raw)
  expect(typeof api.projectProgramCandidateFrontier).toBe("function")
  const frontier = api.projectProgramCandidateFrontier(catalog, raw)
  expect(frontier.items.length).toBeLessThanOrEqual(12)
  expect(frontier.items.every((o: any) => o.source.path === source.path)).toBe(true)
  expect(frontier.total).toBe(22)
  expect(frontier.remainingRelated).toBe(6)
  expect(frontier.items.every((o: any) => o.state === "unmapped")).toBe(true)
  expect(catalog.length).toBe(22)
  const declarationOnly = api.projectProgramCandidateFrontier(catalog, { sourceDeclarations: [{ source: raw.scope.entry }] })
  expect(declarationOnly.items).toEqual(frontier.items)
})
