import { expect, test } from "bun:test"
import { createControlSlice, mergeControlSlice } from "./control-slice.ts"
import { compileAuthorizationInquiry } from "./inquiry-program.ts"
const api = await import("./control-conclusion.ts").catch(() => ({} as any))
const context = { questionIds: ["q"], shownEvidenceIds: ["ev"] }
const plan = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Owner is null. Can the caller write?", premises: [{ text: "Owner is null.", origin: "user" }] }] })
const rule = (key: string, kind: string, after: string[], extra = {}) => ({ key, kind, after, questionId: "q", pathKey: "p", claim: key, evidenceIds: ["ev"], ...extra })
const state = (rules: any[], extra = {}, p = plan) => mergeControlSlice(createControlSlice(), { schemaVersion: "authorization-control-slice/v1", rules, ...extra }, p, context).state
const answer = (disposition: string, extra = {}) => ({ schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q", behavior: { disposition, explanation: "Raw model explanation retained" }, branches: [], evidenceIds: ["ev"], missing: [], ...extra }], observations: [], scope: "local" })
const codes = (checked: any) => checked.diagnostics.map((d: any) => d.code)
test("explicit ordered rejection conflicts with allow and does not certify model semantics", () => {
  expect(typeof api.checkControlConclusions).toBe("function")
  const s = state([rule("entry", "entry", []), rule("stop", "reject", ["entry"], { complete: true })])
  const checked = api.checkControlConclusions(plan, s, answer("allow"), [])
  expect(codes(checked)).toContain("behavior-rule-conflict")
  expect(checked).toMatchObject({ sourceBound: true, ruleConsistency: false, semanticSupport: "unreviewed" })
  expect(checked.paths[0]).toMatchObject({ disposition: "deny", complete: true })
  expect(codes(api.checkControlConclusions(plan, s, answer("deny"), []))).toEqual([])
})
test("homonymous objects do not authorize one another and authorization edges need precedence", () => {
  const rules = [rule("entry", "entry", []), rule("a", "binding", ["entry"], { bindingKind: "resource", bindingKey: "input" }), rule("b", "binding", ["entry"], { bindingKind: "resource", bindingKey: "output" }), rule("user", "binding", ["entry"], { bindingKind: "principal", bindingKey: "caller" }), rule("guard", "guard", ["a", "user"], { principal: "caller", resource: "input" }), rule("write", "effect", ["guard", "b"], { principal: "caller", resource: "output", authorizedBy: ["guard"], complete: true })]
  expect(codes(api.checkControlConclusions(plan, state(rules), answer("allow"), []))).toContain("control-object-mismatch")
  rules[5] = rule("write", "effect", ["b"], { principal: "caller", resource: "input", authorizedBy: ["guard"], complete: true })
  expect(codes(api.checkControlConclusions(plan, state(rules), answer("allow"), []))).toContain("control-order-missing")
})
test("null owner excludes a non-null branch, while unspecified owner keeps its residual", () => {
  const predicate = { op: "not", arg: { op: "is-null", value: { binding: "owner" } } }
  const rules = [rule("entry", "entry", []), rule("owner", "effect", ["entry"], { pathKey: "owner-nonnull", condition: predicate, complete: true }), rule("no-owner", "effect", ["entry"], { pathKey: "owner-null", condition: { op: "is-null", value: { binding: "owner" } }, complete: true })]
  const s = state(rules, { bindings: [{ questionId: "q", key: "owner", value: null, origin: "user", text: "Owner is null." }] })
  const checked = api.checkControlConclusions(plan, s, answer("conditional", { branches: [{ id: "owner-nonnull", condition: "owner set", disposition: "allow", evidenceIds: ["ev"], explanation: "wrong current branch" }] }), [])
  expect(codes(checked)).toContain("inapplicable-branch")
  expect(checked.paths.find((p: any) => p.pathKey === "owner-nonnull").state).toBe("inapplicable")
  const unknown = api.evaluateControlPaths(state(rules)).paths.find((p: any) => p.pathKey === "owner-nonnull")
  expect(unknown.predicate.truth).toBe("unknown")
  expect(unknown.predicate.missingBindings).toEqual(["owner"])
})
test("terminal conflict and effect after early rejection are detected without guessing array order", () => {
  const s = state([rule("entry", "entry", []), rule("deny", "reject", ["entry"], { complete: true }), rule("allow", "effect", ["entry"], { complete: true })])
  expect(codes(api.checkControlConclusions(plan, s, answer("allow"), []))).toContain("path-outcome-conflict")
  const impossible = state([rule("effect", "effect", ["stop"], { complete: true }), rule("entry", "entry", []), rule("stop", "reject", ["entry"], { complete: true })])
  expect(codes(api.checkControlConclusions(plan, impossible, answer("deny"), []))).toContain("effect-after-reject")
})
test("readable decisive dependency prevents false completeness but early rejection makes later grant irrelevant", () => {
  const s = state([rule("entry", "entry", []), rule("write", "effect", ["entry"], { complete: true })])
  const dependency = { key: "grant", questionId: "q", pathKey: "p", state: "pending", decisive: true, symbol: "grantCheck" }
  expect(codes(api.checkControlConclusions(plan, s, answer("allow"), [dependency]))).toContain("decisive-dependency-open")
  const deny = state([rule("entry", "entry", []), rule("stop", "reject", ["entry"], { complete: true })])
  expect(codes(api.checkControlConclusions(plan, deny, answer("unknown", { missing: [{ kind: "source-gap", detail: "grantCheck unread", nextRead: "grantCheck" }] }), [{ ...dependency, state: "inapplicable" }]))).toContain("irrelevant-dependency-gap")
})
test("independent deny policy checks allow as violated; policy changes never change computed behavior", () => {
  const conform = (text: string) => compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "conformance", policy: { text, origin: "user", location: "policy" }, questions: plan.questions })
  const p = conform("Only reviewers may write."), rules = [rule("entry", "entry", []), rule("write", "effect", ["entry"], { complete: true })]
  const s = state(rules, { policyRules: [{ key: "policy", questionId: "q", pathKey: "p", expected: "deny", origin: "policy", text: "Only reviewers may write.", location: "policy" }] }, p)
  const a = answer("allow", { policyAssessment: { status: "satisfied", explanation: "Wrongly uses implementation as policy" } })
  expect(codes(api.checkControlConclusions(p, s, a, []))).toContain("policy-behavior-conflict")
  expect(api.checkControlConclusions(p, s, a, []).policyComparisons[0].status).toBe("violated")
  const changed = state(rules, { policyRules: [{ key: "policy", questionId: "q", pathKey: "p", expected: "allow", origin: "policy", text: "Everyone may write.", location: "policy" }] }, conform("Everyone may write."))
  expect(api.evaluateControlPaths(changed).paths[0].disposition).toBe(api.evaluateControlPaths(s).paths[0].disposition)
  expect(api.checkControlConclusions(conform("Everyone may write."), changed, a, []).policyComparisons[0].status).toBe("satisfied")
})
test("cycles, missing predecessor, missing entry and branch limit stay explicit gaps", () => {
  for (const rules of [[rule("write", "effect", ["missing"], { complete: true })], [rule("a", "continue", ["b"]), rule("b", "effect", ["a"], { complete: true })], [rule("write", "effect", [], { complete: true })]]) {
    expect(api.evaluateControlPaths(state(rules)).paths[0].complete).toBe(false)
    expect(codes(api.checkControlConclusions(plan, state(rules), answer("allow"), []))).toContain("path-not-closed")
  }
  const wide = state([rule("entry", "entry", []), ...Array.from({ length: 17 }, (_, n) => rule(`end${n}`, "effect", ["entry"], { pathKey: `p${n}`, complete: true }))])
  expect(api.evaluateControlPaths(wide).diagnostics.some((d: any) => d.code === "control-path-limit")).toBe(true)
})

