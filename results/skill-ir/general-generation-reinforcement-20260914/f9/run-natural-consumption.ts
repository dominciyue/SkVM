import path from "node:path"
import { writeFile } from "node:fs/promises"
import { runGeneralSkillDevelopment } from "../../../../src/jit-optimize/general-skill-development.ts"
import { i18nHelperGradeV2 } from "../../../../src/bench/evaluators/i18n-helper-grade-v2.ts"
import type { RunResult } from "../../../../src/core/types.ts"

const [skillArg, runArg, inputArg, model, cacheArg] = process.argv.slice(2)
if (!skillArg || !runArg || !inputArg || !model || !cacheArg) {
  throw new Error("Expected skill, fresh run directory, input directory, model and configured cache")
}
process.env.SKVM_CACHE = path.resolve(cacheArg)
const inputDir = path.resolve(inputArg)
const runDir = path.resolve(runArg)
const files = ["package.json", "tsconfig.json", "src/App.tsx", "i18n-contract.json"]
const task = "Inspect the public React source files and i18n contract in this work directory. Implement the requested localization transformation, create exactly the declared locale, config, and report outputs, preserve protected files, and verify the resulting files."
const outputFiles = ["src/i18n.ts", "src/locales/zh-CN.json", "src/locales/en-US.json", "i18n-report.json"]
const inputBytes = await Promise.all(files.map(async (file) => ({
  path: file, sha256: new Bun.CryptoHasher("sha256").update(await Bun.file(path.join(inputDir, file)).bytes()).digest("hex"),
})))
const inputSha256 = new Bun.CryptoHasher("sha256").update(JSON.stringify(inputBytes)).digest("hex")
const bindingSha256 = new Bun.CryptoHasher("sha256").update(JSON.stringify({ task, files, outputFiles })).digest("hex")
const startedAt = new Date().toISOString()
const report = await runGeneralSkillDevelopment({
  skillDir: path.resolve(skillArg), runDir, task, model, timeoutMs: 900_000,
  resources: files.map((file) => ({
    sourcePath: path.join(inputDir, file), workPath: file, protected: file !== "src/App.tsx",
  })),
  expectedFiles: outputFiles.map((file) => ({ path: file })),
  residualEvidenceFiles: ["src/App.tsx", "src/i18n.ts", "src/locales/zh-CN.json", "src/locales/en-US.json"],
})
const runResult: RunResult = {
  text: "", steps: [], tokens: report.runtime.tokens, cost: report.runtime.reportedCostUsd,
  durationMs: report.runtime.durationMs, llmDurationMs: 0, workDir: report.runtime.workDir,
  runStatus: report.runtime.timedOut ? "timeout" : report.runtime.exitCode === 0 ? "ok" : "adapter-crashed",
  usageAvailable: true, initialWorkdirManifest: report.runtime.initialWorkdirManifest,
}
const checks = []
for (const check of ["delta-policy", "source-transform", "locale-integrity", "interpolation", "report"] as const) {
  checks.push({ check, ...await i18nHelperGradeV2.run({
    criterion: { method: "custom", evaluatorId: "skill-ir-i18n-helper-v2", payload: { schemaVersion: "skill-ir-i18n-helper-eval/v2", check } },
    runResult,
  }) })
}
const nodeVersion = Bun.spawnSync(["node", "--version"]).stdout.toString().trim()
const qualityPassed = checks.every((check) => check.pass) && report.verification.taskPassed
const result = {
  schemaVersion: "skill-ir-f9-natural-quality/v1", startedAt, completedAt: new Date().toISOString(),
  argv: process.argv, inputDir, inputBytes, source: { inputSha256, bindingSha256 },
  package: report.package,
  runtime: { model, driver: report.runtime.driver, bunVersion: Bun.version, nodeVersion },
  targetAgent: {
    durationMs: report.runtime.durationMs, usageAvailable: true, tokens: report.runtime.tokens,
    actualCostUsd: null, counts: report.runtime.executionObservation?.counts,
  },
  checks, verification: { qualityPassed },
  consumption: report.consumption,
  claimBoundary: "Independent v2 development structural checks; translation meaning still requires semantic review. No broad reliability or dollar-saving claim.",
}
await writeFile(path.join(runDir, "quality.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ runDir, model, qualityPassed, consumption: report.consumption.consumptionComplete, checks }))
