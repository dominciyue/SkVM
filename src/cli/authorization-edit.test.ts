import { expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { runAuthorizationCli } from "./authorization.ts"
import { loadLocalAuthorizationInput } from "../benchmarks/authorization-dsl/local-input.ts"

test("edit publishes a bounded v2 variant and keeps the base and source untouched", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "authorization-edit-cli-"))
  try {
    await mkdir(path.join(root, "project", "src"), { recursive: true })
    await writeFile(path.join(root, "project", "src", "record.ts"), "function update() { return allowed() }\n", "utf8")
    const base = {
      schemaVersion: "authorization-assessment-authoring/v2", taskId: "edit-cli", request: "Assess updates.", repository: "https://example.test/project", sourceRef: "fixed-ref", sourceRoot: "project", sources: ["src/record.ts"],
      policies: { update: { text: "Only owners update.", location: "brief#/policy", revision: "v1", acceptance: "accepted", reason: "Author supplied." } },
      principals: { member: { role: "member" } }, resources: { record: { type: "record" } },
      entries: { update: { name: "update", locations: [{ path: "src/record.ts", startLine: 1, endLine: 1 }] } },
      scenarios: { owner: { principal: "member", resource: "record", policy: "update", entries: ["update"], relation: "owner", operation: "update", expectation: "allow" }, outsider: { principal: "member", resource: "record", policy: "update", entries: ["update"], relation: "non-owner", operation: "update", expectation: "deny" } },
    }
    const inputFile = path.join(root, "base.json"), editFile = path.join(root, "edit.json"), out = path.join(root, "edited")
    const baseBytes = `${JSON.stringify(base, null, 2)}\n`
    await writeFile(inputFile, baseBytes, "utf8")
    await writeFile(editFile, JSON.stringify({ schemaVersion: "authorization-local-edit/v1", reason: "Updated policy wording", operations: [
      { kind: "policy", key: "update", set: { text: "Only assigned owners update.", revision: "v2" } },
      { kind: "scenario", key: "owner", set: { expectation: "allow" } },
      { kind: "scenario", key: "outsider", set: { expectation: "deny" } },
    ] }), "utf8")
    const stdout: string[] = [], stderr: string[] = []
    const deps = { stdout: (value: string) => stdout.push(value), stderr: (value: string) => stderr.push(value), providerFactory: () => { throw new Error("edit must not call provider") } }
    const args = [`--input=${inputFile}`, `--edit=${editFile}`, `--out=${out}`]
    expect(await runAuthorizationCli(["edit", ...args, "--check-only=true"], deps)).toBe(0)
    await expect(stat(out)).rejects.toThrow()
    expect(await runAuthorizationCli(["edit", ...args], deps)).toBe(0)
    const edited = JSON.parse(await readFile(path.join(out, "assessment.json"), "utf8"))
    expect(edited.taskId).toBe(base.taskId)
    expect(edited.scenarios).toEqual(base.scenarios)
    expect(edited.sourceRoot).toBe("../project")
    expect((await loadLocalAuthorizationInput(path.join(out, "assessment.json"))).status).toBe("valid")
    expect(await readFile(inputFile, "utf8")).toBe(baseBytes)
    expect(await readFile(path.join(root, "project", "src", "record.ts"), "utf8")).toBe("function update() { return allowed() }\n")
    const incompleteFile = path.join(root, "incomplete-edit.json"), draftOut = path.join(root, "drafted")
    await writeFile(incompleteFile, JSON.stringify({ schemaVersion: "authorization-local-edit/v1", reason: "Policy needs review", operations: [
      { kind: "policy", key: "update", set: { text: "Only assigned owners update." } },
      { kind: "scenario", key: "owner", set: { expectation: "allow" } },
    ] }), "utf8")
    expect(await runAuthorizationCli(["edit", `--input=${inputFile}`, `--edit=${incompleteFile}`, `--out=${draftOut}`], deps)).toBe(1)
    expect(await readFile(path.join(draftOut, "draft.json"), "utf8")).toContain("Only assigned owners update")
    await expect(stat(path.join(draftOut, "assessment.json"))).rejects.toThrow()
    expect(await readFile(path.join(draftOut, "edit-report.json"), "utf8")).toContain("policy-expectation-review-required")
    expect(await runAuthorizationCli(["edit", ...args], deps)).toBe(1)
    expect(stderr.at(-1)).toContain("exists")
  } finally { await rm(root, { recursive: true, force: true }) }
})
