import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  buildBidsSuccessorDevelopmentPlan,
  loadBidsSuccessorDevelopmentScorer,
  type BidsSuccessorDevelopmentPlan,
} from "./bids-successor-development.ts"
import {
  BIDS_SUCCESSOR_MATRIX_FREEZE_PATH,
  BIDS_SUCCESSOR_MATRIX_POLICY_PATH,
  assertBidsSuccessorPersistedPrefix,
  orderedBidsSuccessorMatrixRows,
  validateBidsSuccessorMatrixFreeze,
  validateBidsSuccessorMatrixPolicy,
} from "./bids-successor-matrix.ts"
import { executeProspectiveDevelopmentRow } from "./prospective-development-run.ts"
import type { ProspectiveDevelopmentLock, ProspectiveDevelopmentPlan } from "./prospective-development.ts"
import { scoreRealAgentRuns } from "./score-real-agent-runs.ts"
import { sha256Bytes } from "./source-fixture.ts"
import type { RawAgentRunRow } from "./scoring.ts"
import type { ExecutionEnvelope } from "./execution-resilience.ts"

type Phase = "plan" | "execute"

function serializePlan(plan: BidsSuccessorDevelopmentPlan) {
  return {
    ...plan,
    runArgs: Object.fromEntries(Object.entries(plan.runArgs).map(([key, value]) => [
      key,
      value instanceof Set ? [...value] : value,
    ])),
  }
}

type MatrixPrefixEntry = { raw: RawAgentRunRow; envelope: ExecutionEnvelope }

const EXECUTION_BLOCKERS = new Set<ExecutionEnvelope["classification"]>([
  "qualification-failure",
  "parser-incompatible",
  "runtime-crash",
  "measurement-invalid",
])

export function shouldStopBidsSuccessorMatrix(
  classification: ExecutionEnvelope["classification"],
): boolean {
  return EXECUTION_BLOCKERS.has(classification)
}

