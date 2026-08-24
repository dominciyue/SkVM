import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  BIDS_SUCCESSOR_ARTIFACT_CONTROL_FREEZE_PATH,
  validateBidsSuccessorArtifactControlFreeze,
} from "./bids-successor-artifact-control.ts"
import { BidsProspectiveConstructionReportSchema } from "./bids-prospective-construction.ts"
import { buildBidsSuccessorDevelopmentPlan } from "./bids-successor-development.ts"
import {
  BIDS_SUCCESSOR_MATRIX_POLICY_PATH,
  assertBidsSuccessorPersistedPrefix,
  orderedBidsSuccessorMatrixRows,
  validateBidsSuccessorMatrixPolicy,
} from "./bids-successor-matrix.ts"
import type { ExecutionEnvelope } from "./execution-resilience.ts"
import { buildProspectiveDevelopmentResult } from "./prospective-development-result.ts"
import type { RawAgentRunRow, ScoredAgentRunRow } from "./scoring.ts"
import { sha256Bytes } from "./source-fixture.ts"

const OUT_DIR = "results/skill-ir/bids-successor-development-v1"
const CONSTRUCTION_PATH = "results/skill-ir/bids-prospective-construction-v1/report.json"

async function readJsonl<T>(filePath: string): Promise<T[]> {
  return (await readFile(filePath, "utf8")).split(/\r?\n/u).map((line) => line.trim())
    .filter(Boolean).map((line) => JSON.parse(line) as T)
}

async function evidence(rootDir: string, target: string) {
  const relativePath = path.relative(rootDir, target).replaceAll("\\", "/")
  if (!relativePath || relativePath === ".." || relativePath.startsWith("../")
    || path.isAbsolute(relativePath)) {
    throw new Error("BIDS successor result evidence escaped repository root")
  }
  return { path: relativePath, sha256: sha256Bytes(await readFile(target)) }
}

