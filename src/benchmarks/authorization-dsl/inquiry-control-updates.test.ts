import { expect, test } from "bun:test"
import { createControlSlice, mergeControlSlice } from "../../task-dsl/authorization/control-slice.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
import { evaluateControlPaths } from "../../task-dsl/authorization/control-conclusion.ts"
const api = await import("./inquiry-control-updates.ts").catch(() => ({} as any))
const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Owner is null. Grants are not given.", premises: [] }, { id: "other", request: "Another object?", premises: [] }] })
const context = { questionIds: ["q", "other"], shownEvidenceIds: ["ev"], suppliedUserText: [program.questions[0]!.request, program.questions[1]!.request] }
const update = (targetKey: string, kind = "entry", extra = {}) => ({ op: "add", targetKey, questionId: "q", pathKey: "p", kind, after: [], evidenceIds: ["ev"], claim: targetKey, ...extra })
const envelope = (extra = {}) => ({ schemaVersion: "authorization-control-update/v1", ...extra })
test("an omitted root entry predecessor list does not roll back valid atomic siblings", () => {
  const { after, ...root } = update("entry")
  const result = api.applyControlUpdates(createControlSlice(), envelope({ atomic: true, rules: [root, update("effect", "effect", { after: ["entry"] })] }), program, context)
  expect(result.rejected).toEqual([])
  expect(result.state.rules.map((r: any) => r.after)).toEqual([[], ["entry"]])
  expect(root).not.toHaveProperty("after")
  const invalid = api.applyControlUpdates(createControlSlice(), envelope({ rules: [{ ...root, kind: "effect" }] }), program, context)
  expect(invalid.rejected[0].diagnostics.some((d: any) => d.path.endsWith("after"))).toBe(true)
})
test("local add and replace use a current human target and host-generated revision digest", () => {
  expect(typeof api.applyControlUpdates).toBe("function")
  const first = api.applyControlUpdates(createControlSlice(), envelope({ rules: [update("entry")] }), program, context)
  expect(first.accepted).toMatchObject([{ group: "rules", questionId: "q", targetKey: "entry" }])
  const next = api.applyControlUpdates(first.state, envelope({ rules: [update("entry", "reject", { op: "replace", reason: "Correct local extraction", complete: true })] }), program, context)
  expect(next.rejected).toEqual([])
  expect(next.state.rules[0].kind).toBe("reject")
  expect(next.state.revisions[0].previous.digest).toBe(first.state.rules[0].digest)
  expect(next.state.revisions[0].reason).toBe("Correct local extraction")
  const stale = api.applyControlUpdates(next.state, envelope({ baseRevision: first.state.revision, rules: [update("entry", "entry", { op: "replace", reason: "Old view" })] }), program, context)
  expect(stale.rejected[0].diagnostics[0].code).toBe("stale-control-revision")
  expect(stale.state).toEqual(next.state)
})
test("mixed invalid updates keep good local work and leave dependants explicitly unresolved", () => {
  expect(typeof api.applyControlUpdates).toBe("function")
  const result = api.applyControlUpdates(createControlSlice(), envelope({ rules: [update("entry"), update("bad", "guard", { after: ["entry"], evidenceIds: ["not-shown"] }), update("effect", "effect", { after: ["bad"], complete: true })] }), program, context)
  expect(result.accepted.map((a: any) => a.targetKey)).toEqual(["entry", "effect"])
  expect(result.rejected[0]).toMatchObject({ questionId: "q", targetKey: "bad" })
  expect(result.unresolved[0]).toMatchObject({ targetKey: "effect", rejectedTarget: "bad" })
  expect(evaluateControlPaths(result.state).paths[0]!.complete).toBe(false)
  const atomic = api.applyControlUpdates(createControlSlice(), envelope({ atomic: true, rules: [update("entry"), update("bad", "guard", { after: ["entry"], evidenceIds: ["not-shown"] })] }), program, context)
  expect(atomic.state).toEqual(createControlSlice())
  expect(atomic.accepted).toEqual([])
  expect(atomic.rejected).toHaveLength(2)
})
test("source identities and known versus unspecified user values have separate model fields", () => {
  expect(typeof api.applyControlUpdates).toBe("function")
  const { kind: _kind, ...sourceBinding } = update("doc", "entry", { bindingKey: "addressed-document", bindingKind: "resource" })
  const result = api.applyControlUpdates(createControlSlice(), envelope({
    sourceBindings: [sourceBinding],
    premiseValues: [{ op: "add", targetKey: "owner", questionId: "q", status: "known", value: null, text: "Owner is null." }, { op: "add", targetKey: "grant", questionId: "q", status: "unspecified", text: "Grants are not given." }],
  }), program, context)
  expect(result.rejected).toEqual([])
  expect(result.state.rules[0]).toMatchObject({ kind: "binding", bindingKind: "resource", bindingKey: "addressed-document" })
  expect(result.state.bindings).toHaveLength(1)
  expect(result.state.bindings[0].value).toBeNull()
  expect(result.accepted.find((a: any) => a.targetKey === "grant").status).toBe("kept-unknown")
})
test("replacement scope never borrows another question's same-named target", () => {
  expect(typeof api.applyControlUpdates).toBe("function")
  const old = mergeControlSlice(createControlSlice(), { schemaVersion: "authorization-control-slice/v1", rules: [{ key: "entry", questionId: "other", pathKey: "p", kind: "entry", after: [], evidenceIds: ["ev"], claim: "other" }] }, program, context).state
  const invalid = api.applyControlUpdates(old, envelope({ rules: [update("entry", "reject", { op: "replace", reason: "Wrong question" })] }), program, context)
  expect(invalid.state).toEqual(old)
  expect(invalid.rejected[0].diagnostics[0].code).toBe("control-target-missing")
  const malformed = api.applyControlUpdates(old, envelope({ rules: [update("good"), { op: "add", questionId: "q", targetKey: "bad", kind: "effect", evidenceIds: ["ev"] }] }), program, context)
  expect(malformed.state.rules.some((r: any) => r.key === "good")).toBe(true)
  expect(malformed.rejected[0].diagnostics.some((d: any) => d.path.includes("after"))).toBe(true)
})

