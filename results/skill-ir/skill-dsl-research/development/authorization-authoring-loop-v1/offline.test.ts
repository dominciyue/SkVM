import { expect, test } from "bun:test"
import { createDevelopmentCases } from "./development-cases.ts"
import { sourceDownloadOracle } from "./evaluation/source-oracle.ts"
import { assessFiniteCase } from "./evaluation/finite-assessment.ts"

const q = "requested-document-and-returned-file"
const data = () => ({ actor: { id: 7 }, related_root: null, request: { pk: 10, version: null, original: null }, documents: [
  { id: 10, root_document_id: null, owner_id: 7, version_index: null, deleted: false, has_archive_version: true, source_file: "root.pdf", archive_file: "root-archive.pdf" },
  { id: 11, root_document_id: 10, owner_id: 9, version_index: 1, deleted: false, has_archive_version: true, source_file: "one.pdf", archive_file: "one-archive.pdf" },
  { id: 12, root_document_id: 10, owner_id: 9, version_index: 2, deleted: true, has_archive_version: false, source_file: "two.txt", archive_file: null },
  { id: 20, root_document_id: null, owner_id: 8, version_index: null, deleted: false, has_archive_version: false, source_file: "other.txt", archive_file: null },
] })
const assumptions = (user = 7, grant?: boolean) => [{ name: "ObjectPermissionChecker.construct", arguments: { user }, value: true }, ...(grant === undefined ? [] : [{ name: "ObjectPermissionChecker.has_perm", arguments: { user, resource: 10, permission: "view_document" }, value: grant }])]
test("source oracle keeps missing and empty version arguments distinct and rejects wrong-root or invalid versions", () => {
  for (const [version, file] of [[null, 11], ["", 12], ["11", 11], ["12", 12]] as const) {
    const facts = data(); facts.request.version = version as any
    expect(sourceDownloadOracle(facts, assumptions()).returned?.file_document).toBe(file)
  }
  for (const [version, rejection] of [["20", "unrelated-version"], ["bad", "invalid-version"]]) {
    const facts = data(); facts.request.version = version as any
    const result = sourceDownloadOracle(facts, assumptions())
    expect(result).toMatchObject({ kind: "rejected", rejection })
    expect(result.returned).toBeUndefined()
  }
})
test("source oracle authorizes the resolved root before selecting a file and includes constructor uncertainty", () => {
  const facts = data(); facts.actor.id = 9
  const denied = sourceDownloadOracle(facts, assumptions(9, false))
  expect(denied).toMatchObject({ kind: "denied", authorizedResource: 10 })
  expect(denied.returned).toBeUndefined()
  expect(sourceDownloadOracle(facts, assumptions(9, true)).returned?.file_document).toBe(11)
  expect(sourceDownloadOracle(facts, assumptions(9))).toMatchObject({ kind: "conditional", conditions: ["ObjectPermissionChecker.has_perm on resolved root is unspecified"] })
  expect(sourceDownloadOracle(data(), [])).toMatchObject({ kind: "conditional", conditions: ["ObjectPermissionChecker.construct completion is unspecified"] })
  facts.documents = [facts.documents[1]!]; facts.request.pk = 11
  const fallback = sourceDownloadOracle(facts, assumptions(9))
  expect(fallback.authorizedResource).toBe(11)
  expect(fallback.returned?.file_document).toBe(11)
})
test("source oracle uses version index then id with nulls last and ignores unrelated records or order", () => {
  const facts = data(); facts.documents[2]!.deleted = false
  expect(sourceDownloadOracle(facts, assumptions()).returned?.file_document).toBe(12)
  facts.documents.push({ ...facts.documents[2]!, id: 13 })
  facts.documents.reverse()
  expect(sourceDownloadOracle(facts, assumptions()).returned?.file_document).toBe(13)
  facts.documents.find(d => d.id === 12)!.version_index = -1
  facts.documents.find(d => d.id === 13)!.version_index = null
  facts.documents.find(d => d.id === 11)!.version_index = -2
  expect(sourceDownloadOracle(facts, assumptions()).returned?.file_document).toBe(12)
})
test("development variants preserve original task bytes and never insert evaluation fields into model facts", () => {
  const seed = { inquiry: { questions: [{ id: q }] }, resourceInputs: { [q]: data() }, externalAssumptions: { [q]: assumptions() } }
  const original = JSON.stringify(seed)
  const variants = createDevelopmentCases(seed, seed, seed, seed)
  expect(variants.map(v => v.name)).toEqual(expect.arrayContaining(["root-default", "empty-version", "explicit-version", "invalid-version", "other-root-version", "ordering", "denied", "granted", "root-fallback", "no-external", "reordered", "unrelated-document"]))
  expect(JSON.stringify(seed)).toBe(original)
  for (const variant of variants) {
    expect(variant.input.inquiry).toEqual(seed.inquiry)
    expect(Object.keys(variant.input)).not.toContain("expected")
    expect(Object.keys(variant.input.resourceInputs[q])).not.toContain("expected")
  }
})

test("an unknown source-visible helper cannot substitute for the actual missing constructor boundary", () => {
  const expected = sourceDownloadOracle(data(), [])
  const partial = { returned: expected.returned, conditions: ["unresolved"], gaps: ["external:local_helper"], events: [] }
  expect(assessFiniteCase(expected, partial)).toMatchObject({ valuesMatch: true, conditionsMatch: false, finiteMachineMatch: false })
  expect(assessFiniteCase(expected, { ...partial, gaps: ["external:ObjectPermissionChecker.construct"] })).toMatchObject({ conditionsMatch: true, finiteMachineMatch: true })
  expect(assessFiniteCase(sourceDownloadOracle(data(), assumptions()), partial).finiteMachineMatch).toBe(false)
})
