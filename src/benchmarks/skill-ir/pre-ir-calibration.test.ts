import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  validatePreIrCalibrationLock,
  readAndValidatePreIrCalibrationLock,
} from "./pre-ir-calibration.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const lockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/law-to-markdown/law-to-markdown-pre-ir-calibration-lock.json",
)

async function rawLock(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(lockPath, "utf8")) as Record<string, unknown>
}

describe("pre-IR calibration lock", () => {
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
