import path from "node:path"
import { writeAuthoritativeMethodPortfolioReadinessReport } from "./method-portfolio-evidence-authority.ts"

function option(name: string, fallback: string): string {
  const prefix = `--${name}=`
  return process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length) ?? fallback
}

const rootDir = path.resolve(option("root", process.cwd()))
const portfolioPath = path.resolve(rootDir, option(
  "portfolio",
  "benchmarks/skill-ir/corpus/method-portfolio-authoritative.json",
))
const outputPath = path.resolve(rootDir, option(
  "out",
  "results/skill-ir/method-portfolio-authoritative-readiness.json",
))

const report = await writeAuthoritativeMethodPortfolioReadinessReport({
  rootDir,
  portfolioPath,
  outputPath,
})
console.log(JSON.stringify({
  outputPath: path.relative(rootDir, outputPath).replaceAll("\\", "/"),
  passed: report.passed,
  counts: report.counts,
  evidenceAuthority: report.evidenceAuthority.cases.map((entry) => ({
    skillId: entry.skillId,
    classification: entry.classification,
    qualityComparisonComplete: entry.qualityComparisonComplete,
    allAttemptCostComplete: entry.allAttemptCostComplete,
    breakEvenComplete: entry.breakEvenComplete,
  })),
}, null, 2))
