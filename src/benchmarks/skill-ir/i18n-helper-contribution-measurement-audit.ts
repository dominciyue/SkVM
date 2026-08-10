import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { RunResult } from "../../core/types.ts"
import { i18nHelperContributionV2Grade } from "../../bench/evaluators/i18n-helper-contribution-v2-grade.ts"

const CRITERIA = [
  "i18n-contribution-delta",
  "i18n-contribution-artifact",
  "i18n-contribution-extraction",
  "i18n-contribution-preservation",
  "i18n-contribution-locales",
] as const

const WEIGHTS: Record<typeof CRITERIA[number], number> = {
  "i18n-contribution-delta": 0.15,
  "i18n-contribution-artifact": 0.15,
  "i18n-contribution-extraction": 0.25,
  "i18n-contribution-preservation": 0.2,
  "i18n-contribution-locales": 0.25,
}

export type I18nContributionMeasurementObservation = {
  caseId: string
  system: string
  runIndex: number
  priorScore: number
  priorCriteria: Record<typeof CRITERIA[number], boolean>
  v2ExtractionPass: boolean
  v2LocalesPass: boolean
  tokenCost?: number
}

export type I18nContributionMeasurementAuditReport = {
  schemaVersion: "skill-ir-i18n-contribution-measurement-audit/v1"
  status: "measurement-invalid" | "no-false-rejection-observed"
  counts: {
    rows: number
    rowsWithFalseRejection: number
    extractionFalseRejections: number
    localeFalseRejections: number
    v2Successes: number
  }
  systems: Array<{
    system: string
    rows: number
    priorMean: number
    counterfactualMean: number
    priorSuccesses: number
    counterfactualSuccesses: number
    tokenCost: number
  }>
  rows: Array<I18nContributionMeasurementObservation & {
    extractionFalseRejection: boolean
    localeFalseRejection: boolean
    counterfactualScore: number
    counterfactualSuccess: boolean
  }>
  defects: Array<{
    code: "HIDDEN_REPORT_PLACEHOLDER_NORMALIZATION" | "UNSUPPORTED_I18NEXT_V4_PLURAL_FAMILY"
    evidence: string
  }>
  nextAction: string
  claimBoundary: string
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000
}

export function summarizeI18nContributionMeasurementAudit(
  observations: I18nContributionMeasurementObservation[],
): I18nContributionMeasurementAuditReport {
  const rows = observations.map((observation) => {
    const corrected = {
      ...observation.priorCriteria,
      "i18n-contribution-extraction": observation.v2ExtractionPass,
      "i18n-contribution-locales": observation.v2LocalesPass,
    }
    const counterfactualScore = round(CRITERIA.reduce(
      (score, criterion) => score + (corrected[criterion] ? WEIGHTS[criterion] : 0),
      0,
    ))
    return {
      ...observation,
      extractionFalseRejection: !observation.priorCriteria["i18n-contribution-extraction"] && observation.v2ExtractionPass,
      localeFalseRejection: !observation.priorCriteria["i18n-contribution-locales"] && observation.v2LocalesPass,
      counterfactualScore,
      counterfactualSuccess: CRITERIA.every((criterion) => corrected[criterion]),
    }
  })
  const systems = [...new Set(rows.map((row) => row.system))].sort().map((system) => {
    const selected = rows.filter((row) => row.system === system)
    return {
      system,
      rows: selected.length,
      priorMean: round(selected.reduce((sum, row) => sum + row.priorScore, 0) / selected.length),
      counterfactualMean: round(selected.reduce((sum, row) => sum + row.counterfactualScore, 0) / selected.length),
      priorSuccesses: selected.filter((row) => Object.values(row.priorCriteria).every(Boolean)).length,
      counterfactualSuccesses: selected.filter((row) => row.counterfactualSuccess).length,
      tokenCost: selected.reduce((sum, row) => sum + (row.tokenCost ?? 0), 0),
    }
  })
  const extractionFalseRejections = rows.filter((row) => row.extractionFalseRejection).length
  const localeFalseRejections = rows.filter((row) => row.localeFalseRejection).length
  const rowsWithFalseRejection = rows.filter((row) => row.extractionFalseRejection || row.localeFalseRejection).length
  return {
    schemaVersion: "skill-ir-i18n-contribution-measurement-audit/v1",
    status: rowsWithFalseRejection > 0 ? "measurement-invalid" : "no-false-rejection-observed",
    counts: {
      rows: rows.length,
      rowsWithFalseRejection,
      extractionFalseRejections,
      localeFalseRejections,
      v2Successes: rows.filter((row) => row.counterfactualSuccess).length,
    },
    systems,
    rows,
    defects: [
      {
        code: "HIDDEN_REPORT_PLACEHOLDER_NORMALIZATION",
        evidence: "The v1 public ABI typed originalText only as string, while the scorer privately required locale-style double-brace placeholders.",
      },
      {
        code: "UNSUPPORTED_I18NEXT_V4_PLURAL_FAMILY",
        evidence: "The v1 locale criterion named plural support but required an exact locale key and rejected public base keys backed by _one/_other forms.",
      },
    ],
    nextAction: "Freeze v1 as measurement-invalid evidence. Validate the prospective public-semantics scorer identity before any new paid baseline.",
    claimBoundary: "Development-only counterfactual rescore of frozen final workdirs; it is not a replacement scored run, gate result, held-out result, or Skill IR optimization claim.",
  }
}

