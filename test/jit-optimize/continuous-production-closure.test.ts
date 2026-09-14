import { afterEach, describe, expect, mock, test } from "bun:test"
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { emptyTokenUsage, type AgentAdapter, type AgentStep, type RunResult } from "../../src/core/types.ts"
import { RunSession } from "../../src/core/run-session.ts"
import { snapshotWorkdir } from "../../src/core/workdir-manifest.ts"
import { executeRun, loadRunSkill, materializeNaturalRunTask } from "../../src/run/index.ts"
import { OptimizationSession, readOptimizationSession } from "../../src/run/optimization-session.ts"
import { analyzeSkillConsumption } from "../../src/jit-optimize/consumption.ts"
import { runGeneralSkillDevelopment } from "../../src/jit-optimize/general-skill-development.ts"
import { buildOptimizedSkillPackage, verifyOptimizedSkillPackage } from "../../src/jit-optimize/package.ts"
import { completeValidationSuggestion } from "../../src/jit-optimize/validation-completion.ts"
import { acquireOptimizeLock, releaseOptimizeLock } from "../../src/proposals/storage.ts"
import type { OptimizeConfig, OptimizeInput, OptimizeResult, OptimizeSubmission } from "../../src/jit-optimize/types.ts"

let optimizerHandler: (input: OptimizeInput, config: OptimizeConfig) => Promise<OptimizeResult> = async () => {
  throw new Error("continuous production test optimizer handler was not configured")
}

mock.module("../../src/jit-optimize/optimizer.ts", () => ({
  runOptimizer: (input: OptimizeInput, config: OptimizeConfig) => optimizerHandler(input, config),
}))

const { executeRunAndOptimize, runCapturedOptimization } = await import("../../src/run/optimization-handoff.ts")
const { runLoop } = await import("../../src/jit-optimize/loop.ts")

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function sha256(value: string | Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
}

async function closureDigest(directory: string): Promise<string> {
  return sha256(JSON.stringify(await snapshotWorkdir(directory)))
}

function sourceRunAdapter(): AgentAdapter {
  return {
    name: "bare-agent",
    async setup() {},
    async teardown() {},
    async run(options): Promise<RunResult> {
      const inputBytes = new Uint8Array(await Bun.file(path.join(options.workDir, "input.json")).arrayBuffer())
      const input = JSON.parse(new TextDecoder().decode(inputBytes)) as { value: string }
      const output = `${JSON.stringify({ value: input.value.toUpperCase() })}\n`
      await mkdir(path.join(options.workDir, "out"), { recursive: true })
      await writeFile(path.join(options.workDir, "out", "result.json"), output)
      const now = Date.now()
      const steps: AgentStep[] = [
        {
          role: "assistant",
          text: "I read the input and produced the requested bounded output.",
          toolCalls: [],
          timestamp: now,
        },
        {
          role: "tool",
          toolCalls: [{
            id: "source-read",
            name: "read_file",
            input: { path: "input.json" },
            output: new TextDecoder().decode(inputBytes),
            exitCode: 0,
          }],
          timestamp: now + 1,
        },
        {
          role: "tool",
          toolCalls: [{
            id: "source-write",
            name: "write_file",
            input: { path: "out/result.json" },
            output,
            exitCode: 0,
          }],
          timestamp: now + 2,
        },
      ]
      const response = {
        text: "completed",
        toolCalls: [],
        tokens: { ...emptyTokenUsage(), input: 3, output: 2 },
        durationMs: 1,
        stopReason: "end_turn" as const,
      }
      options.convLog?.logResponse(response)
      await options.convLog?.finalize()
      options.runtimeTrace?.providerRequestStart(0)
      options.runtimeTrace?.providerResponseReceived(0, response)
      options.runtimeTrace?.turnEnd(0)
      options.runtimeTrace?.finalize(0, "completed")
      return {
        text: "completed",
        steps,
        tokens: response.tokens,
        cost: 0,
        durationMs: 1,
        llmDurationMs: 1,
        workDir: options.workDir,
        runStatus: "ok",
        usageAvailable: true,
      }
    },
  }
}

