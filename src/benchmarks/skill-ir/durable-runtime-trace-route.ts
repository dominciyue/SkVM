import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { z } from "zod"
import { DurableRuntimeTraceEventSchema, type DurableRuntimeTraceEvent } from "../../core/durable-runtime-trace.ts"
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package.ts"
import {
  PreIrOutputMaterializationSchema,
  compactPreIrRouteDiagnostic,
  type PreIrOutputMaterialization,
} from "./pre-ir-route-diagnostic.ts"
import { readAndValidatePreIrCalibrationLock } from "./pre-ir-calibration.ts"
import type { ProbeExecution } from "./route-probe.ts"
import {
  DurableRuntimeTraceValidationReportSchema,
  verifyDurableRuntimeTraceValidationReport,
} from "./durable-runtime-trace-validation.ts"

const FrozenFileSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict()

export const DurableRuntimeTraceRouteLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-durable-runtime-trace-route-lock/v1"),
  status: z.literal("preregistered"),
  diagnosticId: z.literal("experimental-design-v2-durable-runtime-trace-route-2026-07-29"),
  methodEvidence: z.literal(false),
  baseCalibrationLock: FrozenFileSchema,
  localValidation: FrozenFileSchema,
  traceSources: z.tuple([
    FrozenFileSchema.extend({ path: z.literal("src/core/durable-runtime-trace.ts") }).strict(),
    FrozenFileSchema.extend({ path: z.literal("src/core/agent-loop.ts") }).strict(),
  ]),
  route: z.object({
    skillId: z.literal("experimental-design-v2"),
    system: z.literal("original"),
    taskId: z.literal("experimental-design-v2-cluster-sequential-dev-002"),
    taskSplit: z.literal("development"),
    context: z.literal("clean"),
    agent: z.literal("skvm"),
    environment: z.literal("windows"),
    model: z.literal("xty/gpt-5.6-sol"),
    modelFamily: z.literal("gpt"),
    adapter: z.literal("bare-agent"),
    runIndex: z.literal(1),
    retries: z.literal(0),
    timeoutMs: z.literal(180000),
  }).strict(),
  claimBoundary: z.object({
    infrastructureDiagnosticOnly: z.literal(true),
    benchmarkDenominator: z.literal(false),
    skillOptimizationEvidence: z.literal(false),
    modelCapabilityEvidence: z.literal(false),
    tokenEvidence: z.literal(false),
    permitsMatrixExecution: z.literal(false),
  }).strict(),
}).strict()

export type DurableRuntimeTraceRouteLock = z.infer<typeof DurableRuntimeTraceRouteLockSchema>

const TracePrefixSummarySchema = z.object({
  events: z.number().int().positive(),
  providerRequests: z.number().int().nonnegative(),
  providerResponses: z.number().int().nonnegative(),
  toolBatchStarts: z.number().int().nonnegative(),
  toolBatchEnds: z.number().int().nonnegative(),
  turnEnds: z.number().int().nonnegative(),
  finalized: z.boolean(),
  finalOutcome: z.enum(["completed", "timeout", "handled-error", "max-iterations"]).nullable(),
  lastEvent: z.enum([
    "trace-start",
    "provider-request-start",
    "provider-response-received",
    "tool-batch-start",
    "tool-batch-end",
    "turn-end",
    "finalize",
  ]),
  lastTurn: z.number().int().nonnegative(),
  sequenceContinuous: z.literal(true),
  prefixOrderPassed: z.literal(true),
}).strict()

const ExecutionSummarySchema = z.object({
  status: z.enum(["ok", "timeout", "infrastructure", "agent"]),
  failureCode: z.enum([
    "none",
    "timeout",
    "bun-internal-assertion",
    "bun-crash",
    "provider-auth",
    "provider-rate-limit",
    "provider-5xx",
    "provider-network",
    "adapter-error",
    "nonzero-unclassified",
  ]),
  exitCode: z.number().int().optional(),
  timedOut: z.boolean(),
  durationMs: z.number().nonnegative().optional(),
  runtime: z.object({
    name: z.literal("bun"),
    version: z.string().min(1),
    platform: z.enum(["windows", "linux", "darwin", "unknown"]),
    arch: z.enum(["x64", "arm64", "unknown"]),
  }).strict().nullable(),
  streams: z.object({
    stdoutBytes: z.number().int().nonnegative(),
    stderrBytes: z.number().int().nonnegative(),
    stdoutSha256: Sha256Schema,
    stderrSha256: Sha256Schema,
  }).strict(),
}).strict()

export const DurableRuntimeTraceRouteReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-durable-runtime-trace-route-report/v1"),
  diagnosticId: z.literal("experimental-design-v2-durable-runtime-trace-route-2026-07-29"),
  status: z.literal("captured"),
  methodEvidence: z.literal(false),
  lockSha256: Sha256Schema,
  route: DurableRuntimeTraceRouteLockSchema.shape.route,
  execution: ExecutionSummarySchema,
  outputMaterialization: PreIrOutputMaterializationSchema,
  trace: z.discriminatedUnion("present", [
    z.object({ present: z.literal(false) }).strict(),
    TracePrefixSummarySchema.extend({
      present: z.literal(true),
      rawSha256: Sha256Schema,
    }).strict(),
  ]),
  claimBoundary: DurableRuntimeTraceRouteLockSchema.shape.claimBoundary,
}).strict()

export type DurableRuntimeTraceRouteReport = z.infer<typeof DurableRuntimeTraceRouteReportSchema>

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex")
}

function parseTraceEvents(text: string): DurableRuntimeTraceEvent[] {
  const lines = text.trim().split(/\r?\n/u).filter(Boolean)
  if (lines.length === 0) throw new Error("Durable runtime trace prefix is empty")
  return lines.map((line, index) => {
    try {
      return DurableRuntimeTraceEventSchema.parse(JSON.parse(line))
    } catch (error) {
      throw new Error(`Invalid durable route trace event ${index + 1}: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
}

function assertPrefixOrder(events: DurableRuntimeTraceEvent[]): void {
  if (events[0]?.event !== "trace-start") throw new Error("Durable route trace must start with trace-start")
  if (events.some((event, index) => event.sequence !== index)) {
    throw new Error("Durable route trace sequence is not continuous")
  }
  if (events.slice(1).some((event) => event.event === "trace-start")) {
    throw new Error("Durable route trace must contain exactly one segment")
  }

  let previous: DurableRuntimeTraceEvent = events[0]!
  for (const event of events.slice(1)) {
    const sameTurn = event.turn === previous.turn
    const nextTurn = event.turn === previous.turn + 1
    const valid = previous.event === "trace-start"
      ? event.event === "provider-request-start" && event.turn === 1
      : previous.event === "provider-request-start"
        ? event.event === "provider-response-received" && sameTurn
        : previous.event === "provider-response-received"
          ? ((event.event === "tool-batch-start" || event.event === "turn-end" || event.event === "finalize") && sameTurn)
          : previous.event === "tool-batch-start"
            ? ((event.event === "tool-batch-end" || event.event === "finalize") && sameTurn)
            : previous.event === "tool-batch-end"
              ? ((event.event === "turn-end" || event.event === "finalize") && sameTurn)
              : previous.event === "turn-end"
                ? (event.event === "provider-request-start" && nextTurn)
                  || (event.event === "finalize" && sameTurn)
                : false
    if (!valid) {
      throw new Error(`Invalid durable route trace transition: ${previous.event} -> ${event.event}`)
    }
    previous = event
  }
}

export function summarizeDurableRuntimeTracePrefix(text: string) {
  const events = parseTraceEvents(text)
  assertPrefixOrder(events)
  const final = events.at(-1)!
  return TracePrefixSummarySchema.parse({
    events: events.length,
    providerRequests: events.filter((event) => event.event === "provider-request-start").length,
    providerResponses: events.filter((event) => event.event === "provider-response-received").length,
    toolBatchStarts: events.filter((event) => event.event === "tool-batch-start").length,
    toolBatchEnds: events.filter((event) => event.event === "tool-batch-end").length,
    turnEnds: events.filter((event) => event.event === "turn-end").length,
    finalized: final.event === "finalize",
    finalOutcome: final.event === "finalize" ? final.outcome : null,
    lastEvent: final.event,
    lastTurn: final.turn,
    sequenceContinuous: true,
    prefixOrderPassed: true,
  })
}

export function buildDurableRuntimeTraceRouteReport(input: {
  lock: DurableRuntimeTraceRouteLock
  lockSha256: string
  execution: ProbeExecution
  traceText?: string
  outputMaterialization: PreIrOutputMaterialization
}): DurableRuntimeTraceRouteReport {
  const lock = DurableRuntimeTraceRouteLockSchema.parse(input.lock)
  const diagnostic = compactPreIrRouteDiagnostic({
    qualificationId: lock.diagnosticId,
    calibrationId: lock.diagnosticId,
    model: lock.route.model,
    caseId: [lock.route.skillId, lock.route.agent, lock.route.environment, lock.route.context, lock.route.taskId].join(":"),
    execution: input.execution,
  })
  const rawTraceText = input.traceText
  const traceText = rawTraceText?.trim()
  const trace = traceText && rawTraceText
    ? { present: true as const, rawSha256: sha256(rawTraceText), ...summarizeDurableRuntimeTracePrefix(traceText) }
    : { present: false as const }
  return DurableRuntimeTraceRouteReportSchema.parse({
    schemaVersion: "skill-ir-durable-runtime-trace-route-report/v1",
    diagnosticId: lock.diagnosticId,
    status: "captured",
    methodEvidence: false,
    lockSha256: input.lockSha256,
    route: lock.route,
    execution: {
      status: diagnostic.status,
      failureCode: diagnostic.failureCode,
      ...(diagnostic.exitCode !== undefined ? { exitCode: diagnostic.exitCode } : {}),
      timedOut: diagnostic.timedOut,
      ...(diagnostic.durationMs !== undefined ? { durationMs: diagnostic.durationMs } : {}),
      runtime: diagnostic.runtime,
      streams: diagnostic.streams,
    },
    outputMaterialization: input.outputMaterialization,
    trace,
    claimBoundary: lock.claimBoundary,
  })
}

async function verifyFrozenFile(rootDir: string, file: { path: string; sha256: string }): Promise<void> {
  const bytes = await readFile(resolve(rootDir, file.path))
  if (sha256(bytes) !== file.sha256) throw new Error(`Durable route lock digest mismatch: ${file.path}`)
}

export async function validateDurableRuntimeTraceRouteLock(
  value: unknown,
  rootDir: string,
): Promise<DurableRuntimeTraceRouteLock> {
  const root = resolve(rootDir)
  const lock = DurableRuntimeTraceRouteLockSchema.parse(value)
  await Promise.all([
    verifyFrozenFile(root, lock.baseCalibrationLock),
    verifyFrozenFile(root, lock.localValidation),
    ...lock.traceSources.map((file) => verifyFrozenFile(root, file)),
  ])
  const localValidation = DurableRuntimeTraceValidationReportSchema.parse(JSON.parse(
    await readFile(resolve(root, lock.localValidation.path), "utf8"),
  ))
  await verifyDurableRuntimeTraceValidationReport(root, localValidation)
  if (!localValidation.claimBoundary.localTraceMechanismEvidence || localValidation.claimBoundary.paidMatrixAllowed) {
    throw new Error("Durable route lock local validation boundary mismatch")
  }
  const base = await readAndValidatePreIrCalibrationLock({
    rootDir: root,
    lockPath: resolve(root, lock.baseCalibrationLock.path),
  })
  if (
    base.skillId !== lock.route.skillId
    || base.model.route !== lock.route.model
    || base.model.family !== lock.route.modelFamily
    || base.adapter.id !== lock.route.adapter
    || !base.matrix.taskIds.includes(lock.route.taskId)
    || base.matrix.taskSplit !== lock.route.taskSplit
    || base.matrix.contexts[0] !== lock.route.context
    || base.matrix.agents[0] !== lock.route.agent
    || base.matrix.environments[0] !== lock.route.environment
    || base.runtime.retries !== lock.route.retries
    || base.runtime.routeProbeTimeoutMs !== lock.route.timeoutMs
  ) {
    throw new Error("Durable route lock identity does not match its base calibration lock")
  }
  return lock
}
