import { expect, test } from "bun:test"
import { AuthorizationWorkspaceSchema, AuthorizationReplacementsSchema } from "./schema.ts"

const config = () => ({ schemaVersion: "authorization-scenario-workspace/v1", base: "base.json", variants: [{ id: "owner", replacements: "owner.json" }] })

test("workspace accepts explicit portable ids and rejects extra semantics", () => {
  expect(AuthorizationWorkspaceSchema.safeParse(config()).success).toBe(true)
  expect(AuthorizationWorkspaceSchema.safeParse({ ...config(), expectation: "allow" }).success).toBe(false)
})

test.each(["v2", "", undefined])("workspace requires exact version: %s", version => {
  expect(AuthorizationWorkspaceSchema.safeParse({ ...config(), schemaVersion: version }).success).toBe(false)
})
test.each(["", undefined, 1])("workspace requires base: %s", base => {
  expect(AuthorizationWorkspaceSchema.safeParse({ ...config(), base }).success).toBe(false)
})
test.each(["../out", "a/b", "a\\b", ".", "..", "a.", "a ", "CON", "con.txt", "PRN", "aux", "NUL", "COM1", "LPT9", "A:B", "a*", "a?", "a\u0000", "a|", "a<", "a>", 'a"'])
("workspace rejects unsafe filename id %s", id => {
  expect(AuthorizationWorkspaceSchema.safeParse({ ...config(), variants: [{ id, replacements: "r.json" }] }).success).toBe(false)
})
test("workspace prevents case-insensitive filename collisions and caps explicit variants", () => {
  expect(AuthorizationWorkspaceSchema.safeParse({ ...config(), variants: [{ id: "owner", replacements: "a.json" }, { id: "OWNER", replacements: "b.json" }] }).success).toBe(false)
  expect(AuthorizationWorkspaceSchema.safeParse({ ...config(), variants: [] }).success).toBe(false)
  expect(AuthorizationWorkspaceSchema.safeParse({ ...config(), variants: Array.from({ length: 51 }, (_, i) => ({ id: `v${i}`, replacements: "r.json" })) }).success).toBe(false)
  expect(AuthorizationWorkspaceSchema.safeParse({ ...config(), variants: Array.from({ length: 50 }, (_, i) => ({ id: `v${i}`, replacements: "r.json" })) }).success).toBe(true)
})
test.each([{}, null, "oops", [{ field: "taskId", value: "x" }], [{ field: "taskId", origin: "author" }], [{ field: "taskId", value: "x", origin: " " }], [{ field: "taskId", value: "x", origin: "author", guessed: true }]].map(value => ({ value })))
("replacement files require exact records with nonempty origin: %j", ({ value }) => {
  expect(AuthorizationReplacementsSchema.safeParse(value).success).toBe(false)
})
test("empty replacement list is explicit identity composition", () => {
  expect(AuthorizationReplacementsSchema.parse([])).toEqual([])
})
