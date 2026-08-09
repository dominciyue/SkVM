import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { validatePublicOutputRecord } from "../../bench/public-output-abi.ts"
import { validatePublicOutputRecordV2 } from "../../bench/public-output-abi-v2.ts"

type AbiStatus = "pass" | "fail" | "missing" | "unparseable"
type JsonRecord = Record<string, unknown>
type AuthorityResult =
  | { status: "accepted" }
  | { status: "missing-output" }
  | { status: "abi-failure" }
  | { status: "semantic-failure" }
  | { status: "representation-false-reject"; reason: "array-order-undeclared" }
type AuthorityObservation = {
  task: string
  system: string
  runIndex: number
  parseStatus: "parsed" | "missing" | "unparseable"
  abiStatus: AbiStatus
  shape: string
  reportCriterionFailed: boolean
  authority: AuthorityResult
}

export function publicOutputShapeSignature(value: unknown): string {
  if (value === null) return "null"
  if (Array.isArray(value)) {
    const itemShapes = [...new Set(value.map(publicOutputShapeSignature))].sort()
    return `array<${itemShapes.join("|") || "empty"}>`
  }
  if (value && typeof value === "object") {
    const fields = Object.entries(value as JsonRecord)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([name, nested]) => `${name}:${publicOutputShapeSignature(nested)}`)
    return `object{${fields.join(",")}}`
  }
  return typeof value
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const sort = (values: readonly string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b, "en"))
  return JSON.stringify(sort(left)) === JSON.stringify(sort(right))
}

function resolveAbiStatus(
  parseStatus: "parsed" | "missing" | "unparseable",
  validationStatus: "pass" | "fail" | undefined,
): AbiStatus {
  if (validationStatus !== undefined) return validationStatus
  if (parseStatus === "parsed") throw new Error("parsed public output is missing ABI validation")
  return parseStatus
}

export function resolvePublicOutputAbiModulePath(abi: unknown): string {
  const schemaVersion = (abi as { schemaVersion?: unknown } | undefined)?.schemaVersion
  if (schemaVersion === "skill-ir-public-output-abi/v1") return "src/bench/public-output-abi.ts"
  if (schemaVersion === "skill-ir-public-output-abi/v2") return "src/bench/public-output-abi-v2.ts"
  throw new Error(`Unsupported public output ABI schema: ${String(schemaVersion)}`)
}

export function validateDeclaredPublicOutputAbi(abi: unknown, value: unknown) {
  const modulePath = resolvePublicOutputAbiModulePath(abi)
  return modulePath.endsWith("public-output-abi-v2.ts")
    ? validatePublicOutputRecordV2(abi, value)
    : validatePublicOutputRecord(abi, value)
}

export function classifyI18nReportAuthority(input: {
  abiStatus: AbiStatus
  reportCriterionFailed: boolean
  report?: JsonRecord
  derivedKeys?: string[]
}): AuthorityResult {
  if (input.abiStatus === "missing" || input.abiStatus === "unparseable") return { status: "missing-output" }
  if (input.abiStatus === "fail") return { status: "abi-failure" }
  if (!input.reportCriterionFailed) return { status: "accepted" }
  const report = input.report
  const derivedKeys = input.derivedKeys
  if (
    report
    && derivedKeys
    && report.framework === "react-i18next"
    && JSON.stringify(report.scannedFiles) === JSON.stringify(["src/App.tsx"])
    && isStringArray(report.extractedKeys)
    && sameStringSet(report.extractedKeys, derivedKeys)
    && JSON.stringify(report.extractedKeys) !== JSON.stringify(derivedKeys)
    && JSON.stringify(report.missingKeys) === JSON.stringify({ "zh-CN": [], "en-US": [] })
  ) {
    return { status: "representation-false-reject", reason: "array-order-undeclared" }
  }
  return { status: "semantic-failure" }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

async function readJsonl(filePath: string): Promise<JsonRecord[]> {
  return (await readFile(filePath, "utf8")).split(/\r?\n/u)
    .map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line) as JsonRecord)
}

