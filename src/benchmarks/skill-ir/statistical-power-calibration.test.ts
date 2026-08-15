import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  StatisticalPowerDevelopmentAuthorizationSchema,
} from "./statistical-power-contract.ts"
import {
  readAndValidatePublicContractCalibrationLock,
} from "./public-contract-calibration.ts"
import { buildPublicContractCalibrationV3Plan } from "./public-contract-calibration-v3-run.ts"

describe("statistical-power frozen baseline calibration", () => {
  test("validates every committed dependency and stays within the eight-call authorization", async () => {
    const rootDir = process.cwd()
    const lockPath = "benchmarks/skill-ir/pilots/statistical-power/development-calibration-lock.json"
    const parsed = await readAndValidatePublicContractCalibrationLock({ rootDir, lockPath })
    if (parsed.schemaVersion !== "skill-ir-public-contract-calibration-lock/v3") {
      throw new Error("expected resilient calibration lock")
    }
    const authorization = StatisticalPowerDevelopmentAuthorizationSchema.parse(JSON.parse(await readFile(
      path.join(rootDir, "benchmarks/skill-ir/pilots/statistical-power/development-authorization.json"),
      "utf8",
    )))
    const calibration = authorization.phases[0]

    expect(parsed.matrix).toMatchObject({
      targetBlocksPerTask: 2,
      reserveBlocksPerTask: 0,
      expectedSelectedRows: 8,
      maximumAttemptRows: 8,
    })
    expect(parsed.matrix.maximumAttemptRows).toBeLessThanOrEqual(calibration.maxPaidCalls)
    expect(parsed.runtime).toMatchObject({
      absoluteTimeoutMs: 600000,
      idleTimeoutMs: 120000,
      outerWatchdogMs: 660000,
    })

    const plan = await buildPublicContractCalibrationV3Plan({
      rootDir,
      outDir: "results/skill-ir/statistical-power-development-baseline-v1/run",
      lock: parsed,
    })
    expect(plan.plan).toHaveLength(8)
    expect(plan.plan.every((row) =>
      row.command.includes("--timeout-ms=600000")
      && row.command.includes("--idle-timeout-ms=120000")
      && row.command.includes("--max-steps=30")
      && row.command.some((argument) => argument.startsWith("--execution-observation="))
    )).toBe(true)
  })
})
