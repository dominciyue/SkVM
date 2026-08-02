import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { buildZhReadmeContractAudit } from "./zh-readme-contract-audit.ts"

const rootDir = process.cwd()
const outputPath = path.join(rootDir, "results/skill-ir/benchmark-contract-audit/zh-readme-v1.json")
const report = await buildZhReadmeContractAudit({ rootDir })
await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
console.log(JSON.stringify({ status: report.status, counts: report.counts, outputPath: path.relative(rootDir, outputPath) }, null, 2))
