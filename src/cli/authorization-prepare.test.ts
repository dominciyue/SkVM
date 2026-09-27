import { expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { runAuthorizationCli } from "./authorization.ts"
import { loadLocalAuthorizationInput } from "../benchmarks/authorization-dsl/local-input.ts"

test("prepare checks without writing, then publishes a runnable ordinary input and report exactly once", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "authorization-prepare-cli-"))
  try {
    await mkdir(path.join(root, "project", "src"), { recursive: true })
    await writeFile(path.join(root, "project", "src", "record.ts"), "prefix\nexport function update() {\n  return guard()\n}\nsuffix\n", "utf8")
    const task = {
      schemaVersion: "source-authorization-assessment/v0", taskId: "prepare-cli", request: "Assess update.", repository: "https://example.test/project", sourceRef: "fixed-ref", sourceMode: "fixed-context",
      policySources: [{ id: "policy", kind: "task-requirement", text: "Only owners update.", location: "brief#/policy", revision: "v1", acceptance: { status: "accepted", actorRole: "author", reason: "Task requirement" } }],
      principals: [{ id: "member", role: "member", description: "Caller", startingCapabilities: [] }], resources: [{ id: "record", type: "record", description: "Target" }],
      entries: [{ id: "update", name: "update", locations: [{ path: "src/record.ts", startLine: 2, endLine: 4 }] }],
      obligations: [{ id: "scenario", principalId: "member", resourceId: "record", relation: "non-owner", operation: "update", expectation: "deny", conditions: [], policySourceId: "policy", entryIds: ["update"] }],
      scopeAssurance: "Declared entry only.", requiredAnalysis: ["Trace the control."], constraints: ["Do not execute target."],
    }
    const inputFile = path.join(root, "assessment.json")
    await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-assessment-input/v1", sourceIdentity: { repository: task.repository, sourceRef: task.sourceRef }, sourceRoot: "project", sources: ["src/record.ts"], task }), "utf8")
    const requestFile = path.join(root, "request.json")
    await writeFile(requestFile, JSON.stringify({ schemaVersion: "authorization-evidence-request/v1", sourceRoot: "project", allowedFiles: ["src/record.ts", "src/missing.ts"], entries: [{ entryKey: "update", path: "src/record.ts", startLine: 2, endLine: 4 }], dependencies: [{ id: "missing", from: "update", path: "src/missing.ts", startLine: 1, endLine: 1, reason: "control", basis: "author" }], limits: { maxFiles: 12, maxBytes: 46, maxDepth: 2 } }), "utf8")
    const out = path.join(root, "prepared")
    const stdout: string[] = [], stderr: string[] = []
    const deps = { stdout: (value: string) => stdout.push(value), stderr: (value: string) => stderr.push(value), providerFactory: () => { throw new Error("prepare must not create a provider") } }
    const args = [`--input=${inputFile}`, `--request=${requestFile}`, `--out=${out}`]
    expect(await runAuthorizationCli(["prepare", ...args, "--check-only=true"], deps)).toBe(0)
    await expect(stat(out)).rejects.toThrow()
    expect(await runAuthorizationCli(["prepare", ...args], deps)).toBe(0)
    const preparedInput = path.join(out, "assessment.json")
    expect((await loadLocalAuthorizationInput(preparedInput)).status).toBe("valid")
    expect(await readFile(path.join(out, "source", "src", "record.ts"), "utf8")).toBe("export function update() {\n  return guard()\n}\n")
    expect(await readFile(path.join(out, "report.json"), "utf8")).toContain("missing-file")
    expect(await runAuthorizationCli(["prepare", ...args], deps)).toBe(1)
    expect(stderr.at(-1)).toContain("exists")
  } finally { await rm(root, { recursive: true, force: true }) }
})
