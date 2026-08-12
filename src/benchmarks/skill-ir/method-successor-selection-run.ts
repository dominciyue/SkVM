import path from "node:path"
import { writeMethodSuccessorSelectionReport } from "./method-portfolio.ts"

function option(name: string, fallback: string): string {
  const prefix = `--${name}=`
  return process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length) ?? fallback
}

const rootDir = path.resolve(option("root", process.cwd()))
const portfolioPath = path.resolve(rootDir, option(
  "portfolio",
  "benchmarks/skill-ir/corpus/method-portfolio.json",
))
const policyPath = path.resolve(rootDir, option(
  "policy",
  "benchmarks/skill-ir/corpus/method-successor-selection.json",
))
const outputPath = path.resolve(rootDir, option(
  "out",
  "results/skill-ir/method-successor-selection.json",
))

const report = await writeMethodSuccessorSelectionReport({ rootDir, portfolioPath, policyPath, outputPath })
console.log(JSON.stringify({
  outputPath: path.relative(rootDir, outputPath),
  selectedSkillId: report.selectedSkillId,
  targetPhenotype: report.targetPhenotype,
  candidateCount: report.candidates.length,
}, null, 2))
