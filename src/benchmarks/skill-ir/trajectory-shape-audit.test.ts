import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  buildTrajectoryShapeAudit,
  verifyTrajectoryShapeAuditReport,
} from "./trajectory-shape-audit.ts"
import { parseTrajectoryShapeAuditArgs } from "./trajectory-shape-audit-run.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function writeJson(path: string, value: unknown) {
  await mkdir(join(path, ".."), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "skvm-trajectory-audit-"))
  roots.push(root)
  const rawPath = join(root, "results", "raw-runs.jsonl")
  const planPath = join(root, "results", "plan.json")
  const replayReportPath = join(root, "results", "replay.json")
  const sessionsPath = join(root, ".skvm", "log", "sessions.jsonl")
  const logRoot = join(root, ".skvm", "log")
  const caseId = "experimental-design-v2:skvm:windows:clean:public-task-001"
  const rows = [
    {
      caseId,
      system: "no-skill",
      runIndex: 1,
      exitCode: 0,
      durationMs: 10_100,
      stdout: "PRIVATE_STDOUT",
      stderr: "",
    },
    {
      caseId,
      system: "original",
      runIndex: 1,
      exitCode: 3,
      durationMs: 9_900,
      stdout: "",
      stderr: "panic(main thread): Internal assertion failure PRIVATE_STDERR",
    },
  ]
  await mkdir(join(root, "results"), { recursive: true })
  await writeFile(rawPath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8")
  await writeJson(planPath, {
    schemaVersion: "skill-ir-pre-ir-calibration-plan/v1",
    lock: { matrix: { expectedRows: 2 } },
    plan: rows.map(({ caseId, system, runIndex }) => ({ caseId, system, runIndex })),
  })
  await writeJson(replayReportPath, {
    schemaVersion: "skill-ir-source-process-replay-report/v1",
    shape: { responsesPerRow: 5 },
    rows: [
      { durationMs: 500, responder: { requests: 5 } },
      { durationMs: 600, responder: { requests: 5 } },
    ],
  })
  const sessions = [
    {
      id: "20260729-010000-run-bare-agent-model-public-task",
      type: "run",
      status: "running",
      startedAt: "2026-07-28T17:00:00.000Z",
      logDir: "runtime/bare-agent/model/public-task-001-clean",
      models: ["model"],
      harness: "bare-agent",
    },
    {
      id: "20260729-010000-run-bare-agent-model-public-task",
      type: "run",
      status: "completed",
      startedAt: "2026-07-28T17:00:00.000Z",
      completedAt: "2026-07-28T17:00:10.000Z",
      logDir: "runtime/bare-agent/model/public-task-001-clean",
      models: ["model"],
      harness: "bare-agent",
    },
    {
      id: "20260729-010010-run-bare-agent-model-public-task",
      type: "run",
      status: "running",
      startedAt: "2026-07-28T17:00:10.100Z",
      logDir: "runtime/bare-agent/model/public-task-001-clean",
      models: ["model"],
      harness: "bare-agent",
    },
  ]
  await mkdir(join(root, ".skvm", "log"), { recursive: true })
  await writeFile(sessionsPath, `${sessions.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8")
  const conversationDir = join(logRoot, "20260729-010000-run")
  await mkdir(conversationDir, { recursive: true })
  const conversation = [
    {
      type: "request",
      method: "POST",
      system: "PRIVATE_SYSTEM_SECRET",
      messages: [{ role: "user", content: "PRIVATE_PROMPT_SECRET" }],
    },
    {
      type: "response",
      durationMs: 4_000,
      stopReason: "tool_use",
      text: "PRIVATE_MODEL_SECRET",
      tokens: 999,
      toolCalls: [
        { name: "read_file", arguments: { path: "C:/PRIVATE/SECRET" } },
        { name: "private_tool_name", arguments: { secret: "PRIVATE_TOOL_SECRET" } },
      ],
    },
    {
      type: "request",
      method: "POST",
      system: "PRIVATE_SYSTEM_SECRET",
      messages: [],
      toolResults: [{ output: "PRIVATE_TOOL_RESULT" }],
    },
    {
      type: "response",
      durationMs: 5_000,
      stopReason: "end_turn",
      text: "PRIVATE_FINAL_SECRET",
      tokens: 100,
      toolCalls: [],
    },
  ]
  const conversationPath = join(conversationDir, "conv-001-public-task.jsonl")
  await writeFile(
    conversationPath,
    `${conversation.map((row) => JSON.stringify(row)).join("\n")}\n`,
    "utf8",
  )
  return {
    root,
    rawPath,
    planPath,
    replayReportPath,
    sessionsPath,
    logRoot,
    matrixStartSessionId: sessions[0]!.id,
    conversationPath,
  }
}

describe("trajectory shape audit", () => {
  test("projects completed trajectories while preserving unavailable crash semantics", async () => {
    const input = await fixture()
    const report = await buildTrajectoryShapeAudit(input)

    expect(report.counts).toEqual({
      rows: 2,
      exitZero: 1,
      infrastructureFailures: 1,
      trajectoryAvailable: 1,
      trajectoryUnavailable: 1,
    })
    expect(report.rows[0]).toMatchObject({
      system: "no-skill",
      trajectoryAvailable: true,
      unavailableReason: null,
      trajectory: {
        requestCount: 2,
        responseCount: 2,
        toolCallCount: 2,
        toolTypeCounts: {
          readFile: 1,
          writeFile: 0,
          executeCommand: 0,
          listDirectory: 0,
          webFetch: 0,
          other: 1,
        },
        maxToolFanOut: 2,
        finalizedEndTurn: true,
      },
    })
    expect(report.rows[1]).toMatchObject({
      system: "original",
      runtimeOutcome: "bun-internal-assertion",
      trajectoryAvailable: false,
      unavailableReason: "session-not-finalized",
      trajectory: null,
    })
    expect(report.successfulEnvelope).toMatchObject({
      observedRows: 1,
      maximumResponseCount: 2,
      maximumToolCallCount: 2,
      maximumToolFanOut: 2,
      maximumRawDurationMs: 10_100,
    })
    expect(report.replayCoverage).toEqual({
      responseCountCovered: true,
      toolCallCountCovered: true,
      toolFanOutCovered: true,
      endToEndDurationCovered: false,
      successfulEnvelopeCovered: false,
    })
    expect(report.claimBoundary).toMatchObject({
      crashTrajectoryObservable: false,
      paidRerunAllowed: false,
      skillOptimizationEvidence: false,
    })

    const serialized = JSON.stringify(report)
    for (const forbidden of [
      input.root,
      "PRIVATE_",
      "private_tool_name",
      "messages",
      "arguments",
      "toolResults",
      "tokens",
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  test("fails closed when a completed session has no finalized conversation", async () => {
    const input = await fixture()
    await rm(input.conversationPath)
    await expect(buildTrajectoryShapeAudit(input)).rejects.toThrow("completed session conversation")
  })

  test("fails closed when raw duration does not match an observable session boundary", async () => {
    const input = await fixture()
    const rows = (await Bun.file(input.rawPath).text()).trim().split(/\r?\n/).map((line) => JSON.parse(line))
    rows[0].durationMs = 99_000
    await writeFile(input.rawPath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8")
    await expect(buildTrajectoryShapeAudit(input)).rejects.toThrow("duration mismatch")
  })

  test("binds every consumed input and detects mutation", async () => {
    const input = await fixture()
    const report = await buildTrajectoryShapeAudit(input)
    await expect(verifyTrajectoryShapeAuditReport(input.root, report)).resolves.toBeUndefined()
    await writeFile(input.conversationPath, "{}\n", "utf8")
    await expect(verifyTrajectoryShapeAuditReport(input.root, report)).rejects.toThrow("digest mismatch")
  })

  test("keeps formal CLI inputs frozen", () => {
    expect(parseTrajectoryShapeAuditArgs(["--out=results/audit.json"])).toMatchObject({
      out: "results/audit.json",
      verify: undefined,
    })
    expect(parseTrajectoryShapeAuditArgs(["--verify-only=results/audit.json"])).toMatchObject({
      out: undefined,
      verify: "results/audit.json",
    })
    expect(() => parseTrajectoryShapeAuditArgs([
      "--out=results/audit.json",
      "--matrix-start=changed",
    ])).toThrow("Unknown argument")
  })
})
