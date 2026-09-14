import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  materializeWorkflowScaffold,
  type WorkflowScaffoldSpec,
} from "../../src/jit-optimize/workflow-scaffold.ts"
import { serializeContext } from "../../src/jit-optimize/workspace.ts"
import type { Evidence } from "../../src/jit-optimize/types.ts"

const roots: string[] = []

async function tempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), prefix))
  roots.push(root)
  return root
}

async function put(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, content)
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function spec(kind: WorkflowScaffoldSpec["kind"], processor: string): WorkflowScaffoldSpec {
  return {
    id: `${kind}-case`,
    kind,
    runtime: "node",
    processor: {
      runtime: "node",
      entry: processor,
      args: ["--input", "{input}", "--output", "{output}"],
    },
    residualDuties: ["interpret the produced artifact"],
    sourceRefs: [`${processor}#main`],
  }
}

const transformingSource = [
  "import { readFile, mkdir, writeFile } from 'node:fs/promises'",
  "import { dirname } from 'node:path'",
  "const args = process.argv.slice(2)",
  "const input = args[args.indexOf('--input') + 1]",
  "const output = args[args.indexOf('--output') + 1]",
  "if (!input || !output) process.exit(2)",
  "const text = await readFile(input, 'utf8')",
  "if (text.includes('SKIP')) process.exit(2)",
  "await mkdir(dirname(output), { recursive: true })",
  "await writeFile(output, text.toUpperCase())",
].join("\n") + "\n"

