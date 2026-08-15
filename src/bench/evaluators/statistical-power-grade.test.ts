import { createHash } from "node:crypto"
import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { RunResult } from "../../core/types.ts"
import {
  writeInitialWorkdirManifest,
  type InitialWorkdirManifestReference,
} from "../../core/workdir-manifest.ts"
import { customEvaluators } from "../../framework/types.ts"
import {
  StatisticalPowerReportSchema,
  StatisticalPowerStudySchema,
  buildStatisticalPowerDevelopmentTaskSet,
  buildStatisticalPowerPublicInterface,
  deriveStatisticalPowerOracle,
} from "../../benchmarks/skill-ir/statistical-power-contract.ts"
import { customEvaluatorSourceDigests } from "./index.ts"
import {
  StatisticalPowerGradePayloadSchema,
  statisticalPowerGrade,
} from "./statistical-power-grade.ts"

const temporaryDirectories = new Set<string>()
const initialManifestByWorkDir = new Map<string, InitialWorkdirManifestReference>()
const checks = [
  "input-integrity",
  "artifact-contract",
  "analysis-alignment",
  "multiplicity",
  "allocation-attrition",
  "sensitivity-effect-basis",
] as const

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function runResult(workDir: string): RunResult {
  return {
    text: "complete",
    steps: [],
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    cost: 0,
    durationMs: 0,
    llmDurationMs: 0,
    workDir,
    initialWorkdirManifest: initialManifestByWorkDir.get(workDir),
    runStatus: "ok",
  }
}

async function fixture() {
  const task = buildStatisticalPowerDevelopmentTaskSet(buildStatisticalPowerPublicInterface()).tasks[0]!
  const studyText = task.fixtures["study.json"]
  const interfaceText = task.fixtures["power-interface.json"]
  const study = StatisticalPowerStudySchema.parse(JSON.parse(studyText))
  const oracle = await deriveStatisticalPowerOracle(study)
  const workDir = await mkdtemp(path.join(tmpdir(), "skvm-statistical-power-grade-"))
  temporaryDirectories.add(workDir)
  await writeFile(path.join(workDir, "study.json"), studyText, "utf8")
  await writeFile(path.join(workDir, "power-interface.json"), interfaceText, "utf8")
  initialManifestByWorkDir.set(workDir, await writeInitialWorkdirManifest({
    workDir,
    manifestPath: `${workDir}-initial-workdir-manifest.json`,
  }))
  const report = StatisticalPowerReportSchema.parse({
    schemaVersion: "skill-ir-statistical-power-report/v1",
    studyId: study.studyId,
    analysis: {
      test: study.design.test,
      alternative: study.alternative,
      effectBasis: study.effectBasis.kind,
      effectMetric: "cohens-d",
      familyAlpha: study.errorControl.familyAlpha,
      adjustedAlpha: oracle.adjustedAlpha,
      targetPower: study.targetPower,
      allocationRatio: study.allocationRatio,
      confirmatoryComparisons: study.errorControl.confirmatoryComparisons,
    },
    sampleSize: oracle.planning.sampleSize,
    sensitivity: oracle.sensitivity,
    assumptions: ["SESOI is decision-relevant.", "Closed-form approximation is appropriate."],
    reproducibility: { engine: "statsmodels", procedure: "TTestIndPower.solve_power" },
  })
  await writeFile(path.join(workDir, "power-analysis.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8")
  await writeFile(
    path.join(workDir, "power-analysis.md"),
    `# ${study.studyId}\n\nSESOI; analyzed total ${report.sampleSize.analyzed.total}; enrolled total ${report.sampleSize.enrolled.total}.\n`,
    "utf8",
  )
  return { workDir, task, report }
}

async function grade(check: typeof checks[number], fixtureValue: Awaited<ReturnType<typeof fixture>>) {
  const payload = fixtureValue.task.eval.find((criterion) => criterion.payload.check === check)!.payload
  return statisticalPowerGrade.run({
    criterion: { method: "custom", evaluatorId: "skill-ir-statistical-power", payload },
    runResult: runResult(fixtureValue.workDir),
  })
}

afterEach(async () => {
  await Promise.all([...temporaryDirectories].map((directory) => rm(directory, { recursive: true, force: true })))
  temporaryDirectories.clear()
  initialManifestByWorkDir.clear()
})

describe("statistical-power evaluator", () => {
  test("registers a closed payload and binds the implementation digest", async () => {
    expect(customEvaluators.get("skill-ir-statistical-power")).toBe(statisticalPowerGrade)
    const base = buildStatisticalPowerDevelopmentTaskSet().tasks[0]!.eval[0]!.payload
    expect(() => StatisticalPowerGradePayloadSchema.parse({ ...base, expectedAnswer: 93 })).toThrow()
    expect(customEvaluatorSourceDigests.get("skill-ir-statistical-power")).toBe(sha256(await readFile(
      path.join(process.cwd(), "src/bench/evaluators/statistical-power-grade.ts"),
      "utf8",
    )))
  })

  test("passes all six criteria for a reproducible closed-form report", async () => {
    const value = await fixture()
    for (const check of checks) {
      expect(await grade(check, value)).toMatchObject({ pass: true, score: 1 })
    }
  })

  test("separately rejects method, multiplicity, sample-size, and sensitivity defects", async () => {
    const method = await fixture()
    method.report.analysis.test = "two_proportions"
    method.report.analysis.effectMetric = "cohens-h"
    await writeFile(path.join(method.workDir, "power-analysis.json"), `${JSON.stringify(method.report)}\n`)
    expect(await grade("analysis-alignment", method)).toMatchObject({ pass: false, score: 0 })

    const multiplicity = await fixture()
    multiplicity.report.analysis.adjustedAlpha = 0.05
    await writeFile(path.join(multiplicity.workDir, "power-analysis.json"), `${JSON.stringify(multiplicity.report)}\n`)
    expect(await grade("multiplicity", multiplicity)).toMatchObject({ pass: false, score: 0 })

    const attrition = await fixture()
    attrition.report.sampleSize.enrolled.group1 -= 1
    attrition.report.sampleSize.enrolled.total -= 1
    await writeFile(path.join(attrition.workDir, "power-analysis.json"), `${JSON.stringify(attrition.report)}\n`)
    expect(await grade("allocation-attrition", attrition)).toMatchObject({ pass: false, score: 0 })

    const sensitivity = await fixture()
    sensitivity.report.sensitivity.reverse()
    await writeFile(path.join(sensitivity.workDir, "power-analysis.json"), `${JSON.stringify(sensitivity.report)}\n`)
    expect(await grade("sensitivity-effect-basis", sensitivity)).toMatchObject({ pass: false, score: 0 })
  })

  test("rejects protected-input mutation and exact-output violations", async () => {
    const mutated = await fixture()
    await writeFile(path.join(mutated.workDir, "study.json"), "{}\n")
    expect(await grade("input-integrity", mutated)).toMatchObject({ pass: false, score: 0 })

    const extra = await fixture()
    await writeFile(path.join(extra.workDir, "debug.txt"), "unexpected\n")
    expect(await grade("artifact-contract", extra)).toMatchObject({ pass: false, score: 0 })
  })
})
