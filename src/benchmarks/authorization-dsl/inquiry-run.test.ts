import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { LLMProvider, CompletionParams } from "../../providers/types.ts"
import { emptyTokenUsage } from "../../core/types.ts"
import { runAuthorizationInquiry } from "./inquiry-run.ts"

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ao-loop-")); await mkdir(path.join(root, "src"))
  await writeFile(path.join(root, "src/entry.ts"), "export function entry() { return guard(); }\n")
  await writeFile(path.join(root, "src/helper.ts"), "export function guard() { return false; }\n")
  return { sourceRoot: root, allowedPaths: ["src"], repository: "synthetic", sourceRef: "fixed", inquiry: { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q1", request: "Can a member update a record?", entryHint: "entry", premises: [] }] } }
}
function scripted(fn: (params: CompletionParams, n: number) => unknown): { provider: LLMProvider; count: () => number } {
  let count = 0
  return { count: () => count, provider: { name: "mock", async complete(params) {
    const value = fn(params, count++)
    return { text: "", toolCalls: [{ id: `c${count}`, name: params.tools![0]!.name, arguments: value as Record<string, unknown> }], stopReason: "tool_use", tokens: emptyTokenUsage(), durationMs: 0 }
  }, async completeWithToolResults() { throw new Error("Use structured inquiry actions") } } }
}
const final = (id: string) => ({ kind: "final", result: { schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q1", behavior: { disposition: "deny", explanation: "The called guard returns false." }, evidenceIds: [id], branches: [], missing: [] }], observations: [], scope: "Read source only" } })
test("one analysis genuinely reads entry then requests helper and answers from actual returned bytes", async () => {
  const input = await setup(), mock = scripted((params, n) => {
    const prompt = params.messages[0]!.content
    if (n === 0) { expect(prompt).not.toContain("return false"); return { kind: "tool", calls: [{ name: "source_read", arguments: { path: "src/entry.ts", startLine: 1, endLine: 1 } }] } }
    if (n === 1) { expect(prompt).toContain("return guard()"); expect(prompt).not.toContain("return false"); return { kind: "tool", calls: [{ name: "source_read", arguments: { path: "src/helper.ts", startLine: 1, endLine: 1 } }] } }
    expect(prompt).toContain("return false")
    const shown = [...prompt.matchAll(/"id":"(ev-[a-f0-9]+)"/g)].map(m => m[1]!)
    return final(shown.at(-1)!)
  })
  const result = await runAuthorizationInquiry({ ...input, method: "D1", provider: mock.provider })
  expect(result.status).toBe("completed")
  expect(result.telemetry.providerCalls).toBe(3)
  expect(result.toolHistory.length).toBe(2)
  expect(result.result?.questions[0]?.behavior.disposition).toBe("deny")
  expect(result.evidence.some(e => e.quote.includes("return false"))).toBe(true)
})
test("missing helper can finish as explicit source-gap without a fake allow or policy", async () => {
  const input = await setup(), mock = scripted((_p, n) => n === 0 ? { kind: "tool", calls: [{ name: "source_symbol", arguments: { name: "missingGuard" } }] } : { kind: "final", result: {
    schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q1", behavior: { disposition: "unknown", explanation: "Guard not available" }, branches: [], evidenceIds: [], missing: [{ kind: "source-gap", detail: "No guard candidate", nextRead: "Supply relevant middleware" }] }], observations: [], scope: "Provided source only" } })
  const result = await runAuthorizationInquiry({ ...input, method: "M", provider: mock.provider })
  expect(result.status).toBe("completed")
  expect(result.result?.questions[0]?.missing[0]?.kind).toBe("source-gap")
  expect(JSON.stringify(result.result)).not.toContain("conclusion")
})
test("session dispatch bound stops instead of making a hidden extra call", async () => {
  const input = await setup(), mock = scripted(() => ({ kind: "tool", calls: [{ name: "source_list", arguments: {} }] }))
  const result = await runAuthorizationInquiry({ ...input, method: "D0", provider: mock.provider, maxDispatches: 2 })
  expect(mock.count()).toBe(2)
  expect(result.status).toBe("budget-exhausted")
  expect(result.result).toBeUndefined()
})
test("per-call timeout leaves unknown completion and never dispatches fallback", async () => {
  const input = await setup(); let count = 0
  const provider: LLMProvider = { name: "slow", complete: () => { count++; return new Promise(() => {}) }, completeWithToolResults: async () => { throw new Error("Unexpected") } }
  const result = await runAuthorizationInquiry({ ...input, method: "D1", provider, perCallTimeoutMs: 10 })
  expect(result.status).toBe("timeout-unknown")
  expect(count).toBe(1)
  expect(result.telemetry.unknownUsageCalls).toBe(1)
})
test("source resend budget applies before fallback dispatch and counts failed responses", async () => {
  const input = await setup(), mock = scripted((_p, n) => n === 0 ? { kind: "tool", calls: [{ name: "source_read", arguments: { path: "src/helper.ts", startLine: 1, endLine: 1 } }] } : {})
  const result = await runAuthorizationInquiry({ ...input, method: "D1", provider: mock.provider, maxDisplayBytes: 70 })
  expect(mock.count()).toBe(2)
  expect(result.telemetry.providerCalls).toBe(2)
  expect(result.status).toBe("budget-exhausted")
  expect(result.sourceAccounting.cumulativeModelSourceBytes).toBe(result.evidence[0]!.bytes)
  expect(result.sourceAccounting.resentSourceBytes).toBe(0)
})
test("first delivery validation stays separate when one diagnosed repair succeeds", async () => {
  const input = await setup(), mock = scripted((params, n) => {
    if (!n) return { kind: "tool", calls: [{ name: "source_read", arguments: { path: "src/helper.ts", startLine: 1, endLine: 1 } }] }
    const id = [...params.messages[0]!.content.matchAll(/"id":"(ev-[a-f0-9]+)"/g)].at(-1)![1]!
    return final(n === 1 ? "not-shown" : id)
  })
  const run = await runAuthorizationInquiry({ ...input, method: "D1", provider: mock.provider })
  expect(run.initialValidation?.valid).toBe(false)
  expect(run.validation?.valid).toBe(true)
  expect(mock.count()).toBe(3)
})
