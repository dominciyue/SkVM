import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  DELAYED_REPLAY_SHAPE,
  DelayedSourceProcessReplayReportSchema,
  runDelayedSourceProcessReplay,
  startDelayedSourceProcessReplayResponder,
  verifyDelayedSourceProcessReplayReport,
} from "./delayed-source-process-replay.ts"
import { parseDelayedSourceProcessReplayArgs } from "./delayed-source-process-replay-run.ts"

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })))
})

function replayRequest(model = "delayed-source-process") {
  return {
    model,
    messages: [{ role: "user", content: "Run the public delayed replay task." }],
    tools: ["read_file", "write_file", "execute_command", "list_directory"].map((name) => ({
      type: "function",
      function: { name, description: name, parameters: { type: "object" } },
    })),
  }
}

describe("delayed source-process replay shape", () => {
  test("covers the frozen successful trajectory envelope mechanically", () => {
    expect(DELAYED_REPLAY_SHAPE.responseDelaysMs).toHaveLength(16)
    expect(DELAYED_REPLAY_SHAPE.responseDelaysMs.reduce((sum, value) => sum + value, 0)).toBe(221_000)
    expect(Math.max(...DELAYED_REPLAY_SHAPE.responseDelaysMs)).toBe(27_000)
    expect(DELAYED_REPLAY_SHAPE.toolCallsPerPhase).toEqual([
      6, 3, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
    ])
    expect(DELAYED_REPLAY_SHAPE.toolCallsPerPhase.reduce((sum, value) => sum + value, 0)).toBe(23)
    expect(Math.max(...DELAYED_REPLAY_SHAPE.toolCallsPerPhase)).toBe(6)
    expect(DELAYED_REPLAY_SHAPE.minimumEnvelopeDurationMs).toBe(220_124)
  })
})

describe("delayed source-process replay responder", () => {
  test("fails closed on a model contract violation", async () => {
    const responder = startDelayedSourceProcessReplayResponder({ delayScale: 0 })
    try {
      const token = "TEST_ONLY_DELAYED_REPLAY_INVALID"
      const response = await fetch(`${responder.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(replayRequest("wrong/model")),
      })
      expect(response.status).toBe(400)
      expect(responder.audit(token)).toMatchObject({
        requests: 1,
        protocolPassed: false,
        failureCode: "model-contract",
      })
    } finally {
      responder.stop()
    }
  })
})

describe("delayed source-process replay runner", () => {
  test("keeps the formal CLI at one row per system and full delay", () => {
    expect(parseDelayedSourceProcessReplayArgs(["--out=results/replay.json"])).toMatchObject({
      out: "results/replay.json",
      verify: undefined,
    })
    expect(parseDelayedSourceProcessReplayArgs(["--verify-only=results/replay.json"])).toMatchObject({
      out: undefined,
      verify: "results/replay.json",
    })
    expect(() => parseDelayedSourceProcessReplayArgs([
      "--out=results/replay.json",
      "--delay-scale=0",
    ])).toThrow("Unknown argument")
    expect(() => parseDelayedSourceProcessReplayArgs([
      "--out=results/replay.json",
      "--systems=no-skill",
    ])).toThrow("Unknown argument")
  })

  test("runs the 16-response shape through the real source child at zero test delay", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "skvm-delayed-source-replay-"))
    temporaryRoots.push(temporaryRoot)
    const rootDir = join(import.meta.dir, "..", "..", "..")
    const nodeExecutable = Bun.which("node")
    expect(nodeExecutable).toBeTruthy()

    const report = await runDelayedSourceProcessReplay({
      rootDir,
      temporaryRoot,
      bunExecutable: process.execPath,
      nodeExecutable: nodeExecutable!,
      delayScale: 0,
    })

    expect(report.runtimePassed).toBe(true)
    expect(report.passed).toBe(false)
    expect(report.counts).toEqual({
      expectedRows: 2,
      observedRows: 2,
      exitZero: 2,
      outputsComplete: 2,
      protocolComplete: 2,
      timeouts: 0,
      bunCrashes: 0,
      nonzeroExits: 0,
    })
    expect(report.rows.map((row) => ({
      system: row.system,
      requests: row.responder.requests,
      toolCalls: row.responder.toolCalls,
      fanOut: row.responder.maximumToolFanOut,
    }))).toEqual([
      { system: "no-skill", requests: 16, toolCalls: 23, fanOut: 6 },
      { system: "original", requests: 16, toolCalls: 23, fanOut: 6 },
    ])
    expect(report.coverage).toEqual({
      responseCountCovered: true,
      toolCallCountCovered: true,
      toolFanOutCovered: true,
      configuredDelayCovered: false,
      wallClockCovered: false,
      successfulEnvelopeCovered: false,
    })
    expect(report.claimBoundary.paidRerunAllowed).toBe(false)

    const partial = structuredClone(report)
    partial.rows[0]!.responder.requests = 5
    partial.rows[0]!.responder.protocolPassed = false
    partial.counts.protocolComplete = 1
    partial.runtimePassed = false
    partial.passed = false
    expect(DelayedSourceProcessReplayReportSchema.safeParse(partial).success).toBe(true)

    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain(temporaryRoot)
    expect(serialized).not.toContain("Run the public delayed replay task")
    expect(serialized).not.toContain("TEST_ONLY_DELAYED_REPLAY")
    expect(serialized).not.toContain("delayed-shell")
  }, 60_000)

  test("detects evidence mutation", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "skvm-delayed-evidence-"))
    temporaryRoots.push(temporaryRoot)
    const rootDir = join(import.meta.dir, "..", "..", "..")
    const nodeExecutable = Bun.which("node")
    expect(nodeExecutable).toBeTruthy()
    const runRoot = await mkdtemp(join(tmpdir(), "skvm-delayed-source-replay-"))
    temporaryRoots.push(runRoot)
    const report = await runDelayedSourceProcessReplay({
      rootDir,
      temporaryRoot: runRoot,
      bunExecutable: process.execPath,
      nodeExecutable: nodeExecutable!,
      delayScale: 0,
    })
    const markerPath = join(temporaryRoot, "marker.ts")
    const initial = "export const marker = true\n"
    await writeFile(markerPath, initial, "utf8")
    report.evidence = [{
      path: "marker.ts",
      sha256: new Bun.CryptoHasher("sha256").update(initial).digest("hex"),
    }]
    await expect(verifyDelayedSourceProcessReplayReport(temporaryRoot, report)).resolves.toBeUndefined()
    await writeFile(markerPath, "export const marker = false\n", "utf8")
    await expect(verifyDelayedSourceProcessReplayReport(temporaryRoot, report)).rejects.toThrow("digest mismatch")
  }, 60_000)
})
