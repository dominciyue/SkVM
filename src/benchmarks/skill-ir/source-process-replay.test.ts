import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  runSourceProcessReplay,
  startSourceProcessReplayResponder,
  verifySourceProcessReplayReport,
} from "./source-process-replay.ts"
import { parseSourceProcessReplayArgs } from "./source-process-replay-run.ts"

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })))
})

function replayRequest(model = "source-process") {
  return {
    model,
    messages: [{ role: "user", content: "Run the public replay task." }],
    tools: ["read_file", "write_file", "execute_command"].map((name) => ({
      type: "function",
      function: { name, description: name, parameters: { type: "object" } },
    })),
  }
}

describe("source-process replay responder", () => {
  test("fails closed on a model or phase contract violation", async () => {
    const responder = startSourceProcessReplayResponder()
    try {
      const response = await fetch(`${responder.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: "Bearer TEST_ONLY_SOURCE_REPLAY_INVALID",
          "content-type": "application/json",
        },
        body: JSON.stringify(replayRequest("wrong/model")),
      })
      expect(response.status).toBe(400)
      expect(responder.audit("TEST_ONLY_SOURCE_REPLAY_INVALID")).toMatchObject({
        requests: 1,
        protocolPassed: false,
        failureCode: "model-contract",
      })
    } finally {
      responder.stop()
    }
  })
})

describe("source-process replay runner", () => {
  test("keeps the formal CLI at the frozen 10-per-system shape", () => {
    expect(parseSourceProcessReplayArgs(["--out=results/replay.json"])).toMatchObject({
      out: "results/replay.json",
      verify: undefined,
    })
    expect(parseSourceProcessReplayArgs(["--verify-only=results/replay.json"])).toMatchObject({
      out: undefined,
      verify: "results/replay.json",
    })
    expect(() => parseSourceProcessReplayArgs([
      "--out=results/replay.json",
      "--repetitions-per-system=1",
    ])).toThrow("Unknown argument")
    expect(() => parseSourceProcessReplayArgs([
      "--out=a.json",
      "--verify-only=b.json",
    ])).toThrow("exactly one")
  })

  test("runs no-skill and original through the real source child boundary", async () => {
    const outRoot = await mkdtemp(join(tmpdir(), "skvm-source-process-replay-"))
    temporaryRoots.push(outRoot)
    const rootDir = join(import.meta.dir, "..", "..", "..")
    const nodeExecutable = Bun.which("node")
    expect(nodeExecutable).toBeTruthy()

    const report = await runSourceProcessReplay({
      rootDir,
      temporaryRoot: outRoot,
      bunExecutable: process.execPath,
      nodeExecutable: nodeExecutable!,
      repetitionsPerSystem: 1,
    })

    expect(report.passed).toBe(true)
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
    expect(report.rows.map((row) => [row.system, row.responder.requests])).toEqual([
      ["no-skill", 5],
      ["original", 5],
    ])
    expect(report.bySystem).toEqual({
      "no-skill": {
        rows: 1,
        exitZero: 1,
        outputsComplete: 1,
        protocolComplete: 1,
        failures: 0,
        medianDurationMs: expect.any(Number),
      },
      original: {
        rows: 1,
        exitZero: 1,
        outputsComplete: 1,
        protocolComplete: 1,
        failures: 0,
        medianDurationMs: expect.any(Number),
      },
    })
    expect(report.rows.every((row) => row.outputs.present === 3)).toBe(true)
    expect(report.methodEvidence).toBe(false)
    expect(report.claimBoundary.paidRerunAllowed).toBe(false)

    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain(outRoot)
    expect(serialized).not.toContain("replay-shell")
    expect(serialized).not.toContain("Run the public replay task")
    expect(serialized).not.toContain("TEST_ONLY_SOURCE_REPLAY")
  }, 60_000)

  test("binds source evidence and detects later mutation", async () => {
    const root = await mkdtemp(join(tmpdir(), "skvm-source-process-evidence-"))
    temporaryRoots.push(root)
    await writeFile(join(root, "entry.ts"), "console.log('entry')\n", "utf8")
    const report = {
      schemaVersion: "skill-ir-source-process-replay-report/v1" as const,
      diagnosticId: "test",
      methodEvidence: false as const,
      passed: true,
      runtime: {
        platform: process.platform,
        architecture: process.arch,
        bunVersion: Bun.version,
        bunExecutableSha256: "0".repeat(64),
        nodeExecutableSha256: "1".repeat(64),
      },
      shape: {
        systems: ["no-skill", "original"] as const,
        repetitionsPerSystem: 1,
        expectedRows: 2,
        responsesPerRow: 5,
        requiredOutputs: 3,
      },
      counts: {
        expectedRows: 2,
        observedRows: 2,
        exitZero: 2,
        outputsComplete: 2,
        protocolComplete: 2,
        timeouts: 0,
        bunCrashes: 0,
        nonzeroExits: 0,
      },
      bySystem: {
        "no-skill": { rows: 1, exitZero: 1, outputsComplete: 1, protocolComplete: 1, failures: 0, medianDurationMs: 1 },
        original: { rows: 1, exitZero: 1, outputsComplete: 1, protocolComplete: 1, failures: 0, medianDurationMs: 1 },
      },
      rows: [],
      evidence: [{ path: "entry.ts", sha256: new Bun.CryptoHasher("sha256")
        .update("console.log('entry')\n").digest("hex") }],
      claimBoundary: {
        infrastructureDiagnosticOnly: true as const,
        benchmarkEvidence: false as const,
        skillOptimizationEvidence: false as const,
        modelCapabilityEvidence: false as const,
        tokenEvidence: false as const,
        paidRerunAllowed: false as const,
      },
    }

    await expect(verifySourceProcessReplayReport(root, report)).resolves.toBeUndefined()
    await writeFile(join(root, "entry.ts"), "console.log('mutated')\n", "utf8")
    await expect(verifySourceProcessReplayReport(root, report)).rejects.toThrow("digest mismatch")
  })
})
