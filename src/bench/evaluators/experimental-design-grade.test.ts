import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { RunResult } from "../../core/types.ts"
import { customEvaluators } from "../../framework/types.ts"
import "./index.ts"
import { experimentalDesignGrade } from "./experimental-design-grade.ts"

const temporaryDirectories = new Set<string>()
const schemaVersion = "skill-ir-experimental-design-eval/v1"

afterEach(async () => {
  await Promise.all([...temporaryDirectories].map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ))
  temporaryDirectories.clear()
})

async function makeWorkDir(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "experimental-design-grade-"))
  temporaryDirectories.add(directory)
  return directory
}

function runResult(workDir: string): RunResult {
  return {
    text: "Design complete.",
    steps: [],
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    cost: 0,
    durationMs: 0,
    llmDurationMs: 0,
    workDir,
    runStatus: "ok",
  }
}

async function grade(payload: unknown, workDir: string) {
  return experimentalDesignGrade.run({
    criterion: {
      method: "custom",
      evaluatorId: "skill-ir-experimental-design",
      payload,
    },
    runResult: runResult(workDir),
  })
}

const study = {
  studyId: "site-stratified-study",
  question: "Does the intervention reduce recovery time?",
  assignmentLevel: "individual",
  assignmentUnit: "participant",
  analysisUnit: "participant",
  response: "recovery_days",
  arms: ["control", "intervention"],
  seed: 37,
  nuisanceFactors: ["site"],
  sequentialEnrollment: false,
  units: [
    { id: "A-01", stratum: "site-a" },
    { id: "A-02", stratum: "site-a" },
    { id: "B-01", stratum: "site-b" },
    { id: "B-02", stratum: "site-b" },
  ],
}

describe("experimental-design evaluator registration and safety", () => {
  test("is registered by the evaluator barrel", () => {
    expect(customEvaluators.get("skill-ir-experimental-design")).toBe(experimentalDesignGrade)
  })

  test("invalid payloads and unsafe paths are infrastructure failures", async () => {
    const workDir = await makeWorkDir()
    for (const payload of [
      { schemaVersion: "wrong", check: "protected-file", path: "study.json", content: "{}" },
      { schemaVersion, check: "protected-file", path: "../study.json", content: "{}" },
      { schemaVersion, check: "required-artifacts", paths: ["C:\\outside.json"] },
    ]) {
      const result = await grade(payload, workDir)
      expect(result).toMatchObject({ pass: false, score: 0 })
      expect(result.infraError).toBeDefined()
    }
  })
})

describe("experimental-design deterministic scoring", () => {
  test("accepts a complete stratified allocation derived from the public study", async () => {
    const workDir = await makeWorkDir()
    await mkdir(path.join(workDir, "design"), { recursive: true })
    await writeFile(path.join(workDir, "study.json"), `${JSON.stringify(study, null, 2)}\n`, "utf8")
    await writeFile(path.join(workDir, "design/design-plan.json"), `${JSON.stringify({
      schemaVersion: "experimental-design-plan/v1",
      studyId: study.studyId,
      method: "stratified-block",
      assignmentLevel: study.assignmentLevel,
      assignmentUnit: study.assignmentUnit,
      analysisUnit: study.analysisUnit,
      response: study.response,
      arms: study.arms,
      seed: study.seed,
      nuisanceHandling: ["stratify:site"],
      replicationUnit: study.assignmentUnit,
      pseudoreplicationWarning: "Repeated measurements do not increase the number of independent participant replicates.",
      allocationPath: "design/allocation.csv",
      analysisNotes: ["Analyze at the participant level.", "Include site in the analysis."],
    }, null, 2)}\n`, "utf8")
    await writeFile(path.join(workDir, "design/allocation.csv"), [
      "order,unit_id,stratum,arm",
      "1,A-02,site-a,control",
      "2,A-01,site-a,intervention",
      "3,B-02,site-b,control",
      "4,B-01,site-b,intervention",
      "",
    ].join("\n"), "utf8")
    await writeFile(path.join(workDir, "design/design-report.md"), [
      "# Experimental Design Report",
      "Study ID: site-stratified-study",
      "Method: stratified-block",
      "Randomization unit: participant",
      "Analysis unit: participant",
      "Response: recovery_days",
      "Seed: 37",
      "Nuisance handling: stratify:site",
      "Replication note: participant is the independent replicate.",
      "Allocation schedule: design/allocation.csv",
      "",
    ].join("\n"), "utf8")

    const checks = [
      { check: "protected-file", path: "study.json", content: `${JSON.stringify(study, null, 2)}\n` },
      { check: "required-artifacts", paths: ["design/design-plan.json", "design/allocation.csv", "design/design-report.md"] },
      { check: "plan-contract", studyPath: "study.json", planPath: "design/design-plan.json" },
      { check: "assignment-safety", studyPath: "study.json", planPath: "design/design-plan.json" },
      { check: "allocation-consistency", studyPath: "study.json", allocationPath: "design/allocation.csv" },
      { check: "report-completeness", studyPath: "study.json", reportPath: "design/design-report.md" },
    ]

    for (const check of checks) {
      expect(await grade({ schemaVersion, ...check }, workDir)).toMatchObject({ pass: true, score: 1 })
    }
  })

  test("rejects the wrong method and assignment unit without classifying them as infrastructure", async () => {
    const workDir = await makeWorkDir()
    await mkdir(path.join(workDir, "design"), { recursive: true })
    await writeFile(path.join(workDir, "study.json"), `${JSON.stringify(study, null, 2)}\n`, "utf8")
    await writeFile(path.join(workDir, "design/design-plan.json"), `${JSON.stringify({
      schemaVersion: "experimental-design-plan/v1",
      studyId: study.studyId,
      method: "simple-randomized",
      assignmentLevel: study.assignmentLevel,
      assignmentUnit: "measurement",
      analysisUnit: study.analysisUnit,
      response: study.response,
      arms: study.arms,
      seed: study.seed,
      nuisanceHandling: [],
      replicationUnit: "measurement",
      pseudoreplicationWarning: "none",
      allocationPath: "design/allocation.csv",
      analysisNotes: [],
    })}\n`, "utf8")

    for (const check of ["plan-contract", "assignment-safety"] as const) {
      const result = await grade({
        schemaVersion,
        check,
        studyPath: "study.json",
        planPath: "design/design-plan.json",
      }, workDir)
      expect(result).toMatchObject({ pass: false, score: 0 })
      expect(result.infraError).toBeUndefined()
    }
  })
})
