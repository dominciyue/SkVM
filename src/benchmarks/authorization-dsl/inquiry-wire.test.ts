import { expect, test } from "bun:test"
import { extractStructured } from "../../providers/structured.ts"
const api = await import("./inquiry-wire.ts").catch(() => ({} as any))
const delta = { schemaVersion: "authorization-control-slice/v1", rules: [], dependencies: [], bindings: [], policyRules: [] }
test("legacy final-only parser matches the advertised delivery schema and rejects further tool or observation steps", () => {
  const schemas = api.inquiryStepSchemas("legacy", true)
  for (const step of [{ kind: "tool", calls: [{ name: "source_list", arguments: {} }] }, { kind: "observe", observations: [{ questionId: "q", kind: "entry", subject: "entry", claim: "Index", state: "observed", evidenceIds: ["e"] }] }]) {
    expect(schemas.modelSchema.safeParse(step).success).toBe(false)
    expect(schemas.schema.safeParse(step).success).toBe(false)
    expect(api.inquiryStepSchemas("legacy").schema.safeParse(step).success).toBe(true)
  }
})
test("guided native accepts an otherwise valid unwrapped declaration without changing the model contract", () => {
  const inquiry = { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Can entry run?", premises: [] }] }
  expect(api.inquiryNativeSchemas("guided-evidence-v2", true).authorization_compile.parse(inquiry)).toEqual({ inquiry })
  expect(api.inquiryNativeSchemas("guided-evidence-v2").authorization_compile.safeParse(inquiry).success).toBe(false)
  expect(api.inquiryNativeSchemas("guided-evidence-v2", true).authorization_compile.safeParse({ ...inquiry, inquiry }).success).toBe(false)
  const { schemaVersion, ...body } = inquiry
  expect(api.inquiryNativeSchemas("guided-evidence-v2", true).authorization_compile.parse({ schemaVersion, inquiry: body })).toEqual({ inquiry })
  expect(api.inquiryNativeSchemas("guided-evidence-v2", true).authorization_compile.parse({ inquiry: body })).toEqual({ inquiry })
  expect(api.inquiryNativeSchemas("guided-evidence-v2", true).authorization_compile.safeParse({ schemaVersion: "wrong", inquiry: body }).success).toBe(false)
  expect(api.inquiryNativeSchemas("guided-evidence-v2", true).authorization_compile.safeParse({ schemaVersion, inquiry: { ...body, schemaVersion: "wrong" } }).success).toBe(false)
})
test("guided result moves explicitly owned nested observations without guessing or merging conflicts", () => {
  const observation = { questionId: "q", kind: "entry", subject: "entry", claim: "Read source", state: "observed", evidenceIds: ["e"] }
  const q = { questionId: "q", behavior: { disposition: "unknown", explanation: "Missing helper" }, branches: [], evidenceIds: ["e"], missing: [{ kind: "source-gap", detail: "helper" }], observations: [observation] }
  const raw = { schemaVersion: "authorization-inquiry-result/v1", questions: [q], scope: "source" }
  const schema = api.inquiryNativeSchemas("guided-evidence-v2", true).authorization_check_result
  const parsed = schema.parse({ result: raw }).result
  expect(parsed.observations).toEqual([observation])
  expect(parsed.questions[0]).not.toHaveProperty("observations")
  expect(raw.questions[0]!.observations).toEqual([observation])
  for (const result of [{ ...raw, observations: [] }, { ...raw, questions: [{ ...q, observations: [{ ...observation, questionId: "other" }] }] }]) expect(schema.safeParse({ result }).success).toBe(false)
  expect(api.inquiryStepSchemas("guided-evidence-v2", true).schema.parse({ kind: "final", result: raw }).result).toEqual(parsed)
  expect(api.inquiryNativeSchemas("legacy", true).authorization_check_result.safeParse({ result: raw }).success).toBe(false)
})
test("guided final omission means no additional observations, not a missing answer", () => {
  const result = { schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q", behavior: { disposition: "unknown", explanation: "Helper unavailable" }, branches: [], evidenceIds: [], missing: [{ kind: "source-gap", detail: "Helper" }] }], scope: "source" }
  const schema = api.inquiryNativeSchemas("guided-evidence-v2", true).authorization_check_result
  expect(schema.parse({ result }).result).toEqual({ ...result, observations: [] })
  expect(result).not.toHaveProperty("observations")
  expect(schema.safeParse({ result: { ...result, observations: null } }).success).toBe(false)
  expect(api.inquiryNativeSchemas("legacy", true).authorization_check_result.safeParse({ result }).success).toBe(false)
})
test("structured control steps expose one canonical field and accept the lossless legacy alias", async () => {
  expect(api.ControlStepSchema).toBeDefined()
  const current = { kind: "control", controlDelta: delta }
  expect(api.ControlStepSchema.parse({ kind: "control", delta })).toEqual(current)
  expect(api.ControlStepSchema.parse({ ...current, delta })).toEqual(current)
  const conflict = api.ControlStepSchema.safeParse({ ...current, delta: { ...delta, rules: [{ key: "different" }] } })
  expect(conflict.success).toBe(false)
  expect(conflict.error.issues.some((d: any) => d.message.includes("control-alias-conflict"))).toBe(true)
  let actual: any
  const provider: any = { name: "capture", complete: async (params: any) => { actual = params.tools[0].inputSchema; return { text: "", toolCalls: [{ name: "submit", arguments: { value: current } }], tokens: { input: 1, output: 1 }, durationMs: 0 } } }
  await extractStructured({ provider, schema: api.ControlStepSchema, schemaName: "submit", schemaDescription: "contract capture", prompt: "contract capture", maxRetries: 1 })
  const control = actual.properties.value.anyOf.find((v: any) => v.properties.kind.const === "control")
  expect(control.required).toEqual(["kind", "controlDelta"])
  expect(control.properties.delta).toBeUndefined()
})
test("native schemas use the same complete nested types, strict objects and bounded arrays", () => {
  expect(typeof api.inquiryNativeDefinitions).toBe("function")
  const defs = api.inquiryNativeDefinitions("domain-evidence-v1")
  const observe = defs.find((t: any) => t.name === "authorization_observe").inputSchema
  const rule = observe.properties.controlDelta.properties.rules.items
  expect(rule.properties.key.type).toBe("string")
  expect(rule.properties.key.minLength).toBe(1)
  expect(rule.properties.condition.additionalProperties).toEqual({})
  expect(observe.properties.controlDelta.properties.rules.maxItems).toBe(1024)
  const value = observe.properties.controlDelta.properties.bindings.items.properties.value
  expect(value.anyOf.some((t: any) => t.type === "null")).toBe(true)
  const result = defs.find((t: any) => t.name === "authorization_check_result").inputSchema.properties.result
  expect(result.properties.questions.items.properties.behavior.properties.disposition.enum).toContain("conditional")
  expect(result.additionalProperties).toBe(false)
  const compile = defs.find((t: any) => t.name === "authorization_compile").inputSchema
  expect(compile.properties.inquiry.properties.questions.maxItems).toBe(16)
  expect(compile.properties.inquiry.properties.questions.items.properties.request.minLength).toBe(1)
  const parsed = api.inquiryNativeSchemas("domain-evidence-v1").authorization_observe.safeParse({ controlDelta: delta, invented: true })
  expect(parsed.success).toBe(false)
  expect(parsed.error.issues[0].code).toBe("unrecognized_keys")
})

test("guided local schemas advertise full item contracts while the host can retain a malformed item for partial feedback", () => {
  const defs = api.inquiryNativeDefinitions("guided-evidence-v2")
  const delta = defs.find((t: any) => t.name === "authorization_observe").inputSchema.properties.controlDelta
  expect(delta.properties.schemaVersion.const).toBe("authorization-control-update/v1")
  expect(delta.properties.rules.items.properties.targetKey.type).toBe("string")
  expect(delta.properties.rules.items.properties.revisionOf).toBeUndefined()
  expect(delta.properties.sourceBindings.items.properties.bindingKind.enum).toContain("resource")
  expect(delta.properties.premiseValues.items.anyOf.find((v: any) => v.properties.status.const === "unspecified").properties.value).toBeUndefined()
  const value = { controlDelta: { schemaVersion: "authorization-control-update/v1", rules: [{ questionId: "q", targetKey: "bad" }] } }
  expect(api.inquiryNativeSchemas("guided-evidence-v2").authorization_observe.safeParse(value).success).toBe(false)
  expect(api.inquiryNativeSchemas("guided-evidence-v2", true).authorization_observe.safeParse(value).success).toBe(true)
})

test("actual mode-specific model contracts omit behavior policy and require conformance policy", () => {
  const nativeBehavior = api.inquiryNativeDefinitions("guided-evidence-v2", "behavior").find((d: any) => d.name === "authorization_check_result").inputSchema
  expect(nativeBehavior.properties.result.properties.questions.items.properties.policyAssessment).toBeUndefined()
  const nativeConformance = api.inquiryNativeDefinitions("guided-evidence-v2", "conformance").find((d: any) => d.name === "authorization_check_result").inputSchema
  expect(nativeConformance.properties.result.properties.questions.items.required).toContain("policyAssessment")
  const behavior = api.inquiryStepSchemas("domain-evidence-v1", true, "behavior").modelSchema
  expect(behavior.shape.result.shape.questions.element.shape.policyAssessment).toBeUndefined()
})

test("guided exploration accepts only unambiguous lossless control envelopes and keeps final-only strict", () => {
  const controlDelta = { schemaVersion: "authorization-control-update/v1", rules: [] }
  const { schema, modelSchema } = api.inquiryStepSchemas("guided-evidence-v2")
  for (const raw of [{ controlDelta }, { kind: "tool", controlDelta }]) {
    expect(schema.parse(raw)).toMatchObject({ kind: "control", controlDelta })
    expect(modelSchema.safeParse(raw).success).toBe(false)
    expect(api.inquiryStepSchemas("guided-evidence-v2", true).schema.safeParse(raw).success).toBe(false)
  }
  for (const raw of [{ controlDelta, result: {} }, { controlDelta, observations: [] }, { kind: "tool", controlDelta, calls: [] }, { kind: "invented", controlDelta }, { controlDelta: { schemaVersion: "invented" } }, { controlDelta, extra: true }]) expect(schema.safeParse(raw).success).toBe(false)
  expect(api.inquiryStepSchemas("legacy").schema.safeParse({ controlDelta }).success).toBe(false)
})

test("guided metadata omission preserves explicit source calls and current local content without inferring semantics", () => {
  const raw = { calls: [{ name: "source_read", arguments: { path: "entry.ts", startLine: 1, endLine: 4 } }], controlDelta: { workSelections: [{ questionId: "q", itemId: "q::entry", candidateId: "shown" }] } }
  const schemas = api.inquiryStepSchemas("guided-evidence-v2")
  const result = schemas.schema.parse(raw)
  expect(result).toMatchObject({ kind: "tool", calls: raw.calls, controlDelta: { ...raw.controlDelta, schemaVersion: "authorization-control-update/v1" } })
  expect(raw).not.toHaveProperty("kind")
  expect(raw.controlDelta).not.toHaveProperty("schemaVersion")
  expect(api.normalizeGuidedControlEnvelope(raw).normalization).toMatchObject({ code: "guided-envelope-metadata-omitted", originalKind: null, filled: ["kind", "controlDelta.schemaVersion"] })
  expect(schemas.modelSchema.safeParse(raw).success).toBe(false)
  for (const invalid of [{ ...raw, result: {} }, { ...raw, observations: [] }, { ...raw, calls: [] }, { ...raw, calls: [{ name: "shell", arguments: {} }] }, { ...raw, controlDelta: { ...raw.controlDelta, schemaVersion: "old" } }]) expect(schemas.schema.safeParse(invalid).success).toBe(false)
  expect(api.inquiryStepSchemas("guided-evidence-v2", true).schema.safeParse(raw).success).toBe(false)
  expect(api.inquiryStepSchemas("legacy").schema.safeParse(raw).success).toBe(false)
  expect(api.inquiryNativeSchemas("guided-evidence-v2", true).authorization_observe.parse({ controlDelta: raw.controlDelta }).controlDelta.schemaVersion).toBe("authorization-control-update/v1")
  expect(api.inquiryNativeSchemas("guided-evidence-v2").authorization_observe.safeParse({ controlDelta: raw.controlDelta }).success).toBe(false)
})

test("semantic final-only recovers an omitted routing kind only for an explicit valid result", () => {
  const result = { schemaVersion: "authorization-semantic-result/v1", revision: 0, questions: [{ questionId: "q", explanation: "No source interpretation yet; preserve the gap." }], scope: "bounded source" }
  const raw = { result }, final = api.inquiryStepSchemas("semantic-flow-v1", true)
  expect(final.schema.safeParse(raw).success).toBe(true)
  expect(final.schema.parse(raw)).toMatchObject({ kind: "final", result })
  expect(raw).not.toHaveProperty("kind")
  expect(final.modelSchema.safeParse(raw).success).toBe(false)
  expect(api.normalizeSemanticFinalEnvelope(raw)).toMatchObject({ value: { ...raw, kind: "final" }, normalization: { code: "semantic-final-kind-omitted", originalKind: null } })
  for (const invalid of [{ kind: "control", result }, { result, calls: [] }, { controlDelta: { schemaVersion: "authorization-semantic-update/v1" } }, { result: { ...result, revision: undefined } }, { result, workSelections: [] }, { result: { ...result, questions: [{ questionId: "q", explanation: "Gap", paths: [{ pathId: "p", explanation: "Gap", policy: null }] }] } }]) expect(final.schema.safeParse(invalid).success).toBe(false)
  expect(api.inquiryStepSchemas("semantic-flow-v1").schema.safeParse(raw).success).toBe(false)
  expect(api.inquiryStepSchemas("guided-evidence-v2", true).schema.safeParse(raw).success).toBe(false)
})

test("invalid direct focused envelopes report their actual fields instead of a misleading routing discriminator", () => {
  const schema = api.inquiryStepSchemas("operation-evidence-v1", false, "behavior", "interpret").schema
  const base = { schemaVersion: "authorization-focused-update/v1", kind: "interpret", focusId: "current", unit: { start: "main", complete: false, blocks: [] } }
  const { unit: _unit, ...withoutUnit } = base
  for (const raw of [{ ...base, revisit: "old" }, { ...base, schemaVersion: "wrong" }, withoutUnit]) {
    const r = schema.safeParse(raw)
    expect(r.success).toBe(false)
    expect(r.error.issues.some((i: any) => i.code === "invalid_union_discriminator" && i.path.join(".") === "kind")).toBe(false)
  }
  const invalid = schema.safeParse({ ...base, revisit: "old" })
  expect(invalid.error.issues).toEqual([expect.objectContaining({ code: "unrecognized_keys", keys: ["revisit"] })])
  expect(base).not.toHaveProperty("revisit")
})

test("routable v2 source envelopes retain forbidden raw fields for local diagnosis without advertising them", () => {
  const raw = { kind: "interpret", focusId: "current", interpretation: { schemaVersion: "source-interpretation/v1", revision: "shown", annotations: [] }, complete: true, unit: { fabricated: true } }
  const schemas = api.inquiryStepSchemas("operation-evidence-v2", false, "behavior", "interpret")
  expect(schemas.schema.parse(raw)).toEqual({ kind: "control", controlDelta: { schemaVersion: "authorization-source-update/v1", ...raw } })
  expect(schemas.modelSchema.safeParse(raw).success).toBe(false)
  const native = { controlDelta: { schemaVersion: "authorization-source-update/v1", ...raw } }
  expect(api.inquiryNativeSchemas("operation-evidence-v2", true).authorization_observe.parse(native)).toMatchObject(native)
  expect(api.inquiryNativeSchemas("operation-evidence-v2").authorization_observe.safeParse(native).success).toBe(false)
  expect(schemas.schema.safeParse({ ...raw, schemaVersion: "wrong" }).success).toBe(false)
  expect(api.inquiryStepSchemas("operation-evidence-v1", false, "behavior", "interpret").schema.safeParse(raw).success).toBe(false)
})

test("an invalid root final reports its actual nested field and the one wire repair can fix it", async () => {
  const schemas = api.inquiryStepSchemas("operation-evidence-v2", true, "behavior", "answer")
  const raw = { kind: "final", schemaVersion: "authorization-focused-result/v1", focusId: "answer", answers: [{ explanation: "Source alternatives are conditional", disposition: "conditional", paths: [{ path: 0, explanation: "This individual path is unresolved", disposition: "conditional" }] }], scope: "original source" }
  const invalid = schemas.schema.safeParse(raw)
  expect(invalid.success).toBe(false)
  expect(invalid.error.issues).toContainEqual(expect.objectContaining({ path: ["result", "answers", 0, "paths", 0, "disposition"], code: "invalid_enum_value" }))
  let calls = 0
  const provider: any = { name: "mock", complete: async (params: any) => {
    calls++
    if (calls === 2) { const text = JSON.stringify(params.messages); expect(text).toContain("result.answers.0.paths.0.disposition"); expect(text).toContain("invalid_enum_value") }
    const value = calls === 1 ? raw : { ...raw, answers: [{ ...raw.answers[0], paths: [{ ...raw.answers[0]!.paths[0], disposition: "unknown" }] }] }
    return { text: "", toolCalls: [{ name: "submit_inquiry_step", arguments: value }], tokens: { input: 1, output: 1 }, durationMs: 0 }
  } }
  const result = await extractStructured({ provider, ...schemas, schemaName: "submit_inquiry_step", schemaDescription: "Current final field contract", prompt: "Deliver current source conclusions", maxRetries: 1, schemaRepair: "same-tool" })
  expect(calls).toBe(2)
  expect(result.result).toMatchObject({ kind: "final", result: { answers: [{ disposition: "conditional", paths: [{ disposition: "unknown" }] }] } })
})
