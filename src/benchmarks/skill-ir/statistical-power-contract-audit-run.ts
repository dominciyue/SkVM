import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { runStatisticalPowerContractAudit } from "./statistical-power-contract-audit.ts"

export async function writeStatisticalPowerContractAudit(
  outputPath = path.join(
    process.cwd(),
    "results/skill-ir/statistical-power-contract-audit-v1/report.json",
  ),
) {
  const report = await runStatisticalPowerContractAudit()
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report
}

if (import.meta.main) {
  console.log(JSON.stringify(await writeStatisticalPowerContractAudit(), null, 2))
}
