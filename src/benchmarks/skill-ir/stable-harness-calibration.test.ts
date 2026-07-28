import { describe, expect, test } from "bun:test"
import path from "node:path"
import {
  StableHarnessCalibrationLockSchema,
  assertStableHarnessTimeoutBudget,
  readAndValidateStableHarnessCalibrationLock,
  summarizeLocalPiQualification,
} from "./stable-harness-calibration.ts"

const FILE = { path: "fixture.json", sha256: "a".repeat(64) }
const rootDir = path.resolve(import.meta.dir, "../../..")
const lockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/v2/experimental-design-v2-pi-calibration-lock.json",
)

const lock = {
  schemaVersion: "skill-ir-stable-harness-calibration-lock/v1",
  status: "preregistered",
  calibrationId: "experimental-design-v2-pi-post-injection-cleanup-v1",
  methodEvidence: false,
  corpus: "pilot",
  skillId: "experimental-design-v2",
  frozenInputs: {
    source: FILE,
    tasks: FILE,
    resourceContract: FILE,
    scorer: FILE,
  },
  benchmarkGuards: [
    { kind: "experimental-design-v2-heldout-freeze", ...FILE },
    { kind: "experimental-design-v2-materialization-audit", ...FILE },
  ],
  harness: {
    adapter: "pi",
    adapterVersion: "0.67.68",
    mode: "managed",
    packageJson: FILE,
    bunLock: FILE,
    adapterSource: FILE,
    orchestration: [FILE, FILE],
    installedPackageJson: "node_modules/@mariozechner/pi-coding-agent/package.json",
    executable: "node_modules/.bin/pi.exe",
  },
  model: { route: "xty/gpt-5.6-sol", family: "gpt" },
  matrix: {
    systems: ["no-skill", "original"],
    contexts: ["clean"],
    agents: ["skvm"],
    environments: ["windows"],
    taskSplit: "development",
    taskIds: [
      "experimental-design-v2-stratified-dev-001",
      "experimental-design-v2-cluster-sequential-dev-002",
    ],
    repetitions: 2,
    expectedRows: 8,
    expectedPairs: 4,
  },
  qualification: {
    system: "original",
    taskId: "experimental-design-v2-cluster-sequential-dev-002",
    runIndex: 1,
  },
  runtime: {
    apiKeyEnv: "SKVM_XTY_API_KEY",
    retries: 0,
    taskTimeoutMs: 300000,
    maxSteps: 30,
    teardownGraceMs: 60000,
    outerWatchdogMs: 360000,
  },
  gate: {
    maximumInfrastructureFailures: 0,
    requireNoSkillNonSaturation: true,
    minimumDifferingPairs: 1,
    requireOriginalNonRegression: false,
  },
  claimBoundary: {
    developmentOnly: true,
    harnessSpecific: true,
    comparableWithBareAgent: false,
    createsBaseIr: false,
    permitsHeldOut: false,
    skillOptimizationEvidence: false,
    tokenEvidence: false,
  },
} as const

describe("stable Pi harness calibration contract", () => {
  test("accepts only the frozen managed Pi 0.67.68 eight-row identity", () => {
    expect(StableHarnessCalibrationLockSchema.parse(lock).matrix.expectedRows).toBe(8)
    expect(() => StableHarnessCalibrationLockSchema.parse({
      ...lock,
      harness: { ...lock.harness, adapterVersion: "latest" },
    })).toThrow()
    expect(() => StableHarnessCalibrationLockSchema.parse({
      ...lock,
      runtime: { ...lock.runtime, retries: 1 },
    })).toThrow()
  })

  test("validates the committed lock against benchmark and installed harness identities", async () => {
    const committed = await readAndValidateStableHarnessCalibrationLock({ rootDir, lockPath })
    expect(committed.harness).toMatchObject({
      adapter: "pi",
      adapterVersion: "0.67.68",
      mode: "managed",
    })
  })

  test("requires the outer watchdog to cover task timeout plus teardown grace", () => {
    expect(assertStableHarnessTimeoutBudget(lock.runtime)).toEqual({
      taskTimeoutMs: 300000,
      teardownGraceMs: 60000,
      outerWatchdogMs: 360000,
      minimumOuterWatchdogMs: 360000,
    })
    expect(() => assertStableHarnessTimeoutBudget({
      ...lock.runtime,
      outerWatchdogMs: 359999,
    })).toThrow("outer watchdog")
  })

  test("summarizes an exact local Pi version probe without retaining streams", () => {
    const report = summarizeLocalPiQualification({
      lock: StableHarnessCalibrationLockSchema.parse(lock),
      execution: {
        exitCode: 0,
        timedOut: false,
        durationMs: 20,
        stdout: "0.67.68\n",
        stderr: "",
      },
    })
    expect(report).toMatchObject({
      status: "passed",
      observedVersion: "0.67.68",
      expectedVersion: "0.67.68",
      exitCode: 0,
      timedOut: false,
    })
    expect(JSON.stringify(report)).not.toContain("0.67.68\\n")
    expect(summarizeLocalPiQualification({
      lock: StableHarnessCalibrationLockSchema.parse(lock),
      execution: {
        exitCode: 0,
        timedOut: false,
        stdout: "0.68.0\n",
        stderr: "",
      },
    }).status).toBe("failed")

    expect(summarizeLocalPiQualification({
      lock: StableHarnessCalibrationLockSchema.parse(lock),
      execution: {
        exitCode: 0,
        timedOut: false,
        stdout: "",
        stderr: "0.67.68\n",
      },
    }).status).toBe("passed")
  })
})