function converterSource(): string {
  return `
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const args = process.argv.slice(2);
if (args.includes("--help")) { console.log("Usage: convert --input <path> --out <path>"); process.exit(0); }
const inputAt = args.indexOf("--input");
const outAt = args.indexOf("--out");
if (inputAt < 0 || outAt < 0) { console.error("required argument --input and --out"); process.exit(2); }
const parsed = JSON.parse(await readFile(args[inputAt + 1], "utf8"));
const output = { value: String(parsed.value).toUpperCase() };
await mkdir(path.dirname(args[outAt + 1]), { recursive: true });
await writeFile(args[outAt + 1], JSON.stringify(output) + "\\n");
console.log(JSON.stringify({ status: "success", output: args[outAt + 1] }));
`
}

function actionSubmission(phase: "candidate" | "repair"): OptimizeSubmission {
  const repaired = phase === "repair"
  const entry = repaired ? "scripts/convert.mjs" : "scripts/missing.mjs"
  return {
    rootCause: "A bounded JSON conversion can be parameterized as a local helper.",
    reasoning: "The helper owns only deterministic conversion; the agent retains task fit and residual review.",
    confidence: 0.9,
    changedFiles: repaired ? [] : ["SKILL.md", "scripts/convert.mjs"],
    changes: repaired ? [] : [
      {
        file: "SKILL.md",
        description: "Document the bounded converter entry.",
        generality: "Other bounded JSON conversion tasks can use the same entry.",
      },
      {
        file: "scripts/convert.mjs",
        description: "Add a parameterized deterministic converter.",
        generality: "Other input values and output paths use the same arguments.",
      },
    ],
    actions: [{
      id: "convert-json",
      kind: "generate-script",
      evidenceIds: ["0"],
      sourceRefs: [entry, "SKILL.md#bounded-output"],
      dependsOn: [],
      inputs: ["input.json"],
      outputs: ["out/result.json"],
      preconditions: ["Node.js is available"],
      changedPaths: [entry],
      residualDuties: ["The agent decides whether the task fits the bounded conversion and records the result."],
      verification: ["Compare the produced JSON bytes with the source-owned output invariant."],
      validation: {
        help: { args: ["--help"], stdoutIncludes: ["Usage:"] },
        cases: [{
          id: "source-owned-output",
          evidenceId: "0",
          inputSource: "pre-run-input-snapshot",
          inputFiles: ["input.json"],
          args: ["--input", "input.json", "--out", "out/result.json"],
          expectedFiles: [{ path: "out/result.json" }],
          basis: "task-contract",
          sourceRefs: ["SKILL.md#bounded-output"],
        }],
      },
    }],
  }
}

function completionEvidence(options: {
  entry?: string
  output?: boolean
  secondMode?: boolean
} = {}): OptimizeInput["evidences"][number] {
  const entry = options.entry ?? "scripts/convert.mjs"
  const command = [
    "node",
    entry,
    "--input",
    "input.json",
    ...(options.secondMode ? ["--mode", "strict"] : []),
    "--out",
    "out/result.json",
  ]
  const steps: AgentStep[] = [
    {
      role: "tool",
      toolCalls: [{
        id: "completion-exec",
        name: "execute_command",
        input: { argv: command },
        output: "completed",
        exitCode: 0,
      }],
      timestamp: Date.now(),
    },
  ]
  return {
    taskId: "completion-case",
    taskPrompt: "Convert input.json to out/result.json.",
    conversationLog: [],
    workDirSnapshot: {
      files: new Map([
        ["input.json", "{\"value\":\"alpha\"}\n"],
        ...(options.output === false ? [] : [["out/result.json", "{\"value\":\"ALPHA\"}\n"] as const]),
      ]),
    },
    trace: {
      format: "test",
      representation: "conversation-trace",
      sourcePath: "completion-trace.jsonl",
      inputSha256: "c".repeat(64),
      recordLocator: "record:0",
      taskIdSource: "source",
      unknownFields: [],
      diagnostics: [],
    },
    steps,
  } as OptimizeInput["evidences"][number]
}

