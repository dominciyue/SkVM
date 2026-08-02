import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { buildZhCodeReviewerContractAudit } from "./zh-code-reviewer-contract-audit.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const outputPath = path.join(rootDir, "results/skill-ir/benchmark-contract-audit/zh-code-reviewer.json")
const report = await buildZhCodeReviewerContractAudit({ rootDir })
await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
console.log(JSON.stringify({ outputPath: path.relative(rootDir, outputPath), status: report.status, counts: report.counts }, null, 2))

if (report.status !== "passed") process.exitCode = 1
