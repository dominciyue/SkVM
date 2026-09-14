import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { AgentStep } from "../../src/core/types.ts"
import type { ImplementationSelection } from "../../src/jit-optimize/implementations.ts"
import { completeValidationSuggestion } from "../../src/jit-optimize/validation-completion.ts"
import { runOptimizationValidationLifecycle } from "../../src/jit-optimize/validation-lifecycle.ts"
import type { Evidence, OptimizationAction } from "../../src/jit-optimize/types.ts"

const dirs: string[] = []

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

function implementation(actionId: string, entry = "scripts/convert.py"): ImplementationSelection {
  return {
    actionId,
    kind: "reuse-script",
    status: "selected",
    entry,
    runtime: entry.endsWith(".mjs") ? "node" : "python",
    inputs: ["input file"],
    outputs: ["report file"],
    preconditions: ["python available"],
    residualDuties: ["interpret the report"],
    verification: ["run the bounded source check"],
  }
}

function evidence(options: {
  withOutput?: boolean
  ambiguous?: boolean
  entry?: string
} = {}): Evidence {
  const entry = options.entry ?? "scripts/convert.py"
  const steps: AgentStep[] = [{
    role: "assistant",
    timestamp: 1000,
    toolCalls: [{
      id: "call-convert",
      name: "execute_command",
      input: {
        command: options.ambiguous
          ? `python ${entry} --input input.txt | tee out/report.txt`
          : `${entry.endsWith(".mjs") ? "node" : "python"} ${entry} --input input.txt --output out/report.txt`,
      },
      exitCode: 0,
    }],
  }]
  return {
    taskId: "completion-evidence",
    taskPrompt: "将 input.txt 转换为 out/report.txt。",
    conversationLog: [],
    workDirSnapshot: {
      files: new Map([
        ["input.txt", "report\n"],
        ...(options.withOutput === false ? [] : [["out/report.txt", "REPORT\n"] as const]),
      ]),
    },
    trace: {
      format: "test",
      representation: "conversation-trace",
      sourcePath: "trace.jsonl",
      inputSha256: "e".repeat(64),
      recordLocator: "record:0",
      taskIdSource: "source",
      unknownFields: [],
      diagnostics: [],
    },
    steps,
  } as Evidence & { steps: AgentStep[] }
}

function action(actionId: string, entry = "scripts/convert.py", validation?: OptimizationAction["validation"]): OptimizationAction {
  return {
    id: actionId,
    kind: "reuse-script",
    evidenceIds: ["0"],
    sourceRefs: [entry],
    dependsOn: [],
    inputs: ["input file"],
    outputs: ["report file"],
    preconditions: ["python available"],
    changedPaths: ["SKILL.md"],
    residualDuties: ["interpret the report"],
    verification: ["run the bounded source check"],
    ...(validation ? { validation } : {}),
  }
}