type SubmissionAction = NonNullable<OptimizeSubmission["actions"]>[number]

function completionAction(validation?: SubmissionAction["validation"]): SubmissionAction {
  return {
    id: "completion-action",
    kind: "reuse-script",
    evidenceIds: ["0"],
    sourceRefs: ["scripts/convert.mjs"],
    dependsOn: [],
    inputs: ["input.json"],
    outputs: ["out/result.json"],
    preconditions: ["Node.js is available"],
    changedPaths: ["scripts/convert.mjs"],
    residualDuties: ["Review the conversion result."],
    verification: ["Compare the result file."],
    ...(validation ? { validation } : {}),
  }
}

async function runNaturalConsumption(
  packageDir: string,
  root: string,
  value: string,
  label: string,
  options: { invokeHelper?: boolean } = {},
) {
  const runDir = path.join(root, `consume-${label}`)
  const invokeHelper = options.invokeHelper ?? true
  return runGeneralSkillDevelopment({
    skillDir: packageDir,
    runDir,
    task: "Convert input.json to out/result.json and leave a short residual review note.",
    fixtures: { "input.json": `${JSON.stringify({ value })}\n` },
    protectedFixturePaths: ["input.json"],
    resources: [],
    expectedFiles: [{ path: "out/result.json", includes: [value.toUpperCase()] }],
    residualEvidenceFiles: ["review.txt"],
    model: "test/consumer",
    agentRunner: async (options) => {
      const inputPath = path.join(options.cwd, "input.json")
      const outputPath = path.join(options.cwd, "out", "result.json")
      const raw = await readFile(inputPath, "utf8")
      await mkdir(path.dirname(outputPath), { recursive: true })
      let stdout = ""
      let stderr = ""
      let exitCode = 0
      if (invokeHelper) {
        const child = Bun.spawn([
          Bun.which("node") ?? process.execPath,
          path.join(options.cwd, "skill", "scripts", "convert.mjs"),
          "--input",
          inputPath,
          "--out",
          outputPath,
        ], { cwd: options.cwd, stdout: "pipe", stderr: "pipe" })
        ;[stdout, stderr] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ])
        exitCode = await child.exited
      } else {
        const parsed = JSON.parse(raw) as { value: string }
        await writeFile(outputPath, `${JSON.stringify({ value: parsed.value.toUpperCase() })}\n`)
      }
      await writeFile(path.join(options.cwd, "review.txt"), `reviewed ${JSON.parse(raw).value}\n`)
      const now = Date.now()
      const steps: AgentStep[] = [
        {
          role: "tool",
          toolCalls: [{ id: `${label}-skill`, name: "read_file", input: { path: "skill/SKILL.md" }, output: "read", exitCode: 0 }],
          timestamp: now,
        },
        ...(invokeHelper ? [{
          role: "tool" as const,
          toolCalls: [{
            id: `${label}-helper`,
            name: "execute_command",
            input: { command: `node skill/scripts/convert.mjs --input input.json --out out/result.json` },
            output: stdout,
            exitCode,
          }],
          timestamp: now + 1,
        }] : []),
        {
          role: "tool",
          toolCalls: [{ id: `${label}-review`, name: "write_file", input: { path: "review.txt" }, output: "written", exitCode: 0 }],
          timestamp: now + (invokeHelper ? 2 : 1),
        },
      ]
      const result = {
        exitCode,
        durationMs: 1,
        timedOut: false,
        cost: 0,
        tokens: emptyTokenUsage(),
        rawStdout: JSON.stringify({ label, stderr, stdout }),
        rawStderr: stderr,
        driver: "pi" as const,
      }
      return { result, steps }
    },
  })
}

