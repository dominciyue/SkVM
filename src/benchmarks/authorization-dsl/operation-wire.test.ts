import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { inquiryStepSchemas, inquiryNativeSchemas, normalizeFocusedControlEnvelope } from "./inquiry-wire.ts"
import { runAuthorizationInquiry } from "./inquiry-run.ts"
import { emptyTokenUsage } from "../../core/types.ts"
import type { FocusStage } from "./inquiry-focus.ts"
import { zodToJsonSchema } from "../../providers/structured.ts"

const common = { schemaVersion: "authorization-focused-update/v1", focusId: "current" } as const
const unit = { start: "body", complete: true, parameters: [], blocks: [{ name: "body", steps: [{ kind: "return", name: "denied", claim: "Original returns false", value: false, outcome: "deny" }] }] }
const result = { kind: "final", schemaVersion: "authorization-focused-result/v1", focusId: "current", answers: [{ explanation: "The displayed source returns false." }], scope: "Current source only" }
test("operation advertises one direct action container at every phase and lowers to the same canonical core", () => {
  const actions: Array<[FocusStage, any]> = [["locate", { ...common, kind: "select", candidateId: "candidate" }], ["interpret", { ...common, kind: "interpret", unit, also: [{ itemId: "peer", unit }] }], ["link", { ...common, kind: "link", links: [{ caller: "a", call: "b", target: "c" }] }], ["review", { ...common, kind: "review", claims: [{ claim: "a", verdict: "confirmed", explanation: "Original agrees" }] }], ["answer", { ...common, kind: "defer", reason: "Named source gap" }]]
  for (const [stage, action] of actions) {
    const schemas = inquiryStepSchemas("operation-evidence-v1", false, "behavior", stage)
    expect(schemas.modelSchema.safeParse(action).success).toBe(true)
    const parsed: any = schemas.schema.parse(action)
    expect(parsed.kind).toBe("control")
    expect(parsed.controlDelta).toMatchObject(action)
    expect(schemas.modelSchema.safeParse({ kind: "control", controlDelta: action }).success).toBe(false)
  }
  const final = inquiryStepSchemas("operation-evidence-v1", true, "behavior", "interpret")
  expect(final.modelSchema.safeParse(result).success).toBe(true)
  expect(final.schema.parse(result)).toMatchObject({ kind: "final", result: { focusId: "current" } })
  const nested = { controlDelta: { ...common, kind: "interpret", unit } }
  expect(inquiryNativeSchemas("operation-evidence-v1", false, "interpret").authorization_observe.safeParse(nested).success).toBe(true)
  expect(inquiryStepSchemas("focused-closure-v1", false, "behavior", "interpret").modelSchema.safeParse({ kind: "control", ...nested }).success).toBe(true)
})
test("direct operation actions preserve real calls and explicit empty calls remain a no-op rather than a source dispatch", () => {
  const schemas = inquiryStepSchemas("operation-evidence-v1", false, "behavior", "interpret"), action = { ...common, kind: "interpret", unit }
  const calls = [{ name: "source_read", arguments: { path: "anonymous.py", startLine: 1, endLine: 2 } }]
  expect(schemas.modelSchema.safeParse({ ...action, calls }).success).toBe(true)
  expect(schemas.schema.parse({ ...action, calls })).toMatchObject({ kind: "tool", calls, controlDelta: action })
  expect(schemas.modelSchema.safeParse({ ...action, calls: [] }).success).toBe(true)
  expect(schemas.schema.parse({ ...action, calls: [] })).toMatchObject({ kind: "control", controlDelta: action })
  expect(schemas.schema.safeParse({ kind: "tool", calls: [], controlDelta: action }).success).toBe(false)
})
test("operation advertisement is one root object so source calls cannot spill beside a generated value wrapper", () => {
  for (const stage of ["locate", "interpret", "link", "review", "answer"] as FocusStage[]) {
    const schemas = inquiryStepSchemas("operation-evidence-v1", false, "behavior", stage), advertised: any = zodToJsonSchema(schemas.modelSchema)
    expect(advertised.type).toBe("object")
    expect(advertised).not.toHaveProperty("anyOf")
    expect(advertised).not.toHaveProperty("oneOf")
    expect(advertised.properties).toHaveProperty("kind")
    expect(advertised.properties).toHaveProperty("calls")
    expect(advertised.properties).not.toHaveProperty("value")
    expect(schemas.modelSchema.safeParse({ kind: "tool", calls: [] }).success).toBe(false)
    expect(schemas.modelSchema.safeParse({ kind: "defer", reason: "Identity missing" }).success).toBe(false)
  }
  const schemas = inquiryStepSchemas("operation-evidence-v1", false, "behavior", "interpret")
  expect(schemas.modelSchema.safeParse({ ...common, kind: "interpret", unit, reason: "Field from a different action" }).success).toBe(false)
})
test("pure operation source steps may retain explicit routing metadata without making it a semantic action", () => {
  const calls = [{ name: "source_read" as const, arguments: { path: "anonymous.py", startLine: 1, endLine: 2 } }], tool = { ...common, kind: "tool", calls }
  for (const stage of ["locate", "interpret", "link", "review", "answer"] as FocusStage[]) {
    const schemas = inquiryStepSchemas("operation-evidence-v1", false, "behavior", stage)
    expect(schemas.modelSchema.safeParse(tool).success).toBe(true)
    expect(schemas.schema.parse(tool)).toEqual({ kind: "tool", calls })
    for (const invalid of [{ ...tool, schemaVersion: "wrong" }, { ...tool, focusId: "" }, { ...tool, calls: [] }, { ...tool, unit }, { ...tool, calls: [{ name: "read_initial", arguments: {} }] }]) {
      expect(schemas.modelSchema.safeParse(invalid).success).toBe(false)
      expect(schemas.schema.safeParse(invalid).success).toBe(false)
    }
  }
})
test("link explanation remains original data while exact links and typed source calls retain their contracts", () => {
  const action = { ...common, kind: "link" as const, links: [{ caller: "caller", call: "exact-call", target: "offered-helper", arguments: [{ parameter: "object", object: "exact-resource" }] }], reason: "Proposed relation; the host must still check the actual source candidate." }, schemas = inquiryStepSchemas("operation-evidence-v1", false, "behavior", "link")
  expect(schemas.modelSchema.safeParse(action).success).toBe(true)
  expect(schemas.schema.parse(action)).toEqual({ kind: "control", controlDelta: action })
  expect(inquiryNativeSchemas("operation-evidence-v1", true, "link").authorization_observe.parse({ controlDelta: action })).toEqual({ controlDelta: action })
  for (const invalid of [{ ...action, reason: 3 }, { ...action, calls: [{ name: "get_serializer", arguments: [] }] }, { ...action, kind: "tool" }]) expect(schemas.schema.safeParse(invalid).success).toBe(false)
})
test("selected operation context supplies only an omitted fixed version for every direct focused action", () => {
  const actions: Array<[FocusStage, any]> = [["locate", { kind: "select", focusId: "current", candidateId: "real-candidate" }], ["interpret", { kind: "interpret", focusId: "current", unit }], ["link", { kind: "link", focusId: "current", links: [{ caller: "a", call: "b", target: "c" }] }], ["review", { kind: "review", focusId: "current", claims: [{ claim: "real", verdict: "gap", explanation: "Source gap" }] }], ["answer", { kind: "defer", focusId: "current", reason: "Named gap", revisit: "existing-unit" }]]
  for (const [stage, raw] of actions) {
    const schemas = inquiryStepSchemas("operation-evidence-v1", false, "behavior", stage), normalized = normalizeFocusedControlEnvelope(raw)
    expect(schemas.modelSchema.safeParse(raw).success).toBe(true)
    expect(schemas.schema.parse(raw)).toMatchObject({ kind: "control", controlDelta: { ...raw, schemaVersion: common.schemaVersion } })
    expect(normalized.normalization).toMatchObject({ code: "focused-action-version-omitted", filled: ["schemaVersion"] })
    expect(schemas.schema.safeParse({ ...raw, schemaVersion: "wrong" }).success).toBe(false)
    const { focusId: _focus, ...missingFocus } = raw
    expect(schemas.schema.safeParse(missingFocus).success).toBe(false)
  }
})
test("source-tool explanation and metadata preserve the original source call without selecting a focus", () => {
  const raw = { kind: "tool", calls: [{ name: "source_read" as const, arguments: { path: "anonymous.py", startLine: 1, endLine: 2 } }], reason: "Read the named original body before revisiting its interpretation", ...common }, schemas = inquiryStepSchemas("operation-evidence-v1", false, "behavior", "interpret")
  expect(schemas.modelSchema.safeParse(raw).success).toBe(true)
  expect(schemas.schema.parse(raw)).toEqual({ kind: "tool", calls: raw.calls, reason: raw.reason })
  for (const invalid of [{ ...raw, reason: 4 }, { ...raw, schemaVersion: "wrong" }, { ...raw, revisit: "invented-action" }, { ...raw, calls: [{ name: "get_serializer", arguments: [] }] }]) expect(schemas.schema.safeParse(invalid).success).toBe(false)
})
test("actual structured provider receives the direct operation schema and its original bodies reach the shared runtime", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "au-step-"))
  await writeFile(path.join(sourceRoot, "entry.py"), "def entry():\n    return False\n")
  let calls = 0
  const run = await runAuthorizationInquiry({ sourceRoot, repository: "anonymous", sourceRef: "fixed", allowedPaths: ["."], method: "M", strategy: "operation-evidence-v1", maxDispatches: 4, maxToolCalls: 16,
    inquiry: { schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "Inspect entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect entry", premises: [] }] },
    provider: { name: "mock", async complete(params) {
      const prompt = params.messages.map(m => m.content).join("\n"), marker = "Current local explanation context: ", start = prompt.lastIndexOf(marker), tail = prompt.slice(start + marker.length), context = JSON.parse(tail.slice(0, tail.indexOf("\n\nRemaining dispatches:")))
      expect(prompt).toContain("Focused action fields are at the step root")
      if (calls === 0) { expect(JSON.stringify(params.tools![0]!.inputSchema)).not.toContain('"controlDelta"'); expect(prompt).not.toContain("For interpret submit controlDelta:"); expect((params.tools![0]!.inputSchema as any).properties).not.toHaveProperty("value") }
      const value = calls++ === 0 ? { ...common, focusId: context.focus.id, kind: "interpret", unit, calls: [] } : calls < 3 ? { ...common, focusId: context.focus.id, kind: "defer", reason: "Preserve this source-only answer" } : { ...result, focusId: context.focus.id }
      const tool = params.tools![0]!, wrapped = (tool.inputSchema as any).properties?.value !== undefined
      return { text: "", toolCalls: [{ id: `r-${calls}`, name: tool.name, arguments: wrapped ? { value } : value }], tokens: emptyTokenUsage(), durationMs: 0, stopReason: "tool_use" as const }
    }, async completeWithToolResults() { throw new Error("Unused") } } })
  expect(run.domain!.semantic!.units).toHaveLength(1)
  expect(run.initial).toBeDefined()
  expect(run.wireFailures).toEqual([])
  expect(run.wireNormalizations.some(n => n.code === "focused-update-at-step-root")).toBe(true)
})
