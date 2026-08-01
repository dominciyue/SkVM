import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { readAndEvaluatePartialBenefitReentry } from "./partial-benefit-reentry.ts"

function option(name: string, fallback: string): string {
  const prefix = `--${name}=`
  return process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length) ?? fallback
}

const rootDir = path.resolve(option("root", process.cwd()))
const policyPath = path.resolve(rootDir, option(
  "policy",
  "benchmarks/skill-ir/corpus/partial-benefit-reentry/api-tester-v1.json",
))
const outputPath = path.resolve(rootDir, option(
  "out",
  "results/skill-ir/api-tester-partial-benefit-reentry.json",
))
const report = await readAndEvaluatePartialBenefitReentry({ rootDir, policyPath })
await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
console.log(JSON.stringify({ outputPath: path.relative(rootDir, outputPath), admitted: report.admitted }, null, 2))