test("an unreachable unrelated binding cannot satisfy the live effect", () => {
  const never = { op: "eq", left: { literal: 1 }, right: { literal: 2 } }
  const s = state([
    rule("entry", "entry", []),
    rule("hidden-user", "binding", ["entry"], { pathKey: "hidden", bindingKey: "caller", bindingKind: "principal", condition: never }),
    rule("hidden-object", "binding", ["entry"], { pathKey: "hidden", bindingKey: "doc", bindingKind: "resource", condition: never }),
    rule("write", "effect", ["entry"], { principal: "caller", resource: "doc", complete: true }),
  ])
  expect(codes(api.checkControlConclusions(plan, s, answer("allow"), []))).toContain("object-binding-unreachable")
})
test("live bindings on another branch are still not predecessors of this effect", () => {
  const s = state([rule("entry", "entry", []), rule("caller", "binding", ["entry"], { pathKey: "other", bindingKey: "caller", bindingKind: "principal" }), rule("doc", "binding", ["entry"], { pathKey: "other", bindingKey: "doc", bindingKind: "resource" }), rule("write", "effect", ["entry"], { principal: "caller", resource: "doc", complete: true })])
  expect(codes(api.checkControlConclusions(plan, s, answer("allow"), []))).toContain("object-binding-unreachable")
})
test("a guard and effect cannot conflate distinct source bindings with the same identity key", () => {
  const s = state([rule("entry", "entry", []), rule("caller", "binding", ["entry"], { bindingKey: "caller", bindingKind: "principal" }), rule("input-doc", "binding", ["entry"], { bindingKey: "doc", bindingKind: "resource", claim: "Input document resolved from request" }), rule("guard", "guard", ["caller", "input-doc"], { principal: "caller", resource: "doc" }), rule("output-doc", "binding", ["entry"], { bindingKey: "doc", bindingKind: "resource", claim: "Output document resolved from destination" }), rule("write", "effect", ["guard", "output-doc"], { principal: "caller", resource: "doc", authorizedBy: ["guard"], complete: true })])
  expect(codes(api.checkControlConclusions(plan, s, answer("allow"), []))).toContain("object-binding-conflict")
})
test("question-local binding scope and a legitimate common predecessor are preserved", () => {
  const rules = [rule("entry", "entry", []), rule("caller", "binding", ["entry"], { bindingKey: "caller", bindingKind: "principal" }), rule("doc", "binding", ["entry"], { bindingKey: "doc", bindingKind: "resource" }), rule("guard", "guard", ["caller", "doc"], { principal: "caller", resource: "doc" }), rule("write", "effect", ["guard"], { principal: "caller", resource: "doc", authorizedBy: ["guard"], complete: true })]
  expect(codes(api.checkControlConclusions(plan, state(rules), answer("allow"), []))).toEqual([])
  const multi = { ...plan, questions: [...plan.questions, { ...plan.questions[0]!, id: "other" }] }
  const slice = mergeControlSlice(createControlSlice(), { schemaVersion: "authorization-control-slice/v1", rules: rules.map(r => r.kind === "binding" ? { ...r, questionId: "other" } : r) }, multi, { ...context, questionIds: ["q", "other"] }).state
  expect(codes(api.checkControlConclusions(multi, slice, answer("allow"), []))).toContain("object-binding-missing")
})
