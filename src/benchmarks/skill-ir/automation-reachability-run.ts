import path from "node:path"
import { writeAutomationReachabilityReport } from "./automation-reachability.ts"

function option(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length)
}

const rootDir = path.resolve(option("root") ?? path.resolve(import.meta.dir, "../../.."))
const catalogPath = path.resolve(
  option("catalog") ?? path.join(rootDir, "benchmarks/skill-ir/corpus/automation-reachability-v1.json"),
)
const outputPath = path.resolve(
  option("out") ?? path.join(rootDir, "results/skill-ir/automation-reachability-v1/report.json"),
)

const report = await writeAutomationReachabilityReport({ rootDir, catalogPath, outputPath })
process.stdout.write(`${JSON.stringify({
  outputPath,
  gate: report.authority.automationAndAdaptationConverging,
  readinessAttack: report.decisions.phase3AReadinessAttack,
  closeout: report.decisions.phase3BCloseout,
  stopBoundary: report.decisions.stopBoundary,
  paidCalls: report.phase2Accounting.paidCalls,
})}\n`)
