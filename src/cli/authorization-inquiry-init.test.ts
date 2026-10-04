import { expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { runAuthorizationCli } from "./authorization.ts"
import { emptyTokenUsage } from "../core/types.ts"

async function naturalSession() {
  const root = await mkdtemp(path.join(os.tmpdir(), "inquiry-init-session-"))
  await mkdir(path.join(root, "source")); await mkdir(path.join(root, "exports"))
  await writeFile(path.join(root, "source/entry.ts"), "export function check() { return false; }\n")
  const original = { schemaVersion: "authorization-inquiry-input/v1", taskId: "neutral", repository: "neutral", sourceRef: "fixed", sourceRoot: "source", allowedPaths: ["entry.ts"], brief: "Investigate check and its visible rejection.", mode: "behavior" }
  const input = path.join(root, "input.json"); await writeFile(input, JSON.stringify(original))
  let output = "", error = "", calls = 0, providers = 0
  const declaration = { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: original.brief, entryHint: "check", premises: [] }] }
  const dependencies = { stdout: (s: string) => output = s, stderr: (s: string) => error = s, providerFactory: () => {
    providers++
    return { name: "mock", async complete(params: any) {
      calls++
      const id = /"id":"(ev-[a-f0-9]+)"/.exec(params.messages[0].content)?.[1]
      const args = params.tools[0].name === "submit_inquiry_declaration" ? declaration : { kind: "final", controlDelta: { schemaVersion: "authorization-control-update/v1", rules: [
        { op: "add", questionId: "q", targetKey: "entry", pathKey: "p", kind: "entry", after: [], evidenceIds: [id], claim: "Entry returns false" },
        { op: "add", questionId: "q", targetKey: "stop", pathKey: "p", kind: "reject", after: ["entry"], evidenceIds: [id], claim: "False return", complete: true },
      ] }, result: { schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q", behavior: { disposition: "deny", explanation: "False return" }, evidenceIds: [id], branches: [], missing: [] }], observations: [], scope: "local" } }
      return { text: "", toolCalls: [{ id: "c", name: params.tools[0].name, arguments: args }], tokens: emptyTokenUsage(), durationMs: 0, stopReason: "tool_use" as const }
    }, async completeWithToolResults() { throw new Error("Unused") } }
  } }
  const archive = path.join(root, "archive")
  expect(await runAuthorizationCli(["inquiry", "run", `--input=${input}`, `--out=${archive}`, "--model=mock", "--strategy=guided-evidence-v2"], dependencies)).toBe(0)
  const report = JSON.parse(output)
  expect(report.validation.questionChecks[0].evidenceCoverage).toBe("bounded")
  return { root, archive, original, declaration, dependencies, session: report.sessionPath, counts: () => ({ calls, providers }), output: () => output, error: () => error }
}

test("init exports a retained authored declaration and rebases from original input provenance", async () => {
  const f = await naturalSession(), before = f.counts(), out = path.join(f.root, "exports/input.json")
  const priorRun = await readFile(path.join(f.session, "run.json"), "utf8")
  expect(await runAuthorizationCli(["inquiry", "init", `--from=${f.archive}`, `--out=${out}`], f.dependencies)).toBe(0)
  const exported = JSON.parse(await readFile(out, "utf8"))
  expect(exported).toEqual({ ...f.original, brief: undefined, mode: undefined, inquiry: f.declaration, sourceRoot: "../source" })
  expect(exported).not.toHaveProperty("brief")
  expect(exported).not.toHaveProperty("controlDelta")
  expect(exported).not.toHaveProperty("final")
  expect(f.counts()).toEqual(before)
  expect(await readFile(path.join(f.session, "run.json"), "utf8")).toBe(priorRun)
  const originalBytes = await readFile(out, "utf8")
  expect(await runAuthorizationCli(["inquiry", "init", `--from=${f.session}`, `--out=${out}`], f.dependencies)).toBe(1)
  expect(await readFile(out, "utf8")).toBe(originalBytes)
})

test("missing retained source provenance requires an explicit source root rather than a session-relative guess", async () => {
  const f = await naturalSession(), check = JSON.parse(await readFile(path.join(f.session, "check.json"), "utf8"))
  delete check.inputPath; await writeFile(path.join(f.session, "check.json"), JSON.stringify(check))
  const out = path.join(f.root, "exports/recovered.json"), before = f.counts()
  expect(await runAuthorizationCli(["inquiry", "init", `--from=${f.session}`, `--out=${out}`], f.dependencies)).toBe(1)
  expect(f.error()).toContain("--source-root")
  expect(await readFile(out, "utf8").catch(() => null)).toBeNull()
  expect(await runAuthorizationCli(["inquiry", "init", `--from=${f.session}`, `--out=${out}`, `--source-root=${f.root}/source`], f.dependencies)).toBe(0)
  expect(JSON.parse(await readFile(out, "utf8")).sourceRoot).toBe("../source")
  expect(f.counts()).toEqual(before)
})

test("an exported declaration can reuse a checked natural-brief session without reauthoring questions", async () => {
  const f = await naturalSession(), out = path.join(f.root, "exports/input.json")
  await writeFile(out, JSON.stringify({ ...f.original, brief: undefined, mode: undefined, sourceRoot: "../source", inquiry: f.declaration }))
  const before = f.counts()
  expect(await runAuthorizationCli(["inquiry", "compare", `--input=${out}`, `--previous=${f.session}`], f.dependencies)).toBe(0)
  expect(JSON.parse(f.output())).toMatchObject({ taskChanged: false, reuseEligibility: { status: "reusable", info: { change: "unchanged", answerReused: false } } })
  expect(f.counts()).toEqual(before)
  expect(await runAuthorizationCli(["inquiry", "run", `--input=${out}`, `--out=${f.root}/reuse`, `--previous=${f.session}`, "--model=mock", "--strategy=guided-evidence-v2"], f.dependencies)).toBe(0)
  expect(JSON.parse(f.output()).reuse).toMatchObject({ change: "unchanged", answerReused: false })
  expect(f.counts().calls).toBe(before.calls + 1)
})

test("session declaration export rejects an altered independent policy or declaration program", async () => {
  const f = await naturalSession(), runPath = path.join(f.session, "run.json")
  const run = JSON.parse(await readFile(runPath, "utf8")); run.inquiry.questions[0].request = "A different unarchived task"
  await writeFile(runPath, JSON.stringify(run))
  const out = path.join(f.root, "exports/bad.json"), before = f.counts()
  expect(await runAuthorizationCli(["inquiry", "init", `--from=${f.session}`, `--out=${out}`], f.dependencies)).toBe(1)
  expect(f.error()).toContain("declaration")
  expect(await readFile(out, "utf8").catch(() => null)).toBeNull()
  expect(f.counts()).toEqual(before)
  run.inquiry = { ...f.declaration, mode: "conformance", policy: { text: "Invented rule", origin: "user", location: "unarchived" } }
  await writeFile(runPath, JSON.stringify(run))
  expect(await runAuthorizationCli(["inquiry", "init", `--from=${f.session}`, `--out=${out}`], f.dependencies)).toBe(1)
  expect(f.error()).toContain("independent policy")
  expect(f.counts()).toEqual(before)
})

test("exported questions do not make an unknown previous completion reusable", async () => {
  const f = await naturalSession(), out = path.join(f.root, "exports/input.json"), before = f.counts()
  for (const name of ["run.json", "report.json"]) {
    const file = path.join(f.session, name), value = JSON.parse(await readFile(file, "utf8"))
    value.status = "timeout-unknown"; await writeFile(file, JSON.stringify(value))
  }
  expect(await runAuthorizationCli(["inquiry", "init", `--from=${f.session}`, `--out=${out}`], f.dependencies)).toBe(0)
  expect(await runAuthorizationCli(["inquiry", "run", `--input=${out}`, `--out=${f.root}/reuse`, `--previous=${f.session}`, "--model=mock", "--strategy=guided-evidence-v2"], f.dependencies)).toBe(1)
  expect(JSON.parse(f.output())).toMatchObject({ status: "needs-fresh-analysis", providerCalls: 0, recovery: { kind: "inspect-previous" } })
  expect(f.counts()).toEqual(before)
  expect(await readFile(path.join(f.root, "reuse/sessions.jsonl"), "utf8").catch(() => null)).toBeNull()
})

test("a completed archive label cannot hide a pending previous provider attempt", async () => {
  const f = await naturalSession(), out = path.join(f.root, "exports/input.json"), before = f.counts()
  const runPath = path.join(f.session, "run.json"), run = JSON.parse(await readFile(runPath, "utf8"))
  run.attempts[0].status = "pending"; await writeFile(runPath, JSON.stringify(run))
  expect(await runAuthorizationCli(["inquiry", "init", `--from=${f.session}`, `--out=${out}`], f.dependencies)).toBe(0)
  expect(await runAuthorizationCli(["inquiry", "run", `--input=${out}`, `--out=${f.root}/reuse`, `--previous=${f.session}`, "--model=mock", "--strategy=guided-evidence-v2"], f.dependencies)).toBe(1)
  expect(JSON.parse(f.output())).toMatchObject({ status: "needs-fresh-analysis", recovery: { kind: "inspect-previous" }, providerCalls: 0 })
  expect(f.counts()).toEqual(before)
})

test("file init preserves natural input fields and rebases into an exclusively created output", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "inquiry-file-init-")); await mkdir(path.join(root, "exports"))
  const policy = { text: "A member may inspect", origin: "user", location: "current request" }
  const value = { schemaVersion: "authorization-inquiry-input/v1", taskId: "neutral", repository: "neutral", sourceRef: "fixed", sourceRoot: "source", allowedPaths: ["entry.ts"], brief: "Does inspect comply?", mode: "conformance", policy }
  const from = path.join(root, "input.json"), out = path.join(root, "exports/input.json")
  await writeFile(from, JSON.stringify(value))
  let output = ""
  const deps = { stdout: (s: string) => output = s, stderr: () => {}, providerFactory: () => { throw new Error("Must not create a provider") } }
  expect(await runAuthorizationCli(["inquiry", "init", `--from=${from}`, `--out=${out}`], deps)).toBe(0)
  expect(JSON.parse(await readFile(out, "utf8"))).toEqual({ ...value, sourceRoot: "../source" })
  expect(JSON.parse(output).providerCalls).toBe(0)
  expect(await readFile(from, "utf8")).toBe(JSON.stringify(value))
})
