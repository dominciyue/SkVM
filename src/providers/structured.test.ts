import { expect, it } from "bun:test"
import { z } from "zod"
import { extractStructured, StructuredExtractionError } from "./structured.ts"
import type { CompletionParams, LLMProvider } from "./types.ts"
import { ProviderNetworkError } from "./errors.ts"

it("preserves strict object rejection in the actual tool and fallback JSON schemas", async () => {
  const requests: CompletionParams[] = []
  const schema = z.object({ item: z.object({ statement: z.string() }).strict(), open: z.object({ label: z.string() }).passthrough() }).strict()
  const value = { item: { statement: "Accepted" }, open: { label: "Open", extra: true } }
  const provider: LLMProvider = {
    name: "schema-capture", async complete(params) { requests.push(params); return { text: params.tools ? "" : JSON.stringify(value), toolCalls: [], tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, durationMs: 0, stopReason: "end_turn" } }, async completeWithToolResults() { throw new Error("No executor") },
  }
  await extractStructured({ provider, schema, schemaName: "answer", schemaDescription: "Answer", prompt: "Task", maxRetries: 1 })
  const visible = requests[0]!.tools![0]!.inputSchema as any
  expect(visible.additionalProperties).toBe(false)
  expect(visible.properties.item.additionalProperties).toBe(false)
  expect(visible.properties.open.additionalProperties).not.toBe(false)
  expect(requests[1]!.messages[0]!.content).toContain('"additionalProperties": false')
})

it("preserves nested, exact, optional and union array limits in both structured transports", async () => {
  const requests: CompletionParams[] = []
  const schema = z.object({
    nested: z.object({ calls: z.array(z.string()).min(1).max(8) }),
    exact: z.array(z.string()).min(1).max(8).length(2),
    optional: z.array(z.number()).min(2).max(4).optional(),
    choice: z.union([z.array(z.string()).max(3), z.string()]),
    unbounded: z.array(z.boolean()),
  })
  const value = { nested: { calls: ["read"] }, exact: ["one", "two"], optional: [1, 2], choice: ["one"], unbounded: [] }
  const provider: LLMProvider = {
    name: "array-schema-capture",
    async complete(params) {
      requests.push(params)
      return { text: params.tools ? "" : JSON.stringify(value), toolCalls: [], tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, durationMs: 0, stopReason: "end_turn" }
    },
    async completeWithToolResults() { throw new Error("No executor") },
  }
  await extractStructured({ provider, schema, schemaName: "answer", schemaDescription: "Answer", prompt: "Task", maxRetries: 1 })
  const visible = requests[0]!.tools![0]!.inputSchema as any
  expect(visible.properties.nested.properties.calls).toEqual({ type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 })
  expect(visible.properties.exact).toEqual({ type: "array", items: { type: "string" }, minItems: 2, maxItems: 2 })
  expect(visible.properties.optional).toEqual({ type: "array", items: { type: "number" }, minItems: 2, maxItems: 4 })
  expect(visible.required).not.toContain("optional")
  expect(visible.properties.choice.anyOf[0]).toEqual({ type: "array", items: { type: "string" }, maxItems: 3 })
  expect(visible.properties.unbounded).toEqual({ type: "array", items: { type: "boolean" } })
  const fallbackSchema = JSON.parse(requests[1]!.messages[0]!.content.match(/```json\n([\s\S]*?)\n```/)![1]!)
  expect(fallbackSchema).toEqual(visible)
  expect(requests).toHaveLength(2)
})

const callsSchema = z.object({ calls: z.array(z.object({ name: z.literal("source_list") }).strict()).min(1).max(8) }).strict()
const actions = (count: number) => ({ calls: Array.from({ length: count }, () => ({ name: "source_list" as const })) })

it("uses bounded field diagnostics in the existing fallback and retains the failed response and usage", async () => {
  const requests: CompletionParams[] = [], invalid = actions(10)
  const untrusted = "MODEL_TEXT_MUST_NOT_BECOME_A_SYSTEM_INSTRUCTION"
  const provider: LLMProvider = {
    name: "diagnostic-recovery",
    async complete(params) {
      requests.push(params)
      if (params.tools) return { text: untrusted, toolCalls: [{ id: "first", name: "answer", arguments: invalid }], tokens: { input: 3, output: 2, cacheRead: 1, cacheWrite: 0 }, costUsd: 0.01, durationMs: 0, stopReason: "tool_use" }
      const prompt = params.messages[0]!.content
      const diagnosed = prompt.includes('"code":"too_big"') && prompt.includes('"path":"calls"') && prompt.includes('"maximum":8') && prompt.includes('"actualItems":10')
      return { text: JSON.stringify(diagnosed ? actions(8) : invalid), toolCalls: [], tokens: { input: 5, output: 4, cacheRead: 0, cacheWrite: 1 }, costUsd: 0.02, durationMs: 0, stopReason: "end_turn" }
    },
    async completeWithToolResults() { throw new Error("No executor") },
  }
  const extracted = await extractStructured({ provider, schema: callsSchema, schemaName: "answer", schemaDescription: "Answer", prompt: "Task", system: "Trusted contract", maxRetries: 1 })
  expect(extracted.result.calls).toHaveLength(8)
  expect(requests).toHaveLength(2)
  expect(requests[1]!.messages[0]!.content).toContain('"category":"schema-validation"')
  expect(requests[1]!.messages[0]!.content).not.toContain(untrusted)
  expect(requests[1]!.system).toBe("Trusted contract")
  expect(extracted.tokens).toEqual({ input: 8, output: 6, cacheRead: 1, cacheWrite: 1 })
  expect(extracted.costUsd).toBeCloseTo(0.03)
  expect(extracted.failures![0]!.rawResponse).toBe(JSON.stringify(invalid))
  expect(extracted.failures![0]!.diagnostics).toEqual([{ path: "calls", code: "too_big", maximum: 8, actualItems: 10 }])
})

