import { isAbsolute, relative, resolve, sep } from "node:path"
import { z } from "zod"
import {
  DurableRuntimeTraceEventSchema,
  type DurableRuntimeTraceEvent,
} from "../../core/durable-runtime-trace.ts"
import { DELAYED_REPLAY_SHAPE, type DelayedSourceProcessReplayReport } from "./delayed-source-process-replay.ts"

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const EVIDENCE_PATHS = [
  "src/core/durable-runtime-trace.ts",
  "src/core/agent-loop.ts",
  "src/benchmarks/skill-ir/delayed-source-process-replay.ts",
  "src/benchmarks/skill-ir/durable-runtime-trace-validation.ts",
  "src/benchmarks/skill-ir/durable-runtime-trace-validation-run.ts",
  "results/skill-ir/experimental-design-v2-delayed-source-process-replay-2026-07-29.json",
] as const

const SegmentSummarySchema = z.object({
  index: z.number().int().positive(),
  events: z.literal(80),
  providerRequests: z.literal(16),
  providerResponses: z.literal(16),
  toolBatchStarts: z.literal(15),
  toolBatchEnds: z.literal(15),
  turnEnds: z.literal(16),
  toolCalls: z.literal(23),
  maximumToolFanOut: z.literal(6),
  finalized: z.literal(true),
  finalOutcome: z.literal("completed"),
  orderPassed: z.literal(true),
}).strict()

export const DurableRuntimeTraceValidationReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-durable-runtime-trace-validation-report/v1"),
  validationId: z.literal("experimental-design-v2-durable-runtime-trace-validation-2026-07-29"),
  status: z.literal("passed"),
  methodEvidence: z.literal(false),
  sourceReplay: z.object({
    systems: z.tuple([z.literal("no-skill"), z.literal("original")]),
    rows: z.literal(2),
    runtimePassed: z.literal(true),
    protocolComplete: z.literal(2),
    outputsComplete: z.literal(2),
    configuredDelayMs: z.literal(0),
    latencyEvidence: z.literal(false),
  }).strict(),
  trace: z.object({
    rawSha256: z.string().regex(SHA256_PATTERN),
    events: z.literal(160),
    segments: z.tuple([SegmentSummarySchema, SegmentSummarySchema]),
    orderPassed: z.literal(true),
    privacyProjectionOnly: z.literal(true),
  }).strict(),
  evidence: z.array(z.object({
    path: z.string().min(1),
    sha256: z.string().regex(SHA256_PATTERN),
  }).strict()).min(1),
  claimBoundary: z.object({
    infrastructureDiagnosticOnly: z.literal(true),
    localTraceMechanismEvidence: z.literal(true),
    historicalCrashLocated: z.literal(false),
    benchmarkEvidence: z.literal(false),
    skillOptimizationEvidence: z.literal(false),
    modelCapabilityEvidence: z.literal(false),
    tokenEvidence: z.literal(false),
    paidMatrixAllowed: z.literal(false),
  }).strict(),
}).strict()

export type DurableRuntimeTraceValidationReport = z.infer<typeof DurableRuntimeTraceValidationReportSchema>
export type DurableRuntimeTraceValidation = {
  events: number
  segments: z.infer<typeof SegmentSummarySchema>[]
  passed: true
}

