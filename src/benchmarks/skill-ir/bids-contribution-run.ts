import { writeBidsContributionEvidence } from "./bids-contribution.ts"

async function main(): Promise<void> {
  const evidence = await writeBidsContributionEvidence({ rootDir: process.cwd() })
  console.log(JSON.stringify({
    auditId: evidence.report.auditId,
    status: evidence.report.status,
    independentSkillDerivedClaims: evidence.report.counts.independentSkillDerivedClaims,
    taskSetSkillDerivedWeight: evidence.report.coverage.taskSetSkillDerivedWeight,
  }, null, 2))
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
