import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { extractTokenUsage, parseCaseId } from "./scoring.ts"

type PublicOutputStatus = "parsed" | "missing" | "unparseable"
type UsageStatus = "reported-positive" | "reported-zero" | "unavailable"
type ExecutionObservationStatus =
  | "observable-model-completion"
  | "observable-semantic-failure"
  | "declared-infrastructure-failure"
  | "silent-zero-usage-no-output"
  | "missing-usage-and-output"

type JsonRecord = Record<string, unknown>

export type CalibrationExecutionObservation = {
  status: ExecutionObservationStatus
  usageStatus: UsageStatus
  finalOutputPresent: boolean
  publicOutputPresent: boolean
  semanticInterpretationAllowed: boolean
}

function finalOutputPresent(stdout: string): boolean {
  const match = /final output:/giu
  let lastEnd = -1
  for (const item of stdout.matchAll(match)) lastEnd = item.index + item[0].length
  return lastEnd >= 0 && stdout.slice(lastEnd).trim().length > 0
}

export function classifyCalibrationExecutionObservation(input: {
  exitCode: number
  runStatus: string
  stdout: string
  scoredSuccess: boolean
  scoredFailureType?: string
  publicOutputStatus: PublicOutputStatus
}): CalibrationExecutionObservation {
  const usage = extractTokenUsage(input.stdout)
  const usageStatus: UsageStatus = usage === undefined
    ? "unavailable"
    : usage.inputTokens + usage.outputTokens > 0
      ? "reported-positive"
      : "reported-zero"
  const hasFinalOutput = finalOutputPresent(input.stdout)
  const hasPublicOutput = input.publicOutputStatus !== "missing"
  const base = {
    usageStatus,
    finalOutputPresent: hasFinalOutput,
    publicOutputPresent: hasPublicOutput,
  }

  if (input.exitCode !== 0 || input.runStatus !== "ok" || input.scoredFailureType === "infrastructure") {
    return {
      status: "declared-infrastructure-failure",
      ...base,
      semanticInterpretationAllowed: false,
    }
  }
  if (!hasFinalOutput && !hasPublicOutput && usageStatus === "reported-zero") {
    return {
      status: "silent-zero-usage-no-output",
      ...base,
      semanticInterpretationAllowed: false,
    }
  }
  if (!hasFinalOutput && !hasPublicOutput && usageStatus === "unavailable") {
    return {
      status: "missing-usage-and-output",
      ...base,
      semanticInterpretationAllowed: false,
    }
  }
  return {
    status: input.scoredSuccess ? "observable-model-completion" : "observable-semantic-failure",
    ...base,
    semanticInterpretationAllowed: true,
  }
}

export function summarizeCalibrationExecutionObservations(
  observations: Array<Pick<CalibrationExecutionObservation, "status" | "semanticInterpretationAllowed">>,
) {
  const count = (status: ExecutionObservationStatus) => observations.filter((row) => row.status === status).length
  const observableModelCompletions = count("observable-model-completion")
  const observableSemanticFailures = count("observable-semantic-failure")
  const semanticInterpretationAllowed = observations.every((row) => row.semanticInterpretationAllowed)
  return {
    observedRows: observations.length,
    observableRows: observableModelCompletions + observableSemanticFailures,
    observableModelCompletions,
    observableSemanticFailures,
    declaredInfrastructureFailures: count("declared-infrastructure-failure"),
    silentZeroUsageNoOutputRows: count("silent-zero-usage-no-output"),
    missingUsageAndOutputRows: count("missing-usage-and-output"),
    semanticInterpretationAllowed,
    decision: semanticInterpretationAllowed
      ? "execution-observable" as const
      : "execution-observability-blocked" as const,
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

async function readJsonl(filePath: string): Promise<JsonRecord[]> {
  return (await readFile(filePath, "utf8")).split(/\r?\n/u)
    .map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line) as JsonRecord)
}

function rowKey(task: string, system: string, runIndex: number): string {
  return `${task}\0${system}\0${runIndex}`
}

