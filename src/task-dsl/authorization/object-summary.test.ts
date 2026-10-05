import { expect, test } from "bun:test"
import { summarizeProcedure } from "./procedure-summary.ts"
import { lowerSemanticFlow, type BoundSemanticBlock } from "./semantic-flow.ts"
import { canonicalControl, createControlSlice, mergeControlSlice } from "./control-slice.ts"
import { compileAuthorizationInquiry } from "./inquiry-program.ts"
import { controlObjectDiagnostics, evaluateControlPaths } from "./control-conclusion.ts"
const unit = (handle: string, role: "entry" | "helper", steps: any[], extra = {}): BoundSemanticBlock => ({ handle, itemId: handle, op: "add", role, start: "body", complete: true, questionId: "q", evidenceIds: ["source"], parameters: [], blocks: [{ name: "body", steps }], ...extra })
const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect create", premises: [] }] })
const state = (units: BoundSemanticBlock[], compositional: boolean) => {
  const lower = lowerSemanticFlow(units, { compositional })
  expect(lower.diagnostics).toEqual([])
  const merge = mergeControlSlice(createControlSlice(), lower.delta, program, { questionIds: ["q"], shownEvidenceIds: ["source"] })
  expect(merge.diagnostics).toEqual([])
  return merge.state
}
function fixture(wrong = false) {
  const helper = unit("gate", "helper", [{ kind: "guard", name: "perm", principal: "p", resource: "r", condition: { op: "eq", left: { binding: "r.owner" }, right: { binding: "p.id" } }, claim: "Owner check on the supplied object" }, { kind: "return", name: "resolved", object: "r", claim: "Return exactly the inspected resource" }], { parameters: [{ name: "p", type: "principal" }, { name: "r", type: "resource" }] })
  const entry = unit("entry", "entry", [{ kind: "call", name: "gate", symbol: "gate", callee: "gate", result: "checked", arguments: [{ parameter: "p", object: "caller" }, { parameter: "r", object: "a" }], claim: "Call on a" }, { kind: "effect", name: "save", principal: "caller", resource: wrong ? "b" : "checked", authorizedBy: ["gate.perm"], claim: "Save exact current resource" }, { kind: "return", name: "end", outcome: "allow", claim: "normal return" }], { parameters: [{ name: "caller", type: "principal" }, { name: "a", type: "resource" }, { name: "b", type: "resource" }] })
  return [entry, helper]
}
test("parameterized object guard and object return are composable and equivalent to exact expansion", () => {
  const units = fixture()
  expect(summarizeProcedure(units[1]!).composable).toBe(true)
  const exact = state(units, false), summary = state(units, true)
  const observable = (s: typeof exact) => evaluateControlPaths(s).paths.map(p => [p.disposition, p.protectedEffect, p.predicate.residual, p.returnValues])
  expect(observable(summary)).toEqual(observable(exact))
  expect(controlObjectDiagnostics(summary)).toEqual([])
  const guarded = summary.rules.find(r => r.kind === "guard")!, effect = summary.rules.find(r => r.kind === "effect")!
  expect(effect.resource).toBe(guarded.resource)
  expect(effect.principal).toBe(guarded.principal)
})
test("substituting object B for checked object A fails in both expansion and summary", () => {
  for (const compositional of [false, true]) expect(controlObjectDiagnostics(state(fixture(true), compositional)).some(d => d.code === "control-object-mismatch")).toBe(true)
})
test("helper guard predicate instantiations have distinct object fields, not one global parameter name", () => {
  const units = fixture(), entry = units[0]!
  entry.blocks[0]!.steps.splice(1, 0, { kind: "call", name: "other", symbol: "gate", callee: "gate", arguments: [{ parameter: "p", object: "caller" }, { parameter: "r", object: "b" }], claim: "Call on b" })
  const s = state(units, true), guards = s.rules.filter(r => r.kind === "guard")
  expect(canonicalControl(guards[0]!.condition)).not.toBe(canonicalControl(guards[1]!.condition))
})
test("normal, authorization denial and operation error survive summary; a deleted branch changes observable behavior", () => {
  const helper = unit("save", "helper", [{ kind: "choose", name: "paths", claim: "Three source branches", cases: [{ condition: { op: "eq", left: { binding: "allowed" }, right: { literal: false } }, body: "deny" }, { condition: { op: "eq", left: { binding: "exists" }, right: { literal: false } }, body: "error" }], otherwise: "ok" }], { blocks: [{ name: "body", steps: [{ kind: "choose", name: "paths", claim: "Three source branches", cases: [{ condition: { op: "eq", left: { binding: "allowed" }, right: { literal: false } }, body: "deny" }, { condition: { op: "eq", left: { binding: "exists" }, right: { literal: false } }, body: "error" }], otherwise: "ok" }] }, { name: "deny", steps: [{ kind: "reject", name: "no", failureKind: "authorization", claim: "Denied" }] }, { name: "error", steps: [{ kind: "reject", name: "missing", failureKind: "operation", claim: "Missing object" }] }, { name: "ok", steps: [{ kind: "effect", name: "save", claim: "Persist the object" }, { kind: "return", name: "ret", value: true, claim: "Success" }] }] })
  const entry = unit("entry", "entry", [{ kind: "call", name: "save", symbol: "save", callee: "save", claim: "Save helper", arguments: [] }, { kind: "return", name: "end", outcome: "allow", claim: "End" }])
  expect(summarizeProcedure(helper).composable).toBe(true)
  const exact = state([entry, helper], false), summary = state([entry, helper], true)
  const obs = (s: typeof exact) => evaluateControlPaths(s).paths.map(p => [p.disposition, p.protectedEffect]).sort()
  expect(obs(summary)).toEqual(obs(exact))
  expect(summary.rules.filter(r => r.kind === "reject").map(r => r.failureKind).sort()).toEqual(["authorization", "operation"])
  const changed = structuredClone(helper); (changed.blocks[0]!.steps[0] as any).cases.pop()
  expect(obs(state([entry, changed], true))).not.toEqual(obs(summary))
})
