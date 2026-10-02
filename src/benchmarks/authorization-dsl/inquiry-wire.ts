import { z } from "zod"
import { AuthorizationInquirySchema } from "../../task-dsl/authorization/inquiry.ts"
import { AuthorizationInquiryResultSchema, AuthorizationObservationSchema } from "../../task-dsl/authorization/inquiry-result.ts"
import { ControlSliceDeltaSchema, canonicalControl, type InquiryStrategy } from "../../task-dsl/authorization/control-slice.ts"
import { zodToJsonSchema } from "../../providers/structured.ts"
import type { LLMTool } from "../../providers/types.ts"
import { LocalControlDeltaSchema, LocalControlEnvelopeSchema } from "./inquiry-control-updates.ts"

const calls = z.array(z.object({ name: z.enum(["source_list", "source_search", "source_symbol", "source_read"]), arguments: z.record(z.unknown()) }).strict()).min(1).max(8)
const observations = z.array(AuthorizationObservationSchema).min(1).max(32)
export const LegacyStepSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tool"), calls }).strict(),
  z.object({ kind: z.literal("observe"), observations }).strict(),
  z.object({ kind: z.literal("final"), result: AuthorizationInquiryResultSchema }).strict(),
])
const canonicalStep = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tool"), calls, controlDelta: ControlSliceDeltaSchema.optional() }).strict(),
  z.object({ kind: z.literal("observe"), observations, controlDelta: ControlSliceDeltaSchema.optional() }).strict(),
  z.object({ kind: z.literal("control"), controlDelta: ControlSliceDeltaSchema }).strict(),
  z.object({ kind: z.literal("final"), result: AuthorizationInquiryResultSchema, controlDelta: ControlSliceDeltaSchema.optional() }).strict(),
])
export const ControlFinalStepSchema = canonicalStep.options[3]
/** Historical control.delta is a lossless input alias; the advertised contract only contains controlDelta. */
export const ControlStepSchema = z.preprocess((input, context) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input
  const value = input as Record<string, unknown>
  if (value.kind !== "control" || !("delta" in value)) return value
  if ("controlDelta" in value && canonicalControl(value.delta) !== canonicalControl(value.controlDelta)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["controlDelta"], message: "control-alias-conflict: delta and controlDelta must not disagree" })
    return input
  }
  const { delta, ...rest } = value
  return { ...rest, controlDelta: value.controlDelta ?? delta }
}, canonicalStep)
export type InquiryControlStep = z.infer<typeof ControlStepSchema>
const localSteps = (delta: typeof LocalControlDeltaSchema | typeof LocalControlEnvelopeSchema) => z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tool"), calls, controlDelta: delta.optional() }).strict(),
  z.object({ kind: z.literal("observe"), observations, controlDelta: delta.optional() }).strict(),
  z.object({ kind: z.literal("control"), controlDelta: delta }).strict(),
  z.object({ kind: z.literal("final"), result: AuthorizationInquiryResultSchema, controlDelta: delta.optional() }).strict(),
])
const localModelSteps = localSteps(LocalControlDeltaSchema), localParserSteps = localSteps(LocalControlEnvelopeSchema)
export type InquiryStep = InquiryControlStep | z.infer<typeof localParserSteps>
export function inquiryStepSchemas(strategy: InquiryStrategy, finalOnly = false) {
  if (strategy === "guided-evidence-v2") return { schema: finalOnly ? localParserSteps.options[3] : localParserSteps, modelSchema: finalOnly ? localModelSteps.options[3] : localModelSteps }
  const schema = strategy === "legacy" ? LegacyStepSchema : finalOnly ? ControlFinalStepSchema : ControlStepSchema
  return { schema, modelSchema: schema }
}

export function inquiryNativeSchemas(strategy: InquiryStrategy, parsing = false) {
  const domain = strategy !== "legacy"
  const delta = strategy === "guided-evidence-v2" ? parsing ? LocalControlEnvelopeSchema : LocalControlDeltaSchema : ControlSliceDeltaSchema
  return {
    authorization_compile: z.object({ inquiry: AuthorizationInquirySchema }).strict(),
    authorization_observe: domain ? z.object({ observations: observations.min(0).optional(), controlDelta: delta.optional() }).strict() : z.object({ observations: observations.min(0) }).strict(),
    authorization_check_result: domain ? z.object({ result: AuthorizationInquiryResultSchema, controlDelta: delta.optional() }).strict() : z.object({ result: AuthorizationInquiryResultSchema }).strict(),
  }
}
export function inquiryNativeDefinitions(strategy: InquiryStrategy): LLMTool[] {
  const schemas = inquiryNativeSchemas(strategy), descriptions = {
    authorization_compile: "Compile current user questions without inferring source behavior; returns the pending relation queue.",
    authorization_observe: "Record evidence-bound observations and local controlDelta. The host returns actual dependency reads and diagnostics; semantic support remains unreviewed.",
    authorization_check_result: "Check the final result against current questions, shown source and proposed controls; preserve diagnostics and finish in the original skill prose format.",
  }
  return Object.entries(schemas).map(([name, schema]) => ({ name, description: descriptions[name as keyof typeof descriptions], inputSchema: zodToJsonSchema(schema) }))
}
