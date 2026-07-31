import { describe, expect, test } from "bun:test"
import path from "node:path"
import {
  assertApiTesterWorkDirBudget,
  buildApiTesterCalibrationPlan,
  buildApiTesterPiVersionCommand,
  buildApiTesterQualificationReport,
  selectApiTesterQualificationRow,
} from "./api-tester-calibration-run.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const lockPath = path.join(rootDir, "benchmarks/skill-ir/pilots/api-tester/pi-direct-cli-short-path-calibration-lock.json")
const lockedOutDir = path.join(rootDir, "results/skill-ir/at-pi-v1")

describe("api-tester calibration orchestration", () => {
  test("builds eight short-path managed-Pi rows as four complete pairs", async () => {
    const built = await buildApiTesterCalibrationPlan({ rootDir, lockPath, outDir: lockedOutDir, phase: "plan" })
    expect(built.plan).toHaveLength(8)
    expect(new Set(built.plan.map((entry) => `${entry.caseId}:${entry.runIndex}`)).size).toBe(4)
    expect(buildApiTesterPiVersionCommand(built.lock, rootDir)).toEqual([
      Bun.which("node")!,
      path.join(rootDir, "node_modules/@mariozechner/pi-coding-agent/dist/cli.js"),
      "--version",
    ])
    for (const row of built.plan) {
      expect(row.command.slice(0, 4)).toEqual([process.execPath, "run", path.join(rootDir, "src/index.ts"), "run"])
      expect(row.command).toContain("--adapter-config=managed")
      expect(row.command).toContain("--timeout-ms=300000")
      expect(row.command).toContain("--max-steps=30")
      expect(row.skillPath === undefined).toBe(row.system === "no-skill")
      expect(row.workDir.length).toBeLessThanOrEqual(220)
    }
  })

  test("rejects output-root drift and a workdir beyond the Windows budget", async () => {
    await expect(buildApiTesterCalibrationPlan({
      rootDir,
      lockPath,
      outDir: path.join(rootDir, "results/skill-ir/not-frozen"),
      phase: "plan",
    })).rejects.toThrow("output root drift")
    expect(() => assertApiTesterWorkDirBudget([{ workDir: "x".repeat(221) }], 220)).toThrow("workdir length")
  })

  test("selects one original YAML qualification row and requires all three outputs", async () => {
    const built = await buildApiTesterCalibrationPlan({
      rootDir,
      lockPath,
      outDir: path.join(lockedOutDir, "qualification-work"),
      phase: "qualification",
    })
    const row = selectApiTesterQualificationRow(built.plan, built.lock)
    expect(row).toMatchObject({ system: "original", runIndex: 1, adapter: "pi" })
    expect(row.caseId).toEndWith(":api-tester-openapi-users-dev-001")

    const base = {
      lock: built.lock,
      localPi: { status: "passed" as const, observedVersion: "0.67.68", exitCode: 0, timedOut: false },
      resourceProbe: { status: "ok" as const, requiredModules: ["yaml"] },
      route: {
        row: { caseId: row.caseId, exitCode: 0, runStatus: "ok", durationMs: 1 },
        outputs: {
          declared: 3 as const,
          present: 3,
          missing: [] as Array<"api-test-generator.mjs" | "generated/api-test-plan.json" | "api-test-report.json">,
        },
        harnessResidue: [] as Array<"AGENTS.md" | ".pi-skills">,
      },
    }
    expect(buildApiTesterQualificationReport(base).status).toBe("passed")
    expect(buildApiTesterQualificationReport({
      ...base,
      route: { ...base.route, outputs: { declared: 3, present: 2, missing: ["api-test-report.json"] } },
    }).status).toBe("failed")
  })
})
