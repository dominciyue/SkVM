import { expect, test } from "bun:test"
import { compileAuthorizationInquiry } from "./inquiry-program.ts"
const api = await import("./control-slice.ts").catch(() => ({} as any))
const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "conformance", policy: { text: "Only reviewers may approve.", origin: "user", location: "policy/v1" }, questions: [{ id: "q", request: "Owner is null. May approval proceed?", premises: [{ text: "Owner is null.", origin: "user" }] }, { id: "other", request: "Different object?", premises: [] }] })
const context = { questionIds: ["q", "other"], shownEvidenceIds: ["ev-read"], evidenceQuestions: { "ev-read": ["q"] } }
const rule = (key = "entry", extra = {}) => ({ key, questionId: "q", pathKey: "p", kind: "entry", after: [], evidenceIds: ["ev-read"], claim: "Observed entry", ...extra })
const delta = (rules: unknown[] = [rule()], extra = {}) => ({ schemaVersion: "authorization-control-slice/v1", rules, ...extra })
test("guided execution is an explicit opt-in and legacy remains the default", () => {
  expect(api.parseInquiryStrategy(undefined)).toBe("legacy")
  expect(api.parseInquiryStrategy("guided-evidence-v2")).toBe("guided-evidence-v2")
  expect(api.parseInquiryStrategy("operation-evidence-v4")).toBe("operation-evidence-v4")
  expect(api.isSourceAssistedInquiryStrategy("operation-evidence-v4")).toBe(true)
  expect(api.isFiniteControlInquiryStrategy("operation-evidence-v4")).toBe(true)
  expect(api.isPropertyDirectedInquiryStrategy("operation-evidence-v3")).toBe(false)
  expect(api.sourceMaterialSemanticVersion("operation-evidence-v4")).toBe("property-control/v1")
  expect(() => api.parseInquiryStrategy("guided-evidence-v99")).toThrow("inquiry-strategy")
})
test("semantic completion explicitly inherits task-binding and v7 without changing the default", () => {
  expect(api.parseInquiryStrategy("semantic-completion-v1")).toBe("semantic-completion-v1")
  expect(api.isTaskBindingStrategy("semantic-completion-v1")).toBe(true)
  expect(api.isInterproceduralPropertyStrategy("semantic-completion-v1")).toBe(true)
  expect(api.sourceMaterialSemanticVersion("semantic-completion-v1")).toBe("interprocedural-property/v1")
  expect(api.parseInquiryStrategy(undefined)).toBe("legacy")
})
test("control contract binds original source per question and separates policy and semantics", () => {
  expect(typeof api.mergeControlSlice).toBe("function")
  const good = api.mergeControlSlice(api.createControlSlice(), delta(), program, context)
  expect(good.diagnostics).toEqual([])
  expect(good.state.rules[0]).toMatchObject({ sourceBound: true, semanticSupport: "unreviewed" })
  for (const [extra, code] of [[{ evidenceIds: ["not-read"] }, "evidence-not-shown"], [{ questionId: "other" }, "evidence-question-mismatch"], [{ evidenceIds: ["policy/v1"] }, "policy-as-source"]] as const) {
    const invalid = api.mergeControlSlice(api.createControlSlice(), delta([rule("bad", extra)]), program, context)
    expect(invalid.diagnostics.some((d: any) => d.code === code)).toBe(true)
    expect(invalid.state.rules).toHaveLength(0)
  }
})
test("idempotent proposals keep IDs; contradictory same-key rules are archived instead of silently overwritten", () => {
  const first = api.mergeControlSlice(api.createControlSlice(), delta(), program, context)
  const again = api.mergeControlSlice(first.state, delta(), program, context)
  expect(again.state.rules).toEqual(first.state.rules)
  const bad = api.mergeControlSlice(first.state, delta([rule("entry", { kind: "reject", claim: "Rejects" })]), program, context)
  expect(bad.diagnostics.some((d: any) => d.code === "control-conflict")).toBe(true)
  expect(bad.state.rules[0].kind).toBe("entry")
  expect(bad.state.conflicts).toHaveLength(1)
  const revised = api.mergeControlSlice(bad.state, delta([rule("entry", { kind: "reject", claim: "Rejects", revisionOf: first.state.rules[0].digest, revisionReason: "Correct earlier extraction" })]), program, context)
  expect(revised.state.rules[0].kind).toBe("reject")
  expect(revised.state.revisions).toHaveLength(1)
  expect(revised.state.conflicts[0].resolved).toBe(true)
})
test("typed identities and explicit user mappings keep null distinct from absent or homonymous objects", () => {
  const r = api.mergeControlSlice(api.createControlSlice(), delta([rule("a", { kind: "binding", bindingKey: "docA", bindingKind: "resource" }), rule("b", { kind: "binding", bindingKey: "docB", bindingKind: "resource", claim: "Same human label, different key" })], { bindings: [{ questionId: "q", key: "owner", value: null, origin: "user", text: "Owner is null." }] }), program, context)
  expect(r.diagnostics).toEqual([])
  expect(api.controlBindings(r.state, "q")).toEqual({ owner: null })
  expect(r.state.rules[0].id).not.toBe(r.state.rules[1].id)
  const invalid = api.mergeControlSlice(r.state, delta([], { bindings: [{ questionId: "q", key: "grant", value: true, origin: "user", text: "Grant exists" }] }), program, context)
  expect(invalid.diagnostics.some((d: any) => d.code === "premise-not-supplied")).toBe(true)
  expect(api.controlBindings(invalid.state, "q").grant).toBeUndefined()
  const authoredPremise = api.mergeControlSlice(api.createControlSlice(), delta([], { bindings: [{ questionId: "q", key: "owner", value: null, origin: "user", text: "Owner is null." }] }), program, { ...context, suppliedUserText: ["Owner is unspecified. May approval proceed?"] })
  expect(authoredPremise.diagnostics.some((d: any) => d.code === "premise-not-supplied")).toBe(true)
  expect(api.controlBindings(authoredPremise.state, "q")).toEqual({})
})
test("control contract reports version, expression and per-question limits without discarding existing proposals", () => {
  for (const input of [{ ...delta(), schemaVersion: "v99" }, delta(Array.from({ length: 65 }, (_, n) => rule(`n${n}`))), delta([rule("bad", { condition: { op: "eval", code: "sideEffect()" } })])]) {
    const bad = api.mergeControlSlice(api.createControlSlice(), input, program, context)
    expect(bad.diagnostics.length).toBeGreaterThan(0)
    expect(bad.state.rules).toHaveLength(0)
  }
  const first = api.mergeControlSlice(api.createControlSlice(), delta(Array.from({ length: 64 }, (_, n) => rule(`n${n}`))), program, context)
  const overflow = api.mergeControlSlice(first.state, delta([rule("new")]), program, context)
  expect(overflow.diagnostics.some((d: any) => d.code === "control-node-limit")).toBe(true)
  expect(overflow.state.rules).toHaveLength(64)
})

test("explicitly unspecified user values cannot be fabricated as null or false", () => {
  const input = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Owner is unspecified; grants are not given.", premises: [] }] })
  for (const [key, value, text] of [["owner", null, "Owner is unspecified"], ["grant", false, "grants are not given"]] as const) {
    const result = api.mergeControlSlice(api.createControlSlice(), delta([], { bindings: [{ questionId: "q", key, value, origin: "user", text }] }), input, { ...context, suppliedUserText: [input.questions[0]!.request] })
    expect(result.diagnostics.some((d: any) => d.code === "premise-value-unspecified")).toBe(true)
    expect(api.controlBindings(result.state, "q")).toEqual({})
  }
})
