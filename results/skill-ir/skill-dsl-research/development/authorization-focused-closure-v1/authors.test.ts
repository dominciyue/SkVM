import { expect, test } from "bun:test"
import { selectAuthor, assertAuthorConsumeIdentity } from "./authors.ts"
test("AT authors preserve registered skill/variant and exact original delivered bytes", () => {
  const task = { id: "paperless-share-create", inputFile: "model/inputs/paperless-share-create.json", admission: "eligible" }
  const author = { id: "author-original", task: task.id, skill: "original", sourceSkill: "source/SKILL.md", variant: "original", fieldOrigin: "model-authored", hostFillsOnlyMechanicalMetadata: true }
  const native = { ...author, id: "native-original", kind: "native", admission: "eligible", method: "D1", strategy: "focused-closure-v1", completeSkillAndReferencesRequired: true, originalBriefAndOtherDutiesPreserved: true, totalProviderBudget: 24, totalToolBudget: 48, policyOverride: null }
  const manifest = { tasks: [task], rows: [native], authors: [author], modelInputAllowlist: [task.inputFile], budgets: { maxDispatches: 24, maxToolCalls: 48 } }
  expect(selectAuthor(manifest, author.id).author).toEqual(author)
  expect(() => selectAuthor({ ...manifest, rows: [{ ...native, policyOverride: { text: "Changed", origin: "user", location: "user" } }] }, author.id)).toThrow("policy")
  const sourceInput = { file: task.inputFile, sha256: "original", revision: "original" }
  const claim = { row: { ...author, kind: "author", method: "D1", strategy: "focused-closure-v1" }, originalSkill: "absoluteSkill", originalSkillSha256: "skill", originalInputSha256: "original", sourceInput }
  const report = { sourceSkillUnmodified: true, originalSkillSha256: "skill", authoredArtifacts: { inputSha256: "input", usageSha256: "usage" } }
  const actual = { originalSkill: "absoluteSkill", originalSkillSha256: "skill", originalInputSha256: "original", inputSha256: "input", usageSha256: "usage", sourceInput }
  expect(() => assertAuthorConsumeIdentity(author, claim, report, actual)).not.toThrow()
  expect(() => assertAuthorConsumeIdentity(author, claim, report, { ...actual, inputSha256: "modified" })).toThrow("identity")
  expect(() => assertAuthorConsumeIdentity(author, claim, report, { ...actual, sourceInput: { ...sourceInput, revision: "different" } })).toThrow("identity")
})
