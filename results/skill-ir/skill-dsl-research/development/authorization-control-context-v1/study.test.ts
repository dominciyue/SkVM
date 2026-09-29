import { expect, test } from "bun:test"
import { RatingSchema, summarizeRatings, qualityUnits, authorUnits } from "./protocol.ts"

test("accurate unknown remains unresolved, conditional answer resolves separately", () => {
  const rows = [
    RatingSchema.parse({ id: "a", phase: "final", answerFidelity: "supported", resolution: "unresolved", unknownCauses: ["source-gap"], overAbstention: false, falseCertainty: false, rationale: "Missing source is stated accurately." }),
    RatingSchema.parse({ id: "b", phase: "final", answerFidelity: "supported", resolution: "conditional", unknownCauses: ["premise-unspecified"], overAbstention: false, falseCertainty: false, rationale: "Both requested branches are supported." }),
    RatingSchema.parse({ id: "c", phase: "final", answerFidelity: "blocked", resolution: "blocked", unknownCauses: [], overAbstention: false, falseCertainty: false, rationale: "Author dependency invalid." }),
  ]
  expect(summarizeRatings(rows)).toMatchObject({ planned: 3, supported: 2, resolved: 1, conditional: 1, unresolved: 1, blocked: 1 })
  expect(() => RatingSchema.parse({ ...rows[0], resolution: "blocked" })).toThrow()
  expect(() => summarizeRatings([rows[0]!, rows[0]!])).toThrow("Duplicate rating")
})

test("declared denominators include every source, representation and dependent author", () => {
  const units = qualityUnits(["owui-file", "paperless-download", "memos-get-shared", "paperless-share-create"])
  expect(units).toHaveLength(16)
  expect(new Set(units.map(u => u.id)).size).toBe(16)
  expect(units.slice(0, 4).map(u => u.caseId)).toEqual(["owui-file", "paperless-download", "memos-get-shared", "paperless-share-create"])
  for (const id of new Set(units.map(u => u.caseId))) expect(units.filter(u => u.caseId === id)).toHaveLength(4)
  const authors = authorUnits(["memos-space-policy", "paperless-note-premise"])
  expect(authors).toHaveLength(8)
  expect(authors.filter(u => u.variant === "changed")).toHaveLength(4)
})
