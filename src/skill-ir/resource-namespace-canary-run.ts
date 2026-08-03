import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { buildNamespacedResourceCanary } from "./resource-namespace-canary.ts"

const rootDir = process.cwd()
const outputPath = path.join(rootDir, "results/skill-ir/namespaced-resource-canary.json")
const report = await buildNamespacedResourceCanary(rootDir)
await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
console.log(JSON.stringify({ outputPath: path.relative(rootDir, outputPath), status: report.status, cases: report.cases }, null, 2))
if (report.status !== "passed") process.exitCode = 1
