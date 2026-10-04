import { expect, test } from "bun:test"
import { z } from "zod"
import { extractStructured, StructuredExtractionError } from "../../src/providers/structured.ts"
import type { LLMProvider, CompletionParams } from "../../src/providers/types.ts"

const schema = z.discriminatedUnion("kind", [z.object({ kind: z.literal("control"), controlDelta: z.object({ steps: z.array(z.discriminatedUnion("kind", [z.object({ kind: z.literal("return") }).strict(), z.object({ kind: z.literal("reject") }).strict()])) }).strict() }).strict(), z.object({ kind: z.literal("final"), text: z.string() }).strict()])
const valid: z.infer<typeof schema> = { kind: "control", controlDelta: { steps: [{ kind: "return" }] } }
function provider(candidates: unknown[], requests: CompletionParams[]): LLMProvider {
  return { name: "contract-fixture", async complete(params) { requests.push(params); return { text: "", toolCalls: [{ id: "fixture", name: "submit", arguments: candidates[requests.length - 1] as any }], tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, durationMs: 0, stopReason: "tool_use" } }, async completeWithToolResults() { throw new Error("unused") } }
}
test("extra wrapper fields retain transport diagnostics rather than reporting a missing direct discriminator", async () => {
  const requests: CompletionParams[] = [], rejected = { value: valid, controlDelta: { steps: [{ kind: "reject" }] } }
  const result = await extractStructured({ provider: provider([rejected, { value: valid }], requests), schema, schemaName: "submit", schemaDescription: "fixture", prompt: "fixture", schemaRepair: "same-tool" })
  expect(result.result).toEqual(valid)
  expect(result.failures?.[0]?.diagnostics).toEqual([{ path: "$", code: "unrecognized_keys", keys: ["controlDelta"] }])
  expect(requests).toHaveLength(2)
  expect(requests[1]!.messages[0]!.content).toContain("value.controlDelta")
  expect(result.failures?.[0]?.rawResponse).toBe(JSON.stringify(rejected))
})
test("nested discriminator diagnostics preserve the full wrapped location and advertised alternatives", async () => {
  const requests: CompletionParams[] = [], rejected = { value: { ...valid, controlDelta: { steps: [{ kind: "allow" }] } } }
  try { await extractStructured({ provider: provider([rejected, rejected], requests), schema, schemaName: "submit", schemaDescription: "fixture", prompt: "fixture", schemaRepair: "same-tool" }); throw new Error("Expected rejection") }
  catch (error) { expect(error).toBeInstanceOf(StructuredExtractionError); expect((error as StructuredExtractionError).failures[0]!.diagnostics).toEqual([{ path: "value.controlDelta.steps.0.kind", code: "invalid_union_discriminator", expected: ["return", "reject"], received: "allow" }]) }
  expect(requests).toHaveLength(2)
})
