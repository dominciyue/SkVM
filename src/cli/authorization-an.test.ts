import { expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { runAuthorizationCli } from "./authorization.ts"

test("AN scoped task init publishes ordinary v2, entry seed and field provenance without a provider", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "authorization-an-"))
  try {
    await mkdir(path.join(root, "source"))
    await writeFile(path.join(root, "source", "access.ts"), "export function edit() { return false }\n")
    const context = path.join(root, "context.json"), task = path.join(root, "task.json"), output = path.join(root, "assessment.json")
    await writeFile(context, JSON.stringify({ schemaVersion: "authorization-authoring-context/v1", taskId: "record-edit", repository: "https://example.test/records", sourceRef: "r1", sourceRoot: "source", allowedFiles: ["access.ts"], entries: [{ entryKey: "edit", path: "access.ts", startLine: 1, endLine: 1 }] }))
    await writeFile(task, JSON.stringify({ schemaVersion: "authorization-task-authoring/v1", request: "Assess record editing.", policy: { text: "Only owners may edit.", location: "task", revision: "current", acceptance: "accepted", reason: "Explicit policy." }, cases: [{ name: "foreign", entry: "edit", principal: { role: "member" }, resource: { type: "record" }, relation: "not-owner", operation: "edit", expectation: "deny", boundary: "declared-entry", premises: [{ name: "ownership", statement: "The caller is not the owner." }], branches: [], responseDetails: [] }] }))
    const out: string[] = [], errors: string[] = []
    const io = { stdout: (value: string) => out.push(value), stderr: (value: string) => errors.push(value), providerFactory: () => { throw new Error("Provider must not be used") } }
    expect(await runAuthorizationCli(["init", `--context=${context}`, `--task=${task}`, `--out=${output}`], io)).toBe(0)
    const v2 = JSON.parse(await readFile(output, "utf8"))
    expect(v2.schemaVersion).toBe("authorization-assessment-authoring/v2")
    expect(v2.analysisContract.scenarios.foreign.premises[0].atEntry).toBe("edit")
    expect(JSON.parse(await readFile(path.join(root, "assessment.field-provenance.json"), "utf8")).hostDerived).toContain("premise entry references")
    expect(JSON.parse(await readFile(path.join(root, "assessment.entry-seed.json"), "utf8")).entries).toHaveLength(1)
    const modeledOutput = path.join(root, "modeled.json")
    expect(await runAuthorizationCli(["init", `--context=${context}`, `--task=${task}`, "--field-origin=model-authored", `--out=${modeledOutput}`], io)).toBe(0)
    expect(JSON.parse(await readFile(path.join(root, "modeled.field-provenance.json"), "utf8")).fieldSources["/policies/current/text"]).toBe("model-authored")
    expect(await runAuthorizationCli(["check", `--input=${output}`, "--method=plain", "--assessment=explicit-v1", "--wire=v6"], io)).toBe(0)
    expect(JSON.parse(out.at(-1)!).scopePreview.declaredScenarios).toBe(1)
    expect(await runAuthorizationCli(["init", `--context=${context}`, `--task=${task}`, `--out=${output}`], io)).toBe(1)
    expect(errors.at(-1)).toContain("already exists")
    await expect(stat(path.join(root, "assessment.authoring-guide.md"))).rejects.toThrow()
  } finally { await rm(root, { recursive: true, force: true }) }
})
