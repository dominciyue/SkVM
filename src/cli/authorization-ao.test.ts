import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { runAuthorizationCli } from "./authorization.ts"
import { emptyTokenUsage } from "../core/types.ts"
import { inspectLocalInquiry } from "../benchmarks/authorization-dsl/inquiry-local.ts"

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ao-cli-")); await mkdir(path.join(root, "project"))
  await writeFile(path.join(root, "project/access.ts"), "export function check() { return false; }\n")
  const value = { schemaVersion: "authorization-inquiry-input/v1", taskId: "synthetic", repository: "synthetic", sourceRef: "fixed", sourceRoot: "project", allowedPaths: ["."], inquiry: { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q1", request: "Can a member update?", premises: [] }] } }
  await writeFile(path.join(root, "input.json"), JSON.stringify(value))
  return { root, value, input: path.join(root, "input.json") }
}
test("ordinary inquiry check compiles complete DSL without a provider; natural conformance needs policy", async () => {
  const { input, root, value } = await fixture(); let providers = 0, output = ""
  const deps = { stdout: (s: string) => output = s, stderr: () => {}, providerFactory: () => { providers++; throw new Error("No provider") } }
  expect(await runAuthorizationCli(["inquiry", "check", `--input=${input}`, "--method=D1"], deps)).toBe(0)
  expect(JSON.parse(output).status).toBe("valid")
  expect(providers).toBe(0)
  await writeFile(input, JSON.stringify({ ...value, inquiry: undefined, brief: "Does this comply?", mode: "conformance" }))
  expect(await runAuthorizationCli(["inquiry", "check", `--input=${input}`], deps)).toBe(1)
  expect(providers).toBe(0)
})
test("ordinary inquiry run persists actual reads, inspect is offline and request edit invalidates compare", async () => {
  const { input, root } = await fixture(); let output = "", calls = 0
  const deps = { stdout: (s: string) => output = s, stderr: (s: string) => { throw new Error(s) }, providerFactory: () => ({ name: "mock", async complete(params: any) {
    calls++
    const id = /"id":"(ev-[a-f0-9]+)"/.exec(params.messages[0].content)?.[1]
    const args = calls === 1 ? { kind: "tool", calls: [{ name: "source_read", arguments: { path: "access.ts", startLine: 1, endLine: 1 } }] } : { kind: "final", result: { schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q1", behavior: { disposition: "deny", explanation: "Check returns false" }, evidenceIds: [id], branches: [], missing: [] }], observations: [], scope: "Provided source" } }
    return { text: "", toolCalls: [{ id: "c", name: params.tools[0].name, arguments: args }], tokens: emptyTokenUsage(), durationMs: 0, stopReason: "tool_use" as const }
  }, async completeWithToolResults() { throw new Error("Unused") } }) }
  expect(await runAuthorizationCli(["inquiry", "run", `--input=${input}`, "--method=D1", "--model=mock", `--out=${root}/runs`], deps)).toBe(0)
  const session = JSON.parse(output).sessionPath
  expect(await runAuthorizationCli(["inquiry", "inspect", `--out=${session}`], deps)).toBe(0)
  expect(calls).toBe(2)
  const patch = path.join(root, "edit.json")
  await writeFile(patch, JSON.stringify({ schemaVersion: "authorization-inquiry-edit/v1", reason: "New task", operations: [{ kind: "request", questionId: "q1", statement: "Can an administrator update?" }] }))
  expect(await runAuthorizationCli(["inquiry", "edit", `--input=${input}`, `--edit=${patch}`, `--out=${root}/changed.json`], deps)).toBe(0)
  expect(await runAuthorizationCli(["inquiry", "compare", `--input=${root}/changed.json`, `--previous=${session}`], deps)).toBe(0)
  expect(JSON.parse(output).status).toBe("needs-review")
  expect(calls).toBe(2)
  const archived = JSON.parse(await readFile(path.join(session, "report.json"), "utf8"))
  archived.sourceFiles = []
  await writeFile(path.join(session, "report.json"), JSON.stringify(archived))
  await expect(inspectLocalInquiry(session)).rejects.toThrow("identity")
})
