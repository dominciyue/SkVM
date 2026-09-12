import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
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
})