export async function buildBidsSuccessorDevelopmentResultFromFrozenEvidence(
  rawRootDir: string,
) {
  const rootDir = path.resolve(rawRootDir)
  const outDir = path.resolve(rootDir, ...OUT_DIR.split("/"))
  const runDir = path.join(outDir, "run")
  const policyPath = path.resolve(rootDir, ...BIDS_SUCCESSOR_MATRIX_POLICY_PATH.split("/"))
  const policy = await validateBidsSuccessorMatrixPolicy(
    JSON.parse(await readFile(policyPath, "utf8")), rootDir,
  )
  const controlFreezePath = path.resolve(
    rootDir, ...BIDS_SUCCESSOR_ARTIFACT_CONTROL_FREEZE_PATH.split("/"),
  )
  const controlFreeze = await validateBidsSuccessorArtifactControlFreeze(
    JSON.parse(await readFile(controlFreezePath, "utf8")), rootDir,
  )
  const rawPath = path.join(runDir, "raw-runs.jsonl")
  const scoredPath = path.join(runDir, "scored-runs.jsonl")
  const envelopePath = path.join(runDir, "execution-envelopes.jsonl")
  const prefixPath = path.join(runDir, "matrix-prefix.json")
  const capturePath = path.join(outDir, "matrix-capture.json")
  const [modelRaw, modelRows, envelopes, prefix, capture] = await Promise.all([
    readJsonl<RawAgentRunRow>(rawPath),
    readJsonl<ScoredAgentRunRow>(scoredPath),
    readJsonl<ExecutionEnvelope>(envelopePath),
    readFile(prefixPath, "utf8").then(JSON.parse) as Promise<Array<{
      raw: RawAgentRunRow
      envelope: ExecutionEnvelope
    }>>,
    readFile(capturePath, "utf8").then(JSON.parse) as Promise<{
      lockSha256?: unknown
      qualificationSha256?: unknown
      analysisPolicySha256?: unknown
      attemptedRows?: unknown
      scoredRows?: unknown
      accounting?: { qualificationPaidCalls?: unknown; matrixPaidCalls?: unknown; retries?: unknown }
    }>,
  ])
  if (!Array.isArray(prefix) || modelRaw.length !== 12 || modelRows.length !== 12
    || envelopes.length !== 12 || prefix.length !== 12
    || JSON.stringify(prefix.map((item) => item.raw)) !== JSON.stringify(modelRaw)
    || JSON.stringify(prefix.map((item) => item.envelope)) !== JSON.stringify(envelopes)) {
    throw new Error("BIDS successor result requires one exact 12-row persisted prefix")
  }
  const policySha256 = sha256Bytes(await readFile(policyPath))
  if (capture.lockSha256 !== policy.policy.lock.sha256
    || capture.qualificationSha256 !== policy.policy.qualification.sha256
    || capture.analysisPolicySha256 !== policySha256
    || capture.attemptedRows !== 12 || capture.scoredRows !== 12
    || capture.accounting?.qualificationPaidCalls !== 1
    || capture.accounting?.matrixPaidCalls !== 12
    || capture.accounting?.retries !== 0) {
    throw new Error("BIDS successor result matrix identity or accounting drift")
  }
  const temporary = await mkdtemp(path.join(path.resolve(rootDir, "results/skill-ir"), "bids-successor-result-check-"))
  try {
    const plan = await buildBidsSuccessorDevelopmentPlan({
      rootDir,
      lock: policy.lock,
      outDir: path.relative(rootDir, temporary).replaceAll("\\", "/"),
    })
    const rows = orderedBidsSuccessorMatrixRows(plan.plan, policy.lock)
    assertBidsSuccessorPersistedPrefix(rows, modelRaw, envelopes)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
  const artifactRawPath = path.resolve(
    rootDir, ...controlFreeze.evidence.rawRuns.path.split("/"),
  )
  const artifactScoredPath = path.resolve(
    rootDir, ...controlFreeze.evidence.scoredRuns.path.split("/"),
  )
  const artifactRows = await readJsonl<ScoredAgentRunRow>(artifactScoredPath)
  const constructionPath = path.resolve(rootDir, ...CONSTRUCTION_PATH.split("/"))
  const construction = BidsProspectiveConstructionReportSchema.parse(JSON.parse(
    await readFile(constructionPath, "utf8"),
  ))
  const result = buildProspectiveDevelopmentResult({
    experimentId: policy.lock.experimentId,
    analysisPolicySha256: policySha256,
    modelRows,
    artifactRows,
    classifications: envelopes.map((item) => item.classification),
    evidence: {
      modelRaw: await evidence(rootDir, rawPath),
      modelScored: await evidence(rootDir, scoredPath),
      executionEnvelopes: await evidence(rootDir, envelopePath),
      artifactRaw: await evidence(rootDir, artifactRawPath),
      artifactScored: await evidence(rootDir, artifactScoredPath),
      constructionReport: await evidence(rootDir, constructionPath),
    },
    executionTotals: envelopes.reduce((total, item) => ({
      input: total.input + item.usage.input,
      output: total.output + item.usage.output,
      cacheRead: total.cacheRead + item.usage.cacheRead,
      cacheWrite: total.cacheWrite + item.usage.cacheWrite,
      durationMs: total.durationMs + item.process.durationMs,
    }), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, durationMs: 0 }),
    maximumActiveExecutionFailures: policy.policy.measurementEligibility.maximumActiveExecutionFailures,
    maximumParserOrRuntimeBlockers: policy.policy.measurementEligibility.maximumParserOrRuntimeBlockers,
    automaticConstructionEligible: construction.prePaidGate.automaticCostEligible,
  })
  await mkdir(outDir, { recursive: true })
  await writeFile(path.join(outDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8")
  return result
}

if (import.meta.main) {
  buildBidsSuccessorDevelopmentResultFromFrozenEvidence(process.cwd())
    .then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