describe("workflow scaffolds", () => {
  test("offers a fail-closed generation scaffold for observed file work without a source program", async () => {
    const root = await tempRoot("skvm-scaffold-generation-")
    const skill = path.join(root, "skill")
    const optimize = path.join(root, ".optimize")
    await put(skill, "SKILL.md", "Read the requested input and produce the transformed output.\n")
    const evidence: Evidence = {
      taskId: "manual-file-work",
      taskPrompt: "Transform the supplied file.",
      conversationLog: [{
        type: "response", ts: "2026-09-14T00:00:00Z", text: "done",
        toolCalls: [
          { id: "read-input", name: "read_file", input: { path: "input.txt" } },
          { id: "write-output", name: "write_file", input: { path: "out.txt", content: "RESULT" } },
        ],
      }],
      workDirSnapshot: { files: new Map([["input.txt", "input"], ["out.txt", "RESULT"]]) },
    }
    await serializeContext(optimize, [evidence], [], { skillDir: skill })
    const context = JSON.parse(await readFile(path.join(optimize, "IMPLEMENTATION_CONTEXT.json"), "utf8"))
    const candidate = context.workflowScaffolds.candidates[0]
    expect(candidate).toMatchObject({
      kind: "single-input",
      evidenceIndex: 0,
      observedFileWork: {
        readFiles: ["input.txt"],
        writeFiles: ["out.txt"],
        mapping: "unresolved-model-selection-required",
      },
      diagnostic: expect.stringContaining("requires-model-processor"),
      contributions: { sourceFiles: [], modelFiles: [] },
    })
    const entry = path.join(root, candidate.entry)
    await put(root, "input.txt", "input")
    const child = Bun.spawn(["node", entry, "--input", "input.txt", "--output", "out.txt"], { cwd: root, stdout: "pipe", stderr: "pipe" })
    await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(await child.exited).not.toBe(0)
    expect(await Bun.file(path.join(root, "out.txt")).exists()).toBe(false)
    const manifest = JSON.parse(await readFile(path.join(root, candidate.manifest), "utf8"))
    expect(manifest.steps.find((step: { id: string }) => step.id === "invoke-source").contributor).toBe("model")
  })

  test("materializes a single-input executable that produces an artifact", async () => {
    const root = await tempRoot("skvm-scaffold-single-")
    await put(root, "source.mjs", transformingSource)
    const materialized = await materializeWorkflowScaffold({
      rootDir: root,
      entryRelative: "bin/workflow.mjs",
      spec: spec("single-input", "source.mjs"),
    })
    await put(root, "input.txt", "hello\n")

    const process = Bun.spawn(["node", materialized.entryPath, "--input", "input.txt", "--output", "out/report.txt"], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
    ])

    expect(await process.exited).toBe(0)
    expect(stderr).toBe("")
    expect(await readFile(path.join(root, "out/report.txt"), "utf8")).toBe("HELLO\n")
    const singleSummary = JSON.parse(stdout)
    expect(singleSummary.status).toBe("passed")
    expect(String(singleSummary.outputs[0]).replaceAll("\\", "/")).toContain("out/report.txt")
    expect(materialized.manifest.steps.map((step) => step.id)).toEqual([
      "read-input",
      "invoke-source",
      "verify-output",
    ])
    expect(materialized.manifest.contributions).toEqual(expect.objectContaining({
      frameworkFiles: ["bin/workflow.mjs", "bin/workflow.manifest.json"],
      sourceFiles: ["source.mjs"],
      modelFiles: [],
    }))
  })

  test("keeps manual file-work candidates when an unrelated source executable exists", async () => {
    const root = await tempRoot("skvm-scaffold-unrelated-")
    const skill = path.join(root, "skill")
    const optimize = path.join(root, ".optimize")
    await put(skill, "SKILL.md", "Transform input files; scripts/version.mjs prints the version.\n")
    await put(skill, "scripts/version.mjs", "console.log('1')\n")
    const evidence: Evidence = {
      taskId: "file-work",
      taskPrompt: "Transform input.txt to out.txt.",
      conversationLog: [{
        type: "response", ts: "2026-09-14T00:00:00Z", text: "done",
        toolCalls: [
          { id: "read-input", name: "read_file", input: { path: "input.txt" } },
          { id: "write-output", name: "write_file", input: { path: "out.txt", content: "RESULT" } },
        ],
      }],
    }
    await serializeContext(optimize, [evidence], [], { skillDir: skill })
    const context = JSON.parse(await readFile(path.join(optimize, "IMPLEMENTATION_CONTEXT.json"), "utf8"))
    expect(context.workflowScaffolds.candidates).toContainEqual(expect.objectContaining({
      diagnostic: expect.stringContaining("requires-model-processor"),
      contributions: { frameworkFiles: expect.any(Array), sourceFiles: [], modelFiles: [] },
    }))
    const readme = await readFile(path.join(optimize, "README.md"), "utf8")
    expect(readme).not.toContain('If yes, stop.')
    expect(readme).toContain("workflowScaffolds")
  })

  test("does not combine a read in one evidence with a write in another into a workflow", async () => {
    const root = await tempRoot("skvm-scaffold-evidence-isolation-")
    const skill = path.join(root, "skill")
    const optimize = path.join(root, ".optimize")
    await put(skill, "SKILL.md", "Inspect or write files as requested.\n")
    const evidences: Evidence[] = [
      { taskId: "read-only", taskPrompt: "Read input.txt.", conversationLog: [{
        type: "response", ts: "2026-09-14T00:00:00Z", text: "done",
        toolCalls: [{ id: "read", name: "read_file", input: { path: "input.txt" } }],
      }] },
      { taskId: "write-only", taskPrompt: "Write a note.", conversationLog: [{
        type: "response", ts: "2026-09-14T00:00:00Z", text: "done",
        toolCalls: [{ id: "write", name: "write_file", input: { path: "note.txt", content: "note" } }],
      }] },
    ]
    await serializeContext(optimize, evidences, [], { skillDir: skill })
    const context = JSON.parse(await readFile(path.join(optimize, "IMPLEMENTATION_CONTEXT.json"), "utf8"))
    expect(context.workflowScaffolds.candidates).toEqual([])
  })

  test("materializes a multi-input executable that continues after one input is not applicable", async () => {
    const root = await tempRoot("skvm-scaffold-multi-")
    await put(root, "source.mjs", transformingSource)
    const materialized = await materializeWorkflowScaffold({
      rootDir: root,
      entryRelative: "bin/batch.mjs",
      spec: spec("multi-input", "source.mjs"),
    })
    await put(root, "a.txt", "SKIP\n")
    await put(root, "b.txt", "keep\n")

    const process = Bun.spawn([
      "node",
      materialized.entryPath,
      "--input",
      "a.txt",
      "--input",
      "b.txt",
      "--output-dir",
      "out",
    ], { cwd: root, stdout: "pipe", stderr: "pipe" })
    const [stdout, stderr] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
    ])

    expect(await process.exited).toBe(2)
    expect(stderr).toBe("")
    expect(await readFile(path.join(root, "out", "item-002.out"), "utf8")).toBe("KEEP\n")
    expect(await Bun.file(path.join(root, "out", "item-001.out")).exists()).toBe(false)
    const report = JSON.parse(await readFile(path.join(root, "out", "workflow-manifest.json"), "utf8"))
    expect(report.items).toEqual([
      expect.objectContaining({ input: expect.stringContaining("a.txt"), status: "not-applicable" }),
      expect.objectContaining({ input: expect.stringContaining("b.txt"), status: "passed" }),
    ])
    const multiSummary = JSON.parse(stdout)
    expect(multiSummary.status).toBe("partial")
    expect(String(multiSummary.outputs[0]).replaceAll("\\", "/")).toContain("item-002.out")
  })

  test("rejects a checker-only source that exits successfully without producing the declared artifact", async () => {
    const root = await tempRoot("skvm-scaffold-missing-output-")
    await put(root, "checker.mjs", "console.log('checked')\n")
    const materialized = await materializeWorkflowScaffold({
      rootDir: root,
      entryRelative: "bin/workflow.mjs",
      spec: spec("single-input", "checker.mjs"),
    })
    await put(root, "input.txt", "hello\n")

    const process = Bun.spawn(["node", materialized.entryPath, "--input", "input.txt", "--output", "out/report.txt"], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
    ])

    expect(await process.exited).toBe(1)
    expect(stderr).toBe("")
    const missingSummary = JSON.parse(stdout)
    expect(missingSummary.status).toBe("failed")
    expect(missingSummary.diagnostics.join(" ")).toContain("output artifact is missing")
  })

  test("detects a path handoff mismatch instead of accepting a fixed observed output", async () => {
    const root = await tempRoot("skvm-scaffold-path-mismatch-")
    await put(root, "miswired.mjs", [
      "import { mkdir, writeFile } from 'node:fs/promises'",
      "await mkdir('out', { recursive: true })",
      "await writeFile('out/fixed-observed.txt', 'wrong path\\n')",
    ].join("\n") + "\n")
    const materialized = await materializeWorkflowScaffold({
      rootDir: root,
      entryRelative: "bin/workflow.mjs",
      spec: spec("single-input", "miswired.mjs"),
    })
    await put(root, "input.txt", "hello\n")

    const process = Bun.spawn(["node", materialized.entryPath, "--input", "input.txt", "--output", "out/report.txt"], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
    ])

    expect(await process.exited).toBe(1)
    expect(stderr).toBe("")
    const mismatchSummary = JSON.parse(stdout)
    expect(mismatchSummary.status).toBe("failed")
    expect(mismatchSummary.diagnostics.join(" ")).toContain("output artifact is missing")
    expect(await Bun.file(path.join(root, "out", "fixed-observed.txt")).exists()).toBe(true)
    expect(await Bun.file(path.join(root, "out", "report.txt")).exists()).toBe(false)
  })

  test("reuses the same mechanical generator for single and multi structures", async () => {
    const root = await tempRoot("skvm-scaffold-shared-")
    await put(root, "source.mjs", transformingSource)
    const single = await materializeWorkflowScaffold({
      rootDir: root,
      entryRelative: "bin/single.mjs",
      spec: { ...spec("single-input", "source.mjs"), id: "single" },
    })
    const multi = await materializeWorkflowScaffold({
      rootDir: root,
      entryRelative: "bin/multi.mjs",
      spec: { ...spec("multi-input", "source.mjs"), id: "multi" },
    })

    expect(single.manifest.steps.filter((step) => step.contributor === "framework").map((step) => step.id))
      .toEqual(["read-input", "verify-output"])
    expect(multi.manifest.steps.filter((step) => step.contributor === "framework").map((step) => step.id))
      .toEqual(["read-inputs", "aggregate", "verify-output"])
    expect(single.manifest.contributions.sourceFiles).toEqual(multi.manifest.contributions.sourceFiles)
  })

  test("materializes an observed source operation as an optimizer-context candidate", async () => {
    const root = await tempRoot("skvm-scaffold-context-")
    const skill = path.join(root, "skill")
    const optimize = path.join(root, "optimize")
    await mkdir(path.join(skill, "scripts"), { recursive: true })
    await put(skill, "SKILL.md", "Use scripts/convert.mjs --input FILE --output FILE.\n")
    await put(skill, "scripts/convert.mjs", transformingSource)
    const evidence: Evidence = {
      taskId: "scaffold-context",
      taskPrompt: "Convert an input file.",
      conversationLog: [{
        type: "response",
        ts: "2026-09-14T00:00:00Z",
        text: "done",
        toolCalls: [{
          id: "call-convert",
          name: "execute_command",
          input: { command: "node scripts/convert.mjs --input input.txt --output out/report.txt" },
          exitCode: 0,
        }],
      }],
      workDirSnapshot: { files: new Map([["out/report.txt", "OK\n"]]) },
      trace: {
        format: "test",
        representation: "conversation-trace",
        sourcePath: path.join(root, "trace.jsonl"),
        inputSha256: "a".repeat(64),
        recordLocator: "record:0",
        taskIdSource: "source",
        unknownFields: [],
        diagnostics: [],
      },
    }

    await serializeContext(optimize, [evidence], [], { skillDir: skill })
    const context = JSON.parse(await readFile(path.join(optimize, "IMPLEMENTATION_CONTEXT.json"), "utf8"))
    expect(context.workflowScaffolds.candidates).toEqual([
      expect.objectContaining({
        kind: "single-input",
        runtime: "node",
        operationIds: ["operation-0"],
        entry: expect.stringContaining(".optimize/workflow-scaffolds/"),
      }),
    ])
    expect(await Bun.file(path.join(root, context.workflowScaffolds.candidates[0].entry)).exists()).toBe(true)
  })
})