describe("continuous production closure", () => {
  test("auto-wires a missing validation case only from a complete observed source", async () => {
    const result = await completeValidationSuggestion({
      action: completionAction(),
      implementation: {
        actionId: "completion-action",
        kind: "reuse-script",
        status: "selected",
        entry: "scripts/convert.mjs",
        runtime: "node",
        inputs: ["input.json"],
        outputs: ["out/result.json"],
        preconditions: ["Node.js is available"],
        residualDuties: ["Review the conversion result."],
        verification: ["Compare the result file."],
      },
      evidences: [completionEvidence()],
    })
    expect(result.status).toBe("completed")
    expect(result.action.validation?.cases).toHaveLength(1)
    expect(result.action.validation?.cases[0]).toEqual(expect.objectContaining({
      inputFiles: ["input.json"],
      expectedFiles: [{ path: "out/result.json", referencePath: "out/result.json" }],
    }))
  })

  test("keeps a model-only parameter gap repairable without inventing its value", async () => {
    const result = await completeValidationSuggestion({
      action: completionAction({ cases: [] }),
      implementation: {
        actionId: "completion-action",
        kind: "reuse-script",
        status: "selected",
        entry: "scripts/convert.mjs",
        runtime: "node",
        inputs: ["input.json"],
        outputs: ["out/result.json"],
        preconditions: ["Node.js is available"],
        residualDuties: ["Review the conversion result."],
        verification: ["Compare the result file."],
      },
      evidences: [completionEvidence({ secondMode: true })],
    })
    expect(result.status).toBe("repairable")
    expect(result.action.validation?.cases).toEqual([])
    expect(result.repairable?.suggestion.cases[0]?.args).toEqual(expect.arrayContaining(["--mode", "strict"]))
  })

  test("leaves a missing semantic rule unresolved when no source authority exists", async () => {
    const result = await completeValidationSuggestion({
      action: completionAction({ cases: [] }),
      implementation: {
        actionId: "completion-action",
        kind: "reuse-script",
        status: "selected",
        entry: "scripts/convert.mjs",
        runtime: "node",
        inputs: ["input.json"],
        outputs: ["out/result.json"],
        preconditions: ["Node.js is available"],
        residualDuties: ["Review the conversion result."],
        verification: ["Compare the result file."],
      },
      evidences: [completionEvidence({ output: false, secondMode: true })],
    })
    expect(result.status).toBe("unresolved")
    expect(result.repairable).toBeUndefined()
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  test("captures a natural run, repairs action metadata, exports one package, and consumes that package on two inputs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skvm-continuous-"))
    roots.push(root)
    const sourceSkillDir = path.join(root, "source-skill")
    const taskPath = path.join(root, "natural", "task.json")
    const workDir = path.join(root, "source-work")
    const sessionRoot = path.join(root, "session")
    const packageDir = path.join(root, "exported-package")
    await mkdir(sourceSkillDir, { recursive: true })
    await mkdir(workDir, { recursive: true })
    await writeFile(path.join(sourceSkillDir, "SKILL.md"), `---\nname: bounded-converter\ndescription: deterministic JSON conversion\n---\nUse the task context to decide whether a bounded JSON conversion applies. Preserve residual review duties.\n`)
    await writeFile(path.join(sourceSkillDir, ".skvm-validation.json"), `${JSON.stringify({
      schemaVersion: "skvm-skill-validation/v1",
      fileChecks: [{
        id: "bounded-output",
        path: "out/result.json",
        mode: "exact",
        expected: "{\"value\":\"ALPHA\"}\n",
        sourceRef: "SKILL.md#bounded-output",
      }],
    }, null, 2)}\n`)
    await writeFile(path.join(workDir, "input.json"), "{\"value\":\"alpha\"}\n")
    const sourceSkill = await loadRunSkill(sourceSkillDir)
    const task = await materializeNaturalRunTask({
      prompt: "Convert input.json to out/result.json as uppercase JSON while preserving residual review.",
      taskPath,
    })
    const sourceSkillDigestBefore = await closureDigest(sourceSkillDir)
    const run = await RunSession.start({ type: "run", tag: "continuous-closure", logDir: path.join(root, "run-sessions") })
    const session = await OptimizationSession.start({
      runId: run.id,
      rootDir: sessionRoot,
      skill: sourceSkill,
      task,
      workDir,
      adapter: "bare-agent",
      model: "test/source",
      optimizationRequested: true,
    })

    let optimizerCalls = 0
    let repairFeedback: unknown
    optimizerHandler = async (input, config) => {
      optimizerCalls += 1
      const workspaceDir = await mkdtemp(path.join(root, `optimizer-${optimizerCalls}-`))
      await cp(input.skillDir, workspaceDir, { recursive: true })
      if (optimizerCalls === 1) {
        await mkdir(path.join(workspaceDir, "scripts"), { recursive: true })
        await writeFile(path.join(workspaceDir, "scripts", "convert.mjs"), converterSource())
        await writeFile(path.join(workspaceDir, "SKILL.md"), `---\nname: bounded-converter\ndescription: deterministic JSON conversion\n---\nUse scripts/convert.mjs for bounded JSON conversions, then complete residual review duties.\n`)
      } else {
        repairFeedback = (input as OptimizeInput & { repairFeedback?: unknown }).repairFeedback
      }
      const submission = actionSubmission(optimizerCalls === 1 ? "candidate" : "repair")
      if (config.recordDir) {
        await mkdir(config.recordDir, { recursive: true })
        await writeFile(path.join(config.recordDir, "submission.json"), `${JSON.stringify(submission, null, 2)}\n`)
      }
      return {
        changed: optimizerCalls === 1,
        workspaceDir,
        submission,
        actualChangedFiles: optimizerCalls === 1 ? ["SKILL.md", "scripts/convert.mjs"] : [],
        cost: 0,
        tokens: emptyTokenUsage(),
      }
    }

    const handoff = await executeRunAndOptimize({
      session,
      task,
      skill: sourceSkill,
      adapter: sourceRunAdapter(),
      adapterConfig: { model: "test/source", maxSteps: 10, timeoutMs: 10_000, mode: "managed" },
      workDir,
      optimizerModel: "test/optimizer",
      packageDir,
      dependencies: {
        executeRun,
        runCapturedOptimization: (options) => runCapturedOptimization({
          ...options,
          dependencies: {
            jitOptimize: (config) => runLoop({
              ...config,
              evalProvider: {
                name: "unused-c7-provider",
                complete: async () => { throw new Error("C7 execution-log flow must not call an eval provider") },
                completeWithToolResults: async () => { throw new Error("C7 execution-log flow must not call an eval provider") },
              },
            }),
            buildPackage: buildOptimizedSkillPackage,
            verifyPackage: verifyOptimizedSkillPackage,
            acquireLock: acquireOptimizeLock,
            releaseLock: releaseOptimizeLock,
          },
        }),
      },
    })

    expect(handoff.optimization.status).toBe("completed")
    expect(optimizerCalls).toBe(2)
    expect(repairFeedback).toEqual(expect.objectContaining({ actionIds: ["convert-json"] }))
    expect(handoff.session.handoff.status).toBe("ready")
    expect(handoff.session.optimization).toEqual(expect.objectContaining({
      status: "completed",
      packageDir,
    }))

    const saved = await readOptimizationSession(session.manifestPath)
    const evidencePath = saved.optimization && "evidenceManifestPath" in saved.optimization
      ? saved.optimization.evidenceManifestPath
      : undefined
    expect(evidencePath).toEqual(expect.any(String))
    const evidence = JSON.parse(await readFile(evidencePath!, "utf8"))
    expect(evidence.capture.status).toBe("complete")
    expect(evidence.artifacts.preRunInputSnapshot).toEqual(expect.objectContaining({ sha256: expect.any(String) }))

    const proposalDir = (saved.optimization as { proposalDir: string }).proposalDir
    const report = JSON.parse(await readFile(path.join(proposalDir, "round-1-validation", "report.json"), "utf8"))
    const history = JSON.parse(await readFile(path.join(proposalDir, "history.json"), "utf8"))
    expect(report.resolution).toEqual(expect.objectContaining({ status: "passed", retainedActionIds: ["convert-json"] }))
    expect(report.repair).toEqual(expect.objectContaining({ outcome: "passed", changedPaths: [], revalidatedActionIds: ["convert-json"] }))
    expect(report.actions[0]).toEqual(expect.objectContaining({
      actionId: "convert-json",
      validationSource: "executed",
      programStatus: "passed",
      independentCaseIds: ["source-owned-output"],
    }))
    expect(history.entries[0].actions[0]).toEqual(expect.objectContaining({ id: "convert-json", changedPaths: ["scripts/convert.mjs"] }))

    const manifest = JSON.parse(await readFile(path.join(packageDir, "optimization-manifest.json"), "utf8"))
    expect(manifest.validation).toEqual(expect.objectContaining({
      behaviorStatus: "passed",
      deliveryStatus: "validated-recommendation",
      retainedActionIds: ["convert-json"],
      independentCaseRuns: 1,
    }))
    expect(await readFile(path.join(packageDir, "scripts", "convert.mjs"), "utf8")).toContain("toUpperCase")

    const originalPackageDigest = await closureDigest(packageDir)
    const original = await runNaturalConsumption(packageDir, root, "alpha", "original")
    const changed = await runNaturalConsumption(packageDir, root, "beta", "changed")
    expect(original.status).toBe("passed")
    expect(changed.status).toBe("passed")
    expect(original.package.path).toBe(packageDir)
    expect(changed.package.path).toBe(packageDir)
    expect(original.package.manifestIdentity).toBe(changed.package.manifestIdentity)
    expect(original.consumption.helperSucceeded).toBe(true)
    expect(changed.consumption.helperSucceeded).toBe(true)
    expect(original.verification.protectedResourcesPreserved).toBe(true)
    expect(changed.verification.protectedResourcesPreserved).toBe(true)
    expect(original.verification.residualEvidenceFiles).toEqual([{ path: "review.txt", exists: true }])
    expect(changed.verification.residualEvidenceFiles).toEqual([{ path: "review.txt", exists: true }])
    expect(await readFile(path.join(root, "consume-original", "work", "out", "result.json"), "utf8")).toContain("ALPHA")
    expect(await readFile(path.join(root, "consume-changed", "work", "out", "result.json"), "utf8")).toContain("BETA")
    expect(await closureDigest(packageDir)).toBe(originalPackageDigest)
    expect(await closureDigest(sourceSkillDir)).toBe(sourceSkillDigestBefore)

    const oldPackageDir = path.join(root, "historical-h8-package")
    await cp(packageDir, oldPackageDir, { recursive: true })
    const oldManifestPath = path.join(oldPackageDir, "optimization-manifest.json")
    const oldManifest = JSON.parse(await readFile(oldManifestPath, "utf8"))
    oldManifest.identity = "historical-h8-package"
    await writeFile(oldManifestPath, `${JSON.stringify(oldManifest, null, 2)}\n`)
    expect((await verifyOptimizedSkillPackage(oldPackageDir)).manifest.identity).toBe("historical-h8-package")
    const oldPackageConsumption = await runNaturalConsumption(oldPackageDir, root, "alpha", "old-package")
    expect(oldPackageConsumption.status).toBe("passed")
    expect(oldPackageConsumption.package.manifestIdentity).not.toBe(manifest.identity)
    expect(oldPackageConsumption.package.path).not.toBe(packageDir)
    expect(oldPackageConsumption.package.path === packageDir
      && oldPackageConsumption.package.manifestIdentity === manifest.identity).toBe(false)

    const docsOnlyPackageDir = path.join(root, "docs-only-package")
    await cp(packageDir, docsOnlyPackageDir, { recursive: true })
    const docsOnlyManifestPath = path.join(docsOnlyPackageDir, "optimization-manifest.json")
    const docsOnlyManifest = JSON.parse(await readFile(docsOnlyManifestPath, "utf8"))
    docsOnlyManifest.identity = "docs-only-counterexample"
    docsOnlyManifest.implementations = []
    docsOnlyManifest.validation = {
      status: "passed",
      scope: "package-file-closure",
      behaviorStatus: "not-run",
      behaviorScope: "action-local-program-cases",
      deliveryStatus: "draft",
      retainedActionIds: [],
      unvalidatedActionIds: [],
      rejectedActionIds: [],
      programRuns: 0,
      caseRuns: 0,
      independentCaseRuns: 0,
    }
    await writeFile(docsOnlyManifestPath, `${JSON.stringify(docsOnlyManifest, null, 2)}\n`)
    const docsOnlyVerified = await verifyOptimizedSkillPackage(docsOnlyPackageDir)
    expect(docsOnlyVerified.manifest.implementations).toEqual([])
    expect(docsOnlyVerified.manifest.validation.behaviorStatus).toBe("not-run")
    const docsOnlyConsumption = await runNaturalConsumption(docsOnlyPackageDir, root, "gamma", "docs-only", { invokeHelper: false })
    expect(docsOnlyConsumption.status).toBe("passed")
    expect(docsOnlyConsumption.package.selectedEntrypoints).toEqual([])
    expect(docsOnlyConsumption.consumption.documentationOnly).toBe(true)
    expect(docsOnlyConsumption.consumption.helperInvoked).toBe(false)

    const missingHelperConsumption = await runNaturalConsumption(packageDir, root, "delta", "missing-helper", { invokeHelper: false })
    expect(missingHelperConsumption.verification.taskPassed).toBe(true)
    expect(missingHelperConsumption.status).toBe("failed")
    expect(missingHelperConsumption.consumption.helperInvoked).toBe(false)
    expect(missingHelperConsumption.consumption.consumptionComplete).toBe(false)

    const continuity = {
      sourceRunId: run.id,
      proposalId: (saved.optimization as { proposalId: string }).proposalId,
      selectedRound: 1,
      selectedActionIds: report.resolution.retainedActionIds,
      exportedPackage: packageDir,
      consumedPackage: [original.package.path, changed.package.path],
    }
    expect(continuity.consumedPackage.every((item) => item === continuity.exportedPackage)).toBe(true)
  })

  test("rejects a completion that never consumed its declared helper", () => {
    const steps: AgentStep[] = [{
      role: "tool",
      toolCalls: [{ id: "read", name: "read_file", input: { path: "skill/SKILL.md" }, exitCode: 0 }],
      timestamp: Date.now(),
    }]
    const analysis = analyzeSkillConsumption(steps, {
      executableEntries: ["scripts/convert.mjs"],
      residualWorkRequired: false,
      taskOutcome: "passed",
    })
    expect(analysis.helperInvoked).toBe(false)
    expect(analysis.consumptionComplete).toBe(false)
  })

  test("keeps no-action documentation packages distinct from executable delivery", () => {
    const steps: AgentStep[] = [{
      role: "tool",
      toolCalls: [{ id: "read", name: "read_file", input: { path: "skill/SKILL.md" }, exitCode: 0 }],
      timestamp: Date.now(),
    }]
    const analysis = analyzeSkillConsumption(steps, {
      executableEntries: [],
      documentationOnly: true,
      taskOutcome: "passed",
    })
    expect(analysis.documentationOnly).toBe(true)
    expect(analysis.declaredEntrypoints).toEqual([])
    expect(analysis.helperInvoked).toBe(false)
  })

})
