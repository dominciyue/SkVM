import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { gzipSync } from "node:zlib"
import { adaptTraceFile } from "../../src/jit-optimize/trace-adapters.ts"
import { loadEvidencesFromLogs } from "../../src/jit-optimize/task-source.ts"

const dirs: string[] = []

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "jit-trace-adapter-"))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("adaptTraceFile", () => {
  test("keeps native conversation JSONL compatible and locates its source", async () => {
    const dir = await tempDir()
    const logPath = path.join(dir, "conversation.jsonl")
    await writeFile(logPath, [
      JSON.stringify({ type: "request", ts: "2026-09-13T00:00:00Z", text: "inspect the API" }),
      JSON.stringify({ type: "tool", ts: "2026-09-13T00:00:01Z", name: "read_file" }),
      JSON.stringify({ type: "response", ts: "2026-09-13T00:00:02Z", text: "done" }),
    ].join("\n") + "\n")

    const adapted = await adaptTraceFile(logPath)

    expect(adapted.format).toBe("skvm-conversation-jsonl/v1")
    expect(adapted.representation).toBe("conversation-trace")
    expect(adapted.records).toHaveLength(1)
    expect(adapted.records[0]!.taskPrompt).toBe("inspect the API")
    expect(adapted.records[0]!.conversationLog).toHaveLength(3)
    expect(adapted.records[0]!.source.recordLocator).toBe("lines:1-3")
    expect(adapted.inputSha256).toMatch(/^[a-f0-9]{64}$/)
  })

  test("accepts only the narrow simple-report shape instead of arbitrary JSON", async () => {
    const dir = await tempDir()
    const reportPath = path.join(dir, "report.json")
    const arbitraryPath = path.join(dir, "arbitrary.json")
    await writeFile(reportPath, JSON.stringify({ task: "check output", outcome: "partial", issues: ["missing file"] }))
    await writeFile(arbitraryPath, JSON.stringify({ name: "not a report", value: 3 }))

    const report = await adaptTraceFile(reportPath)
    const arbitrary = await adaptTraceFile(arbitraryPath)

    expect(report.format).toBe("simple-report/v1")
    expect(report.records[0]!.criteria?.[0]?.score).toBe(0.5)
    expect(arbitrary.format).toBe("unrecognized")
    expect(arbitrary.records).toEqual([])
    expect(arbitrary.diagnostics.map((item) => item.code)).toContain("unrecognized-format")
  })

  test("expands Skill IR raw run rows, preserves summary limits, and continues past a bad row", async () => {
    const dir = await tempDir()
    const taskPath = path.join(dir, "task.json")
    const workDir = path.join(dir, "workdir")
    const logPath = path.join(dir, "raw-runs.jsonl")
    await mkdir(workDir)
    await writeFile(taskPath, JSON.stringify({ id: "task-a", prompt: "create an API test plan" }))
    await writeFile(path.join(workDir, "result.json"), "{}\n")
    await writeFile(logPath, [
      JSON.stringify({
        caseId: "api-tester:skvm:windows:clean:task-a",
        system: "original",
        model: "provider/model",
        adapter: "pi",
        adapterVersion: "0.67.68",
        runIndex: 1,
        taskPath,
        skillPath: path.join(dir, "skill", "SKILL.md"),
        workDir,
        exitCode: 0,
        runStatus: "ok",
        durationMs: 1234,
        stdout: "tokens: in=1,234 out=56\nfinal output: created files",
        stderr: "",
        successSource: "execution-only",
      }),
      "{bad-json",
      JSON.stringify({
        caseId: "api-tester:skvm:windows:clean:task-b",
        system: "original",
        adapter: "pi",
        runIndex: 2,
        taskPath: path.join(dir, "missing-task.json"),
        exitCode: 1,
        runStatus: "adapter-error",
        durationMs: 10,
        stdout: "",
        stderr: "failed",
        successSource: "execution-only",
      }),
    ].join("\n") + "\n")

    const adapted = await adaptTraceFile(logPath)

    expect(adapted.format).toBe("skill-ir-raw-run-jsonl/v1")
    expect(adapted.representation).toBe("run-summary")
    expect(adapted.records).toHaveLength(2)
    expect(adapted.records[0]!.taskId).toBe("api-tester:skvm:windows:clean:task-a")
    expect(adapted.records[0]!.taskPrompt).toBe("create an API test plan")
    expect(adapted.records[0]!.conversationLog.at(-1)?.text).toBe("created files")
    expect(adapted.records[0]!.source).toMatchObject({
      sourceAgent: "skvm",
      adapter: "pi",
      model: "provider/model",
      system: "original",
      recordLocator: "line:1",
      representation: "run-summary",
      usage: { inputTokens: 1234, outputTokens: 56, source: "stdout-marker" },
    })
    expect(adapted.records[0]!.source.unknownFields).toContain("conversation.turns")
    expect(adapted.records[0]!.source.unknownFields).toContain("usage.costUsd")
    expect(adapted.records[0]!.source.diagnostics.map((item) => item.code)).not.toContain("workdir-unavailable")
    expect(adapted.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "malformed-row", locator: "line:2" }),
      expect.objectContaining({ code: "task-file-unavailable", locator: "line:3" }),
      expect.objectContaining({ code: "result-missing", locator: "line:3" }),
      expect.objectContaining({ code: "usage-missing", locator: "line:3" }),
    ]))
  })

  test("preserves durable runtime event facts while keeping result and usage unknown", async () => {
    const dir = await tempDir()
    const tracePath = path.join(dir, "runtime-trace.jsonl")
    const common = { schemaVersion: "skill-ir-durable-runtime-trace-event/v1" }
    await writeFile(tracePath, [
      JSON.stringify({ ...common, sequence: 0, turn: 0, elapsedMs: 0, event: "trace-start" }),
      JSON.stringify({ ...common, sequence: 1, turn: 1, elapsedMs: 1, event: "provider-request-start" }),
      JSON.stringify({ ...common, sequence: 2, turn: 1, elapsedMs: 20, event: "provider-response-received", durationMs: 19, stopReason: "tool-use", toolCount: 1, maximumToolFanOut: 1, toolTypes: { readFile: 1, writeFile: 0, executeCommand: 0, listDirectory: 0, webFetch: 0, other: 0 } }),
      JSON.stringify({ ...common, sequence: 3, turn: 1, elapsedMs: 21, event: "new-future-event", visible: true }),
    ].join("\n") + "\n")

    const adapted = await adaptTraceFile(tracePath)

    expect(adapted.format).toBe("skill-ir-durable-runtime-trace-event/v1")
    expect(adapted.representation).toBe("runtime-event-trace")
    expect(adapted.records).toHaveLength(1)
    expect(adapted.records[0]!.conversationLog).toHaveLength(4)
    expect(adapted.records[0]!.source.unknownFields).toEqual(expect.arrayContaining([
      "taskPrompt",
      "result.content",
      "usage",
    ]))
    expect(adapted.diagnostics).toContainEqual(expect.objectContaining({
      code: "unknown-event",
      locator: "line:4",
    }))
    expect(adapted.records[0]!.conversationLog[3]).toMatchObject({
      type: "tool",
      event: "new-future-event",
      sourceLocator: "line:4",
    })
  })

  test("loads a trace-guided agent report as a full Pi conversation with bound quality", async () => {
    const dir = await tempDir()
    const workDir = path.join(dir, "run", "work")
    const skillDir = path.join(dir, "skill")
    const evidenceDir = path.join(dir, "evidence")
    await Promise.all([
      mkdir(workDir, { recursive: true }),
      mkdir(skillDir, { recursive: true }),
      mkdir(evidenceDir, { recursive: true }),
    ])
    await writeFile(path.join(skillDir, "SKILL.md"), "# API\n")
    const rawTrace = JSON.stringify([
      { type: "message_end", message: { role: "user", content: [{ type: "text", text: "build a checked API plan" }], timestamp: 1 } },
      { type: "message_end", message: {
        role: "assistant",
        content: [{ type: "text", text: "done" }],
        api: "openai-completions",
        provider: "openai",
        model: "model",
        usage: {
          input: 10,
          output: 2,
          cacheRead: 30,
          cacheWrite: 0,
          totalTokens: 42,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: 2,
      } },
    ])
    const tracePath = path.join(evidenceDir, "raw-trace.json")
    const reportPath = path.join(evidenceDir, "report.json")
    await writeFile(tracePath, rawTrace)
    await writeFile(reportPath, JSON.stringify({
      schemaVersion: "skill-ir-trace-guided-agent-consumption/v1",
      identity: "candidate-source-run",
      status: "passed",
      condition: "candidate-source-run",
      source: { skillDir, skillSha256: "a".repeat(64), bindingSha256: "b".repeat(64), inputSha256: "c".repeat(64) },
      runtime: { runDir: path.dirname(workDir), model: "provider/model", driver: "pi", bunVersion: "1.3.14", nodeVersion: "v24.3.0" },
      targetAgent: {
        exitCode: 0,
        runStatus: "ok",
        durationMs: 123,
        usageAvailable: true,
        tokens: { input: 10, output: 2, cacheRead: 30, cacheWrite: 0 },
        reportedCostUsd: 0,
        actualCostUsd: "unknown-provider-pricing",
        finalText: "done",
      },
      verification: { qualityPassed: true, checkerReport: { status: "pass" } },
      trace: { path: "raw-trace.json", sha256: new Bun.CryptoHasher("sha256").update(rawTrace).digest("hex"), eventCount: 2 },
    }))

    const adapted = await adaptTraceFile(reportPath)

    expect(adapted.format).toBe("skill-ir-trace-guided-agent-consumption/v1")
    expect(adapted.representation).toBe("conversation-trace")
    expect(adapted.records[0]!.taskPrompt).toBe("build a checked API plan")
    expect(adapted.records[0]!.criteria?.[0]).toMatchObject({ score: 1, passed: true })
    expect(adapted.records[0]!.source).toMatchObject({
      sourceAgent: "pi",
      model: "provider/model",
      runStatus: "ok",
      workDirPath: workDir,
      usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 30 },
    })
    expect(adapted.diagnostics).toEqual([])
  })

  test("loads a general-skill development report through its bound gzip Pi events", async () => {
    const dir = await tempDir()
    const workDir = path.join(dir, "run", "work")
    const skillDir = path.join(dir, "skill")
    await Promise.all([
      mkdir(workDir, { recursive: true }),
      mkdir(skillDir, { recursive: true }),
    ])
    await writeFile(path.join(skillDir, "SKILL.md"), "# General skill\n")
    const rawEvents = JSON.stringify([
      { type: "message_end", message: { role: "user", content: [{ type: "text", text: "perform the ordinary task" }], timestamp: 1 } },
      { type: "message_end", message: {
        role: "assistant",
        content: [{ type: "text", text: "done" }],
        api: "openai-completions",
        provider: "openai",
        model: "model",
        usage: {
          input: 11,
          output: 3,
          cacheRead: 20,
          cacheWrite: 0,
          totalTokens: 34,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: 2,
      } },
    ])
    const compressed = gzipSync(rawEvents)
    const tracePath = path.join(dir, "run", "agent-events.json.gz")
    const reportPath = path.join(dir, "run", "report.json")
    await writeFile(tracePath, compressed)
    await writeFile(reportPath, JSON.stringify({
      schemaVersion: "skill-ir-general-skill-development/v1",
      status: "passed",
      exposure: "development",
      prompt: "perform the ordinary task",
      package: { kind: "optimized", path: skillDir, manifestIdentity: "source:test", selectedEntrypoints: ["scripts/tool.py"] },
      runtime: {
        runDir: path.dirname(workDir),
        workDir,
        model: "provider/model",
        driver: "pi",
        exitCode: 0,
        timedOut: false,
        durationMs: 321,
        tokens: { input: 11, output: 3, cacheRead: 20, cacheWrite: 0 },
        agentEvents: {
          path: "agent-events.json.gz",
          format: "gzip",
          bytes: compressed.byteLength,
          sha256: new Bun.CryptoHasher("sha256").update(compressed).digest("hex"),
          rawBytes: Buffer.byteLength(rawEvents),
          rawSha256: new Bun.CryptoHasher("sha256").update(rawEvents).digest("hex"),
        },
        reportedCostUsd: 0,
        actualCostUsd: null,
      },
      verification: { taskPassed: true, skillPackagePreserved: true, protectedResourcesPreserved: true, expectedFiles: [], residualEvidenceFiles: [] },
    }))

    const adapted = await adaptTraceFile(reportPath)

    expect(adapted.format).toBe("skill-ir-general-skill-development/v1")
    expect(adapted.representation).toBe("conversation-trace")
    expect(adapted.records).toHaveLength(1)
    expect(adapted.records[0]!.taskPrompt).toBe("perform the ordinary task")
    expect(adapted.records[0]!.criteria?.[0]).toMatchObject({ score: 1, passed: true })
    expect(adapted.records[0]!.source).toMatchObject({
      sourceAgent: "pi",
      model: "provider/model",
      runStatus: "ok",
      skillPath: path.join(skillDir, "SKILL.md"),
      workDirPath: workDir,
      usage: { inputTokens: 11, outputTokens: 3, cacheReadTokens: 20, cacheWriteTokens: 0 },
    })
    expect(adapted.diagnostics).toEqual([])
  })

  test("rejects a general-skill development report whose gzip digest does not match", async () => {
    const dir = await tempDir()
    const compressed = gzipSync("[]")
    const tracePath = path.join(dir, "agent-events.json.gz")
    const reportPath = path.join(dir, "report.json")
    await writeFile(tracePath, compressed)
    await writeFile(reportPath, JSON.stringify({
      schemaVersion: "skill-ir-general-skill-development/v1",
      status: "passed",
      prompt: "perform task",
      package: { kind: "optimized", path: path.join(dir, "skill"), manifestIdentity: "source:test" },
      runtime: {
        workDir: path.join(dir, "work"),
        model: "provider/model",
        driver: "pi",
        exitCode: 0,
        timedOut: false,
        durationMs: 1,
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        agentEvents: {
          path: "agent-events.json.gz",
          format: "gzip",
          bytes: compressed.byteLength,
          sha256: "0".repeat(64),
          rawBytes: 2,
          rawSha256: new Bun.CryptoHasher("sha256").update("[]").digest("hex"),
        },
      },
      verification: { taskPassed: true },
    }))

    const adapted = await adaptTraceFile(reportPath)

    expect(adapted.records).toEqual([])
    expect(adapted.diagnostics).toContainEqual(expect.objectContaining({
      code: "trace-digest-mismatch",
      severity: "error",
    }))
  })
})

