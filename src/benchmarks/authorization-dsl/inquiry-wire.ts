import { z } from "zod"
import { AuthorizationInquirySchema } from "../../task-dsl/authorization/inquiry.ts"
import { AuthorizationInquiryResultSchema, AuthorizationObservationSchema, InquiryQuestionResultSchema } from "../../task-dsl/authorization/inquiry-result.ts"
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
/** Relocate only already explicit same-question observations; mixed roots stay invalid. */
function guidedResult(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input
  const value = input as Record<string, unknown>
  if ("observations" in value || !Array.isArray(value.questions)) return input
  const observations: unknown[] = [], questions: unknown[] = []
  for (const q of value.questions) {
    if (!q || typeof q !== "object" || Array.isArray(q)) return input
    const { observations: nested, ...question } = q
    if (nested !== undefined) {
      if (!Array.isArray(nested) || nested.some(o => !AuthorizationObservationSchema.safeParse(o).success || o.questionId !== question.questionId)) return input
      observations.push(...nested)
    }
    questions.push(question)
  }
  return { ...value, questions, observations }
}
const GuidedResultSchema = z.preprocess(guidedResult, AuthorizationInquiryResultSchema)
function guidedCompile(input: unknown) {
  if (AuthorizationInquirySchema.safeParse(input).success) return { inquiry: input }
  if (!input || typeof input !== "object" || Array.isArray(input)) return input
  const value = input as Record<string, unknown>
  if (Object.keys(value).some(key => !["schemaVersion", "inquiry"].includes(key)) || ("schemaVersion" in value && value.schemaVersion !== "authorization-inquiry/v1")) return input
  if (!value.inquiry || typeof value.inquiry !== "object" || Array.isArray(value.inquiry)) return input
  const inquiry = { schemaVersion: "authorization-inquiry/v1", ...value.inquiry }
  return AuthorizationInquirySchema.safeParse(inquiry).success ? { inquiry } : input
}
const localSteps = (delta: typeof LocalControlDeltaSchema | typeof LocalControlEnvelopeSchema, result: typeof AuthorizationInquiryResultSchema | typeof GuidedResultSchema = AuthorizationInquiryResultSchema) => z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tool"), calls, controlDelta: delta.optional() }).strict(),
  z.object({ kind: z.literal("observe"), observations, controlDelta: delta.optional() }).strict(),
  z.object({ kind: z.literal("control"), controlDelta: delta }).strict(),
  z.object({ kind: z.literal("final"), result, controlDelta: delta.optional() }).strict(),
])
const localModelSteps = localSteps(LocalControlDeltaSchema), localParserSteps = localSteps(LocalControlEnvelopeSchema, GuidedResultSchema)
function guidedDeltaWithContextVersion(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input) || "schemaVersion" in input) return input
  const candidate = { ...input, schemaVersion: "authorization-control-update/v1" }
  return LocalControlEnvelopeSchema.safeParse(candidate).success ? candidate : input
}
/** Fill only omitted routing metadata from the selected strategy and explicit payload; never invent calls or a final answer. */
export function normalizeGuidedControlEnvelope(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { value: input }
  const original = input as Record<string, unknown>, keys = Object.keys(original), filled: string[] = []
  let value = original, code: string | undefined
  if ("controlDelta" in value && keys.every(key => ["kind", "controlDelta"].includes(key))) {
    code = !("kind" in value) ? "control-kind-omitted" : value.kind === "tool" ? "control-tool-without-calls" : undefined
    if (code) { value = { ...value, kind: "control" }; filled.push("kind") }
  } else if (!("kind" in value) && keys.every(key => ["calls", "controlDelta"].includes(key)) && calls.safeParse(value.calls).success) {
    value = { ...value, kind: "tool" }; filled.push("kind"); code = "guided-envelope-metadata-omitted"
  }
  const controlDelta = guidedDeltaWithContextVersion(value.controlDelta)
  if (controlDelta !== value.controlDelta) { value = { ...value, controlDelta }; filled.push("controlDelta.schemaVersion"); code = "guided-envelope-metadata-omitted" }
  return code ? { value, normalization: { code, originalKind: original.kind ?? null, ...(code === "guided-envelope-metadata-omitted" ? { filled } : {}) } } : { value: input }
}
export type InquiryStep = InquiryControlStep | z.infer<typeof localParserSteps>
const resultModelSchema = (mode?: "behavior" | "conformance") => mode ? AuthorizationInquiryResultSchema.extend({ questions: z.array(mode === "behavior" ? InquiryQuestionResultSchema.omit({ policyAssessment: true }) : InquiryQuestionResultSchema.extend({ policyAssessment: InquiryQuestionResultSchema.shape.policyAssessment.unwrap() })) }) : AuthorizationInquiryResultSchema
export function inquiryStepSchemas(strategy: InquiryStrategy, finalOnly = false, mode?: "behavior" | "conformance") {
  const fullModel = strategy === "guided-evidence-v2" ? localModelSteps : strategy === "legacy" ? LegacyStepSchema : canonicalStep
  const modelOptions: [z.ZodDiscriminatedUnionOption<"kind">, ...z.ZodDiscriminatedUnionOption<"kind">[]] = [fullModel.options[0], ...fullModel.options.slice(1).map(option => "result" in option.shape ? option.extend({ result: resultModelSchema(mode) }) : option)]
  const modelSchema = finalOnly ? modelOptions.at(-1)! : z.discriminatedUnion("kind", modelOptions)
  if (strategy === "guided-evidence-v2") return { schema: finalOnly ? localParserSteps.options[3] : z.preprocess(input => normalizeGuidedControlEnvelope(input).value, localParserSteps), modelSchema }
  const schema = strategy === "legacy" ? LegacyStepSchema : finalOnly ? ControlFinalStepSchema : ControlStepSchema
  return { schema, modelSchema }
}

