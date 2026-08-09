import { describe, expect, test } from "bun:test"
import path from "node:path"
import { customEvaluators } from "../../framework/types.ts"
import {
  buildPublicContractQualificationReport,
  buildPublicContractCalibrationPlan,
  loadPublicContractCalibrationScorer,
  parsePublicContractCalibrationRunArgs,
  selectPublicContractQualificationRow,
} from "./public-contract-calibration-run.ts"
import type { RawAgentRunRow, ScoredAgentRunRow } from "./scoring.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const lawLock = "benchmarks/skill-ir/pilots/law-to-markdown/v2/development-calibration-lock.json"
const i18nLock = "benchmarks/skill-ir/pilots/i18n-helper/development-calibration-lock.json"
const lawV3Lock = "benchmarks/skill-ir/pilots/law-to-markdown/v3/development-calibration-lock.json"
const i18nV2Lock = "benchmarks/skill-ir/pilots/i18n-helper/v2/development-calibration-lock.json"
const i18nV3Lock = "benchmarks/skill-ir/pilots/i18n-helper/v3/development-calibration-lock.json"

describe("public-contract calibration runner", () => {
  for (const [skillId, lockPath] of [
    ["law-to-markdown-v2", lawLock],
    ["i18n-helper", i18nLock],
    ["law-to-markdown-v3", lawV3Lock],
    ["i18n-helper-v2", i18nV2Lock],
    ["i18n-helper-v3", i18nV3Lock],
  ] as const) {
    test(`builds the frozen paired ${skillId} source-runner plan`, async () => {
      const built = await buildPublicContractCalibrationPlan({
        rootDir,
        lockPath,
        outDir: `results/skill-ir/${skillId}-public-contract-calibration-v1`,
        phase: "plan",
      })
      expect(built.plan).toHaveLength(8)
      expect(built.plan.filter((row) => row.system === "original" && row.skillPath)).toHaveLength(4)
      expect(built.plan.filter((row) => row.system === "no-skill" && row.skillPath)).toHaveLength(0)
      expect(built.plan.every((row) =>
        row.command[0] === process.execPath
        && row.command[1] === "run"
        && row.command[2] === path.join(rootDir, "src/index.ts")
        && row.command.includes("--adapter-config=managed")
        && row.command.includes("--timeout-ms=300000")
        && row.command.includes("--max-steps=30")
      )).toBe(true)
      expect(selectPublicContractQualificationRow(built.plan, built.lock)).toMatchObject({
        system: "original",
        runIndex: 1,
      })
    })
  }

  test("loads only the lock-declared scorer without global registry edits", async () => {
    await loadPublicContractCalibrationScorer(rootDir, "src/bench/evaluators/i18n-helper-grade.ts")
    expect(customEvaluators.has("skill-ir-i18n-helper")).toBe(true)
  })

  test("parses plan, qualification, and execute but rejects held-out", () => {
    expect(parsePublicContractCalibrationRunArgs([
      `--lock=${lawLock}`,
      "--out-dir=results/skill-ir/law-calibration",
      "--phase=qualification",
    ])).toMatchObject({ phase: "qualification", lockPath: lawLock })
    expect(() => parsePublicContractCalibrationRunArgs([
      `--lock=${lawLock}`,
      "--out-dir=results/skill-ir/law-calibration",
      "--phase=heldout",
    ])).toThrow()
  })

  test("qualification permits semantic failure but rejects infrastructure failure", async () => {
    const built = await buildPublicContractCalibrationPlan({
      rootDir,
      lockPath: lawLock,
      outDir: "results/skill-ir/law-to-markdown-v2-public-contract-calibration-v1",
      phase: "plan",
    })
    const selected = selectPublicContractQualificationRow(built.plan, built.lock)
    const raw = {
      caseId: selected.caseId,
      system: "original",
      taskPath: selected.taskPath,
      workDir: selected.workDir,
      exitCode: 0,
      runStatus: "ok",
      durationMs: 100,
      stdout: "",
      stderr: "",
      successSource: "execution-only",
      attempts: 1,
    } satisfies RawAgentRunRow
    const scored = {
      caseId: selected.caseId,
      skill: built.lock.skillId,
      agent: "skvm",
      environment: "windows",
      context: "clean",
      task: built.lock.qualification.taskId,
      system: "original",
      taskSplit: "development",
      success: false,
      ruleViolations: 1,
      stepCoverage: 0.4,
      latencyMs: 100,
      runStatus: "ok",
      successSource: "deterministic-evaluator",
      failedCriteria: ["law-v2-structure"],
      evaluatorScore: 0.4,
    } satisfies ScoredAgentRunRow
    expect(buildPublicContractQualificationReport({
      lock: built.lock,
      raw,
      scored,
      harnessResidue: [],
    })).toMatchObject({ status: "passed", scorer: { semanticSuccess: false } })
    expect(buildPublicContractQualificationReport({
      lock: built.lock,
      raw: { ...raw, exitCode: 1, runStatus: "adapter-crashed" },
      scored: { ...scored, failureType: "infrastructure" },
      harnessResidue: [],
    })).toMatchObject({ status: "failed" })
  })
})
