import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createNativeInquiryRuntime } from "./inquiry-native.ts"
import { runAuthorizationInquiry } from "./inquiry-run.ts"
import { emptyTokenUsage } from "../../core/types.ts"
import type { LLMProvider } from "../../providers/types.ts"

async function fixture(maxToolCalls = 12) {
  const root = await mkdtemp(path.join(os.tmpdir(), "ba-budget-")); await mkdir(path.join(root, "source")); await writeFile(path.join(root, "source/app.py"), "def entry():\n    return False\n")
  const inputFile = path.join(root, "input.json"); await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "t", repository: "anonymous", sourceRef: "r", sourceRoot: "source", allowedPaths: ["app.py"], brief: "Inspect app.entry" }))
  return createNativeInquiryRuntime({ inputFile, workDir: root, domainTools: true, method: "M", strategy: "operation-evidence-v6", maxToolCalls })
}
const badCall = (i: number, name = "authorization_observe") => ({ id: `bad-${i}`, name, arguments: { wrong: "invalid current tool shape" } })
const diagnostics = [{ path: "/wrong", keyword: "additionalProperties", message: "Unexpected field", expected: null }]

test("three format rejects leave reserved valid checks callable, with one charge per attempt", async () => {
  const runtime = await fixture()
  try {
    await runtime.accountContext()
    const before = runtime.report().toolBudget.totalUsed
    for (let i = 1; i <= 3; i++) {
      await runtime.rejectArguments(badCall(i), diagnostics)
      const budget: any = runtime.report().toolBudget
      expect(budget.totalUsed).toBe(before + i)
      expect(budget.formatCorrectionsRemaining).toBe(3 - i)
      expect(budget.checksUsed).toBe(0)
    }
    const answer: any = await runtime.accountContext()
    expect(answer.focus.stage).toBe("answer")
    expect(answer.toolBudget.finalOnly).toBe(true)
    expect(answer.toolBudget.deliveryClosed).toBe(false)
    const validShape = { result: { ...answer.answerTemplate, answers: [{ explanation: "The shown source remains uninterpreted", missing: [{ kind: "interpretation-gap", detail: "Return has not yet been interpreted" }] }] } }
    const checked = JSON.parse((await runtime.execute({ id: "shape-valid-partial", name: "authorization_check_result", arguments: validShape })).output)
    expect(checked.code).not.toBe("format-repair-budget")
    expect(runtime.report().toolBudget.checksUsed).toBe(1)
    expect(runtime.report().toolBudget.totalUsed).toBe(before + 4)
    expect(runtime.report().domain?.checkHistory).toHaveLength(1)
    expect((runtime.report().result as any).questions[0].behavior.disposition).toBe("unknown")
    expect((runtime.report().result as any).questions[0].missing[0].kind).toBe("interpretation-gap")
    await runtime.rejectArguments(badCall(4, "authorization_observe"), diagnostics)
    expect(runtime.report().result).toBeUndefined()
    expect(runtime.report().domain?.check).toBeUndefined()
    expect(runtime.report().domain?.delivery?.check).toBeUndefined()
  } finally { await runtime.close() }
})

test("another malformed final closes delivery instead of creating correction or check credits", async () => {
  const runtime = await fixture()
  try {
    for (let i = 1; i <= 3; i++) await runtime.rejectArguments(badCall(i), diagnostics)
    const answer: any = await runtime.accountContext(), before = runtime.report().toolBudget.totalUsed
    await runtime.rejectArguments(badCall(4, "authorization_check_result"), diagnostics)
    expect((runtime.report().toolBudget as any).deliveryClosed).toBe(true)
    expect(runtime.report().toolBudget.totalUsed).toBe(before + 1)
    expect(runtime.report().toolBudget.checksUsed).toBe(0)
    const denied = JSON.parse((await runtime.execute({ id: "too-late", name: "authorization_check_result", arguments: { result: answer.answerTemplate } })).output)
    expect(denied.code).toBe("delivery-closed")
    expect(runtime.report().toolBudget.checksUsed).toBe(0)
    expect(runtime.report().domain?.checkHistory).toHaveLength(0)
  } finally { await runtime.close() }
})

test("non-check tools cannot spend the two reserved check positions", async () => {
  const runtime = await fixture(8)
  try {
    while (runtime.report().toolBudget.explorationRemaining > 0) await runtime.execute({ id: `source-${runtime.report().history.length}`, name: "source_list", arguments: {} })
    const budget = runtime.report().toolBudget
    expect(budget.totalUsed).toBe(6)
    expect(budget.totalRemaining).toBe(2)
    expect(budget.checksRemaining).toBe(2)
    expect((await runtime.accountContext() as any).focus.stage).toBe("answer")
  } finally { await runtime.close() }
})

test("structured inquiry retains a valid final check after three rejected formats", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ba-inquiry-budget-")); await writeFile(path.join(root, "app.py"), "def entry():\n    return False\n")
  let attempts = 0
  const provider: LLMProvider = { name: "mock", complete: async params => {
    const text = params.messages.at(-1)!.content, prefix = "Current local explanation context: ", context = JSON.parse(text.slice(text.indexOf(prefix) + prefix.length).split("\n\nRemaining dispatches:")[0]!)
    const args = ++attempts <= 3 ? { kind: "final", gaps: [] } : { kind: "final", ...context.answerTemplate, answers: [{ explanation: "Current interpretation remains incomplete", missing: [{ kind: "interpretation-gap", detail: "The source body has not been interpreted" }] }], scope: "Current app.entry only" }
    return { text: "", toolCalls: [{ id: String(attempts), name: "submit_inquiry_step", arguments: args }], tokens: emptyTokenUsage(), durationMs: 0, stopReason: "tool_use" }
  }, completeWithToolResults: async () => { throw new Error("Unused") } }
  const run = await runAuthorizationInquiry({ sourceRoot: root, repository: "anonymous", sourceRef: "fixed", allowedPaths: ["app.py"], brief: "Inspect app.entry", provider, method: "M", strategy: "operation-evidence-v6", maxDispatches: 12, maxToolCalls: 12 })
  expect(attempts).toBe(4)
  expect(run.recovery).toMatchObject({ formatRejectCount: 3, semanticChecksUsed: 1, deliveryClosed: false })
  expect(run.domain?.checkHistory).toHaveLength(1)
  expect(run.result?.questions[0]?.missing[0]?.kind).toBe("interpretation-gap")
})
