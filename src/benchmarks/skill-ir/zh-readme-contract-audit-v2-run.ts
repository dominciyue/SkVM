import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { runZhReadmeContractAuditV2 } from "./zh-readme-contract-audit-v2.ts"

const rootDir = process.cwd()
const outputPath = path.join(rootDir, "results/skill-ir/benchmark-contract-audit/zh-readme-v2.json")
const report = await runZhReadmeContractAuditV2(rootDir)
await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
console.log(JSON.stringify({ outputPath: path.relative(rootDir, outputPath), status: report.status, counts: report.counts }, null, 2))
if (report.status !== "passed") process.exitCode = 1
