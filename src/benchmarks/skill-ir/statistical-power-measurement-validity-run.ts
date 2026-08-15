import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { StatisticalPowerReportSchema } from "./statistical-power-contract.ts"
import {
  buildStatisticalPowerDisclosureAudit,
  buildStatisticalPowerMeasurementValidity,
} from "./statistical-power-measurement-validity.ts"

type JsonRecord = Record<string, unknown>

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function parseJsonl(bytes: Uint8Array): JsonRecord[] {
  return new TextDecoder().decode(bytes).split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JsonRecord)
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const normalize = (values: readonly string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b, "en"))
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right))
}

export async function writeStatisticalPowerMeasurementValidity(input: {
  rootDir?: string
  lockPath?: string
  publicInterfacePath?: string
  scorerPath?: string
  resultsDir?: string
  outputPath?: string
} = {}) {
  const rootDir = path.resolve(input.rootDir ?? process.cwd())
  const lockPath = input.lockPath ?? "benchmarks/skill-ir/pilots/statistical-power/development-calibration-lock.json"
  const publicInterfacePath = input.publicInterfacePath ?? "benchmarks/skill-ir/pilots/statistical-power/public-interface.json"
  const scorerPath = input.scorerPath ?? "src/bench/evaluators/statistical-power-grade.ts"
  const resultsDir = input.resultsDir ?? "results/skill-ir/statistical-power-development-baseline-v1"
  const outputPath = input.outputPath ?? `${resultsDir}/measurement-validity.json`
  const paths = {
    lock: lockPath,
    publicInterface: publicInterfacePath,
    scorer: scorerPath,
    qualification: `${resultsDir}/qualification.json`,
    selectedScoredRows: `${resultsDir}/run/selected-scored-runs.jsonl`,
    executionEnvelopes: `${resultsDir}/run/execution-envelopes.jsonl`,
    gate: `${resultsDir}/gate-report.json`,
  } as const
  const entries = await Promise.all(Object.entries(paths).map(async ([name, relativePath]) => {
    const bytes = await readFile(path.resolve(rootDir, relativePath))
    return [name, { path: relativePath.replaceAll("\\", "/"), sha256: sha256(bytes), bytes }] as const
  }))
  const bound = Object.fromEntries(entries) as Record<keyof typeof paths, { path: string; sha256: string; bytes: Buffer }>
  const publicInterface = JSON.parse(bound.publicInterface.bytes.toString("utf8")) as JsonRecord
  const jsonContract = publicInterface.jsonContract as {
    requiredTopLevelFields: string[]
    assumptions?: { type?: unknown }
    sensitivity?: { fields?: string[] }
  }
  const scoredRows = parseJsonl(bound.selectedScoredRows.bytes)
  const envelopes = parseJsonl(bound.executionEnvelopes.bytes)
  const qualification = JSON.parse(bound.qualification.bytes.toString("utf8")) as JsonRecord
  const gate = JSON.parse(bound.gate.bytes.toString("utf8")) as JsonRecord
  let parsedPublicReports = 0
  let topLevelContractReports = 0
  let strictSchemaReports = 0
  for (const row of scoredRows) {
    const workDir = path.resolve(
      rootDir,
      resultsDir,
      "run",
      "artifacts",
      `${String(row.skill)}__${String(row.agent)}__${String(row.environment)}__${String(row.context)}__${String(row.task)}`,
      String(row.system),
      `run-${Number(row.runIndex)}`,
      "workdir",
    )
    try {
      const report = JSON.parse(await readFile(path.join(workDir, "power-analysis.json"), "utf8")) as unknown
      if (!report || typeof report !== "object" || Array.isArray(report)) continue
      parsedPublicReports += 1
      const keys = Object.keys(report as JsonRecord)
      if (sameStringSet(keys, jsonContract.requiredTopLevelFields)) topLevelContractReports += 1
      if (StatisticalPowerReportSchema.safeParse(report).success) strictSchemaReports += 1
    } catch {
      // Missing and malformed public reports remain counted outside parsedPublicReports.
    }
  }
  const selected = gate.selected as JsonRecord
  const systems = selected.systems as Record<string, JsonRecord>
  const allAttempts = gate.allAttempts as JsonRecord
  const report = buildStatisticalPowerMeasurementValidity({
    calibrationId: String(gate.calibrationId),
    inputs: Object.fromEntries(Object.entries(bound).map(([name, value]) => [
      name,
      { path: value.path, sha256: value.sha256 },
    ])),
    disclosure: buildStatisticalPowerDisclosureAudit(jsonContract),
    qualificationRows: qualification.status === "passed" ? 1 : 0,
    selectedMatrixRows: scoredRows.length,
    semanticCompleteRows: envelopes.filter((row) => row.classification === "semantic-complete").length,
    activeExecutionFailures: Number(allAttempts.activeExecutionFailures),
    parserOrRuntimeBlockers: Number(allAttempts.parserOrRuntimeBlockers),
    parsedPublicReports,
    topLevelContractReports,
    strictSchemaReports,
    numericGatePassed: gate.passed === true,
    noSkillMeanScore: Number(systems["no-skill"]?.meanScore),
    originalMeanScore: Number(systems.original?.meanScore),
    differingPairs: Number(selected.differingPairs),
  })
  const resolvedOutput = path.resolve(rootDir, outputPath)
  await mkdir(path.dirname(resolvedOutput), { recursive: true })
  await writeFile(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report
}

if (import.meta.main) {
  writeStatisticalPowerMeasurementValidity().then((report) => {
    console.log(JSON.stringify({
      calibrationId: report.calibrationId,
      decision: report.decision,
      blocker: report.blocker,
      paidCalls: report.paidCalls,
    }, null, 2))
  })
}
