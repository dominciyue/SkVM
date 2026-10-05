import { expect, test } from "bun:test"
import { compileAuthorizationInquiry } from "./inquiry-program.ts"
import { createControlSlice, mergeControlSlice } from "./control-slice.ts"
import { evaluateControlPaths, controlObjectDiagnostics } from "./control-conclusion.ts"
const api = await import("./semantic-flow.ts").catch(() => ({} as any))
const plan = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Role is admin. Flag is true.", premises: [] }] })
const eq = (binding: string, value: unknown) => ({ op: "eq", left: { binding }, right: { literal: value } })
const block = (name: string, steps: unknown[]) => ({ name, steps })
const unit = (blocks: any[], extra = {}) => ({ questionId: "q", evidenceIds: ["ev"], itemId: "work", handle: "entry", op: "add", role: "entry", start: "main", complete: true, fallthrough: "allow", parameters: [], blocks, ...extra })
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

test("static source relations are retained without creating calls, permissions or effects", () => {
  const step = { kind: "context", name: "route", relationship: "route-registration", claim: "The original router registers this handler" }
  expect(api.SemanticStepSchema.safeParse(step).success).toBe(true)
  const r = lower([unit([block("main", [step, { kind: "return", name: "done", claim: "Registration only", outcome: "allow" }])])])
  expect(r.delta.dependencies).toEqual([])
  expect(r.slice.rules.filter((r: any) => ["call", "guard", "effect"].includes(r.kind))).toEqual([])
  expect(r.slice.rules.some((r: any) => r.kind === "continue" && r.claim === step.claim)).toBe(true)
  expect(r.paths[0].protectedEffect).toBe("none")
})

test("source finite values follow explicit value arguments and aliases without becoming user premises", () => {
  const helper = unit([block("main", [{ kind: "choose", name: "constant", claim: "Source compares the explicit argument", cases: [{ condition: eq("requested", "edit"), body: "yes" }], otherwise: "no" }]), block("yes", [{ kind: "return", name: "yes", claim: "Matched", value: true }]), block("no", [{ kind: "return", name: "no", claim: "Unmatched", value: false }])], { handle: "gate", role: "helper", parameters: [{ name: "requested", type: "value" }] })
  const root = unit([block("main", [{ kind: "bind", name: "source_mode", type: "value", value: "edit", claim: "Literal visible in the original source" }, { kind: "bind", name: "alias", type: "value", aliasOf: "source_mode", claim: "Explicit source alias" }, { kind: "call", name: "gate", symbol: "gate", callee: "gate", arguments: [{ parameter: "requested", object: "alias" }], result: "permitted", claim: "Pass this literal" }, { kind: "guard", name: "required", condition: eq("permitted", true), claim: "Only true continues" }])])
  expect(api.SemanticStepSchema.safeParse(root.blocks[0].steps[0]).success).toBe(true)
  const r = lower([root, helper])
  expect(r.diagnostics).toEqual([])
  expect(r.paths.map((p: any) => p.predicate.truth).sort()).toEqual(["false", "true"])
  expect(r.slice.bindings).toEqual([])
  expect(r.delta.rules.find((n: any) => n.bindingName === "source_mode").sourceOrigin.step).toBe("source_mode")
  const unknown = lower([unit([block("main", [{ kind: "call", name: "gate", symbol: "gate", callee: "gate", arguments: [{ parameter: "requested", object: "source_mode" }], claim: "Unknown entry argument" }])], { parameters: [{ name: "source_mode", type: "value" }] }), helper])
  expect(unknown.paths.every((p: any) => p.predicate.truth === "unknown")).toBe(true)
})

