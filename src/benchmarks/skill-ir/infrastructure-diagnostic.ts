import { createHash } from "node:crypto"
import { z } from "zod"
import { parseCaseId, type RawAgentRunRow } from "./scoring.ts"

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/)
const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (/^(?:[A-Za-z]:[\\/]|[\\/])/u.test(value) || value.includes("\\")) return false
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
})
const FrozenFileSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict()

export const InfrastructureDiagnosticLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-infrastructure-diagnostic-lock/v1"),
  diagnosticId: z.string().regex(/^[a-z0-9][a-z0-9.-]+$/),
  methodEvidence: z.literal(false),
  sourceExperiment: z.object({
    id: z.string().min(1),
    catalog: z.literal("executable-contract-repair-artifact/v4"),
    system: z.literal("ir-contract-artifact-dev"),
    raw: FrozenFileSchema,
    summary: FrozenFileSchema,
    gate: FrozenFileSchema,
  }).strict(),
  identity: z.object({
    skill: z.string().min(1),
    model: z.string().min(1),
    modelFamily: z.string().min(1),
    adapter: z.string().min(1),
    adapterVersion: z.string().min(1),
    agent: z.string().min(1),
    environment: z.string().min(1),
    context: z.string().min(1),
    panelConfigId: z.string().min(1),
  }).strict(),
  taskIds: z.array(z.string().min(1)).min(1).refine((values) => new Set(values).size === values.length),
  repetitions: z.number().int().min(1),
  retryPolicy: z.literal("forbid-source-rerun"),
  heldOutAllowed: z.literal(false),
}).strict()

export type InfrastructureDiagnosticLock = z.infer<typeof InfrastructureDiagnosticLockSchema>

export interface InfrastructureDiagnosticRecord {
  taskId: string
  runIndex: number
  failureStage: "generation" | "adapter" | "unknown"
  runStatus: string
  exitCode: number
  crashClass: "bun-internal-assertion" | "bun-crash" | "adapter-nonzero" | "timeout" | "unknown"
  runtime: { name: "bun"; version: string } | null
  fingerprint: string
}

export interface InfrastructureDiagnosticReport {
  schemaVersion: "skill-ir-infrastructure-diagnostic-report/v1"
  diagnosticId: string
  methodEvidence: false
  sourceExperimentId: string
  reproducibility: "inconclusive"
  counts: { sourceRows: number; infrastructureRows: number }
  records: InfrastructureDiagnosticRecord[]
}

function assertEqual(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) throw new Error(`Infrastructure diagnostic ${label} mismatch`)
}

function classifyCrash(row: RawAgentRunRow): Omit<InfrastructureDiagnosticRecord, "taskId" | "runIndex" | "runStatus" | "exitCode" | "fingerprint"> {
  const stderr = row.stderr ?? ""
  const bunVersion = /\bBun v(\d+(?:\.\d+){1,3})\b/u.exec(stderr)?.[1]
  const failureStage = /infrastructure failure at generation/i.test(stderr)
    ? "generation"
    : row.runStatus === "adapter-crashed" ? "adapter" : "unknown"
  let crashClass: InfrastructureDiagnosticRecord["crashClass"] = "unknown"
  if (/panic\(main thread\): Internal assertion failure/i.test(stderr) && bunVersion) {
    crashClass = "bun-internal-assertion"
  } else if (/Bun has crashed/i.test(stderr) && bunVersion) {
    crashClass = "bun-crash"
  } else if (row.runStatus === "timeout") {
    crashClass = "timeout"
  } else if (row.runStatus === "adapter-crashed" || row.exitCode !== 0) {
    crashClass = "adapter-nonzero"
  }
  return {
    failureStage,
    crashClass,
    runtime: bunVersion ? { name: "bun", version: bunVersion } : null,
  }
}

export function auditInfrastructureRows(
  rows: RawAgentRunRow[],
  lock: InfrastructureDiagnosticLock,
): InfrastructureDiagnosticReport {
  const records: InfrastructureDiagnosticRecord[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    const parsed = parseCaseId(row.caseId)
    assertEqual("skill", parsed.skill, lock.identity.skill)
    assertEqual("agent", parsed.agent, lock.identity.agent)
    assertEqual("environment", parsed.environment, lock.identity.environment)
    assertEqual("context", parsed.context, lock.identity.context)
    if (!lock.taskIds.includes(parsed.task)) throw new Error(`Infrastructure diagnostic task mismatch: ${parsed.task}`)
    assertEqual("system", row.system, lock.sourceExperiment.system)
    assertEqual("model", row.model, lock.identity.model)
    assertEqual("model family", row.modelFamily, lock.identity.modelFamily)
    assertEqual("adapter", row.adapter, lock.identity.adapter)
    assertEqual("adapter version", row.adapterVersion, lock.identity.adapterVersion)
    assertEqual("panel", row.panelConfigId, lock.identity.panelConfigId)
    const runIndex = row.runIndex ?? 1
    if (runIndex < 1 || runIndex > lock.repetitions) throw new Error("Infrastructure diagnostic run index mismatch")
    if ((row.attempts ?? 1) !== 1) throw new Error("Infrastructure diagnostic retry evidence is forbidden")
    const key = `${parsed.task}:${runIndex}`
    if (seen.has(key)) throw new Error(`Duplicate infrastructure diagnostic row: ${key}`)
    seen.add(key)

    if ((row.runStatus ?? "ok") === "ok" && row.exitCode === 0) continue
    const classified = classifyCrash(row)
    const fingerprint = createHash("sha256").update(JSON.stringify({
      taskId: parsed.task,
      runIndex,
      failureStage: classified.failureStage,
      runStatus: row.runStatus ?? "unknown",
      exitCode: row.exitCode,
      crashClass: classified.crashClass,
      runtime: classified.runtime,
    })).digest("hex")
    records.push({
      taskId: parsed.task,
      runIndex,
      failureStage: classified.failureStage,
      runStatus: row.runStatus ?? "unknown",
      exitCode: row.exitCode,
      crashClass: classified.crashClass,
      runtime: classified.runtime,
      fingerprint,
    })
  }

  return {
    schemaVersion: "skill-ir-infrastructure-diagnostic-report/v1",
    diagnosticId: lock.diagnosticId,
    methodEvidence: false,
    sourceExperimentId: lock.sourceExperiment.id,
    reproducibility: "inconclusive",
    counts: { sourceRows: rows.length, infrastructureRows: records.length },
    records,
  }
}