describe("loadEvidencesFromLogs adapter integration", () => {
  test("expands records and snapshots the referenced work directory", async () => {
    const dir = await tempDir()
    const workDir = path.join(dir, "workdir")
    const taskPath = path.join(dir, "task.json")
    const logPath = path.join(dir, "raw-runs.jsonl")
    await mkdir(workDir)
    await writeFile(path.join(workDir, "artifact.txt"), "evidence")
    await writeFile(taskPath, JSON.stringify({ prompt: "produce artifact" }))
    await writeFile(logPath, JSON.stringify({
      caseId: "skill:agent:windows:clean:task",
      system: "original",
      adapter: "pi",
      runIndex: 1,
      taskPath,
      workDir,
      exitCode: 0,
      runStatus: "ok",
      durationMs: 20,
      stdout: "final output: done",
      stderr: "",
      successSource: "execution-only",
    }) + "\n")

    const evidence = await loadEvidencesFromLogs({
      kind: "execution-log",
      logs: [{ path: logPath }],
    })

    expect(evidence).toHaveLength(1)
    expect(evidence[0]!.trace?.format).toBe("skill-ir-raw-run-jsonl/v1")
    expect(evidence[0]!.trace?.inputSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(evidence[0]!.workDirSnapshot?.files.get("artifact.txt")).toBe("evidence")
  })

  test("keeps one successful trace analyzable when usage is unavailable", async () => {
    const dir = await tempDir()
    const taskPath = path.join(dir, "task.json")
    const logPath = path.join(dir, "successful-run.jsonl")
    await writeFile(taskPath, JSON.stringify({ prompt: "convert the visible document" }))
    await writeFile(logPath, JSON.stringify({
      caseId: "law-to-markdown:agent:windows:clean:document",
      system: "original",
      adapter: "local-agent",
      runIndex: 1,
      taskPath,
      exitCode: 0,
      runStatus: "ok",
      durationMs: 20,
      stdout: "Final output:\ncreated markdown/document.md",
      stderr: "",
      successSource: "execution-only",
    }) + "\n")

    const evidence = await loadEvidencesFromLogs({
      kind: "execution-log",
      logs: [{ path: logPath }],
    })

    expect(evidence).toHaveLength(1)
    expect(evidence[0]!.trace?.runStatus).toBe("ok")
    expect(evidence[0]!.trace?.usage).toBeUndefined()
    expect(evidence[0]!.trace?.unknownFields).toContain("usage")
    expect(evidence[0]!.taskPrompt).toBe("convert the visible document")
  })

  test("does not count a byte-identical copied source record as another run", async () => {
    const dir = await tempDir()
    const firstPath = path.join(dir, "first.jsonl")
    const copiedPath = path.join(dir, "copied.jsonl")
    const record = [
      JSON.stringify({ type: "request", ts: "2026-09-13T00:00:00Z", text: "inspect one document" }),
      JSON.stringify({ type: "response", ts: "2026-09-13T00:00:01Z", text: "done" }),
    ].join("\n") + "\n"
    await Promise.all([writeFile(firstPath, record), writeFile(copiedPath, record)])

    const evidence = await loadEvidencesFromLogs({
      kind: "execution-log",
      logs: [{ path: firstPath }, { path: copiedPath }],
    })

    expect(evidence).toHaveLength(1)
    expect(evidence[0]!.trace?.inputSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(evidence[0]!.trace?.recordLocator).toBe("lines:1-2")
  })

  test("can select exactly one located record from a genuine multi-run source", async () => {
    const dir = await tempDir()
    const taskPath = path.join(dir, "task.json")
    const logPath = path.join(dir, "runs.jsonl")
    await writeFile(taskPath, JSON.stringify({ prompt: "process the document" }))
    const row = (caseId: string, runIndex: number) => JSON.stringify({
      caseId,
      system: "original",
      adapter: "local-agent",
      runIndex,
      taskPath,
      exitCode: 0,
      runStatus: "ok",
      durationMs: 20,
      stdout: `Tokens: in=10 out=2\nFinal output:\nrun ${runIndex} complete`,
      stderr: "",
      successSource: "execution-only",
    })
    await writeFile(logPath, `${row("document:first", 1)}\n${row("document:second", 2)}\n`)

    const evidence = await loadEvidencesFromLogs({
      kind: "execution-log",
      logs: [{ path: logPath, recordLocators: ["line:2"] }],
    })

    expect(evidence).toHaveLength(1)
    expect(evidence[0]!.taskId).toBe("document:second")
    expect(evidence[0]!.trace?.recordLocator).toBe("line:2")
  })

  test("adapts one digest-bound optimization session and redacts recognizable secrets", async () => {
    const dir = await tempDir()
    const taskPath = path.join(dir, "task", "task.json")
    const skillPath = path.join(dir, "skill", "SKILL.md")
    const conversationPath = path.join(dir, "conversation.jsonl")
    const durablePath = path.join(dir, "runtime-trace.jsonl")
    const resultPath = path.join(dir, "run-result.json")
    const initialPath = path.join(dir, "initial-workdir-manifest.json")
    const manifestPath = path.join(dir, "optimization-session.json")
    await mkdir(path.dirname(taskPath), { recursive: true })
    await mkdir(path.dirname(skillPath), { recursive: true })
    const taskText = `${JSON.stringify({ id: "natural-secret", prompt: "Inspect API_KEY=source-secret", eval: [] })}\n`
    const skillText = "---\nname: session-skill\ndescription: session\n---\nInspect.\n"
    const conversationText = `${JSON.stringify({ type: "response", ts: "now", text: "Bearer runtime-secret" })}\n`
    const durableText = `${JSON.stringify({ schemaVersion: "skill-ir-durable-runtime-trace-event/v1", event: "finalize", sequence: 1, timestamp: "now", runIndex: 0, status: "completed" })}\n`
    const resultText = `${JSON.stringify({
      text: "token=final-secret",
      steps: [{ role: "tool", timestamp: 1, toolCalls: [{ id: "1", name: "read_file", input: { path: "input.txt" }, output: "password=tool-secret" }] }],
      tokens: { input: 5, output: 2, cacheRead: 0, cacheWrite: 0 },
      cost: 0,
      durationMs: 4,
      llmDurationMs: 3,
      workDir: path.join(dir, "work"),
      runStatus: "ok",
      usageAvailable: true,
    })}\n`
    const initialText = `${JSON.stringify({ schemaVersion: "skvm-initial-workdir-manifest/v1", workDir: path.join(dir, "work"), entries: [] })}\n`
    await Promise.all([
      Bun.write(taskPath, taskText),
      Bun.write(skillPath, skillText),
      Bun.write(conversationPath, conversationText),
      Bun.write(durablePath, durableText),
      Bun.write(resultPath, resultText),
      Bun.write(initialPath, initialText),
    ])
    const sha = (value: string) => new Bun.CryptoHasher("sha256").update(value).digest("hex")
    const skillClosureSha = sha(`SKILL.md\0${sha(skillText)}`)
    await Bun.write(manifestPath, `${JSON.stringify({
      schemaVersion: "skvm-run-optimization-session/v1",
      runId: "run-secret",
      startedAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:01.000Z",
      binding: {
        taskId: "natural-secret",
        selectedSkillPath: path.join(dir, "source-skill", "SKILL.md"),
        selectedTaskPath: taskPath,
        workDir: path.join(dir, "work"),
        adapter: "bare-agent",
        model: "x/source",
        skillSha256: skillClosureSha,
        promptSha256: sha("Inspect API_KEY=source-secret"),
      },
      artifacts: {
        manifest: { path: manifestPath },
        skillSnapshot: { path: skillPath, sha256: skillClosureSha },
        taskSnapshot: { path: taskPath, sha256: sha(taskText), bytes: Buffer.byteLength(taskText) },
        conversationTrace: { path: conversationPath, sha256: sha(conversationText), bytes: Buffer.byteLength(conversationText) },
        durableTrace: { path: durablePath, sha256: sha(durableText), bytes: Buffer.byteLength(durableText) },
        runResult: { path: resultPath, sha256: sha(resultText), bytes: Buffer.byteLength(resultText) },
        initialWorkdirManifest: { path: initialPath, sha256: sha(initialText), bytes: Buffer.byteLength(initialText) },
      },
      sourceRun: { status: "completed", runStatus: "ok" },
      capture: {
        status: "complete",
        conversation: { status: "complete" },
        durable: { status: "complete", finalized: true },
        runResult: { status: "complete" },
      },
      handoff: { status: "ready" },
      optimization: { status: "pending" },
    }, null, 2)}\n`)

    const adapted = await adaptTraceFile(manifestPath)
    const serialized = JSON.stringify(adapted)
    expect(adapted.format).toBe("skvm-run-optimization-session/v1")
    expect(adapted.records).toHaveLength(1)
    expect(adapted.records[0]!.source.recordLocator).toBe("run:run-secret")
    expect(adapted.records[0]!.source).toMatchObject({ adapter: "bare-agent", model: "x/source", runStatus: "ok" })
    expect(adapted.records[0]!.source.usage).toMatchObject({ inputTokens: 5, outputTokens: 2 })
    expect(serialized).not.toContain("source-secret")
    expect(serialized).not.toContain("runtime-secret")
    expect(serialized).not.toContain("final-secret")
    expect(serialized).not.toContain("tool-secret")
    expect(await Bun.file(conversationPath).text()).toContain("runtime-secret")

    await Bun.write(conversationPath, `${conversationText} `)
    const tampered = await adaptTraceFile(manifestPath)
    expect(tampered.records).toEqual([])
    expect(tampered.diagnostics.some((item) => item.code === "session-artifact-digest-mismatch")).toBe(true)
  })
})
