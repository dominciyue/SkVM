import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  PreIrCalibrationLockSchema,
  validatePreIrCalibrationLock,
  readAndValidatePreIrCalibrationLock,
} from "./pre-ir-calibration.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const lockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/law-to-markdown/law-to-markdown-pre-ir-calibration-lock.json",
)
const v2LockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/v2/experimental-design-v2-pre-ir-calibration-lock.json",
)
const v2RuntimeLockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/v2/experimental-design-v2-runtime-qualified-calibration-lock.json",
)
const v2ConfigBoundLockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/v2/experimental-design-v2-config-bound-calibration-lock.json",
)
const v2ExplicitChildEnvLockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/v2/experimental-design-v2-explicit-child-env-calibration-lock.json",
)
const v2Bun1313FetchActiveLockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/v2/experimental-design-v2-bun-1.3.13-fetch-active-calibration-lock.json",
)
const v2Bun1313CalibrationLockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/v2/experimental-design-v2-bun-1.3.13-calibration-lock.json",
)
const v2NodeHttpFetchActiveLockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/v2/experimental-design-v2-node-http-fetch-active-calibration-lock.json",
)
const v2NodeHttpCalibrationLockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/v2/experimental-design-v2-node-http-calibration-lock.json",
)

async function rawLock(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(lockPath, "utf8")) as Record<string, unknown>
}

