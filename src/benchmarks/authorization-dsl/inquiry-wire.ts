import { z } from "zod"
import { InquiryText } from "../../task-dsl/authorization/inquiry.ts"
import { AuthorizationInquirySchema, AuthorizationInquiryV1Schema, AuthorizationInquiryV2Schema } from "../../task-dsl/authorization/inquiry.ts"
import { AuthorizationInquiryResultSchema, AuthorizationObservationSchema, InquiryQuestionResultSchema } from "../../task-dsl/authorization/inquiry-result.ts"
import { ControlSliceV1DeltaSchema as ControlSliceDeltaSchema, canonicalControl, isFocusedInquiryStrategy, isOperationInquiryStrategy, isSourceAssistedInquiryStrategy, isPropertyAbstractionStrategy, type InquiryStrategy } from "../../task-dsl/authorization/control-slice.ts"
import { zodToJsonSchema } from "../../providers/structured.ts"
import type { LLMTool } from "../../providers/types.ts"
import { LocalControlDeltaSchema, LocalControlEnvelopeSchema } from "./inquiry-control-updates.ts"
import { SemanticUpdateSchema, SemanticUpdateEnvelopeSchema, SemanticResultSchema } from "./inquiry-semantic.ts"
import { FocusedResultSchema, FocusedUpdateEnvelopeSchema, SourceUpdateEnvelopeSchema, focusedUpdateSchema, selectedFocusedUpdateSchema, type FocusStage } from "./inquiry-focus.ts"
import { InquirySourceCallSchema, OperationSourceCallSchema } from "./inquiry-tools.ts"

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
const semanticSteps = (delta: typeof SemanticUpdateSchema | typeof SemanticUpdateEnvelopeSchema) => z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tool"), calls, controlDelta: delta.optional() }).strict(),
  z.object({ kind: z.literal("observe"), observations, controlDelta: delta.optional() }).strict(),
  z.object({ kind: z.literal("control"), controlDelta: delta }).strict(),
  z.object({ kind: z.literal("final"), result: SemanticResultSchema, controlDelta: delta.optional() }).strict(),
])
const semanticModelSteps = semanticSteps(SemanticUpdateSchema), semanticParserSteps = semanticSteps(SemanticUpdateEnvelopeSchema)
/** Final-only context supplies the unique omitted routing kind, never a result or its meaning. */
export function normalizeSemanticFinalEnvelope(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { value: input }
  const raw = input as Record<string, unknown>
  if ("kind" in raw || !("result" in raw) || Object.keys(raw).some(key => !["result", "controlDelta"].includes(key))) return { value: input }
  const value = { ...raw, kind: "final" as const }
  return semanticParserSteps.options[3].safeParse(value).success ? { value, normalization: { code: "semantic-final-kind-omitted", originalKind: null } } : { value: input }
}
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
const v1Author = AuthorizationInquiryV1Schema.innerType(), v2Author = AuthorizationInquiryV2Schema.innerType()
export const InquiryAuthorTransportSchema = z.union([
  v1Author.extend({ questions: z.array(v1Author.shape.questions.element.extend({ premises: v1Author.shape.questions.element.shape.premises.default([]) })).min(1).max(16) }),
  v2Author.extend({ questions: z.array(v2Author.shape.questions.element.extend({ premises: v2Author.shape.questions.element.shape.premises.default([]) })).min(1).max(16) }),
])
export const inquiryAuthorModelSchema = (strategy?: InquiryStrategy) => isOperationInquiryStrategy(strategy) ? v2Author : v1Author
/** Recover explicit routing containers losslessly; local source meaning is validated by the active focus. */
export function normalizeFocusedControlEnvelope(input: unknown, sourceAssisted = false) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { value: input }
  const original = input as Record<string, unknown>
  if (sourceAssisted && original.kind === "edit") return { value: { kind: "control", controlDelta: original }, normalization: { code: "source-edit-at-step-root", originalKind: original.kind } }
  if (sourceAssisted && original.kind === "interpret" && "interpretation" in original) {
    const candidate = { schemaVersion: "authorization-source-update/v1", ...original }
    const checked = SourceUpdateEnvelopeSchema.safeParse(candidate)
    if (!checked.success) return { value: input, issues: checked.error.issues }
    return { value: { kind: "control", controlDelta: candidate }, normalization: { code: "source-update-at-step-root", originalKind: original.kind } }
  }
  const versionOmitted = !("schemaVersion" in original) && ["select", "interpret", "link", "review", "defer"].includes(String(original.kind))
  const raw = versionOmitted ? { ...original, schemaVersion: "authorization-focused-update/v1" } : original, keys = Object.keys(raw)
  const sourceCalls = z.array(OperationSourceCallSchema).min(1).max(8)
  let value: unknown = input, code: string | undefined
  if (keys.every(k => ["kind", "value"].includes(k)) && raw.value && typeof raw.value === "object" && !Array.isArray(raw.value)) {
    const nested = raw.value as Record<string, unknown>, nestedKeys = Object.keys(nested)
    const delta = !("controlDelta" in nested) || FocusedUpdateEnvelopeSchema.safeParse(nested.controlDelta).success
    if (raw.kind === nested.kind && ((raw.kind === "tool" && nestedKeys.every(k => ["kind", "calls", "controlDelta"].includes(k)) && sourceCalls.safeParse(nested.calls).success && delta) || (raw.kind === "control" && nestedKeys.every(k => ["kind", "controlDelta"].includes(k)) && FocusedUpdateEnvelopeSchema.safeParse(nested.controlDelta).success))) { value = nested; code = "focused-step-matching-wrapper" }
  } else if (raw.kind === "tool" && ("schemaVersion" in raw || "focusId" in raw || "reason" in raw) && z.object({ kind: z.literal("tool"), calls: sourceCalls, schemaVersion: z.literal("authorization-focused-update/v1").optional(), focusId: z.string().min(1).optional(), reason: InquiryText.optional() }).strict().safeParse(raw).success) {
    value = { kind: "tool", calls: raw.calls, ...("reason" in raw ? { reason: raw.reason } : {}) }; code = "focused-source-routing-metadata"
  } else if (["select", "interpret", "link", "review", "defer"].includes(String(raw.kind))) {
    const { calls: explicitCalls, controlDelta: misplaced, ...focused } = raw
    const hasCalls = "calls" in raw, hasDelta = "controlDelta" in raw
    const emptyCalls = hasCalls && Array.isArray(explicitCalls) && explicitCalls.length === 0
    const onlyAlso = hasDelta && raw.kind === "interpret" && !("also" in focused) && misplaced && typeof misplaced === "object" && !Array.isArray(misplaced) && Object.keys(misplaced).length === 1 && Object.keys(misplaced)[0] === "also"
    const candidate = onlyAlso ? { ...focused, also: (misplaced as Record<string, unknown>).also } : focused
    const parsed = FocusedUpdateEnvelopeSchema.safeParse(candidate)
    if (!parsed.success) return { value: input, issues: parsed.error.issues }
    if (raw.kind === "interpret" && !("unit" in focused)) return { value: input, issues: [{ code: z.ZodIssueCode.custom, path: ["unit"], message: "Focused interpret requires an explicit unit." }] }
    if (hasDelta && !onlyAlso) return { value: input, issues: [{ code: z.ZodIssueCode.custom, path: ["controlDelta"], message: "Focused root action cannot carry another controlDelta." }] }
    if (hasCalls && !emptyCalls) { const checked = sourceCalls.safeParse(explicitCalls); if (!checked.success) return { value: input, issues: checked.error.issues.map(i => ({ ...i, path: ["calls", ...i.path] })) } }
    value = hasCalls && !emptyCalls ? { kind: "tool", calls: explicitCalls, controlDelta: candidate } : { kind: "control", controlDelta: candidate }; code = "focused-update-at-step-root"
  } else if (keys.every(k => ["kind", "controlDelta"].includes(k)) && FocusedUpdateEnvelopeSchema.safeParse(raw.controlDelta).success && (raw.kind === undefined || raw.kind === "tool")) { value = { ...raw, kind: "control" }; code = raw.kind === undefined ? "focused-control-kind-omitted" : "focused-control-tool-without-calls" }
  else if (raw.kind === undefined && keys.every(k => ["calls", "controlDelta"].includes(k)) && z.array(InquirySourceCallSchema).min(1).max(8).safeParse(raw.calls).success) { value = { ...raw, kind: "tool" }; code = "focused-tool-kind-omitted" }
  else if (raw.kind === undefined && keys.every(k => k === "result") && FocusedResultSchema.safeParse(raw.result).success) { value = { ...raw, kind: "final" }; code = "focused-final-kind-omitted" }
  else if ((raw.kind === "final" || raw.kind === undefined) && raw.schemaVersion === "authorization-focused-result/v1") { const { kind: _kind, ...result } = raw; value = { kind: "final", result }; code = "focused-final-result-root" }
  return code ? { value, normalization: { code: versionOmitted ? "focused-action-version-omitted" : code, originalKind: original.kind ?? null, ...(versionOmitted ? { filled: ["schemaVersion"] } : {}) } } : { value: input }
}
const focusedSteps = (stage?: FocusStage, parsing = false, operation = false, sourceAssisted = false, sourceEditing = false) => z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tool"), calls: z.array(operation ? OperationSourceCallSchema : InquirySourceCallSchema).min(1).max(8), controlDelta: focusedUpdateSchema(stage, parsing, operation, sourceAssisted, sourceEditing).optional(), reason: InquiryText.optional() }).strict(),
  z.object({ kind: z.literal("control"), controlDelta: focusedUpdateSchema(stage, parsing, operation, sourceAssisted, sourceEditing) }).strict(),
  z.object({ kind: z.literal("final"), result: FocusedResultSchema }).strict(),
])
/** One advertised routing kind; all actions still parse into the existing focused core. */
function operationStepModelSchema(stage?: FocusStage, finalOnly = false, sourceAssisted = false, sourceEditing = false) {
  const final = FocusedResultSchema.extend({ kind: z.literal("final") })
  if (finalOnly) return final
  const actions = focusedUpdateSchema(stage, false, true, sourceAssisted, sourceEditing), options = "options" in actions ? actions.options : [actions]
  const direct = options.map(action => action.extend({ schemaVersion: action.shape.schemaVersion.optional(), calls: z.array(OperationSourceCallSchema).max(8).optional() }))
  const variants = [z.object({ kind: z.literal("tool"), calls: z.array(OperationSourceCallSchema).min(1).max(8), schemaVersion: z.literal("authorization-focused-update/v1").optional(), focusId: z.string().min(1).optional(), reason: InquiryText.optional() }).strict(), ...direct, ...(stage === "answer" ? [final] : [])]
  const exact = z.union([variants[0]!, variants[1]!, ...variants.slice(2)])
  // A root union forces the generic tool transport to add a second `value` container.
  // Publish one object; action-specific required/forbidden fields remain strictly parsed.
  const shape: z.ZodRawShape = { kind: z.enum(variants.map(v => v.shape.kind.value) as [string, ...string[]]), calls: z.array(OperationSourceCallSchema).max(8).optional() }
  const fields = new Map<string, Map<string, z.ZodTypeAny>>()
  for (const variant of variants) for (const [key, field] of Object.entries(variant.shape) as Array<[string, z.ZodTypeAny]>) {
    if (key === "kind" || key === "calls") continue
    const alternatives = fields.get(key) ?? new Map<string, z.ZodTypeAny>()
    alternatives.set(JSON.stringify(zodToJsonSchema(field)), field); fields.set(key, alternatives)
  }
  for (const [key, alternatives] of fields) {
    const schemas = [...alternatives.values()]
    shape[key] = (schemas.length === 1 ? schemas[0]! : z.union([schemas[0]!, schemas[1]!, ...schemas.slice(2)])).optional()
  }
  return z.object(shape).strict().superRefine((value, context) => {
    const parsed = exact.safeParse(value)
    if (!parsed.success) for (const issue of parsed.error.issues) context.addIssue(issue)
  })
}
export type InquiryStep = InquiryControlStep | z.infer<typeof localParserSteps> | z.infer<typeof semanticParserSteps> | z.infer<ReturnType<typeof focusedSteps>>
const resultModelSchema = (mode?: "behavior" | "conformance") => mode ? AuthorizationInquiryResultSchema.extend({ questions: z.array(mode === "behavior" ? InquiryQuestionResultSchema.omit({ policyAssessment: true }) : InquiryQuestionResultSchema.extend({ policyAssessment: InquiryQuestionResultSchema.shape.policyAssessment.unwrap() })) }) : AuthorizationInquiryResultSchema
export function inquiryStepSchemas(strategy: InquiryStrategy, finalOnly = false, mode?: "behavior" | "conformance", stage?: FocusStage) {
  if (isFocusedInquiryStrategy(strategy)) {
    const sourceAssisted = isSourceAssistedInquiryStrategy(strategy)
    const parser = focusedSteps(stage, true, isOperationInquiryStrategy(strategy), sourceAssisted, isPropertyAbstractionStrategy(strategy)), model = focusedSteps(stage, false, isOperationInquiryStrategy(strategy), sourceAssisted, isPropertyAbstractionStrategy(strategy))
    const select = (schemas: typeof parser) => finalOnly ? schemas.options[2] : stage === "answer" ? schemas : z.discriminatedUnion("kind", [schemas.options[0], schemas.options[1]])
    return { schema: z.preprocess((input, context) => {
      const normalized = normalizeFocusedControlEnvelope(input, sourceAssisted)
      if (normalized.issues) { for (const issue of normalized.issues) context.addIssue({ ...issue, fatal: true }); return z.NEVER }
      return normalized.value
    }, select(parser)), modelSchema: isOperationInquiryStrategy(strategy) ? operationStepModelSchema(stage, finalOnly, sourceAssisted, isPropertyAbstractionStrategy(strategy)) : select(model) }
  }
  if (strategy === "semantic-flow-v1") return { schema: finalOnly ? z.preprocess(input => normalizeSemanticFinalEnvelope(input).value, semanticParserSteps.options[3]) : semanticParserSteps, modelSchema: finalOnly ? semanticModelSteps.options[3] : semanticModelSteps }
  const fullModel = strategy === "guided-evidence-v2" ? localModelSteps : strategy === "legacy" ? LegacyStepSchema : canonicalStep
  const modelOptions: [z.ZodDiscriminatedUnionOption<"kind">, ...z.ZodDiscriminatedUnionOption<"kind">[]] = [fullModel.options[0], ...fullModel.options.slice(1).map(option => "result" in option.shape ? option.extend({ result: resultModelSchema(mode) }) : option)]
  const modelSchema = finalOnly ? modelOptions.at(-1)! : z.discriminatedUnion("kind", modelOptions)
  if (strategy === "guided-evidence-v2") return { schema: finalOnly ? localParserSteps.options[3] : z.preprocess(input => normalizeGuidedControlEnvelope(input).value, localParserSteps), modelSchema }
  const schema = strategy === "legacy" ? finalOnly ? LegacyStepSchema.options[2] : LegacyStepSchema : finalOnly ? ControlFinalStepSchema : ControlStepSchema
  return { schema, modelSchema }
}

