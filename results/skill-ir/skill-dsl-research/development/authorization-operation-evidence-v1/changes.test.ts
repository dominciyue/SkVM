import { expect, test } from "bun:test"
import * as changes from "./changes.ts"
import { plannedPositions } from "./study.ts"
import { removeOneScopedClause, assertOneSourceEdit } from "../authorization-semantic-lowering-v1/source-changes.ts"

const input = { schemaVersion: "authorization-inquiry-input/v1", taskId: "fixture", repository: "fixture", sourceRef: "fixed", sourceRoot: "source", allowedPaths: ["."], inquiry: { schemaVersion: "authorization-inquiry/v2", mode: "conformance", operations: [{ id: "reserve", request: "Reserve the exhibit" }], questions: [{ id: "behavior", operationId: "reserve", intent: "behavior", request: "Inspect all reservation guards", premises: [] }], policy: { text: "Exact reviewer required", origin: "user", location: "original" } } }
const intent = { policy: { text: "Only the owner may reserve", origin: "user", location: "changed" }, premise: "The visitor has an independent group review grant." }
test("changes stay within six registered same-task paired positions", () => {
  const manifest = { rows: plannedPositions(), inputs: [{ id: "paperless-share-create", file: "model/inputs/paperless-share-create.json", sha256: "registered" }], inheritedSeals: { sealedTasks: ["paperless-notes"] } }
  expect((changes as any).selectChangeRow(manifest, "change-source-materials-previous").row.strategy).toBe("operation-evidence-v1")
  expect(() => (changes as any).selectChangeRow(manifest, "debug-paperless-share-create")).toThrow()
  manifest.inheritedSeals.sealedTasks.push("paperless-share-create")
  expect(() => (changes as any).selectChangeRow(manifest, "change-policy-fresh")).toThrow()
})
test("public policy and premises edits retain all original operation and question duties", () => {
  const policy = (changes as any).changedDeclaration(input, "policy", intent, "../../source"), premise = (changes as any).changedDeclaration(input, "premise", intent, "../../source")
  expect(policy.inquiry.operations).toEqual(input.inquiry.operations)
  expect(policy.inquiry.questions).toEqual(input.inquiry.questions)
  expect(policy.inquiry.policy).toEqual(intent.policy)
  expect(premise.inquiry.policy).toEqual(input.inquiry.policy)
  expect(premise.inquiry.questions[0]).toEqual({ ...input.inquiry.questions[0]!, premises: [{ text: intent.premise, origin: "user" }] })
  expect(input.inquiry.questions[0]!.premises).toEqual([])
  expect(policy).not.toHaveProperty("final")
})
test("known source-verified partial material bases require current model and operation strategy, without checked-answer promotion", () => {
  const base = { status: "completed-with-diagnostics", sourceVerification: { valid: true }, model: "fixture/model", method: "D1", strategy: "operation-evidence-v1", sessionPath: "session", domain: { operationFacts: { facts: [] }, semantic: { units: [{ handle: "valid-source-unit" }] } } }
  expect((changes as any).materialBaseEligible(base, "fixture/model")).toBe(true)
  for (const wrong of [{ ...base, completionUnknown: true }, { ...base, status: "completion-unknown" }, { ...base, model: "other" }, { ...base, strategy: "focused-closure-v1" }, { ...base, sourceVerification: { valid: false } }]) expect((changes as any).materialBaseEligible(wrong, "fixture/model")).toBe(false)
})
test("previous material execution respects per-material invalidation and never silently dispatches fresh after refusal", () => {
  const row = { route: "materials-previous" }, lock = { previous: "original-session" }, comparison = { sourceChanged: true, reuseEligibility: { status: "reusable", info: { reuseLevel: "materials", answerReused: false, reusedMaterials: ["unchanged-helper"], invalidatedMaterials: [{ handle: "changed-guard", reasons: ["source-span changed"] }] } } }
  expect((changes as any).variationExecution(row, lock, comparison)).toEqual({ eligible: true, previous: "original-session" })
  expect((changes as any).variationExecution(row, lock, { reuseEligibility: { status: "needs-fresh-analysis", reasons: ["unknown completion"] } })).toMatchObject({ eligible: false, providerCalls: 0 })
  expect((changes as any).variationExecution({ route: "fresh" }, lock, comparison)).toEqual({ eligible: true })
})
test("one copied-source edit preserves other classes and rejects an extra changed file", () => {
  const before = "class Other:\r\n    exact_guard()\r\nclass ShareLinkSerializer:\r\n    exact_guard()\r\n    global_guard()\r\n", after = removeOneScopedClause(before, "ShareLinkSerializer", "    exact_guard()\r\n")
  expect(after).toBe("class Other:\r\n    exact_guard()\r\nclass ShareLinkSerializer:\r\n    global_guard()\r\n")
  const old = [{ path: "serialisers.py", sha256: "old", bytes: 10 }, { path: "other.py", sha256: "stable", bytes: 5 }], current = [{ path: "serialisers.py", sha256: "new", bytes: 9 }, old[1]], edit = { path: "serialisers.py", beforeSha256: "old", afterSha256: "new", afterBytes: 9 }
  expect(() => assertOneSourceEdit(old, current, edit)).not.toThrow()
  expect(() => assertOneSourceEdit(old, [current[0], { ...old[1], sha256: "extra" }], edit)).toThrow()
})
