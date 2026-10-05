import { expect, test } from "bun:test"
import { compileAuthorizationInquiry } from "./inquiry-program.ts"
import { createOperationFacts, projectOperationUnits } from "./operation-facts.ts"
import type { BoundSemanticBlock } from "./semantic-flow.ts"

const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "create" }], questions: [
  { id: "a", request: "create A", operationId: "op", intent: "behavior", premises: [] }, { id: "b", request: "policy B", operationId: "op", intent: "policy-comparison", premises: [] },
] })
const u: BoundSemanticBlock = { itemId: "a::entry", questionId: "a", handle: "create", op: "add", role: "entry", start: "body", complete: true, parameters: [{ name: "subject", type: "principal" }], blocks: [{ name: "body", steps: [{ kind: "return", name: "done", claim: "done", outcome: "allow" }] }], evidenceIds: ["ev1"], source: { id: "sym1", path: "a.py", sha256: "rev1", startLine: 1, endLine: 2 } }
test("units share only after current entry binding, with separate question invocation IDs", () => {
  const store = createOperationFacts(p, { repository: "repo", sourceRef: "ref" })
  expect(projectOperationUnits(p, [u], store.snapshot())).toEqual([])
  store.bind("op", u.source!)
  store.accept("op", u, [{ kind: "source-span", key: "a.py", revision: "rev1" }])
  const units = projectOperationUnits(p, [u], store.snapshot())
  expect(units.map(u => u.questionId)).toEqual(["a", "b"])
  expect(units[0]!.parameters).toEqual(units[1]!.parameters)
  expect(store.snapshot().facts[0]!.semanticSupport).toBe("unreviewed")
})
test("wrong entry withdrawal and dependency invalidation remove only affected facts", () => {
  const store = createOperationFacts(p, { repository: "repo", sourceRef: "ref" }); store.bind("op", u.source!); store.accept("op", u, [{ kind: "candidate-set", key: "method", revision: "old" }])
  store.invalidate(d => d.key === "method" && d.revision !== "new", "new override")
  expect(store.snapshot().facts.filter(f => f.current)).toHaveLength(0)
  expect(projectOperationUnits(p, [u], store.snapshot())).toEqual([])
  store.accept("op", u, [])
  store.bind("op", { ...u.source!, id: "different" })
  expect(projectOperationUnits(p, [u], store.snapshot())).toEqual([])
  expect(store.snapshot().retired.length).toBeGreaterThan(0)
})

test("a dependency-invalidated version cannot be reaccepted with identical old dependency bytes", () => {
  const store = createOperationFacts(p, { repository: "repo", sourceRef: "ref" }), deps: any = [{ kind: "candidate-set", key: "method", revision: "old" }]
  store.bind("op", u.source!); store.accept("op", u, deps)
  store.invalidate(d => d.key === "method", "new override")
  expect(() => store.accept("op", u, deps)).toThrow("operation-dependency-invalidated")
  expect(store.snapshot().facts.filter(f => f.current)).toEqual([])
  store.accept("op", u, [{ kind: "candidate-set", key: "method", revision: "new" }])
  expect(store.snapshot().facts.filter(f => f.current)).toHaveLength(1)
})
