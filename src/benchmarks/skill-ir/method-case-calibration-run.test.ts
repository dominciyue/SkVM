import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { customEvaluators } from "../../framework/types.ts"
import {
  assertMethodCaseWorkDirBudget,
  inspectMethodCaseOutputs,
  loadMethodCaseScorer,
  parseMethodCaseCalibrationRunArgs,
} from "./method-case-calibration-run.ts"

const temporary: string[] = []

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((entry) => rm(entry, { recursive: true, force: true })))
})

describe("method-case calibration runner", () => {
  test("qualifies the lock-declared output set without assuming skill-specific filenames", async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), "method-case-output-"))
    temporary.push(workDir)
    expect(await inspectMethodCaseOutputs(workDir, ["README.zh-CN.md"])).toEqual({
      declared: 1,
      present: 0,
      missing: ["README.zh-CN.md"],
    })
    await writeFile(path.join(workDir, "README.zh-CN.md"), "# 示例\n", "utf8")
    expect(await inspectMethodCaseOutputs(workDir, ["README.zh-CN.md"])).toEqual({
      declared: 1,
      present: 1,
      missing: [],
    })
  })

  test("rejects paths beyond the frozen Windows workdir budget", () => {
    expect(() => assertMethodCaseWorkDirBudget([{ workDir: "C:/short" }], 220)).not.toThrow()
    expect(() => assertMethodCaseWorkDirBudget([{ workDir: `C:/${"x".repeat(230)}` }], 220)).toThrow()
  })

  test("parses only the three frozen runner phases", () => {
    expect(parseMethodCaseCalibrationRunArgs([
      "--lock=lock.json", "--out-dir=results/skill-ir/demo", "--phase=qualification",
    ])).toMatchObject({ lockPath: "lock.json", outDir: "results/skill-ir/demo", phase: "qualification" })
    expect(() => parseMethodCaseCalibrationRunArgs([
      "--lock=lock.json", "--out-dir=results/skill-ir/demo", "--phase=heldout",
    ])).toThrow()
  })

  test("loads a digest-validated scorer module without a skill-id branch", async () => {
    customEvaluators.delete("skill-ir-zh-readme")
    await loadMethodCaseScorer(
      path.resolve(import.meta.dir, "../../.."),
      "src/bench/evaluators/zh-readme-grade-v2.ts",
    )
    expect(customEvaluators.has("skill-ir-zh-readme")).toBe(true)
  })
})