export function inquiryNativeSchemas(strategy: InquiryStrategy, parsing = false, stage?: FocusStage) {
  const domain = strategy !== "legacy"
  const guidedParsing = parsing && strategy === "guided-evidence-v2"
  const compile = z.object({ inquiry: parsing ? InquiryAuthorTransportSchema : inquiryAuthorModelSchema(strategy) }).strict()
  const result = isFocusedInquiryStrategy(strategy) ? FocusedResultSchema : strategy === "semantic-flow-v1" ? SemanticResultSchema : guidedParsing ? GuidedResultSchema : AuthorizationInquiryResultSchema
  const delta = isFocusedInquiryStrategy(strategy) ? focusedUpdateSchema(stage, parsing, isOperationInquiryStrategy(strategy), isSourceAssistedInquiryStrategy(strategy), isPropertyAbstractionStrategy(strategy)) : strategy === "semantic-flow-v1" ? parsing ? SemanticUpdateEnvelopeSchema : SemanticUpdateSchema : strategy === "guided-evidence-v2" ? parsing ? z.preprocess(guidedDeltaWithContextVersion, LocalControlEnvelopeSchema) : LocalControlDeltaSchema : ControlSliceDeltaSchema
  return {
    authorization_compile: guidedParsing ? z.preprocess(guidedCompile, compile) : compile,
    authorization_observe: domain ? z.object({ observations: observations.min(0).optional(), controlDelta: delta.optional() }).strict() : z.object({ observations: observations.min(0) }).strict(),
    authorization_check_result: domain ? z.object({ result, controlDelta: delta.optional() }).strict() : z.object({ result: AuthorizationInquiryResultSchema }).strict(),
  }
}
export function inquiryNativeDefinitions(strategy: InquiryStrategy, mode?: "behavior" | "conformance", stage?: FocusStage): LLMTool[] {
  const original = inquiryNativeSchemas(strategy, false, stage), schemas = { ...original, authorization_check_result: original.authorization_check_result.extend({ result: isFocusedInquiryStrategy(strategy) ? FocusedResultSchema : strategy === "semantic-flow-v1" ? SemanticResultSchema : resultModelSchema(mode) }) }, descriptions = {
    authorization_compile: "Compile current user questions without inferring source behavior; returns the pending relation queue.",
    authorization_observe: "Record evidence-bound observations and local controlDelta. The host returns actual dependency reads and diagnostics; semantic support remains unreviewed.",
    authorization_check_result: "Check the final result against current questions, shown source and proposed controls; preserve diagnostics and finish in the original skill prose format.",
  }
  return Object.entries(schemas).map(([name, schema]) => ({ name, description: descriptions[name as keyof typeof descriptions], inputSchema: zodToJsonSchema(schema) }))
}