it("retains both over-limit responses and diagnostics when the single fallback is still invalid", async () => {
  let count = 0
  const provider: LLMProvider = {
    name: "diagnostic-failure",
    async complete(params) {
      const value = actions(++count === 1 ? 10 : 9)
      return { text: params.tools ? "" : JSON.stringify(value), toolCalls: params.tools ? [{ id: "first", name: "answer", arguments: value }] : [], tokens: { input: 2, output: 1, cacheRead: 0, cacheWrite: 0 }, durationMs: 0, stopReason: "end_turn" }
    },
    async completeWithToolResults() { throw new Error("No executor") },
  }
  let failure: unknown
  try { await extractStructured({ provider, schema: callsSchema, schemaName: "answer", schemaDescription: "Answer", prompt: "Task", maxRetries: 1 }) } catch (error) { failure = error }
  expect(count).toBe(2)
  expect(failure).toBeInstanceOf(StructuredExtractionError)
  if (!(failure instanceof StructuredExtractionError)) throw new Error("Expected a retained extraction failure")
  expect(failure.message).toContain('"path":"calls"')
  expect(failure.message).toContain('"maximum":8')
  expect(failure.failures.map(item => JSON.parse(item.rawResponse!).calls.length)).toEqual([10, 9])
  expect(failure.failures.map(item => item.diagnostics[0]!.actualItems)).toEqual([10, 9])
  expect(failure.tokens).toEqual({ input: 4, output: 2, cacheRead: 0, cacheWrite: 0 })
  expect(failure.costUsd).toBeUndefined()
})

it("propagates a provider network error without a fallback dispatch", async () => {
  let count = 0
  const error = new ProviderNetworkError("Connection failed", "offline-mock")
  const provider: LLMProvider = {
    name: "offline-mock", async complete() { count++; throw error }, async completeWithToolResults() { throw new Error("No executor") },
  }
  let thrown: unknown
  try { await extractStructured({ provider, schema: callsSchema, schemaName: "answer", schemaDescription: "Answer", prompt: "Task", maxRetries: 1 }) } catch (cause) { thrown = cause }
  expect(thrown).toBe(error)
  expect(count).toBe(1)
})

it("exposes refined string identities, free predicate values and explicit null in both real extraction schemas", async () => {
  const requests: CompletionParams[] = [], value = { key: "entry", condition: { op: "is-null", value: { binding: "owner" } }, known: null, optionalValue: null }
  const schema = z.object({ key: z.string().refine(s => s !== "constructor"), condition: z.record(z.unknown()), known: z.union([z.string(), z.null()]), optionalValue: z.string().nullable() }).strict()
  const provider: LLMProvider = { name: "domain-schema-contract", async complete(params) { requests.push(params); return { text: params.tools ? "" : JSON.stringify(value), toolCalls: [], tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, durationMs: 0, stopReason: "end_turn" } }, async completeWithToolResults() { throw new Error("No executor") } }
  await extractStructured({ provider, schema, schemaName: "answer", schemaDescription: "Answer", prompt: "Task", maxRetries: 1 })
  const visible = requests[0]!.tools![0]!.inputSchema as any
  expect(visible.properties.key).toEqual({ type: "string" })
  expect(visible.properties.condition.additionalProperties).toEqual({})
  expect(visible.properties.known.anyOf).toEqual([{ type: "string" }, { type: "null" }])
  expect(visible.properties.optionalValue.anyOf).toEqual([{ type: "string" }, { type: "null" }])
  const fallback = JSON.parse(requests[1]!.messages[0]!.content.match(/```json\n([\s\S]*?)\n```/)![1]!)
  expect(fallback).toEqual(visible)
  expect(schema.safeParse({ ...value, key: "constructor" }).success).toBe(false)
})
