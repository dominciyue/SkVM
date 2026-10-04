import { expect, test } from "bun:test"
import { lowerSemanticFlow, SemanticBlockSchema, type BoundSemanticBlock } from "./semantic-flow.ts"
import { createControlSlice, mergeControlSlice } from "./control-slice.ts"
import { compileAuthorizationInquiry } from "./inquiry-program.ts"
import { evaluateControlPaths } from "./control-conclusion.ts"
const unit = (handle: string, role: "entry" | "helper", blocks: any[], extra = {}): BoundSemanticBlock => ({ itemId: handle, handle, role, op: "add", start: "main", complete: true, parameters: [], blocks, questionId: "q", evidenceIds: ["original"], ...extra })
const eq = (name: string, value: any) => ({ op: "eq", left: { binding: name }, right: { literal: value } })
const paths = (lowered: ReturnType<typeof lowerSemanticFlow>) => {
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect entry", premises: [] }] })
  return evaluateControlPaths(mergeControlSlice(createControlSlice(), lowered.delta, program, { questionIds: ["q"], shownEvidenceIds: ["original"] }).state).paths
}
test("compositional helper alternatives with equal return values join without copying every downstream branch", () => {
  const helper = unit("gate", "helper", [{ name: "main", steps: [{ kind: "choose", name: "owner", claim: "Independent source alternatives", cases: Array.from({ length: 8 }, (_, i) => ({ condition: eq(`grant${i}`, true), body: "yes" })), otherwise: "no" }] }, { name: "yes", steps: [{ kind: "return", name: "true", claim: "Successful helper return", value: true }] }, { name: "no", steps: [{ kind: "return", name: "false", claim: "Unsuccessful helper return", value: false }] }])
  const entry = unit("entry", "entry", [{ name: "main", steps: [1, 2].map(i => ({ kind: "call", name: `gate${i}`, symbol: "gate", callee: "gate", claim: "Two relevant helper calls", arguments: [] })).concat([{ kind: "return", name: "ok", claim: "Source operation allowed", outcome: "allow" }] as any) }])
  const lowered = lowerSemanticFlow([entry, helper], { compositional: true } as any)
  expect(lowered.diagnostics).toEqual([])
  expect(paths(lowered)).toHaveLength(4)
})
test("an explicitly returned helper object binds the caller result; equal spelling is never an implicit alias", () => {
  const helper = unit("lookup", "helper", [{ name: "main", steps: [{ kind: "bind", name: "selected", type: "resource", claim: "Resolved output object" }, { kind: "return", name: "result", claim: "Returns the resolved object", object: "selected" }] }])
  const entry = unit("entry", "entry", [{ name: "main", steps: [{ kind: "call", name: "lookup", symbol: "lookup", callee: "lookup", result: "file", claim: "Resolve returned file", arguments: [] }, { kind: "effect", name: "read", resource: "file", operation: "read", claim: "Read precisely returned object" }, { kind: "return", name: "ok", outcome: "allow", claim: "Return file" }] }])
  const { questionId: _q, evidenceIds: _e, ...source } = helper
  expect(SemanticBlockSchema.safeParse(source).success).toBe(true)
  const lowered = lowerSemanticFlow([entry, helper])
  const selected = lowered.delta.rules.find(r => r.bindingKind === "resource")!
  expect(lowered.delta.rules.find(r => r.kind === "effect")?.resource).toBe(selected.bindingKey)
})
test("field changes are scoped: clearing labels cannot erase the projects argument", () => {
  const entry = unit("entry", "entry", [{ name: "main", steps: [{ kind: "transform", name: "labels", object: "form", field: "labels", value: null, claim: "Only labels are cleared" }, { kind: "return", name: "ok", outcome: "allow", claim: "Unchanged projects still pass onward" }] }], { parameters: [{ name: "form", type: "configuration" }] })
  const { questionId: _q, evidenceIds: _e, ...source } = entry
  expect(SemanticBlockSchema.safeParse(source).success).toBe(true)
  const lowered = lowerSemanticFlow([entry])
  expect(lowered.diagnostics).toEqual([])
  expect((lowered as any).fieldChanges).toEqual([expect.objectContaining({ object: expect.any(String), field: "labels", value: null })])
  expect((lowered as any).fieldChanges.some((f: any) => f.field === "projects")).toBe(false)
})
test("a later void helper result cannot inherit an earlier returned object", () => {
  const lookup = unit("lookup", "helper", [{ name: "main", steps: [{ kind: "bind", name: "object", type: "resource", claim: "First returned object" }, { kind: "return", name: "value", object: "object", claim: "Return this object" }] }])
  const voidHelper = unit("void", "helper", [{ name: "main", steps: [{ kind: "return", name: "empty", claim: "No object returned" }] }])
  const entry = unit("entry", "entry", [{ name: "main", steps: [{ kind: "call", name: "first", symbol: "lookup", callee: "lookup", result: "a", arguments: [], claim: "First lookup" }, { kind: "call", name: "second", symbol: "void", callee: "void", result: "b", arguments: [], claim: "Void second call" }, { kind: "effect", name: "write", resource: "b", claim: "Cannot infer a resource from a void result" }, { kind: "return", name: "end", outcome: "allow", claim: "End" }] }])
  const lowered = lowerSemanticFlow([entry, lookup, voidHelper])
  expect(lowered.delta.rules.find(r => r.kind === "effect")?.resource).not.toBe(lowered.delta.rules.find(r => r.bindingKind === "resource")?.bindingKey)
})
test("an operation failure has separate provenance from an authorization rejection", () => {
  const entry = unit("entry", "entry", [{ name: "main", steps: [{ kind: "reject", name: "missing-file", claim: "The file does not exist", failureKind: "operation" }] }])
  const { questionId: _q, evidenceIds: _e, ...source } = entry
  expect(SemanticBlockSchema.safeParse(source).success).toBe(true)
  const terminal = lowerSemanticFlow([entry]).delta.rules.find(r => r.terminal)
  expect((terminal as any).failureKind).toBe("operation")
})
