import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { buildSourcePackagePortfolioAudit } from "./source-package-portfolio-audit.ts"

const rootDir = process.cwd()
const outputPath = path.join(rootDir, "results/skill-ir/source-package-portfolio-audit.json")
const report = await buildSourcePackagePortfolioAudit({
  rootDir,
  observationPaths: ["results/skill-ir/zrm-pi-v2/measurement-validity.json"],
})
await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
console.log(JSON.stringify({
  outputPath: path.relative(rootDir, outputPath),
  status: report.status,
  counts: report.counts,
}, null, 2))
