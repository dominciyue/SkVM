import { expect, test } from "bun:test"
import { runtimePlan } from "./study.ts"
import { changedInputs } from "./changes.ts"
import { normalizeNaturalOperation } from "../../../../../src/task-dsl/authorization/operation-program.ts"

test("account study uses one fixed original task and distinguishes native quality arms", () => {
  expect(runtimePlan({ id: "native-cloudflare-download-original", kind: "native", task: "download" })).toMatchObject({ method: "M", domainTools: true, strategy: "operation-evidence-v4", inputName: "paperless-download-original.json" })
  expect(runtimePlan({ id: "quality-owui-N", kind: "quality", task: "owui" })).toMatchObject({ domainTools: false, strategy: "legacy", inputName: "owui-ingestion-original.json" })
  expect(runtimePlan({ id: "quality-owui-D-S", kind: "quality", task: "owui" })).toMatchObject({ method: "D1", domainTools: true, strategy: "operation-evidence-v4" })
  expect(() => runtimePlan({ id: "../evaluator", kind: "native", task: "other" })).toThrow()
})
test("author and plain account claims describe their actual common source runtime", () => {
  expect(runtimePlan({ id: "author-download", kind: "author", task: "download" })).toMatchObject({ domainTools: false, strategy: "legacy", method: undefined })
  expect(runtimePlan({ id: "quality-download-N", kind: "quality", task: "download" }).method).toBeUndefined()
})

test("registered changes retain all current original questions and never import older declarations", () => {
  const brief = "Inspect entry; preserve requested source and representation distinctions and unspecified owner/grants."
  const base = { schemaVersion: "authorization-inquiry-input/v1" as const, taskId: "t", repository: "anonymous", sourceRef: "r", sourceRoot: "source", allowedPaths: ["app.py"], inquiry: normalizeNaturalOperation(brief, "behavior") }
  const policy = { text: "Authorize the exact affected object.", origin: "external-policy" as const, location: "independently-registered" }
  const changes = changedInputs(base, { policy, premiseText: "The caller owns the requested object; related object grants are unspecified.", sourceRoot: "changed-source" })
  for (const input of Object.values(changes)) {
    expect(input.inquiry!.questions.map(q => ({ id: q.id, request: q.request }))).toEqual(base.inquiry.questions.map(q => ({ id: q.id, request: q.request })))
    expect(input.inquiry!.schemaVersion).toBe(base.inquiry.schemaVersion)
  }
  expect(changes.policy.inquiry!.mode).toBe("conformance")
  expect(changes.policy.inquiry!.policy).toEqual(policy)
  expect(changes.premise.inquiry!.questions.every(q => q.premises[0]?.origin === "user")).toBe(true)
  expect(changes.source.sourceRoot).toBe("changed-source")
  expect(changes.source.inquiry).toEqual(base.inquiry)
  expect(base.inquiry.mode).toBe("behavior")
})
