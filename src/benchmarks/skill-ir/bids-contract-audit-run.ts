import path from "node:path"
import { writeBidsContractAudit } from "./bids-contract-audit.ts"

const rootDir = process.cwd()
const outputPath = path.resolve(rootDir, "results/skill-ir/bids-contract-audit-v1/report.json")
const report = await writeBidsContractAudit({ rootDir, outputPath })
process.stdout.write(`${JSON.stringify({
  outputPath: path.relative(rootDir, outputPath),
  status: report.status,
  disclosure: report.disclosure.status,
  roles: report.roles,
  authorizations: report.authorizations,
}, null, 2)}\n`)
