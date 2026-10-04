import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { LLMProvider, CompletionParams } from "../../providers/types.ts"
import { emptyTokenUsage } from "../../core/types.ts"
import { runAuthorizationInquiry } from "./inquiry-run.ts"
import { ProviderNetworkError } from "../../providers/errors.ts"
import { createInquiryTools } from "./inquiry-tools.ts"

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
test("guided source allocation preserves a final repair within the original cumulative display limit", async () => {
  const input = await setup()
  await writeFile(path.join(input.sourceRoot, "src/entry.ts"), "export function entry() { return false; }\n")
  const probe = await createInquiryTools(input), read = await probe.execute("source_read", { path: "src/entry.ts", startLine: 1, endLine: 1 })
  const limit = read.evidence[0]!.bytes * 3
  const mock = scripted((params, n) => {
    const context = JSON.parse(params.messages[0]!.content.split("Current local explanation context: ")[1]!.split("\n\nRemaining dispatches:")[0]!)
    if (n < 2) return { kind: "control", controlDelta: { schemaVersion: "authorization-control-update/v1" } }
    const id = context.evidenceCatalog[0].id, answer = final(n === 2 ? "not-shown" : id)
    answer.result.questions[0]!.behavior.explanation = "The original entry returns false."
    return { ...answer, ...(n === 2 ? { controlDelta: { schemaVersion: "authorization-control-update/v1", rules: [
      { op: "add", questionId: "q1", targetKey: "entry", pathKey: "p", kind: "entry", after: [], evidenceIds: [id], claim: "Entry returns false" },
      { op: "add", questionId: "q1", targetKey: "stop", pathKey: "p", kind: "reject", after: ["entry"], evidenceIds: [id], claim: "Entry denies", complete: true },
    ] } } : {}) }
  })
  const run = await runAuthorizationInquiry({ ...input, method: "M", strategy: "guided-evidence-v2", provider: mock.provider, maxDispatches: 4, maxDisplayBytes: limit })
  expect(run.status).toBe("completed")
  expect(mock.count()).toBe(4)
  expect(run.initialValidation?.valid).toBe(false)
  expect(run.validation?.valid).toBe(true)
  expect(run.sourceAccounting.cumulativeModelSourceBytes).toBeLessThanOrEqual(limit)
  expect(run.toolHistory).toHaveLength(1)
  expect(run.requests[0]!.params.messages[0]!.content).toContain('"reason":"source-window-budget"')
})
test("legacy redisplay exhaustion reserves a grounded partial delivery inside the remaining source budget", async () => {
  const input = await setup(), probe = await createInquiryTools(input)
  const read = await probe.execute("source_read", { path: "src/helper.ts", startLine: 1, endLine: 1 }), bytes = read.evidence[0]!.bytes
  const mock = scripted((params, n) => {
    if (n === 0) return { kind: "tool", calls: [{ name: "source_read", arguments: { path: "src/helper.ts", startLine: 1, endLine: 1 } }] }
    const prompt = params.messages[0]!.content, id = /"id":"(ev-[a-f0-9]+)"/.exec(prompt)![1]!
    if (n === 1) { expect(prompt).toContain("return false"); return { kind: "tool", calls: [{ name: "source_list", arguments: {} }] } }
    expect((params.tools![0]!.inputSchema as any).properties.kind.const).toBe("final")
    expect(prompt).not.toContain("export function guard() { return false; }")
    return { kind: "final", result: { schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q1", behavior: { disposition: "unknown", explanation: "One guard was read; the requested entry remains unresolved." }, branches: [], evidenceIds: [id], missing: [{ kind: "source-gap", detail: "Entry remains unread", nextRead: "src/entry.ts" }] }], observations: [], scope: "Retained guard reference; limited source delivery" } }
  })
  const run = await runAuthorizationInquiry({ ...input, method: "M", provider: mock.provider, maxDispatches: 6, maxDisplayBytes: bytes * 2 - 1 })
  expect(run.status).toBe("completed")
  expect(mock.count()).toBe(3)
  expect(run.sourceAccounting.cumulativeModelSourceBytes).toBe(bytes)
  expect(run.sourceAccounting.resentSourceBytes).toBe(0)
  expect(run.toolHistory).toHaveLength(2)
  expect(run.validation!.questionChecks[0]).toMatchObject({ referenceValid: true, deliveryStatus: "unverified", evidenceCoverage: "unreviewed" })
  expect(run.steps.some(s => s.kind === "delivery-budget")).toBe(true)
})
test("limited final delivery cannot cite a newly read body that only reached its metadata catalog", async () => {
  const input = await setup(), probe = await createInquiryTools(input)
  const a = (await probe.execute("source_read", { path: "src/entry.ts", startLine: 1, endLine: 1 })).evidence[0]!.bytes
  const b = (await probe.execute("source_read", { path: "src/helper.ts", startLine: 1, endLine: 1 })).evidence[0]!.bytes
  const mock = scripted((params, n) => {
    if (!n) return { kind: "tool", calls: [{ name: "source_read", arguments: { path: "src/entry.ts", startLine: 1, endLine: 1 } }] }
    if (n === 1) return { kind: "tool", calls: [{ name: "source_list", arguments: {} }] }
    if (n === 2) return { kind: "tool", calls: [{ name: "source_read", arguments: { path: "src/helper.ts", startLine: 1, endLine: 1 } }] }
    const prompt = params.messages[0]!.content
    const catalog = JSON.parse(prompt.split("Already shown original source: ")[1]!.split("\n\nAction history:")[0]!)
    expect(catalog.every((e: any) => e.text === undefined)).toBe(true)
    const entry = catalog.find((e: any) => e.path === "src/entry.ts"), helper = catalog.find((e: any) => e.path === "src/helper.ts")
    expect(entry.shown).toBe(true)
    expect(helper.shown).toBe(false)
    return { kind: "final", result: { schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q1", behavior: { disposition: "unknown", explanation: "Entry calls a guard whose body was not displayed." }, branches: [], evidenceIds: [n === 3 ? helper.id : entry.id], missing: [{ kind: "source-gap", detail: "Guard body was not shown in the available model context" }] }], observations: [], scope: "Actually displayed entry only" } }
  })
  const run = await runAuthorizationInquiry({ ...input, method: "M", provider: mock.provider, maxDispatches: 6, maxDisplayBytes: a * 2 + b - 1 })
  expect(run.status).toBe("completed")
  expect(run.initialValidation!.questionChecks[0]!.referenceValid).toBe(false)
  expect(run.validation!.questionChecks[0]!.referenceValid).toBe(true)
  expect(mock.count()).toBe(5)
  expect(run.sourceAccounting.cumulativeModelSourceBytes).toBe(a * 2)
  expect(run.sourceAccounting.resentSourceBytes).toBe(a)
  expect(run.toolHistory).toHaveLength(3)
})
test("exhausting source tools reserves final delivery without another read or an extra provider allowance", async () => {
  const input = await setup(), mock = scripted((params, n) => {
    if (!n) return { kind: "tool", calls: [{ name: "source_read", arguments: { path: "src/helper.ts", startLine: 1, endLine: 1 } }] }
    expect((params.tools![0]!.inputSchema as any).properties.kind.const).toBe("final")
    expect(params.messages[0]!.content).toContain("return false")
    return final(/"id":"(ev-[a-f0-9]+)"/.exec(params.messages[0]!.content)![1]!)
  })
  const run = await runAuthorizationInquiry({ ...input, method: "M", provider: mock.provider, maxDispatches: 6, maxToolCalls: 1 })
  expect(run.status).toBe("completed")
  expect(mock.count()).toBe(2)
  expect(run.toolHistory).toHaveLength(1)
  expect(run.evidence).toHaveLength(1)
})
test("guided host read that consumes the last source tool reserves the current dispatch for final delivery", async () => {
  const input = await setup(), mock = scripted(params => {
    expect((params.tools![0]!.inputSchema as any).properties.kind.const).toBe("final")
    const context = JSON.parse(params.messages[0]!.content.split("Current local explanation context: ")[1]!.split("\n\nRemaining dispatches:")[0]!)
    return { kind: "final", result: { schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q1", behavior: { disposition: "unknown", explanation: "Entry calls a guard; its body still requires source reading." }, branches: [], evidenceIds: [context.sourceWindows[0].id], missing: [{ kind: "source-gap", detail: "Guard body not read" }] }], observations: [], scope: "Original entry only" } }
  })
  const run = await runAuthorizationInquiry({ ...input, method: "D1", strategy: "guided-evidence-v2", provider: mock.provider, maxDispatches: 4, maxToolCalls: 1 })
  expect(run.status).toBe("completed")
  expect(mock.count()).toBe(1)
  expect(run.toolHistory).toHaveLength(1)
})
test("legacy last dispatch is an actual final opportunity", async () => {
  const input = await setup(), mock = scripted((params, n) => {
    if (!n) return { kind: "tool", calls: [{ name: "source_list", arguments: {} }] }
    expect((params.tools![0]!.inputSchema as any).properties.kind.const).toBe("final")
    return { kind: "final", result: { schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q1", behavior: { disposition: "unknown", explanation: "Only the source index was examined." }, branches: [], evidenceIds: [], missing: [{ kind: "source-gap", detail: "Operation body not read" }] }], observations: [], scope: "Source index" } }
  })
  const run = await runAuthorizationInquiry({ ...input, method: "M", provider: mock.provider, maxDispatches: 2 })
  expect(run.status).toBe("completed")
  expect(mock.count()).toBe(2)
  expect(run.toolHistory).toHaveLength(1)
})
test("structured natural inquiry retains the original lexical entry when the author omits it", async () => {
  const input = await setup(), mock = scripted((params, n) => {
    if (n === 0) return { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q1", request: "Investigate access controls for record updates.", premises: [] }] }
    const prompt = params.messages[0]!.content
    if (n === 1) expect(prompt.includes("return guard()")).toBe(true)
    return final([...prompt.matchAll(/"id":"(ev-[a-f0-9]+)"/g)].at(-1)![1]!)
  })
  const run = await runAuthorizationInquiry({ ...input, inquiry: undefined, brief: "Inspect access controls in entry for record updates.", method: "D1", strategy: "guided-evidence-v2", provider: mock.provider, maxDispatches: 4 })
  expect(run.inquiry?.questions[0]!.entryHint).toBeUndefined()
  expect(run.evidence.some(e => e.path === "src/entry.ts" && e.text.includes("return guard()"))).toBe(true)
  expect(run.toolHistory.filter(t => t.name === "source_read")).toHaveLength(1)
})
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
test("an SDK timeout is unknown completion even when it settles before the configured host deadline", async () => {
  const input = await setup(); let count = 0
  const provider: LLMProvider = { name: "sdk-timeout", async complete() { count++; throw new ProviderNetworkError("The operation timed out.", "sdk-timeout") }, async completeWithToolResults() { throw new Error("Unused") } }
  const run = await runAuthorizationInquiry({ ...input, method: "D1", provider, perCallTimeoutMs: 1000 })
  expect(run.status).toBe("timeout-unknown")
  expect(run.attempts[0]?.status).toBe("timeout")
  expect(run.events.some(event => event.kind === "closed" && event.reason?.startsWith("provider-timeout:"))).toBe(true)
  expect(count).toBe(1)
  expect(run.wireFailures).toEqual([])
  expect(run.error).toBe("The operation timed out.")
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

for (const count of [9, 10]) test(`an over-limit ${count}-action proposal recovers through one diagnosed fallback without truncation`, async () => {
  const input = await setup(), calls = Array.from({ length: count }, () => ({ name: "source_list", arguments: {} }))
  let dispatches = 0
  const provider: LLMProvider = {
    name: "action-bound-mock",
    async complete(params) {
      const n = dispatches++, prompt = params.messages[0]!.content
      let value: unknown
      if (n === 0) value = { kind: "tool", calls }
      else if (n === 1) {
        const diagnosed = prompt.includes('"path":"calls"') && prompt.includes('"code":"too_big"') && prompt.includes('"maximum":8') && prompt.includes(`"actualItems":${count}`)
        value = { kind: "tool", calls: diagnosed ? calls.slice(0, 8) : calls }
      } else if (n === 2) value = { kind: "tool", calls: calls.slice(8) }
      else value = { kind: "final", result: { schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q1", behavior: { disposition: "unknown", explanation: "Only the allowed source index was inspected." }, evidenceIds: [], branches: [], missing: [{ kind: "source-gap", detail: "Entry and guard bodies remain unread", nextRead: "Read the selected entry" }] }], observations: [], scope: "Source index only" } }
      return { text: params.tools ? "" : JSON.stringify(value), toolCalls: params.tools ? [{ id: `c${n}`, name: params.tools[0]!.name, arguments: value as Record<string, unknown> }] : [], tokens: { input: 2, output: 1, cacheRead: 0, cacheWrite: 0 }, durationMs: 0, stopReason: "end_turn" }
    },
    async completeWithToolResults() { throw new Error("Use structured inquiry actions") },
  }
  const run = await runAuthorizationInquiry({ ...input, method: "M", provider })
  expect(run.status).toBe("completed")
  expect(dispatches).toBe(4)
  expect(run.toolHistory).toHaveLength(count)
  expect(run.attempts[0]!.response!.toolCalls[0]!.arguments.calls).toHaveLength(count)
  expect(run.attempts[1]!.transport).toBe("prompt-parse")
  expect(run.telemetry.knownTokens.input).toBe(8)
  expect(run.result?.questions[0]?.behavior.disposition).toBe("unknown")
})

test("an over-limit proposal cannot use fallback after the actual dispatch budget is exhausted", async () => {
  const input = await setup(), mock = scripted(() => ({ kind: "tool", calls: Array.from({ length: 9 }, () => ({ name: "source_list", arguments: {} })) }))
  const run = await runAuthorizationInquiry({ ...input, method: "M", provider: mock.provider, maxDispatches: 1 })
  expect(mock.count()).toBe(1)
  expect(run.status).toBe("budget-exhausted")
  expect(run.result).toBeUndefined()
  expect(run.toolHistory).toHaveLength(0)
  expect(run.attempts[0]!.response!.toolCalls[0]!.arguments.calls).toHaveLength(9)
  expect(run.events.some(event => event.kind === "dispatch-rejected")).toBe(true)
})

test("domain strategy actually schedules a reported helper and diagnoses contradictory allow before one repair", async () => {
  const input = await setup(), mock = scripted((params, n) => {
    const prompt = params.messages[0]!.content
    const shown = JSON.parse(prompt.split("Already shown original source: ")[1]!.split("\n\nAction history:")[0]!).map((e: any) => e.id)
    if (n === 0) return { kind: "tool", calls: [{ name: "source_read", arguments: { path: "src/entry.ts", startLine: 1, endLine: 1 } }] }
    const entry = { key: "entry", questionId: "q1", pathKey: "p", kind: "entry", after: [], claim: "Calls guard", evidenceIds: [shown[0]] }
    if (n === 1) return { kind: "control", delta: { schemaVersion: "authorization-control-slice/v1", rules: [entry], dependencies: [{ key: "guard", questionId: "q1", pathKey: "p", from: "entry", symbol: "guard", kind: "control", decisive: true, evidenceIds: [shown[0]], reason: "Authorization depends on helper" }] } }
    expect(prompt).toContain("return false")
    if (n === 2) return { kind: "final", controlDelta: { schemaVersion: "authorization-control-slice/v1", rules: [{ key: "stop", questionId: "q1", pathKey: "p", kind: "reject", after: ["entry"], complete: true, claim: "Guard rejects", evidenceIds: [shown.at(-1)] }] }, result: { ...(final(shown.at(-1)!) as any).result, questions: [{ ...(final(shown.at(-1)!) as any).result.questions[0], behavior: { disposition: "allow", explanation: "Original contradictory allow" } }] } }
    expect(prompt).toContain("behavior-rule-conflict")
    return final(shown.at(-1)!)
  })
  const run = await runAuthorizationInquiry({ ...input, method: "M", strategy: "domain-evidence-v1", provider: mock.provider } as any) as any
  expect(run.status).toBe("completed")
  expect(run.toolHistory).toHaveLength(2)
  expect(run.domain.schedulerActions[0].actionOrigin).toBe("domain-scheduler")
  expect(run.domain.dependencies[0].state).toBe("checked")
  expect(run.initial.questions[0].behavior.disposition).toBe("allow")
  expect(run.initialValidation.valid).toBe(false)
  expect(run.result.questions[0].behavior.disposition).toBe("deny")
  expect(mock.count()).toBe(4)
})

test("domain ablation disables auto reads and preserves a decisive gap under the same budget", async () => {
  const input = await setup(), mock = scripted((params, n) => {
    if (!n) return { kind: "tool", calls: [{ name: "source_read", arguments: { path: "src/entry.ts", startLine: 1, endLine: 1 } }] }
    const id = [...params.messages[0]!.content.matchAll(/"id":"(ev-[a-f0-9]+)"/g)][0]![1]!
    if (n === 1) return { kind: "control", delta: { schemaVersion: "authorization-control-slice/v1", rules: [{ key: "entry", questionId: "q1", pathKey: "p", kind: "entry", after: [], claim: "Calls guard", evidenceIds: [id] }], dependencies: [{ key: "guard", questionId: "q1", pathKey: "p", from: "entry", symbol: "guard", kind: "control", decisive: true, evidenceIds: [id], reason: "Authorization depends on helper" }] } }
    return { kind: "final", result: { ...(final(id) as any).result, questions: [{ ...(final(id) as any).result.questions[0], behavior: { disposition: "unknown", explanation: "guard not read" }, missing: [{ kind: "source-gap", detail: "guard remains unexamined", nextRead: "guard" }] }] } }
  })
  const run = await runAuthorizationInquiry({ ...input, method: "M", strategy: "domain-evidence-v1", domainAblation: "scheduler-off", provider: mock.provider } as any) as any
  expect(run.status).toBe("completed")
  expect(run.toolHistory).toHaveLength(1)
  expect(run.domain.schedulerActions).toHaveLength(0)
  expect(run.domain.dependencies[0].state).not.toBe("read")
  expect(run.domain.check.taskResolution).toBe("partial")
})

test("partial-evaluation/check ablation leaves the same contradictory answer uncorrected and records no evaluation", async () => {
  const input = await setup(), mock = scripted((params, n) => {
    if (!n) return { kind: "tool", calls: [{ name: "source_read", arguments: { path: "src/helper.ts", startLine: 1, endLine: 1 } }] }
    const id = /"id":"(ev-[a-f0-9]+)"/.exec(params.messages[0]!.content)![1]!
    return { kind: "final", controlDelta: { schemaVersion: "authorization-control-slice/v1", rules: [{ key: "entry", questionId: "q1", pathKey: "p", kind: "entry", after: [], claim: "entry", evidenceIds: [id] }, { key: "stop", questionId: "q1", pathKey: "p", kind: "reject", after: ["entry"], claim: "false", evidenceIds: [id], complete: true }] }, result: { ...(final(id) as any).result, questions: [{ ...(final(id) as any).result.questions[0], behavior: { disposition: "allow", explanation: "Raw contradiction" } }] } }
  })
  const run = await runAuthorizationInquiry({ ...input, method: "M", strategy: "domain-evidence-v1", domainAblation: "checks-off", provider: mock.provider } as any) as any
  expect(run.status).toBe("completed")
  expect(run.result.questions[0].behavior.disposition).toBe("allow")
  expect(run.domain.computation.predicateEvaluations).toBe(0)
  expect(run.domain.computation.conclusionChecks).toBe(0)
  expect(run.domain.check.paths).toEqual([])
  expect(mock.count()).toBe(2)
})

test("domain execution reserves its final dispatch for delivery and describes both literal operands", async () => {
  const input = await setup(), mock = scripted((params, n) => {
    const prompt = params.messages[0]!.content, schema: any = params.tools![0]!.inputSchema
    if (n === 0) {
      expect(prompt).toContain('right:{binding:name}|{literal:scalar}')
      return { kind: "tool", calls: [{ name: "source_read", arguments: { path: "src/helper.ts", startLine: 1, endLine: 1 } }] }
    }
    if (n < 2) return { kind: "control", controlDelta: { schemaVersion: "authorization-control-slice/v1" } }
    expect(schema.properties.kind.const).toBe("final")
    expect(prompt).toContain("Reserved delivery opportunity")
    const id = /"id":"(ev-[a-f0-9]+)"/.exec(prompt)![1]!
    const answer = final(id)
    if (n === 2) answer.result.questions[0]!.behavior.disposition = "allow"
    return { ...answer, controlDelta: { schemaVersion: "authorization-control-slice/v1", rules: [{ key: "entry", questionId: "q1", pathKey: "p", kind: "entry", after: [], claim: "entry", evidenceIds: [id] }, { key: "stop", questionId: "q1", pathKey: "p", kind: "reject", after: ["entry"], claim: "false", evidenceIds: [id], complete: true }] } }
  })
  const run = await runAuthorizationInquiry({ ...input, method: "M", strategy: "domain-evidence-v1", provider: mock.provider, maxDispatches: 4 })
  expect(run.status).toBe("completed")
  expect(mock.count()).toBe(4)
})

test("guided ordinary inquiry retains good extraction during a local item repair", async () => {
  const input = await setup(), mock = scripted((params, n) => {
    const prompt = params.messages[0]!.content
    if (!n) {
      expect(prompt).toContain("guided-evidence-v2 local interface")
      const schema: any = params.tools![0]!.inputSchema
      expect(schema.anyOf.find((s: any) => s.properties.kind.const === "control").properties.controlDelta.properties.sourceBindings).toBeDefined()
      return { kind: "tool", calls: [{ name: "source_read", arguments: { path: "src/helper.ts", startLine: 1, endLine: 1 } }] }
    }
    const id = /"id":"(ev-[a-f0-9]+)"/.exec(prompt)![1]!
    const item = (targetKey: string, extra = {}) => ({ op: "add", questionId: "q1", targetKey, pathKey: "p", kind: "entry", after: [], evidenceIds: [id], claim: "Shown guard", ...extra })
    return { ...final(id), controlDelta: { schemaVersion: "authorization-control-update/v1", rules: n === 1 ? [item("entry"), item("stop", { kind: "reject", after: ["entry"], complete: true }), item("local", { evidenceIds: ["not-shown"] })] : [item("local")] } }
  })
  const run = await runAuthorizationInquiry({ ...input, method: "M", strategy: "guided-evidence-v2", provider: mock.provider, maxDispatches: 4 } as any)
  expect(run.status).toBe("completed")
  expect(run.initialValidation?.valid).toBe(false)
  expect(run.validation?.valid).toBe(true)
  expect(run.domain!.slice.rules.map(r => r.key)).toEqual(["entry", "stop", "local"])
  expect(run.domain!.proposals[0]!.accepted).toHaveLength(2)
  expect(run.domain!.proposals[0]!.rejected).toHaveLength(1)
  expect(mock.count()).toBe(3)
})

test("exhausted structured tool repair retains phase, concrete fields and both raw attempts", async () => {
  const input = await setup(), mock = scripted(() => ({ kind: "tool", calls: [{ name: "source_list", arguments: {} }], observations: [] }))
  const run = await runAuthorizationInquiry({ ...input, method: "M", strategy: "domain-evidence-v1", provider: mock.provider, maxDispatches: 4 })
  expect(run.status).toBe("transport-failed")
  expect(mock.count()).toBe(2)
  expect(run.toolHistory).toEqual([])
  expect(run.wireFailures.map(f => [f.phase, f.sequence])).toEqual([["analysis", 1], ["analysis", 2]])
  expect(run.wireFailures[0]!.diagnostics[0]!.keys).toEqual(["observations"])
  expect(JSON.parse(run.wireFailures[1]!.rawResponse!).observations).toEqual([])
})

test("guided inquiry explains actual entry and helper windows in two ordinary calls with host-bound fields", async () => {
  const input = await setup(), mock = scripted((params, n) => {
    const prompt = params.messages[0]!.content
    const context = JSON.parse(prompt.split("Current local explanation context: ")[1]!.split("\n\nRemaining dispatches:")[0]!)
    const task = context.tasks[0], item = (targetKey: string, kind: string, after: string[], extra = {}) => ({ op: "add", targetKey, kind, pathKey: "p", after, claim: "Current original source interpretation", ...extra })
    expect(task).toBeDefined()
    if (!n) {
      expect(context.sourceWindows.some((e: any) => e.text.includes("return guard()"))).toBe(true)
      return { kind: "control", controlDelta: { schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: task.itemId, rules: [item("entry", "entry", [])], dependencies: [{ op: "add", targetKey: "helper", pathKey: "p", from: "entry", symbol: "guard", kind: "control", decisive: true, reason: "Return depends on original guard" }] }] } }
    }
    expect(context.sourceWindows.some((e: any) => e.text.includes("return false"))).toBe(true)
    expect(task.duty.symbol).toBe("guard")
    return { ...final(task.evidenceIds[0]), controlDelta: { schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: task.itemId, rules: [item("stop", "reject", ["entry"], { complete: true })] }] } }
  })
  const run = await runAuthorizationInquiry({ ...input, method: "M", strategy: "guided-evidence-v2", provider: mock.provider, maxDispatches: 4 })
  expect(run.status).toBe("completed")
  expect(mock.count()).toBe(2)
  expect(run.domain!.localExtractions).toHaveLength(2)
  expect(run.domain!.dependencies[0]!.state).toBe("checked")
  expect(run.toolHistory.map(h => h.actionOrigin)).toEqual(["domain-worklist", "domain-worklist"])
})

test("all newly read original windows reach the next guided call and are counted as actual source display", async () => {
  const input = await setup()
  for (const name of ["one", "two", "three", "four"]) await writeFile(path.join(input.sourceRoot, `src/${name}.ts`), `export const ${name} = '${name}-original';\n`)
  const mock = scripted((params, n) => {
    const prompt = params.messages[0]!.content
    if (!n) return { kind: "tool", calls: ["one", "two", "three", "four"].map(name => ({ name: "source_read", arguments: { path: `src/${name}.ts`, startLine: 1, endLine: 1 } })) }
    const context = JSON.parse(prompt.split("Current local explanation context: ")[1]!.split("\n\nRemaining dispatches:")[0]!)
    expect(context.sourceWindows.map((e: any) => e.path)).toEqual(["src/one.ts", "src/two.ts", "src/three.ts", "src/four.ts"])
    for (const window of context.sourceWindows) expect(prompt.split(window.sha256)).toHaveLength(2)
    for (const name of ["one", "two", "three", "four"]) expect(prompt).toContain(`${name}-original`)
    return { kind: "final", result: { schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q1", behavior: { disposition: "unknown", explanation: "These four original constant declarations do not identify the requested operation." }, evidenceIds: context.sourceWindows.map((e: any) => e.id), branches: [], missing: [{ kind: "source-gap", detail: "The requested operation is not identified by these declarations", nextRead: "Locate its operation entry" }] }], observations: [], scope: "The four displayed original windows" } }
  })
  const run = await runAuthorizationInquiry({ ...input, inquiry: { ...input.inquiry, questions: [{ id: "q1", request: "Inspect these provided sources", premises: [] }] }, method: "M", strategy: "guided-evidence-v2", provider: mock.provider, maxDispatches: 4 })
  expect(run.initialValidation?.valid).toBe(true)
  expect(run.status).toBe("completed")
  expect(run.requests).toHaveLength(2)
  const selectedBytes = run.evidence.filter(e => ["src/one.ts", "src/two.ts", "src/three.ts", "src/four.ts"].includes(e.path)).reduce((sum, e) => sum + e.bytes, 0)
  expect(run.sourceAccounting.cumulativeModelSourceBytes).toBe(selectedBytes)
  expect(run.sourceAccounting.resentSourceBytes).toBe(0)
})

test("lossless guided control normalization retains raw responses and uses no repair dispatch", async () => {
  const input = await setup(), mock = scripted((params, n) => {
    const prompt = params.messages[0]!.content, context = JSON.parse(prompt.split("Current local explanation context: ")[1]!.split("\n\nRemaining dispatches:")[0]!)
    const task = context.tasks[0]
    if (n === 0) return { controlDelta: { schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: task.itemId, rules: [{ op: "add", targetKey: "entry", pathKey: "p", kind: "entry", after: [], claim: "Calls guard" }], dependencies: [{ op: "add", targetKey: "guard", pathKey: "p", from: "entry", symbol: "guard", kind: "control", decisive: true, reason: "The requested decision depends on this call" }] }] } }
    if (n === 1) {
      expect(context.sourceWindows.some((e: any) => e.text.includes("return false"))).toBe(true)
      return { kind: "tool", controlDelta: { schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: task.itemId, rules: [{ op: "add", targetKey: "stop", pathKey: "p", kind: "reject", after: ["entry"], claim: "Rejects the operation", complete: true }] }] } }
    }
    const helper = context.evidenceCatalog.find((e: any) => e.path === "src/helper.ts")
    return final(helper.id)
  })
  const run = await runAuthorizationInquiry({ ...input, method: "M", strategy: "guided-evidence-v2", provider: mock.provider, maxDispatches: 4 })
  expect(run.status).toBe("completed")
  expect(mock.count()).toBe(3)
  expect(run.wireFailures).toEqual([])
  expect(run.wireNormalizations.map(n => [n.sequence, n.code])).toEqual([[1, "control-kind-omitted"], [2, "control-tool-without-calls"]])
  expect(JSON.parse(run.wireNormalizations[0]!.rawResponse).kind).toBeUndefined()
  expect(JSON.parse(run.wireNormalizations[1]!.rawResponse).kind).toBe("tool")
  expect(run.domain!.dependencies[0]!.state).toBe("checked")
  expect(run.toolHistory).toHaveLength(2)
})
