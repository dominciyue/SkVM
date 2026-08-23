import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  BidsProspectiveConstructionMetadataSchema,
  buildBidsProspectiveConstructionReport,
} from "./bids-prospective-construction"

export async function writeBidsProspectiveConstructionReport(input: {
  rootDir: string
  metadataPath?: string
  outputPath?: string
}) {
  const rootDir = path.resolve(input.rootDir)
  const metadataPath = path.resolve(
    rootDir,
    input.metadataPath ?? "benchmarks/skill-ir/pilots/bids/prospective-construction-metadata.json",
  )
  const outputPath = path.resolve(
    rootDir,
    input.outputPath ?? "results/skill-ir/bids-prospective-construction-v1/report.json",
  )
  const metadata = BidsProspectiveConstructionMetadataSchema.parse(JSON.parse(
    await readFile(metadataPath, "utf8"),
  ))
  const report = await buildBidsProspectiveConstructionReport(rootDir, metadata)
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const metadataArg = args.find((item) => item.startsWith("--metadata="))
  const outputArg = args.find((item) => item.startsWith("--out="))
  const unknown = args.filter((item) => !item.startsWith("--metadata=") && !item.startsWith("--out="))
  if (unknown.length > 0) throw new Error(`Unknown argument: ${unknown[0]}`)
  const report = await writeBidsProspectiveConstructionReport({
    rootDir: process.cwd(),
    ...(metadataArg ? { metadataPath: metadataArg.slice("--metadata=".length) } : {}),
    ...(outputArg ? { outputPath: outputArg.slice("--out=".length) } : {}),
  })
  console.log(JSON.stringify({
    constructionId: report.constructionId,
    durationMs: report.cost.summary.durationMs,
    packageBytes: report.cost.summary.packageBytes,
    automaticCostEligible: report.prePaidGate.automaticCostEligible,
    humanMinutes: report.adaptation.humanMinutes,
    adapterLoc: report.adaptation.adapterLoc,
    coreBranchDelta: report.adaptation.coreBranchDelta,
  }, null, 2))
}
