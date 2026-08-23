import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { validateBidsProspectiveDevelopmentLock } from "./bids-prospective-development"
import { validateProspectiveDevelopmentAnalysisPolicy } from "./prospective-development-analysis"
import { ProspectiveDevelopmentQualificationSchema } from "./prospective-development-qualification"
import {
  buildProspectiveDevelopmentPlan,
  type ProspectiveDevelopmentLock,
  type ProspectiveDevelopmentPlan,
} from "./prospective-development"
import { executeProspectiveDevelopmentRow } from "./prospective-development-run"
import { scoreRealAgentRuns } from "./score-real-agent-runs"
import { sha256Bytes } from "./source-fixture"
import type { RawAgentRunRow } from "./scoring"
import type { ExecutionEnvelope } from "./execution-resilience"

type PlanRow = ProspectiveDevelopmentPlan["plan"][number]

function taskId(row: PlanRow): string {
  const value = row.caseId.split(":").at(-1)
  if (!value) throw new Error(`BIDS prospective matrix task identity missing: ${row.caseId}`)
  return value
}

export function orderedProspectiveDevelopmentRows(
  rows: PlanRow[],
  lock: ProspectiveDevelopmentLock,
): PlanRow[] {
  const ordered: PlanRow[] = []
  for (const task of lock.matrix.taskIds) {
    for (let repetition = 1; repetition <= lock.matrix.targetBlocksPerTask; repetition += 1) {
      for (const system of lock.matrix.systems) {
        const matches = rows.filter((row) =>
          taskId(row) === task && row.runIndex === repetition && row.system === system)
        if (matches.length !== 1) {
          throw new Error(`BIDS prospective matrix requires one row: ${task}/${repetition}/${system}`)
        }
        ordered.push(matches[0]!)
      }
    }
  }
  if (ordered.length !== lock.matrix.maximumAttemptRows) {
    throw new Error(`BIDS prospective matrix denominator mismatch: ${ordered.length}`)
  }
  return ordered
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  try {
    return (await readFile(filePath, "utf8")).split(/\r?\n/u).map((line) => line.trim())
      .filter(Boolean).map((line) => JSON.parse(line) as T)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
}

function assertPersistedPrefix(rows: PlanRow[], raw: RawAgentRunRow[], envelopes: ExecutionEnvelope[]): void {
  if (raw.length !== envelopes.length || raw.length > rows.length) {
    throw new Error("BIDS prospective persisted matrix prefix length mismatch")
  }
  for (let index = 0; index < raw.length; index += 1) {
    const planned = rows[index]!
    const observed = raw[index]!
    const envelope = envelopes[index]!
    if (observed.caseId !== planned.caseId || observed.runIndex !== planned.runIndex
      || observed.system !== planned.system || envelope.taskId !== taskId(planned)
      || envelope.candidateBlock !== planned.runIndex || envelope.system !== planned.system) {
      throw new Error(`BIDS prospective persisted matrix prefix identity mismatch at row ${index + 1}`)
    }
  }
}

async function main() {
  const rootDir = path.resolve(process.cwd())
  const outDir = path.join(rootDir, "results/skill-ir/bids-prospective-development-v1")
  const runDir = path.join(outDir, "run")
  const lockPath = path.join(rootDir, "benchmarks/skill-ir/pilots/bids/prospective-development-lock.json")
  const qualificationPath = path.join(outDir, "qualification.json")
  const policyPath = path.join(rootDir, "benchmarks/skill-ir/pilots/bids/prospective-development-analysis-policy.json")
  const [lockInput, qualificationInput, policyInput] = await Promise.all([
    readFile(lockPath, "utf8").then(JSON.parse),
    readFile(qualificationPath, "utf8").then(JSON.parse),
    readFile(policyPath, "utf8").then(JSON.parse),
  ])
  const lock = await validateBidsProspectiveDevelopmentLock(lockInput, rootDir)
  const qualification = ProspectiveDevelopmentQualificationSchema.parse(qualificationInput)
  const policy = await validateProspectiveDevelopmentAnalysisPolicy(policyInput, rootDir)
  const lockSha256 = sha256Bytes(await readFile(lockPath))
  if (qualification.status !== "passed" || !qualification.authorizations.paidMatrix
    || qualification.lockSha256 !== lockSha256 || policy.lock.sha256 !== lockSha256) {
    throw new Error("BIDS prospective matrix is not authorized by the current lock and qualification")
  }
  if (!process.env[lock.runtime.apiKeyEnv]?.trim()) throw new Error(`Missing ${lock.runtime.apiKeyEnv}`)

  const plan = await buildProspectiveDevelopmentPlan({ rootDir, lock, outDir: path.relative(rootDir, runDir) })
  const rows = orderedProspectiveDevelopmentRows(plan.plan, lock)
  await mkdir(runDir, { recursive: true })
  const rawPath = path.join(runDir, "raw-runs.jsonl")
  const envelopePath = path.join(runDir, "execution-envelopes.jsonl")
  const raw = await readJsonl<RawAgentRunRow>(rawPath)
  const envelopes = await readJsonl<ExecutionEnvelope>(envelopePath)
  assertPersistedPrefix(rows, raw, envelopes)

  for (let index = raw.length; index < rows.length; index += 1) {
    const executed = await executeProspectiveDevelopmentRow({
      row: rows[index]!, lock, env: { ...process.env, SKVM_AUTO_PROBE: "0" },
    })
    raw.push(executed.raw)
    envelopes.push(executed.envelope)
    await writeFile(rawPath, `${raw.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8")
    await writeFile(envelopePath, `${envelopes.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8")
    console.log(JSON.stringify({ completed: index + 1, total: rows.length, classification: executed.envelope.classification }))
  }

  const scoredPath = path.join(runDir, "scored-runs.jsonl")
  const scored = await scoreRealAgentRuns({
    raw: rawPath,
    tasks: lock.frozenInputs.tasks.path,
    corpus: lock.corpus,
    rootDir,
    out: scoredPath,
  })
  const classificationCounts = Object.fromEntries([...new Set(envelopes.map((item) => item.classification))]
    .sort().map((classification) => [
      classification, envelopes.filter((item) => item.classification === classification).length,
    ]))
  const summary = {
    schemaVersion: "skill-ir-prospective-development-matrix-capture/v1",
    experimentId: lock.experimentId,
    lockSha256,
    qualificationSha256: sha256Bytes(await readFile(qualificationPath)),
    analysisPolicySha256: sha256Bytes(await readFile(policyPath)),
    attemptedRows: raw.length,
    scoredRows: scored.scored,
    classificationCounts,
    authorizations: { dynamic: false, heldOut: false, readinessPromotion: false },
  }
  await writeFile(path.join(outDir, "matrix-capture.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8")
  return summary
}

if (import.meta.main) {
  main().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
