import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { buildApiTesterContractAudit } from "./api-tester-contract-audit.ts"
import { buildApiTesterMaterializationAudit } from "./api-tester-materialization-audit.ts"

const CONTRACT_OUT = "results/skill-ir/api-tester-contract-audit-2026-07-31.json"
const MATERIALIZATION_OUT = "results/skill-ir/api-tester-materialization-audit-2026-07-31.json"

async function main(): Promise<void> {
  const rootDir = process.cwd()
  const [contract, materialization] = await Promise.all([
    buildApiTesterContractAudit({ rootDir }),
    buildApiTesterMaterializationAudit({ rootDir }),
  ])
  await mkdir(path.join(rootDir, "results/skill-ir"), { recursive: true })
  await Promise.all([
    writeFile(path.join(rootDir, CONTRACT_OUT), `${JSON.stringify(contract, null, 2)}\n`, "utf8"),
    writeFile(path.join(rootDir, MATERIALIZATION_OUT), `${JSON.stringify(materialization, null, 2)}\n`, "utf8"),
  ])
  console.log(JSON.stringify({
    contract: { status: contract.status, matched: contract.counts.matched, cases: contract.counts.cases, out: CONTRACT_OUT },
    materialization: {
      status: materialization.status,
      passed: materialization.counts.passed,
      checks: materialization.counts.checks,
      out: MATERIALIZATION_OUT,
    },
  }, null, 2))
}

if (import.meta.main) await main()