type ScoredRow = {
  caseId: string
  system: string
  runIndex: number
  evaluatorScore: number
  tokenCost?: number
  initialWorkdirManifest?: { path: string }
  evaluationSummary?: Array<{ id?: string; pass: boolean }>
}

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length)
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  return (await readFile(filePath, "utf8"))
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

function priorCriteria(row: ScoredRow): I18nContributionMeasurementObservation["priorCriteria"] {
  const byId = new Map((row.evaluationSummary ?? []).flatMap((criterion) =>
    criterion.id ? [[criterion.id, criterion.pass] as const] : []
  ))
  return Object.fromEntries(CRITERIA.map((criterion) => [criterion, byId.get(criterion) === true])) as I18nContributionMeasurementObservation["priorCriteria"]
}

async function runV2Check(check: "extraction-coverage" | "locale-semantics", workDir: string): Promise<boolean> {
  const runResult: RunResult = {
    text: "measurement audit",
    steps: [],
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    cost: 0,
    durationMs: 0,
    llmDurationMs: 0,
    workDir,
    runStatus: "ok",
    usageAvailable: true,
  }
  const result = await i18nHelperContributionV2Grade.run({
    criterion: {
      method: "custom",
      evaluatorId: "skill-ir-i18n-helper-contribution-v2",
      payload: { schemaVersion: "skill-ir-i18n-contribution-eval/v2", check },
    },
    runResult,
  })
  if (result.infraError) throw new Error(result.infraError)
  return result.pass
}

export async function auditI18nContributionMeasurement(
  scoredRows: ScoredRow[],
  semanticsText: string,
): Promise<I18nContributionMeasurementAuditReport> {
  const observations: I18nContributionMeasurementObservation[] = []
  for (const row of scoredRows) {
    if (!row.initialWorkdirManifest?.path) throw new Error(`missing workdir manifest for ${row.caseId}`)
    const sourceWorkdir = path.join(path.dirname(row.initialWorkdirManifest.path), "workdir")
    const tempRoot = await mkdtemp(path.join(tmpdir(), "i18n-measurement-audit-"))
    const workDir = path.join(tempRoot, "workdir")
    try {
      await cp(sourceWorkdir, workDir, { recursive: true, errorOnExist: true })
      await writeFile(path.join(workDir, "i18n-report-semantics.json"), semanticsText, "utf8")
      observations.push({
        caseId: row.caseId,
        system: row.system,
        runIndex: row.runIndex,
        priorScore: row.evaluatorScore,
        priorCriteria: priorCriteria(row),
        v2ExtractionPass: await runV2Check("extraction-coverage", workDir),
        v2LocalesPass: await runV2Check("locale-semantics", workDir),
        ...(row.tokenCost === undefined ? {} : { tokenCost: row.tokenCost }),
      })
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  }
  return summarizeI18nContributionMeasurementAudit(observations)
}

if (import.meta.main) {
  const scoredPath = path.resolve(parseArg("scored") ?? "results/skill-ir/i18n-helper-contribution-development-v1/scored-runs.jsonl")
  const semanticsPath = path.resolve(parseArg("semantics") ?? "benchmarks/skill-ir/pilots/i18n-helper/contribution-v2/i18n-report-semantics.json")
  const outPath = path.resolve(parseArg("out") ?? "results/skill-ir/i18n-helper-contribution-development-v1/measurement-audit.json")
  const report = await auditI18nContributionMeasurement(
    await readJsonl<ScoredRow>(scoredPath),
    await readFile(semanticsPath, "utf8"),
  )
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  console.log(JSON.stringify({ status: report.status, counts: report.counts, systems: report.systems, out: outPath }, null, 2))
}
