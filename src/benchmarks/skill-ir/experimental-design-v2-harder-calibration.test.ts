import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  HarderCalibrationLockSchema,
  readAndValidateHarderCalibrationLock,
} from "./experimental-design-v2-harder-calibration.ts"
import {
  buildHarderQualificationReport,
  buildHarderCalibrationPlan,
  selectHarderQualificationRow,
} from "./experimental-design-v2-harder-calibration-run.ts"

const rootDir = process.cwd()
const lockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/v2/experimental-design-v2-harder-pi-calibration-lock.json",
)
let outDir: string

beforeAll(async () => {
  outDir = await mkdtemp(path.join(tmpdir(), "skill-ir-v2-harder-plan-"))
})

afterAll(async () => {
  await rm(outDir, { recursive: true, force: true })
})

describe("experimental-design v2 harder Pi calibration", () => {
  test("validates the committed preregistration and every frozen guard", async () => {
    const lock = await readAndValidateHarderCalibrationLock({ rootDir, lockPath })
    expect(lock.calibrationId).toBe("experimental-design-v2-harder-pi-development-v1")
    expect(lock.matrix).toMatchObject({ expectedRows: 8, expectedPairs: 4, repetitions: 2 })
    expect(lock.benchmarkGuards.map((guard) => guard.kind)).toEqual([
      "experimental-design-v2-task-split-freeze",
      "experimental-design-v2-heldout-freeze",
      "experimental-design-v2-saturation-audit",
      "experimental-design-v2-harder-differential-audit",
      "experimental-design-v2-harder-materialization-audit",
    ])
    expect(lock.sourceClosure.some((file) => file.path === lock.frozenInputs.source.path)).toBe(true)
  })

  test("rejects runtime or model drift before materialization", async () => {
    const value = JSON.parse(await readFile(lockPath, "utf8")) as Record<string, any>
    expect(() => HarderCalibrationLockSchema.parse({
      ...value,
      runtime: { ...value.runtime, retries: 1 },
    })).toThrow()
    expect(() => HarderCalibrationLockSchema.parse({
      ...value,
      model: { route: "xty/gpt-4.1", family: "gpt" },
    })).toThrow()
  })

  test("builds exactly four complete pairs from the supplemental task-set", async () => {
    const built = await buildHarderCalibrationPlan({
      rootDir,
      lockPath,
      outDir,
      phase: "plan",
    })
    expect(built.plan).toHaveLength(8)
    expect(new Set(built.plan.map((row) => `${row.caseId}:${row.runIndex}`)).size).toBe(4)
    expect(new Set(built.plan.map((row) => row.caseId.split(":").at(-1)))).toEqual(new Set([
      "experimental-design-v2-three-arm-strata-sequential-dev-003",
      "experimental-design-v2-four-arm-cluster-strata-sequential-dev-004",
    ]))
    for (const row of built.plan) {
      expect(row.panelConfigId).toBe(built.lock.calibrationId)
      expect(row.command).toContain("--adapter-config=managed")
      expect(row.command).toContain("--timeout-ms=300000")
      expect(row.command).toContain("--max-steps=30")
      expect(row.skillPath === undefined).toBe(row.system === "no-skill")
    }
  })

  test("selects only the frozen harder original qualification row", async () => {
    const built = await buildHarderCalibrationPlan({
      rootDir,
      lockPath,
      outDir,
      phase: "qualification",
    })
    const row = selectHarderQualificationRow(built.plan, built.lock)
    expect(row).toMatchObject({ system: "original", runIndex: 1, adapter: "pi" })
    expect(row.caseId).toEndWith(
      ":experimental-design-v2-four-arm-cluster-strata-sequential-dev-004",
    )
  })

  test("requires all qualification gates and rejects harness residue", async () => {
    const lock = await readAndValidateHarderCalibrationLock({ rootDir, lockPath })
    const input = {
      lock,
      localPi: {
        schemaVersion: "skill-ir-local-pi-qualification/v1" as const,
        calibrationId: lock.calibrationId,
        methodEvidence: false as const,
        status: "passed" as const,
        executable: lock.harness.executable,
        expectedVersion: lock.harness.adapterVersion,
        observedVersion: lock.harness.adapterVersion,
        exitCode: 0,
        timedOut: false,
      },
      resourceProbe: {
        schemaVersion: "skill-ir-resource-probe-result/v1" as const,
        methodEvidence: false as const,
        status: "ok" as const,
        executableSource: "fallback" as const,
        requiredModules: [],
        exitCode: 0,
        stderrClass: "none" as const,
        durationMs: 1,
      },
      route: {
        row: {
          caseId: `${lock.skillId}:skvm:windows:clean:${lock.qualification.taskId}`,
          system: "original" as const,
          runIndex: 1 as const,
          model: lock.model.route,
          adapter: lock.harness.adapter,
          adapterVersion: lock.harness.adapterVersion,
          panelConfigId: lock.calibrationId,
          exitCode: 0,
          runStatus: "ok",
          durationMs: 1,
          attempts: 1 as const,
        },
        outputs: { declared: 3, present: 3, missing: [] },
        harnessResidue: [] as Array<"AGENTS.md" | ".pi-skills">,
      },
    }
    expect(buildHarderQualificationReport(input).status).toBe("passed")
    expect(buildHarderQualificationReport({
      ...input,
      route: { ...input.route, harnessResidue: ["AGENTS.md"] },
    }).status).toBe("failed")
    expect(buildHarderQualificationReport({
      ...input,
      route: {
        ...input.route,
        outputs: { declared: 3, present: 2, missing: ["design/design-report.md"] },
      },
    }).status).toBe("failed")
  })
})