describe("completeValidationSuggestion", () => {
  test("fills a missing case from an observed executable, input and output", async () => {
    const result = await completeValidationSuggestion({
      action: action("convert"),
      implementation: implementation("convert"),
      evidences: [evidence()],
    })

    expect(result.status).toBe("completed")
    expect(result.action.validation?.cases).toHaveLength(1)
    expect(result.action.validation?.cases[0]).toMatchObject({
      id: "auto-convert-0-1",
      evidenceId: "0",
      inputSource: "workdir-snapshot",
      inputFiles: ["input.txt"],
      args: ["--input", "input.txt", "--output", "out/report.txt"],
      expectedFiles: [{ path: "out/report.txt", referencePath: "out/report.txt" }],
      basis: "reference-output",
    })
    expect(result.provenance.fields).toMatchObject({
      evidenceId: expect.objectContaining({ source: "action.evidenceIds" }),
      inputFiles: expect.objectContaining({ source: "observed-operation.readFiles" }),
      args: expect.objectContaining({ source: "observed-operation.argv" }),
      expectedFiles: expect.objectContaining({ source: "observed-operation.writeFiles" }),
    })
  })

  test("keeps an existing validation suggestion unchanged", async () => {
    const validation = {
      cases: [{
        id: "declared",
        evidenceId: "0",
        inputSource: "workdir-snapshot" as const,
        inputFiles: ["input.txt"],
        args: ["--input", "input.txt"],
        expectedFiles: [{ path: "out/report.txt" }],
        basis: "self-check" as const,
        sourceRefs: ["manual:case"],
      }],
    }
    const result = await completeValidationSuggestion({
      action: action("existing", "scripts/convert.py", validation),
      implementation: implementation("existing"),
      evidences: [evidence()],
    })
    expect(result.status).toBe("unchanged")
    expect(result.action.validation).toEqual(validation)
    expect(result.provenance.mode).toBe("existing")
    expect(result.diagnostics).toEqual([])
  })

  test("classifies an empty existing validation declaration as repairable without mutating the candidate", async () => {
    const validation = { cases: [] }
    const candidate = action("repairable", "scripts/convert.py", validation)
    const result = await completeValidationSuggestion({
      action: candidate,
      implementation: implementation("repairable"),
      evidences: [evidence()],
    })

    expect(result.status).toBe("repairable")
    expect(result.action).toBe(candidate)
    expect(result.action.validation).toEqual(validation)
    expect(result.suggestion?.cases).toHaveLength(1)
    expect(result.repairable).toEqual(expect.objectContaining({
      fields: expect.arrayContaining(["validation.cases"]),
      evidenceIds: ["0"],
      suggestion: expect.objectContaining({ cases: expect.any(Array) }),
    }))
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "validation-completion-metadata-missing",
    }))
  })

  test("does not request metadata repair when an empty validation declaration has no deterministic basis", async () => {
    const result = await completeValidationSuggestion({
      action: action("repairable-unknown", "scripts/convert.py", { cases: [] }),
      implementation: implementation("repairable-unknown"),
      evidences: [evidence({ withOutput: false })],
    })

    expect(result.status).toBe("unresolved")
    expect(result.repairable).toBeUndefined()
    expect(result.action.validation?.cases).toEqual([])
  })

  test("does not invent an output rule when only an input is observable", async () => {
    const result = await completeValidationSuggestion({
      action: action("no-output"),
      implementation: implementation("no-output"),
      evidences: [evidence({ withOutput: false })],
    })
    expect(result.status).toBe("unresolved")
    expect(result.action.validation).toBeUndefined()
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "validation-completion-output-unresolved",
    }))
  })

  test("keeps ambiguous shell operations unresolved instead of copying a guessed argv", async () => {
    const result = await completeValidationSuggestion({
      action: action("ambiguous"),
      implementation: implementation("ambiguous"),
      evidences: [evidence({ ambiguous: true })],
    })
    expect(result.status).toBe("unresolved")
    expect(result.action.validation).toBeUndefined()
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "validation-completion-operation-ambiguous",
    }))
  })

  test("runs the existing program validator after deterministic completion", async () => {
    const sourceDir = await tempDir("validation-completion-source-")
    const candidateDir = await tempDir("validation-completion-candidate-")
    const proposalDir = await tempDir("validation-completion-proposal-")
    for (const root of [sourceDir, candidateDir]) await mkdir(path.join(root, "scripts"), { recursive: true })
    const script = [
      "import { mkdir, readFile, writeFile } from 'node:fs/promises'",
      "const args = process.argv.slice(2)",
      "const input = args[args.indexOf('--input') + 1]",
      "const output = args[args.indexOf('--output') + 1]",
      "if (!input || !output) process.exit(2)",
      "await mkdir('out', { recursive: true })",
      "await writeFile(output, (await readFile(input, 'utf8')).toUpperCase())",
    ].join("\n") + "\n"
    await writeFile(path.join(sourceDir, "scripts", "convert.mjs"), script)
    await writeFile(path.join(candidateDir, "scripts", "convert.mjs"), script)
    await writeFile(path.join(sourceDir, ".skvm-validation.json"), JSON.stringify({
      schemaVersion: "skvm-skill-validation/v1",
      fileChecks: [{
        id: "report-content",
        path: "out/report.txt",
        mode: "contains",
        expected: "REPORT",
        sourceRef: "scripts/convert.mjs#output",
      }],
    }))

    const evidenceWithTrace = evidence({ entry: "scripts/convert.mjs" }) 
    const result = await runOptimizationValidationLifecycle({
      proposalDir,
      round: 1,
      skillDir: candidateDir,
      sourceSkillDir: sourceDir,
      baselineSkillDir: sourceDir,
      actions: [action("convert", "scripts/convert.mjs")],
      evidences: [evidenceWithTrace],
    })

    expect(result.report.execution.programRuns).toBe(1)
    expect(result.report.execution.caseRuns).toBe(1)
    expect(result.report.actions[0]?.validationCompletion?.status).toBe("completed")
    expect(result.report.actions[0]?.programStatus).toBe("passed")
    expect(result.summary.retainedActionIds).toEqual(["convert"])
  })
})