describe("pre-IR calibration lock", () => {
  test("validates the experimental-design v2 lock and both pre-route benchmark guards", async () => {
    const lock = await readAndValidatePreIrCalibrationLock({ rootDir, lockPath: v2LockPath })

    expect(lock).toMatchObject({
      schemaVersion: "skill-ir-pre-ir-calibration-lock/v2",
      calibrationId: "experimental-design-v2-materialized-delta-calibration-v1",
      skillId: "experimental-design-v2",
      frozenInputs: {
        tasks: { path: "benchmarks/skill-ir/pilots/experimental-design/v2/development/tasks.json" },
        scorer: { path: "src/bench/evaluators/experimental-design-grade-v2.ts" },
      },
      benchmarkGuards: [
        {
          kind: "experimental-design-v2-heldout-freeze",
          path: "benchmarks/skill-ir/pilots/experimental-design/v2/heldout-freeze.json",
        },
        {
          kind: "experimental-design-v2-materialization-audit",
          path: "results/skill-ir/benchmark-contract-audit/experimental-design-v2-materialization.json",
        },
      ],
    })
  })

  test("rejects experimental-design v2 calibration when either benchmark guard drifts", async () => {
    const base = JSON.parse(await readFile(v2LockPath, "utf8")) as {
      benchmarkGuards: Array<{ sha256: string }>
    }
    for (const index of [0, 1]) {
      const lock = structuredClone(base)
      lock.benchmarkGuards[index]!.sha256 = "0".repeat(64)
      await expect(validatePreIrCalibrationLock(lock, rootDir)).rejects.toThrow("digest mismatch")
    }
  })

  test("accepts a distinct runtime-qualified lock identity with an explicit compiled runtime guard", async () => {
    const base = JSON.parse(await readFile(v2LockPath, "utf8")) as Record<string, unknown>
    const lock = PreIrCalibrationLockSchema.parse({
      ...base,
      schemaVersion: "skill-ir-runtime-qualified-pre-ir-calibration-lock/v1",
      calibrationId: "experimental-design-v2-materialized-delta-compiled-runtime-v2",
      executionRuntime: {
        kind: "compiled-skvm",
        commandMode: "direct",
        sourceCommit: "a".repeat(40),
        executable: { path: ".skvm/runtime/skvm.exe", sha256: "b".repeat(64) },
        qualification: { path: "results/runtime-qualification.json", sha256: "c".repeat(64) },
      },
    })

    expect(lock.schemaVersion).toBe("skill-ir-runtime-qualified-pre-ir-calibration-lock/v1")
    expect("executionRuntime" in lock && lock.executionRuntime.commandMode).toBe("direct")
  })

  test("accepts a distinct Node HTTP transport candidate identity", async () => {
    const base = JSON.parse(await readFile(v2LockPath, "utf8")) as Record<string, unknown>
    const lock = PreIrCalibrationLockSchema.parse({
      ...base,
      schemaVersion: "skill-ir-node-http-runtime-qualified-pre-ir-calibration-lock/v1",
      calibrationId: "experimental-design-v2-node-http-candidate-v1",
      executionRuntime: {
        kind: "compiled-skvm",
        commandMode: "direct",
        sourceCommit: "a".repeat(40),
        executable: { path: ".skvm/runtime/skvm.exe", sha256: "b".repeat(64) },
        qualification: { path: "results/runtime-qualification.json", sha256: "c".repeat(64) },
      },
      nodeHttpTransport: {
        kind: "node-http-helper",
        nodeExecutable: { path: ".skvm/runtime/node.exe", sha256: "d".repeat(64) },
        helper: { path: "src/providers/openai-compatible-node-helper.mjs", sha256: "e".repeat(64) },
      },
    })

    expect(lock.schemaVersion).toBe("skill-ir-node-http-runtime-qualified-pre-ir-calibration-lock/v1")
    expect("nodeHttpTransport" in lock && lock.nodeHttpTransport.kind).toBe("node-http-helper")
  })

  test("rejects the historical Node HTTP candidate after final-lock verification evolves", async () => {
    await expect(readAndValidatePreIrCalibrationLock({
      rootDir,
      lockPath: v2NodeHttpFetchActiveLockPath,
    })).rejects.toThrow("orchestration src/benchmarks/skill-ir/pre-ir-calibration.ts digest mismatch")
  })

  test("validates the fetch-qualified Node HTTP matrix identity", async () => {
    const lock = await readAndValidatePreIrCalibrationLock({
      rootDir,
      lockPath: v2NodeHttpCalibrationLockPath,
    })

    expect(lock).toMatchObject({
      schemaVersion: "skill-ir-node-http-fetch-qualified-pre-ir-calibration-lock/v1",
      calibrationId: "experimental-design-v2-materialized-delta-node-http-calibration-v1",
      fetchActiveQualification: {
        kind: "fetch-active-runtime-qualification",
        path: "results/skill-ir/experimental-design-v2-node-http-fetch-active-qualification-2026-07-27.json",
        candidateLock: {
          path: "benchmarks/skill-ir/pilots/experimental-design/v2/experimental-design-v2-node-http-fetch-active-calibration-lock.json",
        },
      },
      nodeHttpTransport: { kind: "node-http-helper" },
    })
  })

  test("validates the committed runtime-qualified experimental-design v2 lock", async () => {
    const lock = await readAndValidatePreIrCalibrationLock({ rootDir, lockPath: v2RuntimeLockPath })

    expect(lock).toMatchObject({
      schemaVersion: "skill-ir-runtime-qualified-pre-ir-calibration-lock/v1",
      calibrationId: "experimental-design-v2-materialized-delta-compiled-runtime-v2",
      adapter: { version: "compiled-experimental-design-v2-materialized-delta-v1" },
      executionRuntime: {
        kind: "compiled-skvm",
        commandMode: "direct",
        executable: { path: "dist/skvm.exe" },
        qualification: {
          path: "results/skill-ir/experimental-design-v2-runtime-qualification-2026-07-27.json",
        },
      },
    })
  })

  test("validates the committed config-bound replacement identity", async () => {
    const lock = await readAndValidatePreIrCalibrationLock({ rootDir, lockPath: v2ConfigBoundLockPath })

    expect(lock).toMatchObject({
      calibrationId: "experimental-design-v2-materialized-delta-config-bound-runtime-v1",
      adapter: { version: "compiled-experimental-design-v2-config-bound-v1" },
      executionRuntime: { cacheRoot: ".skvm" },
    })
  })

  test("rejects the historical explicit-child-env identity after bound orchestration drifts", async () => {
    await expect(readAndValidatePreIrCalibrationLock({
      rootDir,
      lockPath: v2ExplicitChildEnvLockPath,
    })).rejects.toThrow("orchestration src/benchmarks/skill-ir/pre-ir-calibration-run.ts digest mismatch")
  })

  test("rejects the historical fetch-active candidate after bound orchestration drifts", async () => {
    await expect(readAndValidatePreIrCalibrationLock({
      rootDir,
      lockPath: v2Bun1313FetchActiveLockPath,
    })).rejects.toThrow("orchestration src/benchmarks/skill-ir/pre-ir-calibration-run.ts digest mismatch")
  })

  test("rejects the historical fetch-qualified matrix after transport orchestration evolves", async () => {
    await expect(readAndValidatePreIrCalibrationLock({
      rootDir,
      lockPath: v2Bun1313CalibrationLockPath,
    })).rejects.toThrow("orchestration src/benchmarks/skill-ir/pre-ir-calibration.ts digest mismatch")
  })

  test("rejects fetch-qualified calibration when the report or candidate lock identity drifts", async () => {
    const base = JSON.parse(await readFile(v2Bun1313CalibrationLockPath, "utf8")) as {
      fetchActiveQualification: {
        sha256: string
        candidateLock: { sha256: string }
      }
    }
    const reportDrift = structuredClone(base)
    reportDrift.fetchActiveQualification.sha256 = "0".repeat(64)
    await expect(validatePreIrCalibrationLock(reportDrift, rootDir)).rejects.toThrow("digest mismatch")

    const candidateDrift = structuredClone(base)
    candidateDrift.fetchActiveQualification.candidateLock.sha256 = "0".repeat(64)
    await expect(validatePreIrCalibrationLock(candidateDrift, rootDir)).rejects.toThrow("digest mismatch")
  })

  test("validates the committed law-to-markdown 8-generation identity", async () => {
    const lock = await readAndValidatePreIrCalibrationLock({ rootDir, lockPath })

    expect(lock).toMatchObject({
      schemaVersion: "skill-ir-pre-ir-calibration-lock/v1",
      calibrationId: "law-to-markdown-pre-ir-calibration-v1",
      methodEvidence: false,
      corpus: "pilot",
      skillId: "law-to-markdown",
      model: { route: "xty/gpt-5.6-sol", family: "gpt" },
      adapter: { id: "bare-agent", version: "workspace-law-pre-ir-v1" },
      matrix: {
        systems: ["no-skill", "original"],
        contexts: ["clean"],
        agents: ["skvm"],
        environments: ["windows"],
        taskSplit: "development",
        taskIds: [
          "law-to-markdown-statute-dev-001",
          "law-to-markdown-standard-dev-002",
        ],
        repetitions: 2,
        expectedRows: 8,
        expectedPairs: 4,
      },
      runtime: {
        apiKeyEnv: "SKVM_XTY_API_KEY",
        pythonEnv: "SKVM_PYTHON",
        retries: 0,
        resourceProbeRequired: true,
        routeProbeRequired: true,
      },
    })
    expect(lock.prohibited).toEqual(expect.arrayContaining([
      "held-out execution",
      "base IR materialization",
      "scorer retuning from calibration output",
    ]))
    expect(await readFile(lockPath, "utf8")).not.toMatch(/sk-[A-Za-z0-9_-]{16,}/)
  })

  test("rejects digest drift, IR systems, retries, and held-out task selection", async () => {
    const digestDrift = await rawLock()
    ;(digestDrift.frozenInputs as { tasks: { sha256: string } }).tasks.sha256 = "0".repeat(64)
    await expect(validatePreIrCalibrationLock(digestDrift, rootDir)).rejects.toThrow("digest mismatch")

    const irSystem = await rawLock()
    ;(irSystem.matrix as { systems: string[] }).systems = ["no-skill", "ir-static"]
    await expect(validatePreIrCalibrationLock(irSystem, rootDir)).rejects.toThrow()

    const retries = await rawLock()
    ;(retries.runtime as { retries: number }).retries = 1
    await expect(validatePreIrCalibrationLock(retries, rootDir)).rejects.toThrow()

    const heldOut = await rawLock()
    ;(heldOut.matrix as { taskIds: string[] }).taskIds = [
      "law-to-markdown-statute-dev-001",
      "law-to-markdown-regulation-heldout-001",
    ]
    await expect(validatePreIrCalibrationLock(heldOut, rootDir)).rejects.toThrow("non-development")
  })

  test("rejects corpus status drift or an injected base IR", async () => {
    const lock = await rawLock()
    const manifestPath = path.join(rootDir, "benchmarks/skill-ir/corpus/corpora/pilot.json")
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      skills: Array<Record<string, unknown>>
    }
    const skill = manifest.skills.find((entry) => entry.id === "law-to-markdown")!

    skill.status = "runnable"
    await expect(validatePreIrCalibrationLock(lock, rootDir, {
      manifest,
      requireExecutionState: true,
    })).rejects.toThrow("lifecycle state")

    skill.status = "tasks-authored"
    skill.irPath = "benchmarks/skill-ir/pilots/law-to-markdown/base-ir.json"
    await expect(validatePreIrCalibrationLock(lock, rootDir, {
      manifest,
      requireExecutionState: true,
    })).rejects.toThrow("lifecycle state")
  })
})