test("finite field writes survive helper aliases, distinguish empty arrays from null, and preserve unrelated unknown fields", () => {
  const helper = unit([block("main", [{ kind: "transform", name: "clear", object: "input", field: "labels", value: [], claim: "Source writes an empty array" }, { kind: "return", name: "done", claim: "Return to caller" }])], { handle: "clear", role: "helper", parameters: [{ name: "input", type: "configuration" }] })
  expect(api.SemanticStepSchema.safeParse(helper.blocks[0].steps[0]).success).toBe(true)
  const root = unit([block("main", [{ kind: "bind", name: "alias", type: "configuration", aliasOf: "form", claim: "Same form" }, { kind: "call", name: "clear", symbol: "clear", callee: "clear", arguments: [{ parameter: "input", object: "alias" }], claim: "Clear only labels" }, { kind: "guard", name: "array", condition: { op: "not", arg: { op: "is-null", value: { binding: "form.labels" } } }, claim: "Empty array is not null" }, { kind: "guard", name: "project", condition: eq("form.projects", "unknown"), claim: "Project input still unspecified" }])], { parameters: [{ name: "form", type: "configuration" }] })
  const r = lower([root, helper])
  expect(r.diagnostics).toEqual([])
  expect(r.fieldChanges).toEqual([expect.objectContaining({ field: "labels", value: [], evidenceIds: ["ev"] })])
  expect(r.paths[0].predicate.truth).toBe("unknown")
  expect(r.paths[0].predicate.missingBindings).toEqual([expect.stringContaining(".projects")])
})

test("source values cannot attach to principals, conflict with aliases, nest unbounded data, or leak into a same-named helper local", () => {
  for (const step of [{ kind: "bind", name: "actor", type: "principal", value: true, claim: "Invalid literal actor" }, { kind: "bind", name: "alias", type: "value", aliasOf: "other", value: true, claim: "Two conflicting origins" }]) expect(api.semanticBlockDiagnostics(unit([block("main", [step])])).map((d: any) => d.code)).toContain("semantic-source-value-invalid")
  for (const value of [Array.from({ length: 65 }, () => 1), { nested: [] }, [[1]]]) expect(api.SemanticStepSchema.safeParse({ kind: "bind", name: "constant", type: "value", value, claim: "Bounded source value" }).success).toBe(false)
  const helper = unit([block("main", [{ kind: "bind", name: "constant", type: "value", claim: "Different unknown local" }, { kind: "guard", name: "check", condition: eq("constant", true), claim: "No caller name alias" }, { kind: "return", name: "end", claim: "Return" }])], { handle: "helper", role: "helper" })
  const root = unit([block("main", [{ kind: "bind", name: "constant", type: "value", value: true, claim: "Caller literal" }, { kind: "call", name: "invoke", symbol: "helper", callee: "helper", arguments: [], claim: "No mapping" }])])
  expect(lower([root, helper]).paths[0].predicate.truth).toBe("unknown")
})

test("finite maps copied from explicit values and later unknown writes never retain a stale literal", () => {
  const root = unit([block("main", [{ kind: "bind", name: "settings", type: "value", value: { mode: "edit" }, claim: "Source finite map" }, { kind: "transform", name: "copy", object: "form", field: "settings", source: "settings", claim: "Copy this explicit value" }, { kind: "guard", name: "copied", condition: eq("mode", "edit"), claim: "Source lookup", }, { kind: "transform", name: "forget", object: "form", field: "settings", source: "unknown", claim: "Source overwrites with unknown input" }, { kind: "guard", name: "missing", condition: { op: "has-key", map: { binding: "form.settings" }, key: { literal: "mode" } }, claim: "Overwritten value remains unknown" }])], { parameters: [{ name: "form", type: "configuration" }, { name: "unknown", type: "value" }] })
  root.blocks[0].steps[2].condition = { op: "eq", left: { lookup: { map: { binding: "form.settings" }, key: { literal: "mode" } } }, right: { literal: "edit" } }
  const r = lower([root])
  expect(r.diagnostics).toEqual([])
  expect(r.delta.rules.find((n: any) => n.sourceOrigin.step === "copied").condition.left.lookup.map).toEqual({ literal: { mode: "edit" } })
  expect(r.paths[0].predicate.truth).toBe("unknown")
  expect(r.paths[0].predicate.missingBindings).toEqual([expect.stringContaining(".settings")])
})

