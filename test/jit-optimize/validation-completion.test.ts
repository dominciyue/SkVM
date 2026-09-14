import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { AgentStep } from "../../src/core/types.ts"
import type { ImplementationSelection } from "../../src/jit-optimize/implementations.ts"
import {
  completeValidationSuggestion,
  deriveValidationVariations,
} from "../../src/jit-optimize/validation-completion.ts"
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
  test("varies declared new-program paths without inventing an observed invocation", async () => {
    const observed = evidence({ entry: "scripts/old.mjs" })
    ;(observed as Evidence & { steps: AgentStep[] }).steps = [{
      role: "assistant", timestamp: 1000, toolCalls: [
        { id: "read", name: "read_file", input: { path: "input.txt" } },
        { id: "write", name: "write_file", input: { path: "out/report.txt", content: "REPORT\n" } },
      ],
    }]
    const candidate = action("new-entry", "scripts/new.mjs", { cases: [{
      id: "declared-new-interface", evidenceId: "0", inputSource: "workdir-snapshot",
      inputFiles: ["input.txt"], args: ["--input", "input.txt", "--output", "out/report.txt"],
      expectedFiles: [{ path: "out/report.txt", referencePath: "out/report.txt" }],
      basis: "task-contract", sourceRefs: ["task:conversion-rule"],
    }] })
    candidate.kind = "generate-script"
    const result = await deriveValidationVariations({
      action: candidate, implementation: implementation("new-entry", "scripts/new.mjs"), evidences: [observed],
    })
    expect(result.generated.map((item) => item.kind)).toEqual(["path", "cwd"])
    expect(result.generated[0]?.sourceRefs).toContain("validation-case:declared-new-interface#args")
    expect(result.generated[0]?.sourceRefs.some((ref) => ref.includes("tool-call"))).toBe(false)
    expect(result.covered).toEqual([])
    expect(result.skipped).toContainEqual(expect.objectContaining({ kind: "parameter" }))
  })

  test("offers bounded argv repair for an unobserved entry with captured read/write evidence", async () => {
    const observed = evidence()
    ;(observed as Evidence & { steps: AgentStep[] }).steps = [{
      role: "assistant",
      timestamp: 1000,
      toolCalls: [
        { id: "read-input", name: "read_file", input: { path: "input.txt" } },
        { id: "write-output", name: "write_file", input: { path: "out/report.txt", content: "REPORT\n" } },
      ],
    }]
    const candidate = action("new-entry")
    const result = await completeValidationSuggestion({
      action: candidate,
      implementation: implementation("new-entry"),
      evidences: [observed],
    })
    expect(result.status).toBe("repairable")
    expect(result.action).toBe(candidate)
    expect(result.action.validation).toBeUndefined()
    expect(result.repairable?.fields).toContain("validation.cases.args")
    expect(result.suggestion?.cases[0]).toMatchObject({
      inputFiles: ["input.txt"],
      args: [],
      expectedFiles: [{ path: "out/report.txt", referencePath: "out/report.txt" }],
      basis: "reference-output",
    })
    expect(result.provenance.fields.args?.source).toBe("unresolved-requires-repair")

    observed.workDirSnapshot!.files.delete("out/report.txt")
    const withoutOutput = await completeValidationSuggestion({
      action: candidate,
      implementation: implementation("new-entry"),
      evidences: [observed],
    })
    expect(withoutOutput.status).toBe("unresolved")
    expect(withoutOutput.repairable).toBeUndefined()
  })

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

  test("does not execute an unwired candidate until repaired argv reaches the real validator", async () => {
    const sourceDir = await tempDir("unobserved-entry-source-")
    const candidateDir = await tempDir("unobserved-entry-candidate-")
    const proposalDir = await tempDir("unobserved-entry-proposal-")
    await writeFile(path.join(sourceDir, "SKILL.md"), "# Converter\n")
    await writeFile(path.join(candidateDir, "SKILL.md"), "# Converter\n")
    await mkdir(path.join(candidateDir, "scripts"))
    await writeFile(path.join(candidateDir, "scripts", "convert.mjs"), [
      "import { readFile, writeFile, mkdir } from 'node:fs/promises'",
      "const [input, output] = process.argv.slice(2)",
      "if (!input || !output) process.exit(2)",
      "await mkdir('out', { recursive: true })",
      "await writeFile(output, (await readFile(input, 'utf8')).toUpperCase())",
    ].join("\n"))
    const observed = evidence()
    ;(observed as Evidence & { steps: AgentStep[] }).steps = [{
      role: "assistant", timestamp: 1000, toolCalls: [
        { id: "read", name: "read_file", input: { path: "input.txt" } },
        { id: "write", name: "write_file", input: { path: "out/report.txt", content: "REPORT\n" } },
      ],
    }]
    const candidate: OptimizationAction = {
      ...action("new-program", "scripts/convert.mjs"),
      kind: "generate-script",
      changedPaths: ["scripts/convert.mjs"],
    }
    const options = { proposalDir, round: 1, skillDir: candidateDir, sourceSkillDir: sourceDir, baselineSkillDir: sourceDir, evidences: [observed] }
    const initial = await runOptimizationValidationLifecycle({ ...options, actions: [candidate] })
    expect(initial.report.execution.programRuns).toBe(0)
    expect(initial.report.repairable?.actionIds).toEqual(["new-program"])
    const suggestion = initial.report.repairable!.feedback[0]!.suggestion
    const repaired = await runOptimizationValidationLifecycle({
      ...options,
      round: 2,
      actions: [{
        ...candidate,
        validation: { cases: suggestion.cases.map((item) => ({ ...item, args: ["input.txt", "out/report.txt"] })) },
      }],
    })
    expect(repaired.report.execution.programRuns).toBe(1)
    expect(repaired.report.actions[0]?.programStatus).toBe("passed")
    expect(repaired.report.execution.independentCaseRuns).toBe(0)
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

  test("derives isolated path and cwd cases from an evidence-bound validation case", async () => {
    const taskDir = await tempDir("variation-task-")
    const taskPath = path.join(taskDir, "task.json")
    await writeFile(taskPath, JSON.stringify({
      fixtures: { "input.txt": "alpha\n" },
      eval: [{ id: "output", method: "file-check", path: "out/report.txt", mode: "exact", expected: "ALPHA\n" }],
    }))
    const observed = evidence({ entry: "scripts/convert.mjs" })
    observed.trace = { ...observed.trace!, taskPath }
    observed.criteria = [{ id: "output", method: "file-check", weight: 1, score: 1, passed: true }]
    const candidate: OptimizationAction = {
      ...action("variation", "scripts/convert.mjs", {
        cases: [{
          id: "base",
          evidenceId: "0",
          inputSource: "task-fixtures",
          inputFiles: ["input.txt"],
          args: ["--input", "input.txt", "--output", "out/report.txt"],
          expectedFiles: [{ path: "out/report.txt", referencePath: "out/report.txt" }],
          basis: "task-contract",
          sourceRefs: ["evidence:0#criteria/output"],
        }],
      }),
      outputs: ["out/report.txt"],
    }
    const result = await deriveValidationVariations({
      action: candidate,
      implementation: implementation("variation", "scripts/convert.mjs"),
      evidences: [observed],
    })

    expect(result.generated.map((item) => item.kind)).toEqual(["path", "cwd"])
    expect(result.generated[0]).toEqual(expect.objectContaining({
      parentCaseId: "base",
      suggestion: expect.objectContaining({
        inputFiles: [expect.stringContaining("__skvm_variations")],
        args: expect.arrayContaining([expect.stringContaining("__skvm_variations")]),
        expectedFiles: [expect.objectContaining({
          referencePath: "out/report.txt",
        })],
      }),
      inputBindings: [expect.objectContaining({ sourcePath: "input.txt" })],
    }))
    expect(result.generated[1]?.cwdRelative).toContain("__skvm_variations")
  })

  test("does not invent a parameter value or relation when only one value is observed", async () => {
    const observed = evidence({ entry: "scripts/convert.mjs" })
    const candidate: OptimizationAction = {
      ...action("parameter-unknown", "scripts/convert.mjs", {
        cases: [{
          id: "base",
          evidenceId: "0",
          inputSource: "workdir-snapshot",
          inputFiles: ["input.txt"],
          args: ["--input", "input.txt", "--mode", "alpha", "--output", "out/report.txt"],
          expectedFiles: [{ path: "out/report.txt" }],
          basis: "reference-output",
          sourceRefs: ["operation:call-convert"],
        }],
      }),
      outputs: ["out/report.txt"],
    }
    const result = await deriveValidationVariations({
      action: candidate,
      implementation: implementation("parameter-unknown", "scripts/convert.mjs"),
      evidences: [observed],
    })

    expect(result.generated.some((item) => item.kind === "parameter")).toBe(false)
    expect(result.skipped).toContainEqual(expect.objectContaining({
      kind: "parameter",
      reason: expect.stringContaining("one observed value"),
    }))
  })

  test("records an already-covered parameter variation without duplicating its case", async () => {
    const observed = evidence({ entry: "scripts/convert.mjs" })
    const baseCase = {
      id: "base",
      evidenceId: "0",
      inputSource: "workdir-snapshot" as const,
      inputFiles: ["input.txt"],
      args: ["--input", "input.txt", "--mode", "alpha", "--output", "out/report.txt"],
      expectedFiles: [{ path: "out/report.txt", referencePath: "out/report.txt" }],
      basis: "reference-output" as const,
      sourceRefs: ["operation:call-convert"],
    }
    const result = await deriveValidationVariations({
      action: {
        ...action("parameter-covered", "scripts/convert.mjs", { cases: [
          baseCase,
          { ...baseCase, id: "changed-mode", args: ["--input", "input.txt", "--mode", "beta", "--output", "out/report.txt"] },
        ] }),
        outputs: ["out/report.txt"],
      },
      implementation: implementation("parameter-covered", "scripts/convert.mjs"),
      evidences: [observed],
    })

    expect(result.generated.filter((item) => item.kind === "parameter")).toHaveLength(0)
    expect(result.covered).toContainEqual(expect.objectContaining({
      kind: "parameter",
      caseIds: ["base", "changed-mode"],
      changedBindings: expect.arrayContaining(["mode"]),
    }))
  })

  test("runs generated path and cwd cases through the lifecycle without changing the action schema", async () => {
    const sourceDir = await tempDir("variation-lifecycle-source-")
    const candidateDir = await tempDir("variation-lifecycle-candidate-")
    const proposalDir = await tempDir("variation-lifecycle-proposal-")
    const taskDir = await tempDir("variation-lifecycle-task-")
    for (const root of [sourceDir, candidateDir]) await mkdir(path.join(root, "scripts"), { recursive: true })
    const script = [
      "import { mkdir, readFile, writeFile } from 'node:fs/promises'",
      "import { dirname } from 'node:path'",
      "const args = process.argv.slice(2)",
      "const input = args[args.indexOf('--input') + 1]",
      "const output = args[args.indexOf('--output') + 1]",
      "if (!input || !output) process.exit(2)",
      "await mkdir(dirname(output), { recursive: true })",
      "await writeFile(output, (await readFile(input, 'utf8')).toUpperCase())",
    ].join("\n") + "\n"
    await writeFile(path.join(sourceDir, "scripts", "convert.mjs"), script)
    await writeFile(path.join(candidateDir, "scripts", "convert.mjs"), script)
    const taskPath = path.join(taskDir, "task.json")
    await writeFile(taskPath, JSON.stringify({
      fixtures: { "input.txt": "alpha\n" },
      eval: [{ id: "output", method: "file-check", path: "out/report.txt", mode: "exact", expected: "ALPHA\n" }],
    }))
    const observed = evidence({ entry: "scripts/convert.mjs" })
    observed.trace = { ...observed.trace!, taskPath }
    observed.criteria = [{ id: "output", method: "file-check", weight: 1, score: 1, passed: true }]
    const candidate: OptimizationAction = {
      ...action("variation-lifecycle", "scripts/convert.mjs", {
        cases: [{
          id: "base",
          evidenceId: "0",
          inputSource: "task-fixtures",
          inputFiles: ["input.txt"],
          args: ["--input", "input.txt", "--output", "out/report.txt"],
          expectedFiles: [{ path: "out/report.txt" }],
          basis: "task-contract",
          sourceRefs: ["evidence:0#criteria/output"],
        }],
      }),
      outputs: ["out/report.txt"],
    }

    const result = await runOptimizationValidationLifecycle({
      proposalDir,
      round: 1,
      skillDir: candidateDir,
      sourceSkillDir: sourceDir,
      baselineSkillDir: sourceDir,
      actions: [candidate],
      evidences: [observed],
    })

    expect(result.report.actions[0]?.programStatus).toBe("passed")
    expect(result.report.execution.caseRuns).toBe(3)
    expect(result.report.actions[0]?.variationChecks).toEqual(expect.objectContaining({
      generated: expect.arrayContaining([
        expect.objectContaining({ kind: "path" }),
        expect.objectContaining({ kind: "cwd" }),
      ]),
    }))
    expect(candidate.validation?.cases).toHaveLength(1)
  })

  test("detects a program that ignores relocated path parameters", async () => {
    const sourceDir = await tempDir("fixed-path-source-")
    const candidateDir = await tempDir("fixed-path-candidate-")
    const proposalDir = await tempDir("fixed-path-proposal-")
    const taskDir = await tempDir("fixed-path-task-")
    for (const root of [sourceDir, candidateDir]) await mkdir(path.join(root, "scripts"), { recursive: true })
    const fixed = [
      "import { mkdir, readFile, writeFile } from 'node:fs/promises'",
      "await mkdir('out', { recursive: true })",
      "await writeFile('out/report.txt', (await readFile('input.txt', 'utf8')).toUpperCase())",
    ].join("\n") + "\n"
    await writeFile(path.join(sourceDir, "scripts", "convert.mjs"), fixed)
    await writeFile(path.join(candidateDir, "scripts", "convert.mjs"), fixed)
    const taskPath = path.join(taskDir, "task.json")
    await writeFile(taskPath, JSON.stringify({
      fixtures: { "input.txt": "alpha\n" },
      eval: [{ id: "output", method: "file-check", path: "out/report.txt", mode: "exact", expected: "ALPHA\n" }],
    }))
    const observed = evidence({ entry: "scripts/convert.mjs" })
    observed.trace = { ...observed.trace!, taskPath }
    observed.criteria = [{ id: "output", method: "file-check", weight: 1, score: 1, passed: true }]
    const candidate: OptimizationAction = {
      ...action("fixed-path", "scripts/convert.mjs", {
        cases: [{
          id: "base",
          evidenceId: "0",
          inputSource: "task-fixtures",
          inputFiles: ["input.txt"],
          args: ["--input", "input.txt", "--output", "out/report.txt"],
          expectedFiles: [{ path: "out/report.txt" }],
          basis: "task-contract",
          sourceRefs: ["evidence:0#criteria/output"],
        }],
      }),
      outputs: ["out/report.txt"],
    }
    const result = await runOptimizationValidationLifecycle({
      proposalDir,
      round: 1,
      skillDir: candidateDir,
      sourceSkillDir: sourceDir,
      baselineSkillDir: sourceDir,
      actions: [candidate],
      evidences: [observed],
    })

    expect(result.report.actions[0]?.programStatus).toBe("failed")
    expect(result.report.actions[0]?.program?.cases.find((item) => item.id === "variation-path-base"))
      .toEqual(expect.objectContaining({ status: "failed" }))
    expect(result.report.actions[0]?.program?.cases.find((item) => item.id === "variation-path-base")?.diagnostics.join(" "))
      .toContain("expected output file is missing")
    expect(result.summary.rejectedActionIds).toEqual(["fixed-path"])
  })
})
