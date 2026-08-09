import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { lawToMarkdownGradeV2 } from "../../bench/evaluators/law-to-markdown-grade-v2.ts"
import { i18nHelperGrade } from "../../bench/evaluators/i18n-helper-grade.ts"
import type { CustomEvaluator } from "../../framework/types.ts"
import { BenchmarkContractAuditManifestSchema } from "./benchmark-contract-audit.ts"
import { runBenchmarkContractAudit } from "./benchmark-contract-audit-run.ts"

const evaluators = new Map<string, CustomEvaluator>([
  ["skill-ir-law-to-markdown-v2", lawToMarkdownGradeV2],
  ["skill-ir-i18n-helper", i18nHelperGrade],
])

function option(name: string): string {
  const prefix = `--${name}=`
  const value = process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length)
  if (!value) throw new Error(`--${name} is required`)
  return value
}

export async function runMethodCaseContractAudit(input: {
  manifestPath: string
  outputPath: string
  rootDir?: string
}) {
  const rootDir = path.resolve(input.rootDir ?? process.cwd())
  const manifest = BenchmarkContractAuditManifestSchema.parse(JSON.parse(
    await readFile(path.resolve(rootDir, input.manifestPath), "utf8"),
  ))
  const evaluator = evaluators.get(manifest.scorer.evaluatorId)
  if (!evaluator) throw new Error(`Unsupported method-case evaluator: ${manifest.scorer.evaluatorId}`)
  const report = await runBenchmarkContractAudit(manifest, rootDir, {
    evaluatorSourcePaths: new Map([[manifest.scorer.evaluatorId, manifest.scorer.path]]),
    evaluatorSourceDigests: new Map([[manifest.scorer.evaluatorId, manifest.scorer.sha256]]),
    evaluatorImplementations: new Map([[manifest.scorer.evaluatorId, evaluator]]),
  })
  const outputPath = path.resolve(rootDir, input.outputPath)
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report
}

if (import.meta.main) {
  const report = await runMethodCaseContractAudit({
    manifestPath: option("manifest"),
    outputPath: option("out"),
  })
  console.log(JSON.stringify({ auditId: report.auditId, status: report.status, canaries: report.canaries.length }, null, 2))
  if (report.status !== "passed") process.exitCode = 1
}
