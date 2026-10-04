import { expect, test } from "bun:test"
import { compileAuthorizationInquiry } from "./inquiry-program.ts"
import { createControlSlice, mergeControlSlice } from "./control-slice.ts"
import { evaluateControlPaths, controlObjectDiagnostics } from "./control-conclusion.ts"
const api = await import("./semantic-flow.ts").catch(() => ({} as any))
const plan = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Role is admin. Flag is true.", premises: [] }] })
const eq = (binding: string, value: unknown) => ({ op: "eq", left: { binding }, right: { literal: value } })
const block = (name: string, steps: unknown[]) => ({ name, steps })
const unit = (blocks: unknown[], extra = {}) => ({ questionId: "q", evidenceIds: ["ev"], itemId: "work", handle: "entry", op: "add", role: "entry", start: "main", complete: true, fallthrough: "allow", parameters: [], blocks, ...extra })
function lower(units: unknown[], bindings: unknown[] = []) {
  expect(typeof api.lowerSemanticFlow).toBe("function")
  const lowered = api.lowerSemanticFlow(units)
  const merged = mergeControlSlice(createControlSlice(), { ...lowered.delta, bindings }, plan, { questionIds: ["q"], shownEvidenceIds: ["ev"] })
  expect(merged.diagnostics).toEqual([])
  const evaluated = evaluateControlPaths(merged.state)
  return { ...lowered, slice: merged.state, ...evaluated, diagnostics: [...lowered.diagnostics, ...evaluated.diagnostics] }
}
const known = (key: string, value: unknown, text: string) => ({ questionId: "q", key, value, text, origin: "user" })
test("explicit alternatives clone their common continuation instead of ANDing mutually exclusive guards", () => {
  const r = lower([unit([block("main", [{ kind: "choose", name: "role", claim: "if else", cases: [{ condition: eq("role", "admin"), body: "admin" }], otherwise: "member" }, { kind: "effect", name: "write", claim: "mutation" }]), block("admin", []), block("member", [])])], [known("role", "admin", "Role is admin.")])
  expect(r.paths.map((p: any) => p.predicate.truth).sort()).toEqual(["false", "true"])
  expect(r.paths.filter((p: any) => p.state === "checked")).toHaveLength(1)
  expect(r.paths.find((p: any) => p.state === "checked").protectedEffect).toBe("performed")
  expect(r.slice.rules.filter((n: any) => n.kind === "effect")).toHaveLength(2)
})
test("independent sequential guards remain a conjunction and unspecified premises keep both alternatives", () => {
  const guards = [{ kind: "guard", name: "a", claim: "first", condition: eq("role", "admin") }, { kind: "guard", name: "b", claim: "second", condition: eq("flag", false) }]
  const r = lower([unit([block("main", [...guards, { kind: "effect", name: "write", claim: "mutation" }])])], [known("role", "admin", "Role is admin."), known("flag", true, "Flag is true.")])
  expect(r.paths[0].state).toBe("inapplicable")
  const u = lower([unit([block("main", [{ kind: "choose", name: "role", claim: "if else", cases: [{ condition: eq("role", "admin"), body: "yes" }], otherwise: "no" }]), block("yes", [{ kind: "return", name: "yes", claim: "permitted", outcome: "allow" }]), block("no", [{ kind: "reject", name: "no", claim: "denied" }])])])
  expect(u.paths.map((p: any) => p.predicate.truth)).toEqual(["unknown", "unknown"])
  expect(u.paths.map((p: any) => p.disposition).sort()).toEqual(["allow", "deny"])
})
test("a missing alternative is an explicit gap, not an invented complement or completed outcome", () => {
  const r = lower([unit([block("main", [{ kind: "choose", name: "only", claim: "incomplete selection", cases: [{ condition: eq("role", "admin"), body: "yes" }] }]), block("yes", [])])])
  expect(r.diagnostics.map((d: any) => d.code)).toContain("choice-uncovered")
  expect(r.paths.some((p: any) => p.gaps.some((g: string) => g.includes("choice-uncovered")))).toBe(true)
})
test("helper early success returns to caller without claiming its skipped protected mutation", () => {
  const helper = unit([block("main", [{ kind: "choose", name: "exists", claim: "existing object", cases: [{ condition: eq("exists", true), body: "old" }], otherwise: "new" }, { kind: "effect", name: "insert", claim: "actual insertion" }]), block("old", [{ kind: "return", name: "noop", claim: "success without insert", value: true }]), block("new", [])], { handle: "save", role: "helper" })
  const r = lower([unit([block("main", [{ kind: "call", name: "save", claim: "calls save", symbol: "save", callee: "save", arguments: [] }, { kind: "return", name: "ok", claim: "endpoint success", outcome: "allow", value: true }])]), helper])
  expect(r.paths.map((p: any) => p.protectedEffect).sort()).toEqual(["none", "performed"])
  expect(r.paths.every((p: any) => p.disposition === "allow")).toBe(true)
})
test("same local name in caller and helper is a different object unless an argument alias is explicit", () => {
  const common = [{ kind: "bind", name: "caller", type: "principal", claim: "caller" }, { kind: "bind", name: "doc", type: "resource", claim: "input" }, { kind: "guard", name: "permission", claim: "input check", principal: "caller", resource: "doc" }]
  const helper = unit([block("main", [{ kind: "bind", name: "doc", type: "resource", claim: "separate output" }, { kind: "effect", name: "write", claim: "write output", principal: "actor", resource: "doc", authorizedBy: ["entry.permission"] }])], { handle: "helper", role: "helper", parameters: [{ name: "actor", type: "principal" }] })
  const r = lower([unit([block("main", [...common, { kind: "call", name: "helper", claim: "call", symbol: "helper", callee: "helper", arguments: [{ parameter: "actor", object: "caller" }] }])]), helper])
  expect(controlObjectDiagnostics(r.slice).map(d => d.code)).toContain("control-object-mismatch")
})
test("explicit entry parameters supply typed identities to mapped helper parameters without known values", () => {
  const root = unit([block("main", [{ kind: "guard", name: "permission", claim: "Explicit object check", principal: "actor", resource: "target" }, { kind: "call", name: "invoke", claim: "Calls helper", symbol: "helper", callee: "helper", arguments: [{ parameter: "who", object: "actor" }, { parameter: "dest", object: "target" }, { parameter: "context", object: "request" }] }])], { parameters: [{ name: "actor", type: "principal" }, { name: "target", type: "resource" }, { name: "request", type: "configuration" }] })
  const helper = unit([block("main", [{ kind: "effect", name: "write", claim: "Actual mutation", principal: "who", resource: "dest", authorizedBy: ["entry.permission"] }])], { handle: "helper", role: "helper", parameters: [{ name: "who", type: "principal" }, { name: "dest", type: "resource" }, { name: "context", type: "configuration" }] })
  const r = lower([root, helper])
  expect(r.diagnostics).toEqual([])
  expect(controlObjectDiagnostics(r.slice)).toEqual([])
  expect(r.paths[0].complete).toBe(true)
  expect(r.paths[0].protectedEffect).toBe("performed")
  expect(r.slice.bindings).toEqual([])
  expect(r.slice.rules.filter((n: any) => n.kind === "binding").map((n: any) => n.bindingKind).sort()).toEqual(["configuration", "principal", "resource"])
})
test("unbound helper arguments name the missing mapping and the actual type mismatch", () => {
  const helper = unit([block("main", [])], { handle: "helper", role: "helper", parameters: [{ name: "actor", type: "principal" }, { name: "target", type: "resource" }] })
  const r = lower([unit([block("main", [{ kind: "bind", name: "context", type: "configuration", claim: "Explicit configuration" }, { kind: "call", name: "invoke", claim: "Helper call", symbol: "helper", callee: "helper", arguments: [{ parameter: "actor", object: "context" }] }])]), helper])
  const message = r.diagnostics.filter((d: any) => d.code === "semantic-argument-unbound").map((d: any) => d.message).join("\n")
  expect(message).toContain("actor")
  expect(message).toContain("principal")
  expect(message).toContain("context")
  expect(message).toContain("configuration")
  expect(message).toContain("target")
  expect(r.paths[0].complete).toBe(false)
})
test("an entry return without a permission outcome names its local source step without guessing from its scalar", () => {
  const r = lower([unit([block("main", [{ kind: "return", name: "response", claim: "Scalar result only", value: true, outcome: "unknown" }])])])
  const diagnostic = r.diagnostics.find((d: any) => d.code === "entry-return-outcome-unspecified")
  expect(diagnostic).toBeDefined()
  expect(diagnostic.message).toContain("main.response")
  expect(r.paths[0].disposition).toBe("unknown")
  expect(r.paths[0].complete).toBe(false)
})
test("unread call, block cycle and expansion limits remain named unresolved terminals", () => {
  const call = lower([unit([block("main", [{ kind: "call", name: "gate", claim: "decisive callee", symbol: "gate", callee: "unread", arguments: [] }])])])
  expect(call.delta.dependencies).toHaveLength(1)
  expect(call.paths[0].protectedEffect).toBe("unresolved")
  const cyclic = lower([unit([block("main", [{ kind: "choose", name: "cycle", claim: "recursive body", cases: [{ condition: eq("flag", true), body: "main" }], otherwise: "other" }]), block("other", [])])])
  expect(cyclic.diagnostics.map((d: any) => d.code)).toContain("semantic-cycle")
  const large = lower([unit([block("main", Array.from({ length: 140 }, (_, i) => ({ kind: "guard", name: `g${i}`, claim: "guard" })))])])
  expect(large.diagnostics.map((d: any) => d.code)).toContain("semantic-node-limit")
  expect(large.paths.every((p: any) => !p.complete)).toBe(true)
})
