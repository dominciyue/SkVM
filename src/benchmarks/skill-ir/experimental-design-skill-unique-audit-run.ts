import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { buildExperimentalDesignSkillUniqueAudits } from "./experimental-design-skill-unique-audit.ts"

const CONTRACT_OUT =
  "results/skill-ir/experimental-design-skill-unique-contract-audit-2026-07-31.json"
const MATERIALIZATION_OUT =
  "results/skill-ir/experimental-design-skill-unique-materialization-audit-2026-07-31.json"

async function main(): Promise<void> {
  const rootDir = process.cwd()
  const reports = await buildExperimentalDesignSkillUniqueAudits({ rootDir })
  await mkdir(path.join(rootDir, "results/skill-ir"), { recursive: true })
  await Promise.all([
    writeFile(path.join(rootDir, CONTRACT_OUT), `${JSON.stringify(reports.contract, null, 2)}\n`, "utf8"),
    writeFile(
      path.join(rootDir, MATERIALIZATION_OUT),
      `${JSON.stringify(reports.materialization, null, 2)}\n`,
      "utf8",
    ),
  ])
  console.log(JSON.stringify({
    contract: {
      status: reports.contract.status,
      matched: reports.contract.counts.matched,
      cases: reports.contract.counts.cases,
      out: CONTRACT_OUT,
    },
    materialization: {
      status: reports.materialization.status,
      passed: reports.materialization.counts.passed,
      checks: reports.materialization.counts.checks,
      out: MATERIALIZATION_OUT,
    },
  }, null, 2))
}

if (import.meta.main) await main()
