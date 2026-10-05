import { expect, test } from "bun:test"
import { buildStructureIndex } from "./evidence-preparation/structure-index.ts"
import { bindOperationCalls, operationCallTargets } from "./operation-links.ts"
import type { BoundSemanticBlock } from "../../task-dsl/authorization/semantic-flow.ts"

async function fixture() {
  const index = await buildStructureIndex([{ path: "app.py", content: "class Base:\n    def check(self, actor):\n        return actor\nclass A(Base):\n    pass\nclass B(Base):\n    pass\ndef create(a: A, b: B, actor):\n    a.check(actor)\n    b.check(actor)\n" }, { path: "other.py", content: "def check(actor):\n    return False\n" }], { repository: "fixture", sourceRef: "r" })
  const unit = (name: string, handle: string, receiverClass?: string): BoundSemanticBlock => {
    const s = index.symbols.find(s => s.qualifiedName === name)!
    return { itemId: handle, handle, questionId: "q", op: "add", role: handle === "entry" ? "entry" : "helper", source: { id: s.id, path: s.path, sha256: s.sha256, startLine: s.startLine, endLine: s.endLine }, receiverClass, evidenceIds: [handle], start: "body", complete: true, parameters: [{ name: "actor", type: "principal" }], blocks: [{ name: "body", steps: [] }] }
  }
  return { index, units: [unit("app.create", "entry"), unit("app.Base.check", "a", "app.A"), unit("app.Base.check", "b", "app.B"), unit("other.check", "unrelated")] }
}

test("unique actual source call binds an accepted helper without inventing arguments", async () => {
  const { index, units } = await fixture(), caller = units[0]!
  caller.blocks[0]!.steps = [{ kind: "call", name: "gate", symbol: "a.check", claim: "Actual source call", arguments: [{ parameter: "actor", object: "actor" }] }]
  const result = bindOperationCalls(index, units)
  const call = result.units[0]!.blocks[0]!.steps[0] as any
  expect(call.callee).toBe("a")
  expect(call.arguments).toEqual([{ parameter: "actor", object: "actor" }])
  expect(result.records[0]).toMatchObject({ caller: "entry", call: "gate", target: "a", receiverClass: "app.A" })
  expect((caller.blocks[0]!.steps[0] as any).callee).toBeUndefined()
  expect(bindOperationCalls(index, result.units).records).toEqual([])
})

test("homonyms and receiver ambiguity remain unbound; candidate identity alone cannot choose a receiver", async () => {
  const { index, units } = await fixture(), caller = units[0]!
  const step: any = { kind: "call", name: "gate", symbol: "check", claim: "Source call", candidateId: units[1]!.source!.id, arguments: [] }
  caller.blocks[0]!.steps = [step]
  expect(operationCallTargets(index, caller, step, units).map(t => t.unit.handle)).toEqual(["a", "b"])
  const result = bindOperationCalls(index, units)
  expect((result.units[0]!.blocks[0]!.steps[0] as any).callee).toBeUndefined()
  expect(result.records).toEqual([])
  step.symbol = "invented.check"
  expect(operationCallTargets(index, caller, step, units)).toEqual([])
})

test("source identity binding keeps missing parameter mappings visible and rejects stale helper bytes", async () => {
  const { index, units } = await fixture(), caller = units[0]!
  caller.blocks[0]!.steps = [{ kind: "call", name: "gate", symbol: "a.check", claim: "Source call", arguments: [] }]
  const result = bindOperationCalls(index, units)
  expect((result.units[0]!.blocks[0]!.steps[0] as any).callee).toBe("a")
  expect((result.units[0]!.blocks[0]!.steps[0] as any).arguments).toEqual([])
  units[1]!.source!.sha256 = "stale"
  expect(operationCallTargets(index, caller, caller.blocks[0]!.steps[0] as any, units)).toEqual([])
})

test("an unaccepted alternative receiver cannot turn ambiguous source into a unique link", async () => {
  const { index, units } = await fixture()
  units[0]!.blocks[0]!.steps = [{ kind: "call", name: "gate", symbol: "check", claim: "Receiver not identified", arguments: [] }]
  const result = bindOperationCalls(index, units.filter(u => u.handle !== "b"))
  expect((result.units[0]!.blocks[0]!.steps[0] as any).callee).toBeUndefined()
  expect(result.records).toEqual([])
})

test("changed or invalid source relationships withdraw an earlier host callee", async () => {
  const { index, units } = await fixture()
  units[0]!.blocks[0]!.steps = [{ kind: "call", name: "gate", symbol: "a.check", claim: "Actual call", arguments: [] }]
  const linked = bindOperationCalls(index, units)
  ;(linked.units[0]!.blocks[0]!.steps[0] as any).symbol = "check"
  const withdrawn = bindOperationCalls(index, linked.units)
  expect((withdrawn.units[0]!.blocks[0]!.steps[0] as any).callee).toBeUndefined()
  expect(withdrawn.records[0]).toMatchObject({ action: "unbind", previousTarget: "a" })
})

test("an unresolved same-name receiver prevents a short symbol from proving a unique call", async () => {
  const { index, units } = await fixture()
  const changed = await buildStructureIndex([{ path: "app.py", content: "class Base:\n    def check(self, actor):\n        return actor\nclass A(Base):\n    pass\ndef create(a: A, b, actor):\n    a.check(actor)\n    b.check(actor)\n" }], { repository: "fixture", sourceRef: "r" })
  for (const unit of units.slice(0, 2)) {
    const old = index.symbols.find(s => s.id === unit.source!.id)!, current = changed.symbols.find(s => s.qualifiedName === old.qualifiedName)!
    unit.source = { id: current.id, path: current.path, sha256: current.sha256, startLine: current.startLine, endLine: current.endLine }
  }
  units[0]!.blocks[0]!.steps = [{ kind: "call", name: "gate", symbol: "check", claim: "Unspecified receiver", arguments: [] }]
  expect((bindOperationCalls(changed, units.slice(0, 2)).units[0]!.blocks[0]!.steps[0] as any).callee).toBeUndefined()
  ;(units[0]!.blocks[0]!.steps[0] as any).symbol = "a.check"
  expect((bindOperationCalls(changed, units.slice(0, 2)).units[0]!.blocks[0]!.steps[0] as any).callee).toBe("a")
})
