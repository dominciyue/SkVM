import { describe, expect, test } from "bun:test"
import { deriveZhCodeReviewOracle } from "./zh-code-reviewer-oracle.ts"

describe("zh-code-reviewer source-derived oracle", () => {
  test("derives security findings from observable data flow", () => {
    const source = `export async function lookup(db, userInput, sessionToken) {
  const statement = \`SELECT * FROM users WHERE name = '${"${userInput}"}'\`
  console.warn("session", sessionToken)
  return db.query(statement)
}
`
    const oracle = deriveZhCodeReviewOracle("src/lookup.ts", source)
    expect(oracle.status).toBe("confirmed")
    if (oracle.status !== "confirmed") return
    expect(oracle.findings).toEqual([
      expect.objectContaining({ ruleId: "dynamic-query", category: "security", severity: "critical", line: 2, symbol: "lookup" }),
      expect.objectContaining({ ruleId: "sensitive-log", category: "security", severity: "critical", line: 3, symbol: "lookup" }),
    ])
  })

  test("derives performance and unchecked-result findings", () => {
    const source = `export async function load(ids, client) {
  const rows = []
  for (const id of ids) {
    rows.push(await client.fetch(id))
  }
  return rows[0].name
}
`
    const oracle = deriveZhCodeReviewOracle("src/load.js", source)
    expect(oracle.status).toBe("confirmed")
    if (oracle.status !== "confirmed") return
    expect(oracle.findings).toEqual([
      expect.objectContaining({ ruleId: "await-in-loop", category: "performance", severity: "major", line: 4, symbol: "load" }),
      expect.objectContaining({ ruleId: "unchecked-index-access", category: "correctness", severity: "major", line: 6, symbol: "load" }),
    ])
  })

  test("supports command interpolation and unchecked find results", () => {
    const command = deriveZhCodeReviewOracle("src/hook.ts", `export function run(target) {
  exec(\`curl ${"${target}"}\`)
}
`)
    expect(command.status).toBe("confirmed")
    if (command.status === "confirmed") {
      expect(command.findings[0]).toMatchObject({ ruleId: "dynamic-command", severity: "critical", line: 2 })
    }

    const find = deriveZhCodeReviewOracle("src/select.js", `export function select(values) {
  const selected = values.find((value) => value.active)
  return selected.value
}
`)
    expect(find.status).toBe("confirmed")
    if (find.status === "confirmed") {
      expect(find.findings[0]).toMatchObject({ ruleId: "unchecked-find-result", severity: "major", line: 3 })
    }
  })

  test("removes a constraint when its public source evidence is removed", () => {
    const before = deriveZhCodeReviewOracle("src/lookup.ts", `export async function lookup(db, value) {
  const query = \`SELECT * FROM users WHERE id = ${"${value}"}\`
  return db.query(query)
}
`)
    const after = deriveZhCodeReviewOracle("src/lookup.ts", `export async function lookup(db, value) {
  return db.query("SELECT * FROM users WHERE id = ?", [value])
}
`)
    expect(before.status).toBe("confirmed")
    expect(after).toEqual({ status: "unconfirmed", reason: "no-supported-observable-pattern" })
  })

  test("does not guess findings for unsupported source", () => {
    expect(deriveZhCodeReviewOracle("src/safe.ts", "export const add = (a, b) => a + b\n"))
      .toEqual({ status: "unconfirmed", reason: "no-supported-observable-pattern" })
    expect(deriveZhCodeReviewOracle("README.md", "text\n"))
      .toEqual({ status: "unconfirmed", reason: "unsupported-source-format" })
  })
})
