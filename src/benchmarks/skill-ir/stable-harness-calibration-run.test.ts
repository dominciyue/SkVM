import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  buildStableHarnessCalibrationPlan,
  buildStableHarnessQualificationReport,
  selectStableHarnessQualificationRow,
} from "./stable-harness-calibration-run.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const lockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/v2/experimental-design-v2-pi-calibration-lock.json",
)
let outDir: string

beforeAll(async () => {
  outDir = await mkdtemp(path.join(tmpdir(), "skill-ir-stable-harness-plan-"))
})

afterAll(async () => {
  await rm(outDir, { recursive: true, force: true })
})

describe("stable Pi harness calibration runner", () => {
  test("builds exactly four complete development pairs with frozen runtime arguments", async () => {
    const built = await buildStableHarnessCalibrationPlan({
      rootDir,
      lockPath,
      outDir,
      phase: "plan",
    })
    expect(built.plan).toHaveLength(8)
    expect(new Set(built.plan.map((row) => `${row.caseId}:${row.runIndex}`)).size).toBe(4)
    for (const row of built.plan) {
      expect(row.adapter).toBe("pi")
      expect(row.adapterVersion).toBe("0.67.68")
      expect(row.command).toContain("--adapter-config=managed")
      expect(row.command).toContain("--timeout-ms=300000")
      expect(row.command).toContain("--max-steps=30")
    }
  })

  test("selects exactly the preregistered original qualification row", async () => {
    const built = await buildStableHarnessCalibrationPlan({
      rootDir,
      lockPath,
      outDir,
      phase: "qualification",
    })
    const row = selectStableHarnessQualificationRow(built.plan, built.lock)
    expect(row).toMatchObject({
      system: "original",
      runIndex: 1,
      adapter: "pi",
    })
    expect(row.caseId).toEndWith(":experimental-design-v2-cluster-sequential-dev-002")
  })

  test("passes qualification only when local Pi, resource probe, route, and outputs all pass", async () => {
    const built = await buildStableHarnessCalibrationPlan({
      rootDir,
      lockPath,
      outDir,
      phase: "qualification",
    })
    const row = selectStableHarnessQualificationRow(built.plan, built.lock)
    const report = buildStableHarnessQualificationReport({
      lock: built.lock,
      localPi: {
        schemaVersion: "skill-ir-local-pi-qualification/v1",
        calibrationId: built.lock.calibrationId,
        methodEvidence: false,
        status: "passed",
        executable: built.lock.harness.executable,
        expectedVersion: "0.67.68",
        observedVersion: "0.67.68",
        exitCode: 0,
        timedOut: false,
      },
      resourceProbe: {
        schemaVersion: "skill-ir-resource-probe-result/v1",
        methodEvidence: false,
        status: "ok",
        executableSource: "fallback",
        requiredModules: [],
        exitCode: 0,
        stderrClass: "none",
        durationMs: 1,
      },
      route: {
        row: {
          caseId: row.caseId,
          system: "original",
          runIndex: 1,
          model: built.lock.model.route,
          adapter: "pi",
          adapterVersion: "0.67.68",
          panelConfigId: built.lock.calibrationId,
          exitCode: 0,
          runStatus: "ok",
          durationMs: 100,
          attempts: 1,
        },
        outputs: { declared: 3, present: 3, missing: [] },
        harnessResidue: [],
      },
    })
    expect(report.status).toBe("passed")
    expect(buildStableHarnessQualificationReport({
      ...{
        lock: built.lock,
        localPi: report.localPi,
        resourceProbe: report.resourceProbe,
      },
      route: {
        row: report.route!.row,
        outputs: { declared: 3, present: 2, missing: ["design/design-report.md"] },
        harnessResidue: [],
      },
    }).status).toBe("failed")
    expect(buildStableHarnessQualificationReport({
      lock: built.lock,
      localPi: report.localPi,
      resourceProbe: report.resourceProbe,
      route: {
        row: report.route!.row,
        outputs: report.route!.outputs,
        harnessResidue: ["AGENTS.md"],
      },
    }).status).toBe("failed")
  })

  test("records a failed pre-route qualification without inventing route evidence", async () => {
    const built = await buildStableHarnessCalibrationPlan({
      rootDir,
      lockPath,
      outDir,
      phase: "qualification",
    })
    const report = buildStableHarnessQualificationReport({
      lock: built.lock,
      localPi: {
        schemaVersion: "skill-ir-local-pi-qualification/v1",
        calibrationId: built.lock.calibrationId,
        methodEvidence: false,
        status: "failed",
        executable: built.lock.harness.executable,
        expectedVersion: "0.67.68",
        observedVersion: "0.68.0",
        exitCode: 0,
        timedOut: false,
      },
      resourceProbe: {
        schemaVersion: "skill-ir-resource-probe-result/v1",
        methodEvidence: false,
        status: "ok",
        executableSource: "fallback",
        requiredModules: [],
        exitCode: 0,
        stderrClass: "none",
        durationMs: 1,
      },
      route: null,
    })
    expect(report).toMatchObject({ status: "failed", route: null })
  })
})