export async function runPublicContractCalibrationExecutionAudit(input: {
  rootDir: string
  resultsDir: string
  outPath: string
}) {
  const rootDir = path.resolve(input.rootDir)
  const resultsDir = path.resolve(rootDir, input.resultsDir)
  const paths = {
    raw: path.join(resultsDir, "run", "raw-runs.jsonl"),
    scored: path.join(resultsDir, "scored-runs.jsonl"),
    gate: path.join(resultsDir, "gate-report.json"),
    authority: path.join(resultsDir, "authority-audit.json"),
  }
  const [rawBytes, scoredBytes, gateBytes, authorityBytes] = await Promise.all([
    readFile(paths.raw),
    readFile(paths.scored),
    readFile(paths.gate),
    readFile(paths.authority),
  ])
  const rawRows = await readJsonl(paths.raw)
  const scoredRows = await readJsonl(paths.scored)
  const gate = JSON.parse(gateBytes.toString("utf8")) as JsonRecord
  const authority = JSON.parse(authorityBytes.toString("utf8")) as JsonRecord
  if (gate.calibrationId !== authority.calibrationId) {
    throw new Error("Execution audit calibration identity mismatch")
  }

  const scoredByKey = new Map(scoredRows.map((row) => {
    const parsed = parseCaseId(String(row.caseId))
    return [rowKey(parsed.task, String(row.system), Number(row.runIndex)), row] as const
  }))
  const authorityRows = Array.isArray(authority.rows) ? authority.rows as JsonRecord[] : []
  const authorityByKey = new Map(authorityRows.map((row) => [
    rowKey(String(row.task), String(row.system), Number(row.runIndex)),
    row,
  ] as const))

  const rows = rawRows.map((raw) => {
    const parsed = parseCaseId(String(raw.caseId))
    const task = parsed.task
    const system = String(raw.system)
    const runIndex = Number(raw.runIndex)
    const key = rowKey(task, system, runIndex)
    const scored = scoredByKey.get(key)
    const publicOutput = authorityByKey.get(key)
    if (!scored || !publicOutput) throw new Error(`Execution audit row identity mismatch: ${key}`)
    const observation = classifyCalibrationExecutionObservation({
      exitCode: Number(raw.exitCode),
      runStatus: String(raw.runStatus ?? "ok"),
      stdout: String(raw.stdout ?? ""),
      scoredSuccess: scored.success === true,
      ...(typeof scored.failureType === "string" ? { scoredFailureType: scored.failureType } : {}),
      publicOutputStatus: String(publicOutput.parseStatus) as PublicOutputStatus,
    })
    return { task, system, runIndex, ...observation }
  })
  if (rows.length !== scoredRows.length || rows.length !== authorityRows.length) {
    throw new Error("Execution audit row count mismatch")
  }
  const counts = summarizeCalibrationExecutionObservations(rows)
  const relative = (filePath: string) => path.relative(rootDir, filePath).replaceAll("\\", "/")
  const audit = {
    schemaVersion: "skill-ir-public-contract-calibration-execution-audit/v1",
    calibrationId: gate.calibrationId,
    methodEvidence: false,
    inputs: {
      rawRuns: { path: relative(paths.raw), sha256: sha256(rawBytes) },
      scoredRows: { path: relative(paths.scored), sha256: sha256(scoredBytes) },
      gate: { path: relative(paths.gate), sha256: sha256(gateBytes) },
      authorityAudit: { path: relative(paths.authority), sha256: sha256(authorityBytes) },
    },
    frozenEvidencePolicy: {
      rewritesRawRows: false,
      rewritesScoredRows: false,
      rewritesGate: false,
      changesFailureType: false,
    },
    counts,
    rows,
    conclusion: {
      benchmarkRepresentation: authority.decision,
      numericGatePassed: gate.passed === true,
      semanticGateInterpretationAllowed: counts.semanticInterpretationAllowed,
      baseIrAuditAllowed: gate.passed === true && counts.semanticInterpretationAllowed,
      heldOutAllowed: false,
      entersMainClaim: false,
    },
  }
  const outPath = path.resolve(rootDir, input.outPath)
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8")
  return audit
}

function argument(name: string): string {
  const prefix = `--${name}=`
  const value = process.argv.slice(2).find((item) => item.startsWith(prefix))?.slice(prefix.length)
  if (!value) throw new Error(`--${name} is required`)
  return value
}

if (import.meta.main) {
  runPublicContractCalibrationExecutionAudit({
    rootDir: process.cwd(),
    resultsDir: argument("results"),
    outPath: argument("out"),
  }).then((audit) => console.log(JSON.stringify({
    calibrationId: audit.calibrationId,
    decision: audit.counts.decision,
    counts: audit.counts,
  }, null, 2)))
}
