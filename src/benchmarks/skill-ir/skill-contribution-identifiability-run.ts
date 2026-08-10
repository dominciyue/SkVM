import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  SkillContributionIdentifiabilityManifestSchema,
  analyzeSkillContribution,
  verifyContributionManifest,
  type SkillContributionReport,
} from "./skill-contribution-identifiability.ts"

export type SkillContributionIdentifiabilityArgs = {
  manifestPath: string
  outPath: string
}

export function parseSkillContributionIdentifiabilityArgs(
  argv: string[],
): SkillContributionIdentifiabilityArgs {
  let manifestPath = ""
  let outPath = ""
  for (const argument of argv) {
    if (argument.startsWith("--manifest=")) {
      manifestPath = argument.slice("--manifest=".length)
    } else if (argument.startsWith("--out=")) {
      outPath = argument.slice("--out=".length)
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }
  if (!manifestPath) throw new Error("--manifest is required")
  if (!outPath) throw new Error("--out is required")
  return { manifestPath, outPath }
}

export async function runSkillContributionIdentifiability(input: {
  rootDir: string
  manifestPath: string
  outPath: string
}): Promise<SkillContributionReport> {
  const manifest = SkillContributionIdentifiabilityManifestSchema.parse(
    JSON.parse(await readFile(path.resolve(input.manifestPath), "utf8")),
  )
  const verified = await verifyContributionManifest(manifest, input.rootDir)
  const report = analyzeSkillContribution(verified)
  const outPath = path.resolve(input.outPath)
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report
}

export function contributionIdentifiabilityExitCode(
  report: SkillContributionReport,
): 0 | 1 {
  return report.status === "eligible-for-baseline" ? 0 : 1
}

async function main(): Promise<void> {
  const args = parseSkillContributionIdentifiabilityArgs(process.argv.slice(2))
  const rootDir = process.cwd()
  const report = await runSkillContributionIdentifiability({
    rootDir,
    manifestPath: path.resolve(rootDir, args.manifestPath),
    outPath: path.resolve(rootDir, args.outPath),
  })
  console.log(JSON.stringify({
    auditId: report.auditId,
    status: report.status,
    independentSkillDerivedClaims: report.counts.independentSkillDerivedClaims,
    taskSetSkillDerivedWeight: report.coverage.taskSetSkillDerivedWeight,
    out: args.outPath,
  }, null, 2))
  process.exitCode = contributionIdentifiabilityExitCode(report)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
