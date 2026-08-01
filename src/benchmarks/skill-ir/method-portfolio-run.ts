import path from "node:path"
import { writeMethodPortfolioReadinessReport } from "./method-portfolio.ts"

function option(name: string, fallback: string): string {
  const prefix = `--${name}=`
  return process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length) ?? fallback
}

const rootDir = path.resolve(option("root", process.cwd()))
const portfolioPath = path.resolve(rootDir, option(
  "portfolio",
  "benchmarks/skill-ir/corpus/method-portfolio.json",
))
const outputPath = path.resolve(rootDir, option(
  "out",
  "results/skill-ir/method-portfolio-readiness.json",
))

const report = await writeMethodPortfolioReadinessReport({ rootDir, portfolioPath, outputPath })
console.log(JSON.stringify({ outputPath: path.relative(rootDir, outputPath), passed: report.passed, counts: report.counts }, null, 2))
