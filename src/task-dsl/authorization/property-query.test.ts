import { expect, test } from "bun:test"
import { AuthorizationInquirySchema } from "./inquiry.ts"
const api = await import("./property-query.ts").catch(() => ({} as any))
const question = { id: "q", request: "Check authorization before send and whether the operation completes.", premises: [], properties: [{ id: "auth", kind: "authorization-before-effect", requirement: "authorization before send" }, { id: "done", kind: "operation-completion", requirement: "whether the operation completes" }] }
const skeleton: any = { revision: "r", modelCovered: true, source: { id: "entry", path: "app.py", sha256: "s", startLine: 1, endLine: 4 }, anchors: [{ id: "actor", kind: "parameter" }, { id: "item", kind: "parameter" }, { id: "guard", kind: "condition" }, { id: "send", kind: "call" }] }
const draft: any = { revision: "r", annotations: [{ anchorId: "actor", role: "principal" }, { anchorId: "item", role: "resource" }, { anchorId: "guard", role: "condition", guardBranch: "false", principalAnchorId: "actor", resourceAnchorId: "item" }, { anchorId: "send", role: "effect", principalAnchorId: "actor", resourceAnchorId: "item", authorizedByAnchorIds: ["guard"] }], unresolved: [], propertyBindings: [{ propertyId: "auth", effectAnchorId: "send", guardAnchorId: "guard" }, { propertyId: "done", effectAnchorId: "send" }] }
test("property kinds have source bindings and distinct current question identities, never inherited verdicts", () => {
  const bound = api.bindPropertyQueries(question, skeleton, draft)
  expect(bound.queries.map((q: any) => [q.kind, q.state])).toEqual([["authorization-before-effect", "bound"], ["operation-completion", "bound"]])
  expect(bound.queries.every((q: any) => q.semanticReview === "unreviewed" && q.verdict === undefined)).toBe(true)
  expect(api.bindPropertyQueries({ ...question, request: question.request + " Again." }, skeleton, draft).revision).not.toBe(bound.revision)
  expect(api.bindPropertyQueries(question, skeleton).queries.every((q: any) => q.state === "unbound")).toBe(true)
  expect(api.bindPropertyQueries(question, { ...skeleton, revision: "changed" }, draft).queries.every((q: any) => q.state === "unbound")).toBe(true)
})
test("property declarations and source bindings reject missing, duplicate and foreign identities", () => {
  expect(AuthorizationInquirySchema.safeParse({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [question] }).success).toBe(true)
  for (const properties of [[question.properties[0], question.properties[0]], [{ ...question.properties[0], kind: "safe" }]]) expect(AuthorizationInquirySchema.safeParse({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ ...question, properties }] }).success).toBe(false)
  for (const propertyBindings of [[{ propertyId: "foreign", effectAnchorId: "send" }], [draft.propertyBindings[0], draft.propertyBindings[0]]]) expect(api.bindPropertyQueries(question, skeleton, { ...draft, propertyBindings }).diagnostics.some((d: any) => d.code === "property-binding-identity")).toBe(true)
  expect(api.validatePropertyQuestionMapping(["q", "other"], [{ questionId: "q", properties: [] }]).map((d: any) => d.code)).toContain("property-question-missing")
  expect(api.validatePropertyQuestionMapping(["q"], [{ questionId: "foreign", properties: [] }]).map((d: any) => d.code)).toContain("property-question-unknown")
})
test("ambiguous qualified owners report the exact current owner handles without choosing one", () => {
  const entry = { ...skeleton, sourceId: "entry" }, helper = { ...skeleton, sourceId: "helper", source: { ...skeleton.source, id: "helper", path: "helper.py" } }, ref = { sourceId: "helper", sourceSha256: "s", revision: "r", anchorId: "send", questionId: "q", operationId: "op" }
  const owners = ["first", "second"].map(handle => ({ questionId: "q", operationId: "op", handle, skeleton: helper, interpretation: draft }))
  const result = api.bindPropertyQueries(question, entry, { ...draft, propertyBindings: [{ propertyId: "auth", effectRef: ref }] }, { operationId: "op", sources: owners })
  expect(result.queries[0].state).toBe("unbound")
  expect(result.diagnostics.find((d: any) => d.code === "property-reference-owner-ambiguous").owners.map((o: any) => o.handle)).toEqual(["first", "second"])
})
