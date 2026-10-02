import { expect, test } from "bun:test"
import { extractStructured } from "../../providers/structured.ts"
const api = await import("./inquiry-wire.ts").catch(() => ({} as any))
const delta = { schemaVersion: "authorization-control-slice/v1", rules: [], dependencies: [], bindings: [], policyRules: [] }
test("structured control steps expose one canonical field and accept the lossless legacy alias", async () => {
  expect(api.ControlStepSchema).toBeDefined()
  const current = { kind: "control", controlDelta: delta }
  expect(api.ControlStepSchema.parse({ kind: "control", delta })).toEqual(current)
  expect(api.ControlStepSchema.parse({ ...current, delta })).toEqual(current)
  const conflict = api.ControlStepSchema.safeParse({ ...current, delta: { ...delta, rules: [{ key: "different" }] } })
  expect(conflict.success).toBe(false)
  expect(conflict.error.issues.some((d: any) => d.message.includes("control-alias-conflict"))).toBe(true)
  let actual: any
  const provider: any = { name: "capture", complete: async (params: any) => { actual = params.tools[0].inputSchema; return { text: "", toolCalls: [{ name: "submit", arguments: current }], tokens: { input: 1, output: 1 }, durationMs: 0 } } }
  await extractStructured({ provider, schema: api.ControlStepSchema, schemaName: "submit", schemaDescription: "contract capture", prompt: "contract capture", maxRetries: 1 })
  const control = actual.anyOf.find((v: any) => v.properties.kind.const === "control")
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
