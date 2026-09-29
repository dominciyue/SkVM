import { expect, test } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { executeMarkdownStudyRun } from "../../../../../src/benchmarks/authorization-dsl/markdown-study.ts"
import { markdownInput, compareArgs, sameValue } from "./generation-options.ts"
import { cli, root, al } from "./common.ts"

test("shared Markdown metadata reaches ordinary provider boundary without a paid dispatch", async () => {
  const outRoot = await mkdtemp(path.join(os.tmpdir(), "authorization-am-origin-"))
  let factories = 0
  const report = await executeMarkdownStudyRun({ inputFile: path.join(al, "inputs", "memos-get-shared", "automatic-v3", "assessment.json"),
    model: "offline", outRoot, wireVersion: "v6", assessmentMode: "explicit-v1", reasoningStrategy: "standard",
    markdown: markdownInput("Assess the public declared task from supplied sources.", "public.md"),
    providerFactory: () => { factories++; throw new Error("Deliberate offline provider boundary") } })
  expect(report.status).not.toBe("invalid")
  expect(factories).toBe(1)
})

test("shared comparison arguments use the ordinary previous-session option", async () => {
  const result = await cli(compareArgs(path.join(root, "nonexistent-session"), path.join(root, "nonexistent-input.json")))
  expect(result.exitCode).toBe(2)
  expect(result.errors.join("\n")).toContain("session index")
})

test("schema key reordering preserves material identity but changed gaps and ranges do not", () => {
  const before = { included: [{ path: "guard.py", originalPath: "guard.py", startLine: 1, endLine: 3 }], gaps: [{ id: "missing", reason: "unread" }] }
  const after = { gaps: [{ reason: "unread", id: "missing" }], included: [{ endLine: 3, startLine: 1, originalPath: "guard.py", path: "guard.py" }] }
  expect(sameValue(before, after)).toBe(true)
  expect(sameValue(before, { ...after, gaps: [] })).toBe(false)
  expect(sameValue(before, { ...after, included: [{ ...after.included[0], endLine: 2 }] })).toBe(false)
})
