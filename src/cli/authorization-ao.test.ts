import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { runAuthorizationCli } from "./authorization.ts"
import { emptyTokenUsage } from "../core/types.ts"
import { inspectLocalInquiry } from "../benchmarks/authorization-dsl/inquiry-local.ts"
import { RUN_FLAGS, validateRunConfig } from "./run.ts"

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

test("inquiry strategy is a zero-call explicit option, persisted and checked in archived domain state", async () => {
  const { input, root } = await fixture(); let output = "", providers = 0, calls = 0
  const deps = { stdout: (s: string) => output = s, stderr: () => {}, providerFactory: () => { providers++; return { name: "mock", async complete(params: any) {
    calls++; const prompt = params.messages[0].content, id = /"id":"(ev-[a-f0-9]+)"/.exec(prompt)?.[1]
    const args = calls === 1 ? { kind: "tool", calls: [{ name: "source_read", arguments: { path: "access.ts", startLine: 1, endLine: 1 } }] } : { kind: "final", controlDelta: { schemaVersion: "authorization-control-slice/v1", rules: [{ key: "entry", questionId: "q1", pathKey: "p", kind: "entry", after: [], evidenceIds: [id], claim: "entry" }, { key: "stop", questionId: "q1", pathKey: "p", kind: "reject", after: ["entry"], evidenceIds: [id], claim: "false", complete: true }] }, result: { schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q1", behavior: { disposition: "deny", explanation: "False" }, branches: [], missing: [], evidenceIds: [id] }], observations: [], scope: "local" } }
    return { text: "", toolCalls: [{ id: "c", name: params.tools[0].name, arguments: args }], tokens: emptyTokenUsage(), durationMs: 0, stopReason: "tool_use" as const }
  }, async completeWithToolResults() { throw new Error("Unused") } } } }
  expect(await runAuthorizationCli(["inquiry", "check", `--input=${input}`, "--strategy=domain-evidence-v1"], deps)).toBe(0)
  expect(JSON.parse(output).strategy).toBe("domain-evidence-v1")
  expect(providers).toBe(0)
  expect(await runAuthorizationCli(["inquiry", "run", `--input=${input}`, "--strategy=wrong", "--model=mock", `--out=${root}/bad`], deps)).toBe(1)
  expect(providers).toBe(0)
  expect(await runAuthorizationCli(["inquiry", "run", `--input=${input}`, "--strategy=domain-evidence-v1", "--model=mock", `--out=${root}/runs`], deps)).toBe(0)
  const session = JSON.parse(output).sessionPath
  const report = await inspectLocalInquiry(session)
  expect(report.strategy).toBe("domain-evidence-v1")
  expect(report.domain.slice.rules).toHaveLength(2)
  expect(await runAuthorizationCli(["inquiry", "compare", `--input=${input}`, `--previous=${session}`, "--strategy=legacy"], deps)).toBe(0)
  expect(JSON.parse(output).strategyChanged).toBe(true)
  expect(calls).toBe(2)
  const archived = JSON.parse(await readFile(path.join(session, "report.json"), "utf8")); archived.domain.slice.rules = []
  await writeFile(path.join(session, "report.json"), JSON.stringify(archived))
  await expect(inspectLocalInquiry(session)).rejects.toThrow("identity")
})

test("ordinary run domain strategy is explicit and cannot bypass native tools/scope", () => {
  const base = ["--prompt=Inspect access", "--model=mock/test", "--adapter=bare-agent"]
  const validate = (args: string[]) => { const parsed = RUN_FLAGS.parse(args); if (parsed.help) throw new Error("Unexpected help"); return validateRunConfig(parsed) }
  expect(() => validate([...base, "--authorization-strategy=domain-evidence-v1"])).toThrow("scope")
  expect(() => validate([...base, "--authorization-scope=scope.json", "--authorization-strategy=domain-evidence-v1"])).toThrow("domain-tools")
  expect(validate([...base, "--authorization-scope=scope.json", "--authorization-domain-tools", "--authorization-strategy=domain-evidence-v1"]).mode).toBe("source")
})
test("ordinary authorization budgets are explicit public flags and require a source scope", () => {
  const base = ["--prompt=Inspect access", "--model=mock/test", "--adapter=bare-agent"]
  const budget = ["--authorization-max-provider-calls=24", "--authorization-max-tool-calls=48", "--authorization-max-display-bytes=524288", "--authorization-max-read-bytes=8388608"]
  const parsed = RUN_FLAGS.parse([...base, ...budget, "--authorization-scope=scope.json"])
  if (parsed.help) throw new Error("Unexpected help")
  expect(parsed["authorization-max-provider-calls"]).toBe(24)
  expect(parsed["authorization-max-tool-calls"]).toBe(48)
  expect(validateRunConfig(parsed).mode).toBe("source")
  expect(() => { const unscoped = RUN_FLAGS.parse([...base, ...budget]); if (!unscoped.help) validateRunConfig(unscoped) }).toThrow("scope")
})
test("ordinary inquiry budgets bound actual public execution and reject invalid limits before a provider", async () => {
  const { input, root } = await fixture(); let output = "", calls = 0, providers = 0
  const deps = { stdout: (s: string) => output = s, stderr: () => {}, providerFactory: () => { providers++; return { name: "mock", async complete(params: any) {
    calls++; expect(params.maxTokens).toBe(777)
    return { text: "", toolCalls: [{ id: "c", name: params.tools[0].name, arguments: { kind: "tool", calls: [{ name: "source_read", arguments: { path: "access.ts", startLine: 1, endLine: 1 } }] } }], tokens: emptyTokenUsage(), durationMs: 0, stopReason: "tool_use" as const }
  }, async completeWithToolResults() { throw new Error("Unused") } } } }
  const base = ["inquiry", "run", `--input=${input}`, "--model=mock"]
  for (const value of ["0", "-1", "1.2", "9007199254740992"]) expect(await runAuthorizationCli([...base, `--out=${root}/invalid`, `--max-provider-calls=${value}`], deps)).toBe(1)
  expect(providers).toBe(0)
  expect(await runAuthorizationCli([...base, `--out=${root}/bounded`, "--max-provider-calls=1", "--max-tool-calls=1", "--max-display-bytes=1024", "--max-read-bytes=1024", "--max-output-tokens=777", "--request-timeout-ms=1000", "--session-timeout-ms=5000"], deps)).toBe(1)
  expect(JSON.parse(output).status).toBe("budget-exhausted")
  expect(calls).toBe(1)
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
