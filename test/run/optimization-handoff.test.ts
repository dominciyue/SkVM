import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { emptyTokenUsage, type AgentAdapter, type RunResult } from "../../src/core/types.ts"
import { RunSession } from "../../src/core/run-session.ts"
import { loadRunSkill, loadRunTask, materializeNaturalRunTask } from "../../src/run/index.ts"
import {
  OptimizationSession,
  readOptimizationSession,
  transitionOptimizationSession,
} from "../../src/run/optimization-session.ts"
import {
  executeRunAndOptimize,
  prepareCapturedSourceEvaluation,
  runCapturedOptimization,
} from "../../src/run/optimization-handoff.ts"
import { loadEvidencesFromLogs } from "../../src/jit-optimize/task-source.ts"
import type { TaskSource } from "../../src/jit-optimize/types.ts"
import { snapshotWorkdir, writeInitialWorkdirManifest } from "../../src/core/workdir-manifest.ts"
import { writePreRunInputSnapshot } from "../../src/run/pre-run-input-snapshot.ts"
import { publishOptimizedSkillPackageAtomically } from "../../src/jit-optimize/package.ts"
import { registerCustomEvaluator, customEvaluators } from "../../src/framework/types.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(name: string) {
  const root = await mkdtemp(path.join(tmpdir(), `skvm-handoff-${name}-`))
  roots.push(root)
  const skillDir = path.join(root, "skill")
  const taskDir = path.join(root, "task")
  const workDir = path.join(root, "work")
  await mkdir(skillDir, { recursive: true })
  await mkdir(taskDir, { recursive: true })
  await mkdir(workDir, { recursive: true })
  await Bun.write(path.join(skillDir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name}\n---\nDo the task.\n`)
  await Bun.write(path.join(taskDir, "task.json"), `${JSON.stringify({ id: name, prompt: "Do it", eval: [] })}\n`)
  const task = await loadRunTask(path.join(taskDir, "task.json"))
  const skill = await loadRunSkill(skillDir)
  const run = await RunSession.start({ type: "run", tag: name, logDir: path.join(root, "sessions") })
  const session = await OptimizationSession.start({
    runId: run.id,
    rootDir: path.join(root, "sessions"),
    skill,
    task,
    workDir,
    adapter: "bare-agent",
    model: "x/source",
    optimizationRequested: true,
  })
  await Bun.write(session.conversationTracePath, `${JSON.stringify({ type: "response", ts: "now", text: "done" })}\n`)
  session.runtimeTrace.finalize(0, "completed")
  await writePreRunInputSnapshot({
    workDir,
    manifestPath: session.preRunInputSnapshotPath,
    excludedPrefixes: [".skvm"],
  })
  await writeInitialWorkdirManifest({ workDir, manifestPath: session.initialWorkdirManifestPath })
  const result: RunResult = {
    text: "done",
    steps: [],
    tokens: { ...emptyTokenUsage(), input: 2, output: 1 },
    cost: 0,
    durationMs: 5,
    llmDurationMs: 4,
    workDir,
    runStatus: "ok",
    usageAvailable: true,
  }
  await session.complete(result)
  return { root, skill, task, workDir, session, result, run }
}

describe("natural task materialization", () => {
  test("writes a minimal internal task with no user-authored task JSON", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skvm-natural-task-"))
    roots.push(root)
    const taskPath = path.join(root, "internal", "task.json")
    const task = await materializeNaturalRunTask({ prompt: "  Inspect this directory  ", taskPath })
    expect(task.prompt).toBe("Inspect this directory")
    expect(task.eval).toEqual([])
    expect(task.taskPath).toBe(path.resolve(taskPath))
    expect(JSON.parse(await Bun.file(taskPath).text())).toMatchObject({ id: task.id, prompt: "Inspect this directory", eval: [] })
    await expect(materializeNaturalRunTask({ prompt: "   ", taskPath: path.join(root, "empty.json") })).rejects.toThrow("non-whitespace")
  })
})

describe("captured optimization handoff", () => {
  test("prepares declared local checks without invoking an LLM judge", async () => {
    const item = await fixture("source-evaluation")
    await Bun.write(path.join(item.workDir, "result.txt"), "ok\n")
    const task = {
      ...item.task,
      eval: [
        { method: "file-check" as const, id: "result", path: "result.txt", mode: "exact" as const, expected: "ok\n" },
        { method: "llm-judge" as const, id: "judge", rubric: "looks good", maxScore: 1 },
      ],
    }

    const prepared = await prepareCapturedSourceEvaluation(task, {
      ...item.result,
      workDir: item.workDir,
    })

    expect(prepared.results).toHaveLength(1)
    expect(prepared.results[0]).toMatchObject({ pass: true, criterion: { id: "result" } })
    expect(prepared.skipped).toEqual([{ criterionId: "judge", reason: "llm-judge-requires-an-additional-model-call" }])
    expect(prepared.errors).toEqual([])
  })

  test("evaluates a user-only view without deployed skill resources", async () => {
    const item = await fixture("source-evaluation-isolation")
    const helperPath = path.join(item.skill.skillDir, "helper.txt")
    await Bun.write(helperPath, "framework helper\n")
    const skill = { ...item.skill, bundleFiles: ["helper.txt"] }
    await mkdir(path.join(item.workDir, ".skvm", "skills", item.skill.skillId), { recursive: true })
    await Bun.write(path.join(item.workDir, ".skvm", "skills", item.skill.skillId, "SKILL.md"), item.skill.skillContent)
    await Bun.write(path.join(item.workDir, "helper.txt"), "framework helper\n")
    await Bun.write(path.join(item.workDir, "result.txt"), "user output\n")
    const evaluatorId = "test-source-evaluation-isolation"
    registerCustomEvaluator(evaluatorId, {
      async run({ runResult }) {
        const paths = (await snapshotWorkdir(runResult.workDir)).map((entry) => entry.path)
        const pass = paths.includes("result.txt")
          && !paths.some((entry) => entry === ".skvm" || entry.startsWith(".skvm/"))
          && !paths.includes("helper.txt")
        return { pass, score: pass ? 1 : 0, details: paths.join(",") }
      },
    })
    try {
      const manifest = await readOptimizationSession(item.session.manifestPath)
      const initial = manifest.artifacts.initialWorkdirManifest
      const task = {
        ...item.task,
        eval: [{ method: "custom" as const, id: "isolated", evaluatorId }],
      }
      const prepared = await prepareCapturedSourceEvaluation(task, {
        ...item.result,
        initialWorkdirManifest: { path: initial.path, sha256: initial.sha256! },
      }, { skill })
      expect(prepared.results).toMatchObject([{ pass: true, criterion: { id: "isolated" } }])
    } finally {
      customEvaluators.delete(evaluatorId)
    }
  })

  test("rejects a captured session from an adapter the automatic handoff does not support", async () => {
    const item = await fixture("unsupported-adapter")
    const manifest = await readOptimizationSession(item.session.manifestPath)
    await Bun.write(item.session.manifestPath, `${JSON.stringify({
      ...manifest,
      binding: { ...manifest.binding, adapter: "opencode" },
    }, null, 2)}\n`)
    let calls = 0

    await expect(runCapturedOptimization({
      manifestPath: item.session.manifestPath,
      optimizerModel: "x/optimizer",
      dependencies: {
        async jitOptimize() { calls++; throw new Error("must not run") },
        async buildPackage() { throw new Error("must not run") },
        async verifyPackage() { throw new Error("must not run") },
        async acquireLock() { calls++; return true },
        async releaseLock() {},
      },
    })).rejects.toThrow("automatic optimization only supports captured bare-agent runs")
    expect(calls).toBe(0)
  })

  test("uses the session manifest once, persists proposal/package refs, and resumes without another model call", async () => {
    const item = await fixture("complete")
    let optimizerCalls = 0
    let packageCalls = 0
    let optimizerEvidencePath = ""
    let optimizerEvidenceBytes = ""
    const proposalDir = path.join(item.root, "proposal")
    const dependencies = {
      async jitOptimize(config: unknown) {
        optimizerCalls++
        const actual = config as { taskSource: TaskSource; skillDir: string; optimizer: { model: string } }
        if (actual.taskSource.kind !== "execution-log") throw new Error("expected execution-log")
        optimizerEvidencePath = actual.taskSource.logs[0]!.path
        expect(path.basename(optimizerEvidencePath)).toBe("optimization-evidence.json")
        expect(optimizerEvidencePath).not.toBe(item.session.manifestPath)
        optimizerEvidenceBytes = await Bun.file(optimizerEvidencePath).text()
        expect(actual.skillDir).toBe(path.dirname((await readOptimizationSession(item.session.manifestPath)).artifacts.skillSnapshot.path))
        expect(actual.optimizer.model).toBe("x/optimizer")
        const evidence = await loadEvidencesFromLogs(actual.taskSource)
        expect(evidence).toHaveLength(1)
        expect(evidence[0]!.trace?.recordLocator).toBe(`run:${item.run.id}`)
        return { proposalId: "proposal-1", proposalDir, bestRound: 1, bestRoundReason: "test", rounds: [], setupCost: {}, totalCost: {} } as never
      },
      async buildPackage({ packageDir }: { packageDir: string }) {
        packageCalls++
        await mkdir(packageDir, { recursive: true })
        await Bun.write(path.join(packageDir, "optimization-manifest.json"), "{}\n")
        return { status: "exported" as const, packageDir, sourceProposalDir: proposalDir, validation: "passed" as const }
      },
      async verifyPackage(packageDir: string) {
        expect(await Bun.file(path.join(packageDir, "optimization-manifest.json")).exists()).toBe(true)
        return {} as never
      },
      async acquireLock() { return true },
      async releaseLock() {},
    }

    const first = await runCapturedOptimization({
      manifestPath: item.session.manifestPath,
      optimizerModel: "x/optimizer",
      dependencies,
    })
    const saved = await readOptimizationSession(item.session.manifestPath)
    expect(first.status).toBe("completed")
    expect(first.resumed).toBe(false)
    expect(saved.optimization).toMatchObject({
      status: "completed",
      optimizerModel: "x/optimizer",
      proposalId: "proposal-1",
      proposalDir,
      packageDir: path.join(path.dirname(item.session.manifestPath), "optimized-skill"),
      evidenceManifestPath: optimizerEvidencePath,
    })
    expect(await Bun.file(optimizerEvidencePath).text()).toBe(optimizerEvidenceBytes)
    expect(saved.optimization && "evidenceSha256" in saved.optimization ? saved.optimization.evidenceSha256 : undefined).toBe(
      new Bun.CryptoHasher("sha256").update(optimizerEvidenceBytes).digest("hex"),
    )

    const resumed = await runCapturedOptimization({
      manifestPath: item.session.manifestPath,
      optimizerModel: "x/optimizer",
      dependencies,
    })
    expect(resumed).toMatchObject({ status: "completed", resumed: true })
    expect(optimizerCalls).toBe(1)
    expect(packageCalls).toBe(1)
  })

  test("refuses to replay an optimizer call whose completion is unknown", async () => {
    const item = await fixture("uncertain")
    await transitionOptimizationSession(item.session.manifestPath, ["pending"], {
      status: "optimizer-running",
      optimizerModel: "x/optimizer",
      startedAt: new Date().toISOString(),
    })
    let calls = 0
    await expect(runCapturedOptimization({
      manifestPath: item.session.manifestPath,
      optimizerModel: "x/optimizer",
      dependencies: {
        async jitOptimize() { calls++; throw new Error("must not run") },
        async buildPackage() { throw new Error("must not run") },
        async verifyPackage() { throw new Error("must not run") },
        async acquireLock() { return true },
        async releaseLock() {},
      },
    })).rejects.toThrow("completion is unknown")
    expect(calls).toBe(0)
  })

  test("refuses to replay a package export whose completion is unknown", async () => {
    const item = await fixture("uncertain-package")
    const proposalDir = path.join(item.root, "proposal")
    const packageDir = path.join(item.root, "package")
    await transitionOptimizationSession(item.session.manifestPath, ["pending"], {
      status: "proposal-ready",
      optimizerModel: "x/optimizer",
      proposalId: "uncertain-package",
      proposalDir,
    })
    await transitionOptimizationSession(item.session.manifestPath, ["proposal-ready"], {
      status: "package-exporting",
      optimizerModel: "x/optimizer",
      proposalId: "uncertain-package",
      proposalDir,
      packageDir,
    })
    let packageCalls = 0
    await expect(runCapturedOptimization({
      manifestPath: item.session.manifestPath,
      optimizerModel: "x/optimizer",
      dependencies: {
        async jitOptimize() { throw new Error("must not run") },
        async buildPackage() { packageCalls++; throw new Error("must not run") },
        async verifyPackage() { throw new Error("must not run") },
        async acquireLock() { return true },
        async releaseLock() {},
      },
    })).rejects.toThrow("completion is unknown")
    expect(packageCalls).toBe(0)
  })

  test("resumes a persisted proposal at package export without another optimizer call", async () => {
    const item = await fixture("proposal-resume")
    const evidencePath = path.join(path.dirname(item.session.manifestPath), "optimization-evidence.json")
    await Bun.write(evidencePath, "frozen\n")
    const evidenceSha256 = new Bun.CryptoHasher("sha256").update("frozen\n").digest("hex")
    const proposalDir = path.join(item.root, "proposal-ready")
    await transitionOptimizationSession(item.session.manifestPath, ["pending"], {
      status: "proposal-ready",
      optimizerModel: "x/optimizer",
      proposalId: "proposal-ready",
      proposalDir,
      evidenceManifestPath: evidencePath,
      evidenceSha256,
    })
    let optimizerCalls = 0
    let packageCalls = 0
    const result = await runCapturedOptimization({
      manifestPath: item.session.manifestPath,
      optimizerModel: "x/optimizer",
      dependencies: {
        async jitOptimize() { optimizerCalls++; throw new Error("must not run") },
        async buildPackage({ packageDir }) {
          packageCalls++
          await mkdir(packageDir, { recursive: true })
          return { status: "exported", packageDir, sourceProposalDir: proposalDir, validation: "passed" }
        },
        async verifyPackage() { return {} as never },
        async acquireLock() { return true },
        async releaseLock() {},
      },
    })
    expect(result).toMatchObject({ status: "completed", resumed: true, proposalId: "proposal-ready" })
    expect(optimizerCalls).toBe(0)
    expect(packageCalls).toBe(1)
  })

  test("retries a known atomic package failure without replaying the source or optimizer", async () => {
    const item = await fixture("package-retry")
    const evidencePath = path.join(path.dirname(item.session.manifestPath), "optimization-evidence.json")
    await Bun.write(evidencePath, "frozen\n")
    const evidenceSha256 = new Bun.CryptoHasher("sha256").update("frozen\n").digest("hex")
    const proposalDir = path.join(item.root, "proposal-ready")
    const packageDir = path.join(item.root, "published")
    await transitionOptimizationSession(item.session.manifestPath, ["pending"], {
      status: "proposal-ready",
      optimizerModel: "x/optimizer",
      proposalId: "package-retry",
      proposalDir,
      evidenceManifestPath: evidencePath,
      evidenceSha256,
    })
    let optimizerCalls = 0
    let packageCalls = 0
    const dependencies = {
      async jitOptimize() { optimizerCalls++; throw new Error("must not run") },
      async buildPackage() {
        packageCalls++
        await publishOptimizedSkillPackageAtomically(packageDir, async (stagingDir) => {
          await Bun.write(path.join(stagingDir, "SKILL.md"), "# staged\n")
          if (packageCalls === 1) throw new Error("injected package failure")
          await Bun.write(path.join(stagingDir, "optimization-manifest.json"), "{}\n")
        })
        return { status: "exported" as const, packageDir, sourceProposalDir: proposalDir, validation: "passed" as const }
      },
      async verifyPackage() { return {} as never },
      async acquireLock() { return true },
      async releaseLock() {},
    }

    await expect(runCapturedOptimization({
      manifestPath: item.session.manifestPath,
      optimizerModel: "x/optimizer",
      packageDir,
      dependencies,
    })).rejects.toThrow("injected package failure")
    await expect(stat(packageDir)).rejects.toThrow()
    expect((await readOptimizationSession(item.session.manifestPath)).optimization).toMatchObject({
      status: "failed",
      phase: "package",
      proposalId: "package-retry",
    })

    const recovered = await runCapturedOptimization({
      manifestPath: item.session.manifestPath,
      optimizerModel: "x/optimizer",
      packageDir,
      dependencies,
    })
    expect(recovered).toMatchObject({ status: "completed", resumed: true, packageDir })
    expect(optimizerCalls).toBe(0)
    expect(packageCalls).toBe(2)
  })

  test("records no-change and optimizer failure as distinct terminal states", async () => {
    const noChange = await fixture("no-change")
    const noChangeResult = await runCapturedOptimization({
      manifestPath: noChange.session.manifestPath,
      optimizerModel: "x/optimizer",
      dependencies: {
        async jitOptimize() {
          return { proposalId: "no-change", proposalDir: path.join(noChange.root, "proposal"), bestRound: 0 } as never
        },
        async buildPackage({ proposalDir }) {
          return { status: "no-change", sourceProposalDir: proposalDir, validation: "not-run" }
        },
        async verifyPackage() { throw new Error("must not run") },
        async acquireLock() { return true },
        async releaseLock() {},
      },
    })
    expect(noChangeResult.status).toBe("no-change")
    expect((await readOptimizationSession(noChange.session.manifestPath)).optimization?.status).toBe("no-change")

    const failed = await fixture("optimizer-failure")
    await expect(runCapturedOptimization({
      manifestPath: failed.session.manifestPath,
      optimizerModel: "x/optimizer",
      dependencies: {
        async jitOptimize() { throw new Error("provider offline") },
        async buildPackage() { throw new Error("must not run") },
        async verifyPackage() { throw new Error("must not run") },
        async acquireLock() { return true },
        async releaseLock() {},
      },
    })).rejects.toThrow("provider offline")
    expect((await readOptimizationSession(failed.session.manifestPath)).optimization).toMatchObject({
      status: "failed",
      phase: "optimizer",
      error: "provider offline",
    })
  })

  test("executes the source task once and preserves its result when optimization fails", async () => {
    const item = await fixture("source-once")
    let sourceCalls = 0
    const adapter: AgentAdapter = { name: "bare-agent", async setup() {}, async run() { return item.result }, async teardown() {} }
    const outcome = await executeRunAndOptimize({
      session: item.session,
      task: item.task,
      skill: item.skill,
      adapter,
      adapterConfig: { model: "x/source", maxSteps: 1, timeoutMs: 1000 },
      workDir: item.workDir,
      optimizerModel: "x/optimizer",
      dependencies: {
        async executeRun() { sourceCalls++; return { task: item.task, skill: item.skill, runResult: item.result, workDir: item.workDir } },
        async runCapturedOptimization() { throw new Error("optimizer unavailable") },
      },
    })
    expect(sourceCalls).toBe(1)
    expect(outcome.source.runResult.text).toBe("done")
    expect(outcome.optimization).toEqual({ status: "failed", error: "optimizer unavailable" })
  })
})