test("local groups cannot replace another group's target in the same question", () => {
  const first = api.applyControlUpdates(createControlSlice(), envelope({ rules: [update("entry")] }), program, context)
  const { kind: _kind, ...binding } = update("entry", "entry", { op: "replace", reason: "Wrong group", bindingKey: "document", bindingKind: "resource" })
  const wrong = api.applyControlUpdates(first.state, envelope({ sourceBindings: [binding] }), program, context)
  expect(wrong.state).toEqual(first.state)
  expect(wrong.rejected[0].diagnostics.some((d: any) => d.code === "control-target-group")).toBe(true)
})

test("a child dependency on a rejected parent remains an explicit unresolved item", () => {
  const dependency = (targetKey: string, extra = {}) => ({ op: "add", targetKey, questionId: "q", pathKey: "p", from: "entry", symbol: "helper", evidenceIds: ["ev"], reason: "Read original helper", kind: "control", decisive: true, ...extra })
  const result = api.applyControlUpdates(createControlSlice(), envelope({ rules: [update("entry")], dependencies: [dependency("parent", { evidenceIds: ["not-shown"] }), dependency("child", { parent: "parent" })] }), program, context)
  expect(result.accepted.map((a: any) => a.targetKey)).toEqual(["entry", "child"])
  expect(result.unresolved).toContainEqual({ group: "dependencies", questionId: "q", targetKey: "child", rejectedTarget: "parent", code: "control-dependency-unresolved" })
})

test("atomic rollback exposes current gaps rather than the rolled-back candidate's nodes", () => {
  const old = api.applyControlUpdates(createControlSlice(), envelope({ rules: [update("entry")] }), program, context).state
  const result = api.applyControlUpdates(old, envelope({ atomic: true, rules: [update("effect", "effect", { after: ["not-accepted"], complete: true })] }), program, context)
  expect(result.state).toEqual(old)
  expect(result.accepted).toEqual([])
  expect(result.unresolved).toEqual([])
  expect(result.attemptUnresolved).toMatchObject([{ targetKey: "effect", rejectedTarget: "not-accepted" }])
})

test("explicit local replacement records host provenance without requiring invented model rationale", () => {
  const first = api.applyControlUpdates(createControlSlice(), envelope({ rules: [update("entry")] }), program, context)
  const next = api.applyControlUpdates(first.state, envelope({ rules: [update("entry", "reject", { op: "replace", complete: true })] }), program, context)
  expect(next.rejected).toEqual([])
  expect(next.state.rules[0].kind).toBe("reject")
  expect(next.state.revisions[0]).toMatchObject({ previous: first.state.rules[0], reason: "host:explicit-local-replacement" })
  const invalid = api.applyControlUpdates(next.state, envelope({ rules: [update("entry", "effect", { op: "replace", evidenceIds: ["not-shown"] })] }), program, context)
  expect(invalid.rejected[0].diagnostics.map((d: any) => d.code)).toContain("evidence-not-shown")
  expect(invalid.state).toEqual(next.state)
  const dependency = api.applyControlUpdates(next.state, envelope({ dependencies: [{ op: "add", targetKey: "dep", questionId: "q", pathKey: "p", from: "entry", symbol: "helper", kind: "control", evidenceIds: ["ev"] }] }), program, context)
  expect(dependency.rejected[0].diagnostics.some((d: any) => d.path.endsWith("reason"))).toBe(true)
})