function parseEvents(text: string): DurableRuntimeTraceEvent[] {
  return text.trim().split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return DurableRuntimeTraceEventSchema.parse(JSON.parse(line))
    } catch (error) {
      throw new Error(`Invalid durable trace event ${index + 1}: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
}

function splitSegments(events: DurableRuntimeTraceEvent[]): DurableRuntimeTraceEvent[][] {
  const segments: DurableRuntimeTraceEvent[][] = []
  for (const event of events) {
    if (event.event === "trace-start") segments.push([])
    const current = segments.at(-1)
    if (!current) throw new Error("Durable trace begins without trace-start")
    current.push(event)
  }
  return segments
}

function expectedOrder() {
  const expected: Array<{ event: DurableRuntimeTraceEvent["event"]; turn: number }> = [
    { event: "trace-start", turn: 0 },
  ]
  for (let turn = 1; turn <= 16; turn++) {
    expected.push({ event: "provider-request-start", turn })
    expected.push({ event: "provider-response-received", turn })
    if (DELAYED_REPLAY_SHAPE.toolCallsPerPhase[turn - 1]! > 0) {
      expected.push({ event: "tool-batch-start", turn })
      expected.push({ event: "tool-batch-end", turn })
    }
    expected.push({ event: "turn-end", turn })
  }
  expected.push({ event: "finalize", turn: 16 })
  return expected
}

function summarizeSegment(events: DurableRuntimeTraceEvent[], index: number) {
  const expected = expectedOrder()
  if (events.length !== expected.length || events.some((event, eventIndex) =>
    event.sequence !== eventIndex
      || event.event !== expected[eventIndex]!.event
      || event.turn !== expected[eventIndex]!.turn)) {
    throw new Error(`Durable trace sequence or event order mismatch in segment ${index}`)
  }
  const responses = events.filter((event) => event.event === "provider-response-received")
  for (let turn = 1; turn <= 16; turn++) {
    const response = responses[turn - 1]!
    const expectedTools = DELAYED_REPLAY_SHAPE.toolCallsPerPhase[turn - 1]!
    if (response.toolCount !== expectedTools
      || response.maximumToolFanOut !== expectedTools
      || response.stopReason !== (expectedTools > 0 ? "tool-use" : "end-turn")) {
      throw new Error(`Durable trace response shape mismatch in segment ${index}, turn ${turn}`)
    }
    if (expectedTools > 0) {
      const start = events.find((event): event is Extract<DurableRuntimeTraceEvent, { event: "tool-batch-start" }> =>
        event.event === "tool-batch-start" && event.turn === turn)
      const end = events.find((event): event is Extract<DurableRuntimeTraceEvent, { event: "tool-batch-end" }> =>
        event.event === "tool-batch-end" && event.turn === turn)
      if (!start || !end || start.toolCount !== expectedTools || end.toolCount !== expectedTools
        || start.maximumToolFanOut !== expectedTools || end.maximumToolFanOut !== expectedTools) {
        throw new Error(`Durable trace tool batch mismatch in segment ${index}, turn ${turn}`)
      }
    }
  }
  const final = events.at(-1)
  if (!final || final.event !== "finalize" || final.outcome !== "completed") {
    throw new Error(`Durable trace finalize mismatch in segment ${index}`)
  }
  return SegmentSummarySchema.parse({
    index,
    events: events.length,
    providerRequests: events.filter((event) => event.event === "provider-request-start").length,
    providerResponses: responses.length,
    toolBatchStarts: events.filter((event) => event.event === "tool-batch-start").length,
    toolBatchEnds: events.filter((event) => event.event === "tool-batch-end").length,
    turnEnds: events.filter((event) => event.event === "turn-end").length,
    toolCalls: responses.reduce((sum, event) => sum + event.toolCount, 0),
    maximumToolFanOut: Math.max(...responses.map((event) => event.maximumToolFanOut)),
    finalized: true,
    finalOutcome: final.outcome,
    orderPassed: true,
  })
}

export function validateDurableRuntimeTrace(text: string): DurableRuntimeTraceValidation {
  const events = parseEvents(text)
  const segments = splitSegments(events)
  if (segments.length !== 2) throw new Error(`Expected two durable trace segments, observed ${segments.length}`)
  const summaries = segments.map((segment, index) => summarizeSegment(segment, index + 1))
  return { events: events.length, segments: summaries, passed: true }
}

function containedPath(root: string, path: string): string {
  const rootPath = resolve(root)
  const candidate = resolve(path)
  const rel = relative(rootPath, candidate)
  if (rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))) return candidate
  throw new Error(`Durable trace evidence path escapes root: ${path}`)
}

async function sha256File(path: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(await Bun.file(path).arrayBuffer())
  return hasher.digest("hex")
}

async function evidenceRefs(root: string) {
  return Promise.all(EVIDENCE_PATHS.map(async (path) => ({
    path,
    sha256: await sha256File(containedPath(root, resolve(root, path))),
  })))
}

export async function buildDurableRuntimeTraceValidationReport(options: {
  rootDir: string
  traceText: string
  sourceReplay: DelayedSourceProcessReplayReport
}): Promise<DurableRuntimeTraceValidationReport> {
  if (!options.sourceReplay.runtimePassed
    || options.sourceReplay.counts.observedRows !== 2
    || options.sourceReplay.counts.protocolComplete !== 2
    || options.sourceReplay.counts.outputsComplete !== 2
    || options.sourceReplay.shape.configuredProviderDelayMs !== 0) {
    throw new Error("Durable trace source replay did not pass the local mechanism gate")
  }
  const validation = validateDurableRuntimeTrace(options.traceText)
  return DurableRuntimeTraceValidationReportSchema.parse({
    schemaVersion: "skill-ir-durable-runtime-trace-validation-report/v1",
    validationId: "experimental-design-v2-durable-runtime-trace-validation-2026-07-29",
    status: "passed",
    methodEvidence: false,
    sourceReplay: {
      systems: ["no-skill", "original"],
      rows: 2,
      runtimePassed: true,
      protocolComplete: 2,
      outputsComplete: 2,
      configuredDelayMs: 0,
      latencyEvidence: false,
    },
    trace: {
      rawSha256: new Bun.CryptoHasher("sha256").update(options.traceText).digest("hex"),
      events: validation.events,
      segments: validation.segments,
      orderPassed: true,
      privacyProjectionOnly: true,
    },
    evidence: await evidenceRefs(resolve(options.rootDir)),
    claimBoundary: {
      infrastructureDiagnosticOnly: true,
      localTraceMechanismEvidence: true,
      historicalCrashLocated: false,
      benchmarkEvidence: false,
      skillOptimizationEvidence: false,
      modelCapabilityEvidence: false,
      tokenEvidence: false,
      paidMatrixAllowed: false,
    },
  })
}

export async function verifyDurableRuntimeTraceValidationReport(rootDir: string, value: unknown): Promise<void> {
  const report = DurableRuntimeTraceValidationReportSchema.parse(value)
  for (const ref of report.evidence) {
    const path = containedPath(rootDir, resolve(rootDir, ref.path))
    if (await sha256File(path) !== ref.sha256) {
      throw new Error(`Durable trace validation digest mismatch: ${ref.path}`)
    }
  }
}
