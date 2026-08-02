import { describe, expect, test } from "bun:test"
import path from "node:path"
import {
  assertZhCodeReviewerWorkDirBudget,
  buildZhCodeReviewerCalibrationPlan,
  buildZhCodeReviewerPiVersionCommand,
  buildZhCodeReviewerQualificationReport,
  selectZhCodeReviewerQualificationRow,
} from "./zh-code-reviewer-calibration-run.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const lockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/zh-code-reviewer/pi-direct-cli-short-path-calibration-lock-v2.json",
)
const lockedOutDir = path.join(rootDir, "results/skill-ir/zcr-pi-v2")

describe("zh-code-reviewer calibration orchestration", () => {
  test("builds eight short-path managed-Pi rows as four complete pairs", async () => {
    const built = await buildZhCodeReviewerCalibrationPlan({
      rootDir, lockPath, outDir: lockedOutDir, phase: "plan",
    })
    expect(built.plan).toHaveLength(8)
    expect(new Set(built.plan.map((entry) => `${entry.caseId}:${entry.runIndex}`)).size).toBe(4)
    expect(buildZhCodeReviewerPiVersionCommand(built.lock, rootDir)).toEqual([
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

  test("rejects output-root drift and excessive Windows paths", async () => {
    await expect(buildZhCodeReviewerCalibrationPlan({
      rootDir,
      lockPath,
      outDir: path.join(rootDir, "results/skill-ir/not-frozen"),
      phase: "plan",
    })).rejects.toThrow("output root drift")
    expect(() => assertZhCodeReviewerWorkDirBudget([{ workDir: "x".repeat(221) }], 220))
      .toThrow("workdir length")
  })

  test("selects one original row and requires both declared outputs", async () => {
    const built = await buildZhCodeReviewerCalibrationPlan({
      rootDir,
      lockPath,
      outDir: path.join(lockedOutDir, "qualification-work"),
      phase: "qualification",
    })
    const row = selectZhCodeReviewerQualificationRow(built.plan, built.lock)
    expect(row).toMatchObject({ system: "original", runIndex: 1, adapter: "pi" })
    expect(row.caseId).toEndWith(":zh-code-reviewer-user-service-dev-001")

    const base = {
      lock: built.lock,
      localPi: { status: "passed" as const, observedVersion: "0.67.68", exitCode: 0, timedOut: false },
      resourceProbe: { status: "ok" as const, requiredModules: [] },
      route: {
        row: { caseId: row.caseId, exitCode: 0, runStatus: "ok", durationMs: 1 },
        outputs: { declared: 2 as const, present: 2, missing: [] as Array<"code-review.json" | "code-review.md"> },
        harnessResidue: [] as Array<"AGENTS.md" | ".pi-skills">,
      },
    }
    expect(buildZhCodeReviewerQualificationReport(base).status).toBe("passed")
    expect(buildZhCodeReviewerQualificationReport({
      ...base,
      route: { ...base.route, outputs: { declared: 2, present: 1, missing: ["code-review.md"] } },
    }).status).toBe("failed")
  })
})