export function inquiryNativeArgumentSchema(strategy: InquiryStrategy, name: string, raw: unknown, parsing = true): z.ZodTypeAny | undefined {
  const schemas = inquiryNativeSchemas(strategy, parsing), schema = schemas[name as keyof typeof schemas]
  if (!schema || !isFocusedInquiryStrategy(strategy) || !raw || typeof raw !== "object" || !("controlDelta" in raw) || !raw.controlDelta || name === "authorization_compile") return schema
  if (!(schema instanceof z.ZodObject)) return schema
  return schema.extend({ controlDelta: selectedFocusedUpdateSchema(raw.controlDelta, parsing, isOperationInquiryStrategy(strategy), isSourceAssistedInquiryStrategy(strategy), isPropertyAbstractionStrategy(strategy)).optional() })
}
/** AJV still decides static transport validity; this only replaces ambiguous error feedback. */
export function inquiryArgumentDiagnostics(strategy: InquiryStrategy, name: string, raw: unknown) {
  const schema = inquiryNativeArgumentSchema(strategy, name, raw, false)
  if (!schema) return undefined
  const parsed = schema.safeParse(raw)
  if (parsed.success) return undefined
  return parsed.error.issues.slice(0, 8).map(issue => ({ path: "/" + issue.path.map(p => String(p).replaceAll("~", "~0").replaceAll("/", "~1")).join("/"), keyword: issue.code,
    message: issue.message, expected: issue.code === "invalid_enum_value" ? { allowedValues: issue.options } : issue.code === "invalid_literal" ? { allowedValue: issue.expected } : issue.code === "unrecognized_keys" ? { additionalProperties: issue.keys } : issue.code === "invalid_type" ? { type: issue.expected } : null }))
}