test("explicit object fields can be value arguments but cannot acquire an inferred resource type", () => {
  const root = unit([block("main", [{ kind: "transform", name: "set", object: "form", field: "labels", value: ["edit"], claim: "Source writes a finite field" }, { kind: "call", name: "pass", symbol: "helper", callee: "helper", arguments: [{ parameter: "labels", object: "form.labels" }], claim: "Pass precisely that field" }])], { parameters: [{ name: "form", type: "configuration" }] })
  const helper = unit([block("main", [{ kind: "guard", name: "member", condition: { op: "member", value: { literal: "edit" }, set: { binding: "labels" } }, claim: "Examine the supplied list" }, { kind: "return", name: "end", claim: "Return" }])], { handle: "helper", role: "helper", parameters: [{ name: "labels", type: "value" }] })
  const r = lower([root, helper])
  expect(r.diagnostics).toEqual([])
  expect(r.paths[0].predicate.truth).toBe("true")
  const invalid = lower([root, { ...helper, parameters: [{ name: "labels", type: "resource" }] }])
  expect(invalid.diagnostics.map((d: any) => d.code)).toContain("semantic-argument-unbound")
})

test("finite map field projections agree with whole-map lookup and unknown overwrites preserve only other fields", () => {
  const root = unit([block("main", [{ kind: "bind", name: "settings", type: "value", value: { mode: "read", other: "keep" }, claim: "Finite source map" }, { kind: "guard", name: "initial", condition: eq("settings.mode", "read"), claim: "Project the source key" }, { kind: "transform", name: "write", object: "settings", field: "mode", value: "edit", claim: "Change one known source field" }, { kind: "guard", name: "updated", condition: { op: "eq", left: { lookup: { map: { binding: "settings" }, key: { literal: "mode" } } }, right: { literal: "edit" } }, claim: "Whole-map lookup sees the new field" }, { kind: "transform", name: "unknown", object: "settings", field: "mode", source: "input", claim: "Unknown input overwrites the field" }, { kind: "guard", name: "other", condition: eq("settings.other", "keep"), claim: "Unrelated field survives" }, { kind: "guard", name: "unknown-value", condition: eq("settings.mode", "edit"), claim: "Do not reuse stale source literal" }])], { parameters: [{ name: "input", type: "value" }] })
  const r = lower([root])
  expect(r.delta.rules.find((n: any) => n.sourceOrigin.step === "initial").condition.left).toEqual({ literal: "read" })
  expect(r.delta.rules.find((n: any) => n.sourceOrigin.step === "updated").condition.left.lookup.map).toEqual({ literal: { mode: "edit", other: "keep" } })
  expect(r.delta.rules.find((n: any) => n.sourceOrigin.step === "other").condition.left).toEqual({ literal: "keep" })
  expect(r.paths[0].predicate.truth).toBe("unknown")
  expect(r.paths[0].predicate.missingBindings).toEqual([expect.stringContaining(".mode")])
})

test("typed field aliases name their mismatch and an explicit source field bind preserves resource identity", () => {
  const broken = unit([block("main", [{ kind: "bind", name: "target", type: "resource", aliasOf: "ctx.target", claim: "Invalid inferred resource alias" }])], { parameters: [{ name: "ctx", type: "configuration" }] })
  const d = lower([broken]).diagnostics.find((d: any) => d.code === "semantic-alias-missing")
  expect(d.message).toContain('"target" (resource)')
  expect(d.message).toContain('"ctx.target" (value)')
  const root = unit([block("main", [{ kind: "bind", name: "ctx.target", type: "resource", claim: "Shown source identifies the target field as this resource" }, { kind: "bind", name: "target", type: "resource", aliasOf: "ctx.target", claim: "Explicit same-type alias" }, { kind: "guard", name: "check", resource: "target", principal: "actor", claim: "Check this target" }, { kind: "call", name: "invoke", symbol: "helper", callee: "helper", arguments: [{ parameter: "target", object: "target" }, { parameter: "actor", object: "actor" }], claim: "Pass this checked resource" }])], { parameters: [{ name: "ctx", type: "configuration" }, { name: "actor", type: "principal" }] })
  const helper = unit([block("main", [{ kind: "effect", name: "write", resource: "target", principal: "actor", authorizedBy: ["entry.check"], claim: "Use the exact mapped resource" }, { kind: "return", name: "done", claim: "Return" }])], { handle: "helper", role: "helper", parameters: [{ name: "target", type: "resource" }, { name: "actor", type: "principal" }] })
  const r = lower([root, helper])
  expect(r.diagnostics).toEqual([])
  expect(controlObjectDiagnostics(r.slice)).toEqual([])
  expect(r.slice.rules.find((n: any) => n.kind === "effect").resource).toBe(r.slice.rules.find((n: any) => n.kind === "guard").resource)
})
