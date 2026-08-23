import { z } from "zod"
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package"
import {
  ExecutionEnvelopeSchema,
  ExecutionFailureClassificationSchema,
  type ExecutionEnvelope,
} from "./execution-resilience"

export const ProspectiveDevelopmentQualificationSchema = z.object({
  schemaVersion: z.literal("skill-ir-prospective-development-qualification/v1"),
  experimentId: z.string().min(1),
  lockSha256: Sha256Schema,
  status: z.enum(["passed", "failed"]),
  checks: z.object({
    resource: z.boolean(),
    route: z.boolean(),
    observability: z.boolean(),
    scorer: z.boolean(),
  }).strict(),
  resource: z.object({
    status: z.enum(["ok", "failed"]),
    reportPath: SafeRelativePathSchema,
    reportSha256: Sha256Schema,
  }).strict(),
  execution: z.object({
    classification: ExecutionFailureClassificationSchema,
    durationMs: z.number().nonnegative(),
    exitCode: z.number().int().nullable(),
    requestDispatched: z.boolean(),
    providerResponses: z.number().int().nonnegative(),
    parserOutcome: z.enum(["ok", "empty", "incompatible"]),
    usage: z.object({
      available: z.boolean(),
      input: z.number().int().nonnegative(),
      output: z.number().int().nonnegative(),
      cacheRead: z.number().int().nonnegative(),
      cacheWrite: z.number().int().nonnegative(),
    }).strict(),
  }).strict(),
  scorer: z.object({
    rowProduced: z.boolean(),
    deterministicEvaluator: z.boolean(),
  }).strict(),
  disclosure: z.object({
    exactOutputsPresent: z.boolean(),
    semanticSuccess: z.boolean().nullable(),
    usedAsGate: z.literal(false),
  }).strict(),
  accounting: z.object({ paidCalls: z.literal(1) }).strict(),
  authorizations: z.object({
    paidMatrix: z.boolean(),
    heldOut: z.literal(false),
    readinessPromotion: z.literal(false),
  }).strict(),
  claimBoundary: z.literal(
    "Qualification proves resource, route, execution-observability, and deterministic-scorer infrastructure only. Task output presence and semantic success are disclosed but never gate model selection.",
  ),
}).strict().superRefine((report, context) => {
  const passed = Object.values(report.checks).every(Boolean)
  if ((report.status === "passed") !== passed || report.authorizations.paidMatrix !== passed) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "qualification status or authorization mismatch" })
  }
})

export type ProspectiveDevelopmentQualification = z.infer<
  typeof ProspectiveDevelopmentQualificationSchema
>

const OBSERVABLE_CLASSIFICATIONS = new Set([
  "semantic-complete",
  "active-idle-timeout",
  "active-absolute-timeout",
  "step-limit",
])

export function buildProspectiveDevelopmentQualification(input: {
  experimentId: string
  lockSha256: string
  resource: { status: "ok" | "failed"; reportPath: string; reportSha256: string }
  envelope: ExecutionEnvelope
  scorer: { rowProduced: boolean; deterministicEvaluator: boolean; semanticSuccess: boolean | null }
  exactOutputsPresent: boolean
}): ProspectiveDevelopmentQualification {
  const envelope = ExecutionEnvelopeSchema.parse(input.envelope)
  const checks = {
    resource: input.resource.status === "ok",
    route: envelope.activity.requestDispatched && envelope.activity.providerResponses > 0,
    observability: OBSERVABLE_CLASSIFICATIONS.has(envelope.classification)
      && envelope.parser.outcome === "ok"
      && envelope.parser.unknownTypes.length === 0,
    scorer: input.scorer.rowProduced && input.scorer.deterministicEvaluator,
  }
  const passed = Object.values(checks).every(Boolean)
  return ProspectiveDevelopmentQualificationSchema.parse({
    schemaVersion: "skill-ir-prospective-development-qualification/v1",
    experimentId: input.experimentId,
    lockSha256: input.lockSha256,
    status: passed ? "passed" : "failed",
    checks,
    resource: input.resource,
    execution: {
      classification: envelope.classification,
      durationMs: envelope.process.durationMs,
      exitCode: envelope.process.exitCode,
      requestDispatched: envelope.activity.requestDispatched,
      providerResponses: envelope.activity.providerResponses,
      parserOutcome: envelope.parser.outcome,
      usage: envelope.usage,
    },
    scorer: {
      rowProduced: input.scorer.rowProduced,
      deterministicEvaluator: input.scorer.deterministicEvaluator,
    },
    disclosure: {
      exactOutputsPresent: input.exactOutputsPresent,
      semanticSuccess: input.scorer.semanticSuccess,
      usedAsGate: false,
    },
    accounting: { paidCalls: 1 },
    authorizations: { paidMatrix: passed, heldOut: false, readinessPromotion: false },
    claimBoundary:
      "Qualification proves resource, route, execution-observability, and deterministic-scorer infrastructure only. Task output presence and semantic success are disclosed but never gate model selection.",
  })
}
