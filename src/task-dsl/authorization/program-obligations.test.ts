import { expect, test } from "bun:test"
import { executeResourceWorkflow } from "./resource-relations.ts"
import { AuthoringTargetSchema } from "./program-coverage.ts"
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

const at = { path: "anonymous.py", startLine: 5, endLine: 5, sha256: "current" }
const truth = (binding: string): any => ({ op: "truthy", language: "python", value: { binding } })
const call = { id: "invoke", op: "external", name: "remote", arguments: { actor: { literal: 7 } }, source: at }
const out = { id: "result", op: "return", value: { literal: 1 }, source: at }
const rawFor = (steps: any[], relation?: any): any => ({ resourceWorkflow: { inputs: ["shortcut"], steps, gaps: [] }, authoringTarget: { mode: "reusable", coverage: relation ? [{ id: "call", source: at, stepIds: ["invoke"], disposition: "implemented", call: relation }] : [] } })
const relation = { stepId: "invoke", activation: "always", completion: "required", completionGuardId: "complete", completionMeaning: "normal-return", successorStepIds: ["result"], resultUse: "ignored", reason: "Source continues only after the call returns normally." }
test("call feedback exposes post-call selection and unused known completion without inventing a predicate", () => {
  expect(typeof api.projectProgramCallRelations).toBe("function")
  const raw = rawFor([call, { id: "chosen", op: "value", source: at, value: { choose: { test: truth("shortcut"), then: { literal: 1 }, else: { ref: "invoke" } } } }, out])
  const execution = executeResourceWorkflow(raw.resourceWorkflow, { shortcut: true }, { externalAssumptions: [{ name: "remote", arguments: { actor: 7 }, value: false, reason: "Normal return" }] })
  const row = api.projectProgramCallRelations(raw, execution)[0]
  expect(row.diagnostics).toContain("selection-after-call-does-not-control-activation")
  expect(row.diagnostics).toContain("call-semantics-undeclared")
  expect(row.event).toMatchObject({ outcome: "computed", value: false })
  expect(row.valueConsumers).toEqual(["chosen"])
  expect(row.semanticSupport).toBe("unreviewed")
  const unused = rawFor([call, out])
  expect(api.projectProgramCallRelations(unused, execution)[0].diagnostics).toContain("call-result-unused-completion-unreviewed")
})
test("declared completion requires a real forward control dependency, not just coverage or a value use", () => {
  expect(typeof api.projectProgramCallRelations).toBe("function")
  const raw = rawFor([call, out], relation)
  expect(AuthoringTargetSchema.safeParse(raw.authoringTarget).success).toBe(true)
  const row = api.projectProgramCallRelations(raw, executeResourceWorkflow(raw.resourceWorkflow, { shortcut: true }))[0]
  expect(row.diagnostics).toContain("completion-guard-missing-or-out-of-order")
  const guard = { id: "complete", op: "guard", source: at, test: { op: "eq", left: { binding: "invoke" }, right: { binding: "invoke" } }, failure: "completion-unresolved" }
  const fixed = rawFor([call, guard, out], relation)
  for (const value of [false, null]) {
    const execution = executeResourceWorkflow(fixed.resourceWorkflow, { shortcut: true }, { externalAssumptions: [{ name: "remote", arguments: { actor: 7 }, value, reason: "Normal return" }] })
    expect(execution.conditions).toEqual([])
    expect(execution.termination).toBe("return")
    expect(api.projectProgramCallRelations(fixed, execution)[0].diagnostics).toEqual([])
  }
  const unknown = executeResourceWorkflow(fixed.resourceWorkflow, { shortcut: true })
  expect(unknown.conditions).toHaveLength(1)
  expect(api.projectProgramCallRelations(fixed, unknown)[0].completionGuard).toMatchObject({ id: "complete", outcome: "unresolved" })
  const bad = rawFor([call, { ...guard, test: truth("invoke") }, out], relation)
  expect(api.projectProgramCallRelations(bad, executeResourceWorkflow(bad.resourceWorkflow, { shortcut: true }))[0].diagnostics).toContain("normal-completion-tested-as-truthiness")
})
test("caught calls require an explicit source explanation; conditional calls use actual activation and current trial events", () => {
  expect(typeof api.projectProgramCallRelations).toBe("function")
  const raw = rawFor([{ ...call, when: { op: "not", arg: truth("shortcut") } }, out], { ...relation, activation: "conditional", completion: "caught", completionGuardId: undefined, reason: "Source catches failure and returns a fallback." })
  const skipped = executeResourceWorkflow(raw.resourceWorkflow, { shortcut: true })
  const executed = executeResourceWorkflow(raw.resourceWorkflow, { shortcut: false })
  const row = api.projectProgramCallRelations(raw, skipped, [{ id: "other", execution: executed }])[0]
  expect(row.diagnostics).toEqual([])
  expect(row.event.outcome).toBe("skipped")
  expect(row.trials).toEqual([{ id: "other", outcome: "unresolved", gaps: ["external:remote"] }])
  const stale = structuredClone(raw); stale.authoringTarget.coverage[0].source = { ...at, sha256: "old" }
  expect(api.projectProgramCallRelations(stale, skipped)[0].diagnostics).toContain("call-relation-source-mismatch")
})
test("malformed unadopted call metadata remains diagnostic rather than crashing author recovery", () => {
  for (const coverage of [{ broken: true }, [null], [{ call: { stepId: "invoke", completion: "required", successorStepIds: {} } }]]) {
    const raw = rawFor([call, out]); raw.authoringTarget.coverage = coverage
    expect(() => api.projectProgramCallRelations(raw)).not.toThrow()
    expect(api.projectProgramCallRelations(raw).some((row: any) => row.diagnostics.length)).toBe(true)
  }
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
