import path from "node:path"
import { writeAuthoritativeAutomationReadinessReport } from "./method-portfolio-automation-authority.ts"

function option(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length)
}

const rootDir = path.resolve(option("root") ?? path.resolve(import.meta.dir, "../../.."))
const catalogPath = path.resolve(
  option("catalog")
    ?? path.join(rootDir, "benchmarks/skill-ir/corpus/method-portfolio-authoritative-automation.json"),
)
const outputPath = path.resolve(
  option("out")
    ?? path.join(rootDir, "results/skill-ir/method-portfolio-authoritative-automation-readiness.json"),
)

const report = await writeAuthoritativeAutomationReadinessReport({ rootDir, catalogPath, outputPath })
process.stdout.write(`${JSON.stringify({
  outputPath,
  passed: report.passed,
  gates: report.gates,
  authorityQualifiedCases: report.automationEvidenceAuthority.summary.authorityQualifiedCases,
  completeFullQualifiedAdaptationCostCases:
    report.automationEvidenceAuthority.summary.completeFullQualifiedAdaptationCostCases,
  accounting: report.automationEvidenceAuthority.accounting,
})}\n`)