async function readOptional(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  }
}

function parseLawEvidence(contract: JsonRecord, report: string): JsonRecord | undefined {
  const reviewEvidence = contract.reviewEvidence as JsonRecord
  const lines = report.split(/\r\n?|\n/u)
  const opening = lines.findIndex((line) => line.trimEnd() === reviewEvidence.openingMarker)
  if (opening < 0) return undefined
  const closingOffset = lines.slice(opening + 1)
    .findIndex((line) => line.trimEnd() === reviewEvidence.closingMarker)
  if (closingOffset < 0) return undefined
  try {
    const value = JSON.parse(lines.slice(opening + 1, opening + 1 + closingOffset).join("\n")) as unknown
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : undefined
  } catch {
    return undefined
  }
}

function markerKeys(source: string | undefined): string[] {
  if (!source) return []
  return [...source.matchAll(/data-i18n-key=["']([^"']+)["']/gu)]
    .map((match) => match[1]!).sort((left, right) => left.localeCompare(right, "en"))
}

export async function runPublicOutputAbiAuthorityAudit(input: {
  rootDir: string
  kind: "law" | "i18n"
  lockPath: string
  resultsDir: string
  outPath: string
}) {
  const rootDir = path.resolve(input.rootDir)
  const lockBytes = await readFile(path.resolve(rootDir, input.lockPath))
  const lock = JSON.parse(lockBytes.toString("utf8")) as JsonRecord
  const frozenInputs = lock.frozenInputs as Record<
    string,
    { path: string; sha256: string } | Array<{ path: string; sha256: string }>
  >
  const matrix = lock.matrix as JsonRecord
  const skillId = String(lock.skillId)
  const resultsDir = path.resolve(rootDir, input.resultsDir)
  const scoredPath = path.join(resultsDir, "scored-runs.jsonl")
  const scoredBytes = await readFile(scoredPath)
  const rows = await readJsonl(scoredPath)
  const publicContractInput = frozenInputs.publicContract as { path: string; sha256: string }
  const scorerInput = frozenInputs.scorer as { path: string; sha256: string }
  const contractBytes = await readFile(path.resolve(rootDir, publicContractInput.path))
  const contract = JSON.parse(contractBytes.toString("utf8")) as JsonRecord
  const abi = contract.outputAbi
  const agent = (matrix.agents as string[])[0]!
  const environment = (matrix.environments as string[])[0]!
  const context = (matrix.contexts as string[])[0]!
  const criterionId = input.kind === "law" ? "law-v3-review" : "i18n-v2-report"
  const observations: AuthorityObservation[] = []

  for (const row of rows) {
    const task = String(row.task)
    const system = String(row.system)
    const runIndex = Number(row.runIndex)
    const workDir = path.join(
      resultsDir,
      "run",
      "artifacts",
      `${skillId}__${agent}__${environment}__${context}__${task}`,
      system,
      `run-${runIndex}`,
      "workdir",
    )
    let report: JsonRecord | undefined
    let parseStatus: "parsed" | "missing" | "unparseable" = "missing"
    let derivedKeys: string[] | undefined
    if (input.kind === "law") {
      const outputPath = (contract.outputs as JsonRecord).review
      const text = typeof outputPath === "string"
        ? await readOptional(path.join(workDir, ...outputPath.split("/")))
        : undefined
      if (text !== undefined) {
        report = parseLawEvidence(contract, text)
        parseStatus = report ? "parsed" : "unparseable"
      }
    } else {
      const reportPath = (contract.report as JsonRecord).path
      const text = typeof reportPath === "string" ? await readOptional(path.join(workDir, reportPath)) : undefined
      if (text !== undefined) {
        try {
          const value = JSON.parse(text) as unknown
          if (value && typeof value === "object" && !Array.isArray(value)) {
            report = value as JsonRecord
            parseStatus = "parsed"
          } else parseStatus = "unparseable"
        } catch {
          parseStatus = "unparseable"
        }
      }
      derivedKeys = markerKeys(await readOptional(path.join(workDir, "src", "App.tsx")))
    }
    const validation = report ? validateDeclaredPublicOutputAbi(abi, report) : undefined
    const abiStatus = resolveAbiStatus(parseStatus, validation?.status)
    const reportCriterionFailed = Array.isArray(row.failedCriteria)
      && row.failedCriteria.includes(criterionId)
    const authority = input.kind === "i18n"
      ? classifyI18nReportAuthority({ abiStatus, reportCriterionFailed, report, derivedKeys })
      : abiStatus === "pass" && !reportCriterionFailed
        ? { status: "accepted" as const }
        : abiStatus === "missing" || abiStatus === "unparseable"
          ? { status: "missing-output" as const }
          : abiStatus === "fail"
            ? { status: "abi-failure" as const }
            : { status: "semantic-failure" as const }
    observations.push({
      task,
      system,
      runIndex,
      parseStatus,
      abiStatus,
      shape: report ? publicOutputShapeSignature(report) : parseStatus,
      reportCriterionFailed,
      authority,
    })
  }

  const gateBytes = await readFile(path.join(resultsDir, "gate-report.json"))
  const gate = JSON.parse(gateBytes.toString("utf8")) as JsonRecord
  const falseRejectRows = observations.filter((row) => row.authority.status === "representation-false-reject").length
  const abiModulePath = resolvePublicOutputAbiModulePath(abi)
  const abiModuleBytes = await readFile(path.resolve(rootDir, abiModulePath))
  const abiModuleSha256 = sha256(abiModuleBytes)
  const scorerDependencies = Array.isArray(frozenInputs.scorerDependencies)
    ? frozenInputs.scorerDependencies
    : []
  const preregisteredInLock = scorerDependencies.some((dependency) =>
    dependency.path === abiModulePath && dependency.sha256 === abiModuleSha256
  )
  const audit = {
    schemaVersion: "skill-ir-public-output-abi-authority-audit/v1",
    calibrationId: lock.calibrationId,
    skillId,
    kind: input.kind,
    inputs: {
      lock: { path: input.lockPath, sha256: sha256(lockBytes) },
      publicContract: { path: publicContractInput.path, sha256: sha256(contractBytes) },
      scorer: scorerInput,
      publicOutputAbiModule: {
        path: abiModulePath,
        sha256: abiModuleSha256,
        preregisteredInLock,
      },
      scoredRows: { path: path.relative(rootDir, scoredPath).replaceAll("\\", "/"), sha256: sha256(scoredBytes) },
      gate: { path: `${input.resultsDir}/gate-report.json`, sha256: sha256(gateBytes) },
    },
    counts: {
      observedRows: observations.length,
      parsedReports: observations.filter((row) => row.parseStatus === "parsed").length,
      missingOrUnparseableReports: observations.filter((row) => row.parseStatus !== "parsed").length,
      abiPassReports: observations.filter((row) => row.abiStatus === "pass").length,
      abiFailReports: observations.filter((row) => row.abiStatus === "fail").length,
      representationFalseRejectRows: falseRejectRows,
    },
    shapes: Object.fromEntries([...new Set(observations.map((row) => row.shape))].sort()
      .map((shape) => [shape, observations.filter((row) => row.shape === shape).length])),
    rows: observations,
    decision: falseRejectRows === 0 ? "representation-valid" : "measurement-invalid",
    numericGatePassed: gate.passed === true,
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
  const kind = argument("kind")
  if (kind !== "law" && kind !== "i18n") throw new Error("--kind must be law or i18n")
  runPublicOutputAbiAuthorityAudit({
    rootDir: process.cwd(),
    kind,
    lockPath: argument("lock"),
    resultsDir: argument("results"),
    outPath: argument("out"),
  }).then((audit) => console.log(JSON.stringify({
    skillId: audit.skillId,
    decision: audit.decision,
    counts: audit.counts,
  }, null, 2)))
}