export function inquiryNativeSchemas(strategy: InquiryStrategy, parsing = false) {
  const domain = strategy !== "legacy"
  const guidedParsing = parsing && strategy === "guided-evidence-v2"
  const compile = z.object({ inquiry: AuthorizationInquirySchema }).strict()
  const result = guidedParsing ? GuidedResultSchema : AuthorizationInquiryResultSchema
  const delta = strategy === "guided-evidence-v2" ? parsing ? z.preprocess(guidedDeltaWithContextVersion, LocalControlEnvelopeSchema) : LocalControlDeltaSchema : ControlSliceDeltaSchema
  return {
    authorization_compile: guidedParsing ? z.preprocess(guidedCompile, compile) : compile,
    authorization_observe: domain ? z.object({ observations: observations.min(0).optional(), controlDelta: delta.optional() }).strict() : z.object({ observations: observations.min(0) }).strict(),
    authorization_check_result: domain ? z.object({ result, controlDelta: delta.optional() }).strict() : z.object({ result: AuthorizationInquiryResultSchema }).strict(),
  }
}
export function inquiryNativeDefinitions(strategy: InquiryStrategy, mode?: "behavior" | "conformance"): LLMTool[] {
  const original = inquiryNativeSchemas(strategy), schemas = { ...original, authorization_check_result: original.authorization_check_result.extend({ result: resultModelSchema(mode) }) }, descriptions = {
    authorization_compile: "Compile current user questions without inferring source behavior; returns the pending relation queue.",
    authorization_observe: "Record evidence-bound observations and local controlDelta. The host returns actual dependency reads and diagnostics; semantic support remains unreviewed.",
    authorization_check_result: "Check the final result against current questions, shown source and proposed controls; preserve diagnostics and finish in the original skill prose format.",
  }
  return Object.entries(schemas).map(([name, schema]) => ({ name, description: descriptions[name as keyof typeof descriptions], inputSchema: zodToJsonSchema(schema) }))
}
