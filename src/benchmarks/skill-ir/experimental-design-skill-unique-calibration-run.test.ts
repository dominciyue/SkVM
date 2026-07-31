import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  buildExperimentalDesignSkillUniqueCalibrationPlan,
  buildExperimentalDesignSkillUniquePiVersionCommand,
  buildExperimentalDesignSkillUniqueQualificationReport,
  assertExperimentalDesignSkillUniqueWorkDirBudget,
  selectExperimentalDesignSkillUniqueQualificationRow,
} from "./experimental-design-skill-unique-calibration-run.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const lockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/v2/skill-unique/pi-direct-cli-short-path-calibration-lock.json",
)
const lockedOutDir = path.join(rootDir, "results/skill-ir/su-pi-direct-v1")
let outDir: string

beforeAll(async () => {
  outDir = await mkdtemp(path.join(tmpdir(), "skill-unique-calibration-"))
})

afterAll(async () => {
  await rm(outDir, { recursive: true, force: true })
})

describe("experimental-design skill-unique calibration orchestration", () => {
  test("builds the frozen direct Node Pi version command without a shim", async () => {
    const built = await buildExperimentalDesignSkillUniqueCalibrationPlan({
      rootDir,
      lockPath,
      outDir: lockedOutDir,
      phase: "plan",
    })
    const command = buildExperimentalDesignSkillUniquePiVersionCommand(built.lock, rootDir)
    expect(command).toEqual([
      Bun.which("node")!,
      path.join(rootDir, "node_modules/@mariozechner/pi-coding-agent/dist/cli.js"),
      "--version",
    ])
    expect(command.some((part) => part.includes(`${path.sep}.bin${path.sep}`))).toBe(false)
  })

  test("builds eight managed-Pi rows as four complete no-skill/original pairs", async () => {
    const built = await buildExperimentalDesignSkillUniqueCalibrationPlan({
      rootDir,
      lockPath,
      outDir: lockedOutDir,
      phase: "plan",
    })
    expect(built.plan).toHaveLength(8)
    expect(new Set(built.plan.map((item) => `${item.caseId}:${item.runIndex}`)).size).toBe(4)
    for (const row of built.plan) {
      expect(row.command.slice(0, 4)).toEqual([
        process.execPath,
        "run",
        path.join(rootDir, "src/index.ts"),
        "run",
      ])
      expect(row.panelConfigId).toBe("experimental-design-skill-unique-pi-direct-cli-short-path-development-v1")
      expect(row.command).toContain("--adapter-config=managed")
      expect(row.command).toContain("--timeout-ms=300000")
      expect(row.command).toContain("--max-steps=30")
      expect(row.skillPath === undefined).toBe(row.system === "no-skill")
      expect(row.workDir.length).toBeLessThanOrEqual(220)
    }
  })

  test("rejects output-root drift and workdirs beyond the frozen Windows budget", async () => {
    await expect(buildExperimentalDesignSkillUniqueCalibrationPlan({
      rootDir,
      lockPath,
      outDir,
      phase: "plan",
    })).rejects.toThrow("output root drift")
    expect(() => assertExperimentalDesignSkillUniqueWorkDirBudget([
      { workDir: "x".repeat(221) },
    ], 220)).toThrow("workdir length")
  })

  test("selects the one preregistered original qualification row", async () => {
    const built = await buildExperimentalDesignSkillUniqueCalibrationPlan({
      rootDir,
      lockPath,
      outDir: path.join(lockedOutDir, "qualification-work"),
      phase: "qualification",
    })
    const row = selectExperimentalDesignSkillUniqueQualificationRow(built.plan, built.lock)
    expect(row).toMatchObject({ system: "original", runIndex: 1, adapter: "pi" })
    expect(row.caseId).toEndWith(":experimental-design-skill-unique-repeated-visit-dev-002")
  })

  test("requires Pi, resource, route, exact two outputs, and no harness residue", async () => {
    const built = await buildExperimentalDesignSkillUniqueCalibrationPlan({
      rootDir,
      lockPath,
      outDir: path.join(lockedOutDir, "qualification-work"),
      phase: "qualification",
    })
    const input = {
      lock: built.lock,
      localPi: {
        schemaVersion: "skill-ir-local-pi-qualification/v1" as const,
        calibrationId: built.lock.calibrationId,
        methodEvidence: false as const,
        status: "passed" as const,
        executable: built.lock.harness.executable,
        expectedVersion: built.lock.harness.adapterVersion,
        observedVersion: built.lock.harness.adapterVersion,
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
          caseId: `${built.lock.skillId}:skvm:windows:clean:${built.lock.qualification.taskId}`,
          system: "original" as const,
          runIndex: 1 as const,
          model: built.lock.model.route,
          adapter: built.lock.harness.adapter,
          adapterVersion: built.lock.harness.adapterVersion,
          panelConfigId: built.lock.calibrationId,
          exitCode: 0,
          runStatus: "ok",
          durationMs: 1,
          attempts: 1 as const,
        },
        outputs: { declared: 2 as const, present: 2, missing: [] },
        harnessResidue: [] as Array<"AGENTS.md" | ".pi-skills">,
      },
    }
    expect(buildExperimentalDesignSkillUniqueQualificationReport(input).status).toBe("passed")
    expect(buildExperimentalDesignSkillUniqueQualificationReport({
      ...input,
      route: { ...input.route, outputs: { declared: 2, present: 1, missing: ["design/analysis-plan.json"] } },
    }).status).toBe("failed")
  })
})
