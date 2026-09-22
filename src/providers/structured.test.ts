import { expect, it } from "bun:test"
import { z } from "zod"
import { extractStructured } from "./structured.ts"
import type { CompletionParams, LLMProvider } from "./types.ts"

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