async function readPrefix(filePath: string): Promise<MatrixPrefixEntry[]> {
  try {
    const value = JSON.parse(await readFile(filePath, "utf8")) as unknown
    if (!Array.isArray(value) || value.some((entry) => !entry || typeof entry !== "object"
      || !("raw" in entry) || !("envelope" in entry))) {
      throw new Error("BIDS successor matrix prefix checkpoint is malformed")
    }
    return value as MatrixPrefixEntry[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
}

async function writeAtomicJson(filePath: string, value: unknown): Promise<void> {
  const temporary = `${filePath}.next`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8")
  await rename(temporary, filePath)
}

function parseArgs(argv: string[]) {
  let phase: Phase | undefined
  let policyPath = "benchmarks/skill-ir/pilots/bids/successor-v2/development-analysis-policy.json"
  let outDir = "results/skill-ir/bids-successor-development-v1"
  for (const argument of argv) {
    if (argument.startsWith("--phase=")) {
      const value = argument.slice("--phase=".length)
      if (value !== "plan" && value !== "execute") throw new Error("invalid BIDS successor matrix phase")
      phase = value
    } else if (argument.startsWith("--policy=")) policyPath = argument.slice("--policy=".length)
    else if (argument.startsWith("--out-dir=")) outDir = argument.slice("--out-dir=".length)
    else throw new Error(`Unknown argument: ${argument}`)
  }
  if (!phase) throw new Error("--phase is required")
  return { phase, policyPath, outDir }
}

function assertOutputRoot(rootDir: string, outDir: string): void {
  const resultsRoot = path.resolve(rootDir, "results/skill-ir")
  const relative = path.relative(resultsRoot, outDir)
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("BIDS successor matrix output must be a child of results/skill-ir")
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const rootDir = path.resolve(process.cwd())
  const outDir = path.resolve(rootDir, args.outDir)
  const runDir = path.join(outDir, "run")
  assertOutputRoot(rootDir, outDir)
  const policyAbsolute = path.resolve(rootDir, ...args.policyPath.split("/"))
  const committedPolicyAbsolute = path.resolve(rootDir, ...BIDS_SUCCESSOR_MATRIX_POLICY_PATH.split("/"))
  if (policyAbsolute !== committedPolicyAbsolute) {
    throw new Error("BIDS successor matrix policy path drift")
  }
  const validated = await validateBidsSuccessorMatrixPolicy(
    JSON.parse(await readFile(policyAbsolute, "utf8")), rootDir,
  )
  const freezeAbsolute = path.resolve(rootDir, ...BIDS_SUCCESSOR_MATRIX_FREEZE_PATH.split("/"))
  await validateBidsSuccessorMatrixFreeze(
    JSON.parse(await readFile(freezeAbsolute, "utf8")), rootDir, validated.policy,
  )
  const plan = await buildBidsSuccessorDevelopmentPlan({
    rootDir,
    lock: validated.lock,
    outDir: path.relative(rootDir, runDir).replaceAll("\\", "/"),
  })
  const rows = orderedBidsSuccessorMatrixRows(plan.plan, validated.lock)
  await mkdir(runDir, { recursive: true })
  await writeFile(path.join(runDir, "plan.json"), `${JSON.stringify(serializePlan({ ...plan, plan: rows }), null, 2)}\n`, "utf8")
  if (args.phase === "plan") {
    return { phase: "plan", rows: rows.length, paidCalls: 0, matrixExecuted: false }
  }
  if (!process.env[validated.lock.runtime.apiKeyEnv]?.trim()) {
    throw new Error(`Missing ${validated.lock.runtime.apiKeyEnv}`)
  }
  await loadBidsSuccessorDevelopmentScorer(
    rootDir, validated.lock, validated.lock.frozenInputs.scorer.path,
  )
  const prefixPath = path.join(runDir, "matrix-prefix.json")
  const prefix = await readPrefix(prefixPath)
  const raw = prefix.map((entry) => entry.raw)
  const envelopes = prefix.map((entry) => entry.envelope)
  assertBidsSuccessorPersistedPrefix(rows, raw, envelopes)
  const persistedBlocker = envelopes.find((envelope) => shouldStopBidsSuccessorMatrix(envelope.classification))
  if (persistedBlocker) {
    throw new Error(`BIDS successor matrix persisted execution blocker: ${persistedBlocker.classification}`)
  }

  for (let index = raw.length; index < rows.length; index += 1) {
    const executed = await executeProspectiveDevelopmentRow({
      row: rows[index] as unknown as ProspectiveDevelopmentPlan["plan"][number],
      lock: validated.lock as unknown as ProspectiveDevelopmentLock,
      env: { ...process.env, SKVM_AUTO_PROBE: "0" },
    })
    raw.push(executed.raw)
    envelopes.push(executed.envelope)
    prefix.push({ raw: executed.raw, envelope: executed.envelope })
    await writeAtomicJson(prefixPath, prefix)
    console.log(JSON.stringify({
      completed: index + 1,
      total: rows.length,
      classification: executed.envelope.classification,
    }))
    if (shouldStopBidsSuccessorMatrix(executed.envelope.classification)) {
      throw new Error(`BIDS successor matrix execution blocker: ${executed.envelope.classification}`)
    }
  }

  const rawPath = path.join(runDir, "raw-runs.jsonl")
  const envelopePath = path.join(runDir, "execution-envelopes.jsonl")
  await writeFile(rawPath, `${raw.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8")
  await writeFile(envelopePath, `${envelopes.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8")
  const scoredPath = path.join(runDir, "scored-runs.jsonl")
  const scored = await scoreRealAgentRuns({
    raw: rawPath,
    tasks: validated.lock.frozenInputs.tasks.path,
    rootDir,
    out: scoredPath,
  })
  const classificationCounts = Object.fromEntries([...new Set(envelopes.map((item) => item.classification))]
    .sort().map((classification) => [
      classification,
      envelopes.filter((item) => item.classification === classification).length,
    ]))
  const summary = {
    schemaVersion: "skill-ir-bids-successor-matrix-capture/v1",
    experimentId: validated.lock.experimentId,
    measurementIdentity: validated.lock.measurementIdentity,
    lockSha256: validated.policy.lock.sha256,
    qualificationSha256: validated.policy.qualification.sha256,
    analysisPolicySha256: sha256Bytes(await readFile(policyAbsolute)),
    attemptedRows: raw.length,
    scoredRows: scored.scored,
    classificationCounts,
    accounting: { qualificationPaidCalls: 1, matrixPaidCalls: raw.length, retries: 0 },
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
