import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { emptyTokenUsage, type RunResult } from "../../src/core/types.ts"
import { RunSession } from "../../src/core/run-session.ts"
import { writeInitialWorkdirManifest } from "../../src/core/workdir-manifest.ts"
import { loadRunSkill, loadRunTask } from "../../src/run/index.ts"
import {
  OptimizationSession,
  readOptimizationSession,
} from "../../src/run/optimization-session.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(name: string) {
  const root = await mkdtemp(path.join(tmpdir(), `skvm-opt-session-${name}-`))
  roots.push(root)
  const skillDir = path.join(root, "skill")
  const taskDir = path.join(root, "task")
  const workDir = path.join(root, "work")
  await mkdir(path.join(skillDir, "scripts"), { recursive: true })
  await mkdir(path.join(taskDir, "fixtures"), { recursive: true })
  await mkdir(workDir, { recursive: true })
  await Bun.write(path.join(skillDir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name} test skill\n---\nUse scripts/check.mjs.\n`)
  await Bun.write(path.join(skillDir, "scripts", "check.mjs"), "console.log('ok')\n")
  await Bun.write(path.join(taskDir, "task.json"), `${JSON.stringify({
    id: "same-task",
    prompt: `Inspect ${name} input without exposing API_KEY=secret-value`,
    fixtures: { "inline.txt": `inline-${name}` },
    eval: [],
    timeoutMs: 1000,
    maxSteps: 2,
  })}\n`)
  await Bun.write(path.join(taskDir, "fixtures", "input.txt"), `input-${name}\n`)
  return {
    root,
    sessionsRoot: path.join(root, "sessions"),
    workDir,
    skill: await loadRunSkill(skillDir),
    task: await loadRunTask(path.join(taskDir, "task.json")),
  }
}

function successfulResult(workDir: string): RunResult {
  return {
    text: "done",
    steps: [{
      role: "tool",
      timestamp: 1,
      toolCalls: [{ id: "read-1", name: "read_file", input: { path: "input.txt" }, output: "input" }],
    }],
    tokens: { ...emptyTokenUsage(), input: 12, output: 3 },
    cost: 0,
    durationMs: 25,
    llmDurationMs: 20,
    workDir,
    runStatus: "ok",
    usageAvailable: true,
  }
}

describe("optimization run session binding", () => {
  test("freezes only changed and new post-run files as observed outputs", async () => {
    const item = await fixture("observed-outputs")
    await Bun.write(path.join(item.workDir, "input.txt"), "before\n")
    await Bun.write(path.join(item.workDir, "unchanged.txt"), "same\n")
    const run = await RunSession.start({ type: "run", tag: "observed-outputs", logDir: item.sessionsRoot })
    const session = await OptimizationSession.start({
      runId: run.id, rootDir: item.sessionsRoot, skill: item.skill, task: item.task,
      workDir: item.workDir, adapter: "bare-agent", model: "test/model", optimizationRequested: true,
    })
    await writeInitialWorkdirManifest({
      workDir: item.workDir,
      manifestPath: session.initialWorkdirManifestPath,
      excludedPrefixes: [".skvm"],
    })
    await Bun.write(path.join(item.workDir, "input.txt"), "after\n")
    await Bun.write(path.join(item.workDir, "result.txt"), "result\n")
    await Bun.write(session.conversationTracePath, `${JSON.stringify({ type: "response", ts: "now", text: "done" })}\n`)
    session.runtimeTrace.finalize(1, "completed")

    const completed = await session.complete(successfulResult(item.workDir))
    const observedRef = (completed.artifacts as Record<string, { path: string } | undefined>).observedWorkdirSnapshot
    expect(observedRef).toBeDefined()
    const observed = JSON.parse(await Bun.file(observedRef!.path).text())
    expect(observed.files.map((file: { path: string }) => file.path)).toEqual(["input.txt", "result.txt"])
    expect(observed.files[0].content).toBe("after\n")
    expect(observed.files[1].content).toBe("result\n")
    expect(observed.deleted).toEqual([])
    expect(completed.capture).toMatchObject({ observedOutputs: { status: "complete" } })
  })

  test("bounds the filesystem directory while retaining the full run identity", async () => {
    const item = await fixture("bounded-run-dir")
    const runId = `run-${"a".repeat(150)}`
    const session = await OptimizationSession.start({
      runId, rootDir: item.sessionsRoot, skill: item.skill, task: item.task,
      workDir: item.workDir, adapter: "bare-agent", model: "test/model",
    })

    expect(path.basename(path.dirname(session.manifestPath)).length).toBeLessThanOrEqual(32)
    expect((await readOptimizationSession(session.manifestPath)).runId).toBe(runId)
    await session.fail("interrupted", "test cleanup")
  })

  test("same task twice and two skills in parallel retain unique explicit bindings", async () => {
    const a = await fixture("alpha")
    const b = await fixture("beta")
    const [runA1, runA2, runB] = await Promise.all([
      RunSession.start({ type: "run", tag: "bare-agent-test-same-task", logDir: a.sessionsRoot }),
      RunSession.start({ type: "run", tag: "bare-agent-test-same-task", logDir: a.sessionsRoot }),
      RunSession.start({ type: "run", tag: "bare-agent-test-same-task", logDir: b.sessionsRoot }),
    ])
    expect(new Set([runA1.id, runA2.id, runB.id]).size).toBe(3)

    const [sessionA1, sessionA2, sessionB] = await Promise.all([
      OptimizationSession.start({
        runId: runA1.id, rootDir: a.sessionsRoot, skill: a.skill, task: a.task,
        workDir: a.workDir, adapter: "bare-agent", model: "test/model",
      }),
      OptimizationSession.start({
        runId: runA2.id, rootDir: a.sessionsRoot, skill: a.skill, task: a.task,
        workDir: a.workDir, adapter: "bare-agent", model: "test/model",
      }),
      OptimizationSession.start({
        runId: runB.id, rootDir: b.sessionsRoot, skill: b.skill, task: b.task,
        workDir: b.workDir, adapter: "bare-agent", model: "other/model",
      }),
    ])

    const [manifestA1, manifestA2, manifestB] = await Promise.all([
      readOptimizationSession(sessionA1.manifestPath),
      readOptimizationSession(sessionA2.manifestPath),
      readOptimizationSession(sessionB.manifestPath),
    ])
    expect(manifestA1.runId).not.toBe(manifestA2.runId)
    expect(manifestA1.binding).toMatchObject({
      taskId: "same-task",
      selectedSkillPath: a.skill.skillPath,
      selectedTaskPath: a.task.taskPath,
      workDir: a.workDir,
      adapter: "bare-agent",
      model: "test/model",
    })
    expect(manifestB.binding.selectedSkillPath).toBe(b.skill.skillPath)
    expect(manifestB.binding.model).toBe("other/model")
    expect(manifestA1.binding.skillSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(manifestA1.binding.promptSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(manifestA1.artifacts.skillSnapshot.path).not.toBe(manifestB.artifacts.skillSnapshot.path)

    await Promise.all([
      sessionA1.fail("interrupted", "test cleanup"),
      sessionA2.fail("interrupted", "test cleanup"),
      sessionB.fail("interrupted", "test cleanup"),
    ])
  })

  test("completed capture is ready only when the run result and both trace forms are readable", async () => {
    const item = await fixture("complete")
    const run = await RunSession.start({ type: "run", tag: "complete", logDir: item.sessionsRoot })
    const session = await OptimizationSession.start({
      runId: run.id, rootDir: item.sessionsRoot, skill: item.skill, task: item.task,
      workDir: item.workDir, adapter: "bare-agent", model: "test/model",
    })
    await Bun.write(session.conversationTracePath, [
      JSON.stringify({ type: "request", ts: "now", text: item.task.prompt }),
      JSON.stringify({ type: "response", ts: "now", text: "done", tokens: { input: 12, output: 3 } }),
    ].join("\n") + "\n")
    session.runtimeTrace.providerRequestStart(1)
    session.runtimeTrace.finalize(1, "completed")

    const completed = await session.complete(successfulResult(item.workDir))

    expect(completed.sourceRun).toMatchObject({ status: "completed", runStatus: "ok" })
    expect(completed.capture).toMatchObject({
      status: "complete",
      conversation: { status: "complete" },
      durable: { status: "complete", finalized: true },
      runResult: { status: "complete" },
    })
    expect(completed.handoff).toEqual({ status: "ready" })
    expect(completed.artifacts.runResult.sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  test("successful source result survives an unreadable full trace but automatic handoff is blocked", async () => {
    const item = await fixture("missing-log")
    const run = await RunSession.start({ type: "run", tag: "missing-log", logDir: item.sessionsRoot })
    const session = await OptimizationSession.start({
      runId: run.id, rootDir: item.sessionsRoot, skill: item.skill, task: item.task,
      workDir: item.workDir, adapter: "bare-agent", model: "test/model",
    })
    session.runtimeTrace.finalize(0, "completed")

    const completed = await session.complete(successfulResult(item.workDir))

    expect(completed.sourceRun.status).toBe("completed")
    expect(completed.capture.conversation.status).toBe("failed")
    expect(completed.capture.status).toBe("partial")
    expect(completed.handoff.status).toBe("blocked")
    expect(completed.handoff.reason).toContain("conversation")
    expect(await Bun.file(session.runResultPath).exists()).toBe(true)
  })

  test("an optimization-requested run cannot hand off without the pre-run source-input manifest", async () => {
    const item = await fixture("missing-input-manifest")
    const run = await RunSession.start({ type: "run", tag: "missing-input-manifest", logDir: item.sessionsRoot })
    const session = await OptimizationSession.start({
      runId: run.id, rootDir: item.sessionsRoot, skill: item.skill, task: item.task,
      workDir: item.workDir, adapter: "bare-agent", model: "test/model", optimizationRequested: true,
    })
    await Bun.write(session.conversationTracePath, `${JSON.stringify({ type: "response", ts: "now", text: "done" })}\n`)
    session.runtimeTrace.finalize(0, "completed")

    const completed = await session.complete(successfulResult(item.workDir))

    expect(completed.capture.sourceInputs?.status).toBe("failed")
    expect(completed.capture.status).toBe("partial")
    expect(completed.handoff).toMatchObject({ status: "blocked" })
    expect(completed.handoff.reason).toContain("sourceInputs=failed")
    expect(completed.optimization).toMatchObject({ status: "failed", phase: "capture" })
  })

  test("provider failure and interruption are terminal, retained, and never ready for optimization", async () => {
    const item = await fixture("failed")
    const providerRun = await RunSession.start({ type: "run", tag: "provider", logDir: item.sessionsRoot })
    const interruptedRun = await RunSession.start({ type: "run", tag: "interrupt", logDir: item.sessionsRoot })
    const providerSession = await OptimizationSession.start({
      runId: providerRun.id, rootDir: item.sessionsRoot, skill: item.skill, task: item.task,
      workDir: item.workDir, adapter: "bare-agent", model: "test/model",
    })
    const interruptedSession = await OptimizationSession.start({
      runId: interruptedRun.id, rootDir: item.sessionsRoot, skill: item.skill, task: item.task,
      workDir: item.workDir, adapter: "bare-agent", model: "test/model",
    })

    const failed = await providerSession.fail("provider-error", "provider unavailable")
    const interrupted = await interruptedSession.fail("interrupted", "process stopped")

    expect(failed.sourceRun).toMatchObject({ status: "failed", failureKind: "provider-error" })
    expect(failed.capture.durable).toMatchObject({ status: "partial", finalized: false })
    expect(failed.handoff.status).toBe("blocked")
    expect(interrupted.sourceRun).toMatchObject({ status: "interrupted", failureKind: "interrupted" })
    expect(interrupted.handoff.status).toBe("blocked")
  })

  test("a recovery run receives a fresh session and cannot consume a failed run's partial output", async () => {
    const item = await fixture("recovery")
    await Bun.write(path.join(item.workDir, "user-input.txt"), "keep me\n")
    const firstRun = await RunSession.start({ type: "run", tag: "recovery", logDir: item.sessionsRoot })
    const first = await OptimizationSession.start({
      runId: firstRun.id, rootDir: item.sessionsRoot, skill: item.skill, task: item.task,
      workDir: item.workDir, adapter: "bare-agent", model: "test/model",
    })
    const failedOutput = path.join(path.dirname(first.manifestPath), "partial-package", "result.txt")
    await mkdir(path.dirname(failedOutput), { recursive: true })
    await Bun.write(failedOutput, "unvalidated\n")
    await first.fail("provider-error", "provider stopped after a partial write")

    const secondRun = await RunSession.start({ type: "run", tag: "recovery", logDir: item.sessionsRoot })
    const second = await OptimizationSession.start({
      runId: secondRun.id, rootDir: item.sessionsRoot, skill: item.skill, task: item.task,
      workDir: item.workDir, adapter: "bare-agent", model: "test/model",
    })

    expect(path.dirname(second.manifestPath)).not.toBe(path.dirname(first.manifestPath))
    expect(await Bun.file(path.join(path.dirname(second.manifestPath), "partial-package", "result.txt")).exists()).toBe(false)
    expect(await Bun.file(path.join(item.workDir, "user-input.txt")).text()).toBe("keep me\n")
    await second.fail("interrupted", "test cleanup")
  })
})
