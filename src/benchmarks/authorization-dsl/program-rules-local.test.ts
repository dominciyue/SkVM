import { expect, test } from "bun:test"
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { runAuthorizationInquiryCli } from "../../cli/authorization-inquiry.ts"
import { checkAuthorizationInquiry, inspectLocalInquiry, compareLocalInquiry, executeLocalInquiryRun } from "./inquiry-local.ts"
import { createNativeInquiryRuntime } from "./inquiry-native.ts"

test("baseline can share checked source tools and structural results without domain tools", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "source-parity-"))
  const runtimes: Awaited<ReturnType<typeof createNativeInquiryRuntime>>[] = []
  try {
    await writeFile(path.join(root, "app.py"), "def helper():\n    return True\n\ndef work():\n    return helper()\n")
    const inputFile = path.join(root, "input.json")
    await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "parity", repository: "anonymous", sourceRef: "fixed", sourceRoot: ".", allowedPaths: ["app.py"], inquiry: { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Explain the source", premises: [] }] } }))
    const outputs = []
    for (const arm of ["baseline", "rules", "execute"] as const) {
      const runtime = await createNativeInquiryRuntime({ inputFile, workDir: root, sourceStructure: true, domainTools: arm !== "baseline", strategy: arm === "baseline" ? "legacy" : "question-checked-v1", programSupport: arm === "baseline" ? undefined : arm, programContext: "directed", programMode: "consume", maxToolCalls: 16 } as any)
      runtimes.push(runtime)
      const symbol = JSON.parse((await runtime.execute({ id: "symbol", name: "source_symbol", arguments: { name: "work", path: "app.py" } })).output)
      const result = JSON.parse((await runtime.execute({ id: "structure", name: "source_structure", arguments: { symbolId: symbol.candidates[0].id } })).output)
      expect(result.status).not.toBe("error")
      const { toolBudget, progress, ...source } = result
      outputs.push(source)
    }
    const sourceTools = (runtime: typeof runtimes[number]) => runtime.definitions.filter(t => t.name.startsWith("source_"))
    expect(sourceTools(runtimes[0]!)).toEqual(sourceTools(runtimes[1]!))
    expect(sourceTools(runtimes[0]!)).toEqual(sourceTools(runtimes[2]!))
    expect(outputs[0]).toEqual(outputs[1])
    expect(outputs[0]).toEqual(outputs[2])
    expect(runtimes[0]!.definitions.some(t => t.name.startsWith("authorization_"))).toBe(false)
  } finally { for (const runtime of runtimes) await runtime.close(); await rm(root, { recursive: true, force: true }) }
})

test("rules local check, archive, inspect and compare never evaluate and retain source invalidation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "rules-local-"))
  try {
    const at = { path: "app.py", startLine: 1, endLine: 2 }, input = path.join(root, "input.json"), rawFile = path.join(root, "raw.json"), out = path.join(root, "out")
    await writeFile(path.join(root, "app.py"), "def work():\n    return 7\n\ndef sibling():\n    return None\n")
    await writeFile(input, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "rules-local", repository: "anonymous", sourceRef: "fixed", sourceRoot: ".", allowedPaths: ["app.py"], inquiry: { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Explain the source", premises: [] }] } }))
    await writeFile(rawFile, JSON.stringify({ schemaVersion: "authorization-executable-contract/v1", id: "work", scope: { kind: "function-contract", questionId: "q", root: at, upstream: [] }, sourceDeclarations: [{ source: at, statements: [] }], queries: [], assumptions: [], resourceWorkflow: { inputs: [], steps: [{ id: "external", op: "external", name: "missing_fact", arguments: {}, source: at }, { id: "result", op: "return", value: { ref: "external" }, source: at }] } }))
    const checked: any = await checkAuthorizationInquiry(input, "M", "question-checked-v1", rawFile, { programSupport: "rules" } as any)
    expect(checked.status).toBe("valid")
    expect(checked.executableContract).toBeUndefined()
    expect(checked.ruleProgram.programSupport).toBe("rules")
    const output: string[] = []
    expect(await runAuthorizationInquiryCli(["check", `--input=${input}`, `--domain-program=${rawFile}`, `--out=${out}`, "--method=M", "--strategy=question-checked-v1", "--program-support=rules"], { stdout: (s: string) => output.push(s) } as any)).toBe(0)
    const report = await inspectLocalInquiry(out)
    expect(report.programSupport).toBe("rules")
    expect(report.execution.schemaVersion).toBe("authorization-program-rules-archive/v1")
    for (const name of ["check.json", "execution.json", "report.json", "run.json"]) {
      const json = await readFile(path.join(report.sessionPath, name), "utf8")
      for (const key of ["resourceExecution", "returned", "propertyChecks", "outcome", "candidatePreviewAvailable"]) expect(json).not.toContain(`"${key}":`)
    }
    await writeFile(path.join(root, "app.py"), "def work():\n    return 8\n\ndef sibling():\n    return None\n")
    const changed: any = await compareLocalInquiry(input, out, undefined, rawFile, { programSupport: "rules" } as any)
    expect(changed.sourceChanged).toBe(true)
    expect(changed.status).toBe("needs-review")
    expect(changed.ruleProgram.programDraft.sourcesCurrent).toBe(false)
    expect(changed.executableContract).toBeUndefined()
    await expect(executeLocalInquiryRun({ inputFile: input, outDir: out, model: "unused", programSupport: "rules" } as any)).rejects.toThrow("rules-support-requires-codex-account")
  } finally { await rm(root, { recursive: true, force: true }) }
})
