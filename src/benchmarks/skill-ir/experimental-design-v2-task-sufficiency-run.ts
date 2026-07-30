import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  ExperimentalDesignV2TaskSufficiencyManifestSchema,
  ExperimentalDesignV2TaskSufficiencyReportSchema,
  analyzeExperimentalDesignV2TaskSufficiency,
  verifyExperimentalDesignV2TaskSufficiencyManifest,
} from "./experimental-design-v2-task-sufficiency.ts"

const DEFAULT_MANIFEST =
  "benchmarks/skill-ir/pilots/experimental-design/v2/public-contract-task-sufficiency-audit.json"
const DEFAULT_OUT =
  "results/skill-ir/experimental-design-v2-public-contract-task-sufficiency-audit-2026-07-31.json"

function option(name: string): string | undefined {
  return process.argv.slice(2).find((argument) => argument.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}

const rootDir = process.cwd()
const manifestPath = path.resolve(rootDir, option("--manifest") ?? DEFAULT_MANIFEST)
const outPath = path.resolve(rootDir, option("--out") ?? DEFAULT_OUT)
const verifyOnlyPath = option("--verify-only")
const manifest = ExperimentalDesignV2TaskSufficiencyManifestSchema.parse(
  JSON.parse(await readFile(manifestPath, "utf8")),
)

if (verifyOnlyPath) {
  await verifyExperimentalDesignV2TaskSufficiencyManifest(rootDir, manifest)
  const persisted = ExperimentalDesignV2TaskSufficiencyReportSchema.parse(
    JSON.parse(await readFile(path.resolve(rootDir, verifyOnlyPath), "utf8")),
  )
  const current = await analyzeExperimentalDesignV2TaskSufficiency({ rootDir, manifest })
  if (JSON.stringify(persisted) !== JSON.stringify(current)) {
    throw new Error("task sufficiency report drift")
  }
  console.log(JSON.stringify({ status: "verified", report: verifyOnlyPath }, null, 2))
} else {
  const report = await analyzeExperimentalDesignV2TaskSufficiency({ rootDir, manifest })
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  console.log(JSON.stringify({
    status: report.status,
    conclusion: report.conclusion,
    out: path.relative(rootDir, outPath),
  }, null, 2))
}
